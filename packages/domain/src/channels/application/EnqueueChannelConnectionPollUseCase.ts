import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { BackgroundJobEntry } from "../../shared/types/index";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { IChannelPollJobQuery } from "../ports/IChannelPollJobQuery";
import {
  buildLegacyPollIdempotencyKey,
  buildManualPollIdempotencyKey,
  buildRecoveryPollIdempotencyKey,
  buildScheduledPollIdempotencyKey,
  icalPollBucket,
  resolveIcalPollIntervalMs,
  computePollRunAt,
} from "../providers/ical/inventory/icalPollJobIdentity";

export interface EnqueueChannelConnectionPollCommand {
  tenantId: string;
  connectionId: string;
  /**
   * When omitted, behaves as operator manual/recovery poll.
   * Scheduler passes mode: "scheduled".
   */
  mode?: "manual" | "scheduled";
  /** Injected clock for tests. */
  now?: Date;
  /** Injected RNG for jitter tests. */
  random?: () => number;
  /** Skip permission check for internal scheduler. */
  bypassPermissionCheck?: boolean;
}

export interface EnqueueChannelConnectionPollResult {
  job: BackgroundJobEntry;
  /** true when an existing in-flight or same-key terminal/existing job was returned. */
  reusedExisting: boolean;
}

/** @deprecated Prefer buildManual/Scheduled/Recovery keys (P1-S7b). */
export function buildPollChannelConnectionIdempotencyKey(
  tenantId: string,
  connectionId: string,
): string {
  return buildLegacyPollIdempotencyKey(tenantId, connectionId);
}

/**
 * CM-4b S4a-2b / P1-S7b — enqueue poll_channel_connection without synchronous provider I/O.
 * Race-safe identities: sched:{bucket} | manual:{bucket} | recovery:{deadLetterJobId}.
 * Never creates unkeyed poll jobs.
 */
export class EnqueueChannelConnectionPollUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly enqueueJobUseCase: EnqueueJobUseCase,
    private readonly permissionChecker: PermissionChecker,
    private readonly pollJobQuery: IChannelPollJobQuery,
  ) {}

  async execute(
    command: EnqueueChannelConnectionPollCommand,
    actor: ActorContext,
  ): Promise<Result<EnqueueChannelConnectionPollResult, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (tenantId.length === 0) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (connectionId.length === 0) {
        return Result.fail(new ValidationError("connectionId is required"));
      }
      if (
        !command.bypassPermissionCheck &&
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }
      if (connection.status !== "active") {
        return Result.fail(
          new ConflictError("Channel connection is not active", "lifecycle_status_conflict"),
        );
      }

      const registration = this.providerRegistry.get(connection.provider);
      if (!registration?.capabilities.inbound.polling || !registration.polling) {
        return Result.fail(
          new ConflictError(
            "Polling provider is not registered for this connection",
            "provider_capability_conflict",
          ),
        );
      }

      const inFlight = await this.pollJobQuery.findInFlightPoll({ tenantId, connectionId });
      if (inFlight) {
        return Result.ok({ job: inFlight, reusedExisting: true });
      }

      const now = command.now ?? new Date();
      const intervalMs = resolveIcalPollIntervalMs();
      const bucket = icalPollBucket(now.getTime(), intervalMs);
      const mode = command.mode ?? "manual";

      let idempotencyKey: string;
      if (mode === "scheduled") {
        idempotencyKey = buildScheduledPollIdempotencyKey(tenantId, connectionId, bucket);
      } else {
        const latest = await this.pollJobQuery.findLatestPoll({ tenantId, connectionId });
        if (latest?.status === "dead_letter") {
          idempotencyKey = buildRecoveryPollIdempotencyKey(
            tenantId,
            connectionId,
            latest.id,
          );
        } else {
          idempotencyKey = buildManualPollIdempotencyKey(tenantId, connectionId, bucket);
        }
      }

      const runAt =
        mode === "scheduled"
          ? computePollRunAt(now, intervalMs, command.random)
          : now;

      const enqueued = await this.enqueueJobUseCase.execute({
        tenantId,
        jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
        payload: { connectionId },
        idempotencyKey,
        runAt,
      });
      if (enqueued.isFailure) {
        return Result.fail(enqueued.getError());
      }

      const job = enqueued.getValue();
      const reusedExisting =
        job.status === "completed" ||
        job.status === "dead_letter" ||
        job.status === "cancelled" ||
        job.status === "processing";

      return Result.ok({ job, reusedExisting });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
