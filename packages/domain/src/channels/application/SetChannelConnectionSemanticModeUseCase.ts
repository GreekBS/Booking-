import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { IChannelSemanticModeTransitionStore } from "../ports/IChannelSemanticModeTransitionStore";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";
import {
  isFeedSemanticMode,
  parseSemanticConfigVersion,
} from "../types/FeedSemanticMode";
import { assertFeedSemanticModeAllowed } from "../types/FeedSemanticModePolicy";
import { resolveAllowedFeedSemanticModes } from "../types/FeedSemanticModePolicy";
import {
  CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
} from "./semanticModeTransitionFingerprint";
import {
  isValidSemanticModeChangeConfirmation,
  type SemanticModeChangeConfirmation,
} from "./SemanticModeChangeConfirmation";

export interface SetChannelConnectionSemanticModeCommand {
  tenantId: string;
  connectionId: string;
  /** Durable command identity for S3d idempotency (tenant + operation + commandId). */
  commandId: string;
  targetMode: FeedSemanticMode;
  confirmation: SemanticModeChangeConfirmation;
  /**
   * Observed semantic configuration version. Must match the current persisted version.
   * Mandatory for every caller (CM-4b S3f).
   */
  expectedSemanticConfigVersion: number;
  /** Optional non-secret operator reason recorded in audit metadata. */
  reason?: string;
  now?: Date;
}

export interface SetChannelConnectionSemanticModeResult {
  connectionId: string;
  previousMode: FeedSemanticMode;
  newMode: FeedSemanticMode;
  previousSemanticConfigVersion: number;
  newSemanticConfigVersion: number;
  changed: boolean;
  cursorReset: boolean;
  commandId: string;
  replayed: boolean;
}

/**
 * Operator entry point for changing ChannelConnection feed semantic mode.
 *
 * Pre-TX: authorize, confirm, provider allow-list (Option B).
 * Persistence: delegates entirely to IChannelSemanticModeTransitionStore (S3d atomic TX).
 * No sequential clearCursor → persist → audit path remains.
 */
export class SetChannelConnectionSemanticModeUseCase {
  constructor(
    private readonly transitionStore: IChannelSemanticModeTransitionStore,
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: SetChannelConnectionSemanticModeCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<SetChannelConnectionSemanticModeResult, Error>> {
    try {
      if (!command.commandId || command.commandId.trim().length === 0) {
        return Result.fail(new ValidationError("commandId is required"));
      }
      let expectedSemanticConfigVersion: number;
      try {
        expectedSemanticConfigVersion = parseSemanticConfigVersion(
          command.expectedSemanticConfigVersion,
        );
      } catch (error) {
        return Result.fail(
          error instanceof Error ? error : new ValidationError(String(error)),
        );
      }
      if (!isFeedSemanticMode(command.targetMode)) {
        return Result.fail(
          new ValidationError(`Invalid feed semantic mode: ${String(command.targetMode)}`),
        );
      }

      const requiredPermission =
        command.targetMode === "reservation_feed"
          ? PERMISSIONS.CHANNELS_CONNECTION_DECLARE_RESERVATION_FEED
          : PERMISSIONS.CHANNELS_CONNECTION_MANAGE;

      if (
        !this.permissionChecker.hasPermission(actor, requiredPermission, command.tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const connection = await this.connectionRepository.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", command.connectionId));
      }

      if (
        command.confirmation == null ||
        command.confirmation.confirmed !== true ||
        !isFeedSemanticMode(command.confirmation.acknowledgedFromMode) ||
        command.confirmation.acknowledgedToMode !== command.targetMode
      ) {
        return Result.fail(
          new ValidationError(
            "Explicit semantic mode change confirmation is required and must match the from/to transition",
          ),
        );
      }

      /**
       * Fingerprint uses the confirmed from-mode (not a freshly reloaded live mode) so that
       * exact retries after a successful transition keep a stable fingerprint.
       * Live from-mode is still enforced for fresh executions: mismatch fails closed below
       * unless the store short-circuits on an exact receipt replay.
       */
      const expectedFromMode = command.confirmation.acknowledgedFromMode;
      const confirmationMatchesLiveMode =
        expectedFromMode === connection.semanticMode;

      if (
        confirmationMatchesLiveMode &&
        !isValidSemanticModeChangeConfirmation(
          command.confirmation,
          connection.semanticMode,
          command.targetMode,
        )
      ) {
        return Result.fail(
          new ValidationError(
            "Explicit semantic mode change confirmation is required and must match the from/to transition",
          ),
        );
      }

      const registration = this.providerRegistry.get(connection.provider);
      if (!registration) {
        return Result.fail(
          new ValidationError(`Provider registration not found: ${connection.provider}`),
        );
      }

      const allowedFeedSemanticModes = resolveAllowedFeedSemanticModes(
        registration.allowedFeedSemanticModes,
      );
      assertFeedSemanticModeAllowed(command.targetMode, allowedFeedSemanticModes);

      let transition;
      try {
        transition = await this.transitionStore.executeTransition({
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          commandId: command.commandId,
          operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
          actorId: audit.actorId,
          expectedFromMode,
          targetSemanticMode: command.targetMode,
          expectedSemanticConfigVersion,
          allowedFeedSemanticModes,
          reason: command.reason ?? null,
          ipAddress: audit.ipAddress,
          now: command.now,
        });
      } catch (error) {
        if (
          !confirmationMatchesLiveMode &&
          error instanceof ConflictError &&
          /expectedFromMode|semantic mode does not match/i.test(error.message)
        ) {
          return Result.fail(
            new ValidationError(
              "Explicit semantic mode change confirmation is required and must match the from/to transition",
            ),
          );
        }
        throw error;
      }

      return Result.ok({
        connectionId: transition.connectionId,
        previousMode: transition.previousMode,
        newMode: transition.newMode,
        previousSemanticConfigVersion: transition.previousSemanticConfigVersion,
        newSemanticConfigVersion: transition.newSemanticConfigVersion,
        changed: transition.changed,
        cursorReset: transition.cursorReset,
        commandId: transition.commandId,
        replayed: transition.replayed,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export function requiredPermissionForFeedSemanticMode(
  mode: FeedSemanticMode,
): typeof PERMISSIONS.CHANNELS_CONNECTION_MANAGE | typeof PERMISSIONS.CHANNELS_CONNECTION_DECLARE_RESERVATION_FEED {
  return mode === "reservation_feed"
    ? PERMISSIONS.CHANNELS_CONNECTION_DECLARE_RESERVATION_FEED
    : PERMISSIONS.CHANNELS_CONNECTION_MANAGE;
}
