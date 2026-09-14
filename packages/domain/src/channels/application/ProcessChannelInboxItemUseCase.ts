import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { ChannelInboxProcessingOutcome } from "../domain/ChannelInboxProcessingOutcome";
import type { ChannelInboxProcessingStatus } from "../domain/ChannelInboxProcessingStatus";
import { parseChannelInboxRawPayload } from "./ChannelInboxMessageParser";
import { classifyInboxOutcome } from "./ChannelInboxOutcomeClassifier";
import { ImportChannelReservationCreateDryRunUseCase } from "./ImportChannelReservationCreateDryRunUseCase";
import { ImportChannelReservationCommandUseCase } from "./ImportChannelReservationCommandUseCase";
import { DEFAULT_INBOX_LEASE_TTL_MS } from "../jobs/ChannelInboxJobTypes";
import type { IChannelInboxRepository } from "../ports/IChannelInboxRepository";

export interface ProcessChannelInboxItemCommand {
  tenantId: string;
  inboxItemId: string;
  workerId: string;
  leaseTtlMs?: number;
}

export interface ProcessChannelInboxItemResult {
  processed: boolean;
  status?: ChannelInboxProcessingStatus;
  outcome?: ChannelInboxProcessingOutcome;
  shouldRetryJob: boolean;
}

export class ProcessChannelInboxItemUseCase {
  constructor(
    private readonly inboxRepository: IChannelInboxRepository,
    private readonly importDryRunUseCase: ImportChannelReservationCreateDryRunUseCase,
    private readonly importCommandUseCase: ImportChannelReservationCommandUseCase,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: ProcessChannelInboxItemCommand,
  ): Promise<Result<ProcessChannelInboxItemResult, Error>> {
    const tenantId = command.tenantId.trim();
    const inboxItemId = command.inboxItemId.trim();
    const workerId = command.workerId.trim();
    const processingToken = this.idGenerator.generate();
    const leaseExpiresAt = new Date(Date.now() + (command.leaseTtlMs ?? DEFAULT_INBOX_LEASE_TTL_MS));

    const claimed = await this.inboxRepository.claim({
      tenantId,
      inboxItemId,
      workerId,
      processingToken,
      leaseExpiresAt,
    });

    if (!claimed) {
      return Result.ok({ processed: false, shouldRetryJob: false });
    }

    try {
      const message = parseChannelInboxRawPayload(claimed.rawPayload);

      if (message.kind !== "reservation.create") {
        return await this.finish(claimed, tenantId, inboxItemId, processingToken, {
          unsupported: true,
          inboxAttemptCount: claimed.attemptCount,
        });
      }

      const dryRun = await this.importDryRunUseCase.execute({
        tenantId,
        connectionId: claimed.connectionId,
        provider: claimed.provider,
        message,
      });

      if (dryRun.isFailure) {
        return await this.finish(claimed, tenantId, inboxItemId, processingToken, {
          error: dryRun.getError(),
          inboxAttemptCount: claimed.attemptCount,
        });
      }

      const dryRunValue = dryRun.getValue();
      if (dryRunValue.duplicate) {
        return await this.finish(claimed, tenantId, inboxItemId, processingToken, {
          duplicate: true,
          inboxAttemptCount: claimed.attemptCount,
          resultLinkId: dryRunValue.existingLink.id,
          resultBookingId: dryRunValue.existingLink.bookingId,
        });
      }

      const importResult = await this.importCommandUseCase.execute({
        normalizedCommand: dryRunValue.command,
        mappingContext: dryRunValue.mappingContext,
        external: {
          provider: claimed.provider,
          connectionId: claimed.connectionId,
          externalReservationId: normalizeRequired(
            message.externalReservationId ?? "",
            "External reservation id",
          ),
          externalRevision:
            typeof message.payload.externalRevision === "string"
              ? message.payload.externalRevision
              : null,
          lastExternalUpdateAt: message.externalUpdatedAt ?? null,
        },
      });

      if (importResult.isFailure) {
        return await this.finish(claimed, tenantId, inboxItemId, processingToken, {
          error: importResult.getError(),
          inboxAttemptCount: claimed.attemptCount,
        });
      }

      const importValue = importResult.getValue();
      if (importValue.outcome === "duplicate") {
        return await this.finish(claimed, tenantId, inboxItemId, processingToken, {
          duplicate: true,
          inboxAttemptCount: claimed.attemptCount,
          resultLinkId: importValue.link.id,
          resultBookingId: importValue.link.bookingId,
        });
      }

      return await this.finish(claimed, tenantId, inboxItemId, processingToken, {
        success: true,
        inboxAttemptCount: claimed.attemptCount,
        resultBookingId: importValue.booking.id,
        resultLinkId: importValue.link.id,
      });
    } catch (error) {
      return await this.finish(claimed, tenantId, inboxItemId, processingToken, {
        error: error instanceof Error ? error : new Error(String(error)),
        inboxAttemptCount: claimed.attemptCount,
      });
    }
  }

  private async finish(
    claimed: { attemptCount: number },
    tenantId: string,
    inboxItemId: string,
    processingToken: string,
    input: {
      error?: Error;
      duplicate?: boolean;
      success?: boolean;
      unsupported?: boolean;
      inboxAttemptCount: number;
      resultBookingId?: string;
      resultLinkId?: string;
    },
  ): Promise<Result<ProcessChannelInboxItemResult, Error>> {
    const classified = classifyInboxOutcome({
      error: input.error,
      duplicate: input.duplicate,
      success: input.success,
      unsupported: input.unsupported,
      inboxAttemptCount: input.inboxAttemptCount,
    });

    const now = new Date();

    if (classified.shouldRetryJob) {
      const marked = await this.inboxRepository.markFailed({
        tenantId,
        inboxItemId,
        processingToken,
        outcome: classified.outcome,
        outcomeDetail: classified.outcomeDetail ?? null,
        lastError: classified.outcomeDetail ?? input.error?.message ?? null,
        processedAt: now,
      });
      if (!marked) {
        return Result.fail(new ValidationError("Failed to mark inbox item for retry"));
      }
      return Result.ok({
        processed: true,
        status: "failed",
        outcome: classified.outcome,
        shouldRetryJob: true,
      });
    }

    const completed = await this.inboxRepository.complete({
      tenantId,
      inboxItemId,
      processingToken,
      status: classified.status,
      outcome: classified.outcome,
      outcomeDetail: classified.outcomeDetail ?? null,
      lastError: classified.outcomeDetail ?? input.error?.message ?? null,
      resultBookingId: input.resultBookingId ?? null,
      resultLinkId: input.resultLinkId ?? null,
      processedAt: now,
    });

    if (!completed) {
      return Result.fail(new ValidationError("Failed to complete inbox item with matching token"));
    }

    return Result.ok({
      processed: true,
      status: classified.status,
      outcome: classified.outcome,
      shouldRetryJob: false,
    });
  }
}

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}
