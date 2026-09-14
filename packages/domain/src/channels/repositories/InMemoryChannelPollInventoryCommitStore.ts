import { ConflictError } from "../../shared/errors/DomainError";
import { isChannelInventoryApplyEnabled } from "../application/channelInventoryApplyGate";
import { mapBatchToPollConnectionResult } from "../application/ChannelPollTransportSupport";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelPollCursorRepository } from "../ports/IChannelPollCursorRepository";
import { InMemoryChannelPollCursorRepository } from "./InMemoryChannelPollCursorRepository";
import type {
  ChannelPollInventoryCommitCommand,
  ChannelPollInventoryCommitFailureCode,
  ChannelPollInventoryCommitResult,
  IChannelPollInventoryCommitStore,
} from "../ports/IChannelPollInventoryCommitStore";
import {
  ICAL_INVENTORY_RECONCILE_AGGREGATE_TYPE,
  ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
  buildIcalInventoryReconcileDeliveryKey,
  uuidFromSha256Hex,
} from "../providers/ical/inventory/icalInventoryReconcileOutboxIdentity";
import type { ChannelInventoryReconciliationRecord } from "../types/ChannelInventoryReconciliation";
import type { ChannelPollConnectionResult } from "../types/ChannelPollConnectionResult";

export interface InMemoryInventoryOutboxEvent {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly tenantId: string | null;
  readonly deliveryKey: string | null;
  readonly payload: Record<string, unknown>;
}

/**
 * In-memory TX1 for domain/unit tests. No calendar inventory row mutation.
 */
export class InMemoryChannelPollInventoryCommitStore
  implements IChannelPollInventoryCommitStore
{
  readonly generations = new Map<string, ChannelInventoryReconciliationRecord>();
  readonly outbox: InMemoryInventoryOutboxEvent[] = [];

  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly cursorRepository: IChannelPollCursorRepository,
    private readonly applyEnabled: () => boolean = () => isChannelInventoryApplyEnabled(),
  ) {}

  async commit(
    command: ChannelPollInventoryCommitCommand,
  ): Promise<ChannelPollInventoryCommitResult> {
    const baseFail = (
      code: ChannelPollInventoryCommitFailureCode,
      message: string,
      reconciliation: "not_applicable" | "deferred_retry" = "not_applicable",
      shouldRetry = false,
    ): ChannelPollInventoryCommitResult => ({
      ok: false,
      code,
      message,
      pollResult: mapBatchToPollConnectionResult(
        command.batch,
        command.loadedCursorVersion,
        reconciliation,
        false,
        shouldRetry,
        shouldRetry ? "transient" : "none",
        null,
      ),
    });

    if (!this.applyEnabled()) {
      return baseFail("inventory_apply_disabled", "CHANNELS_INVENTORY_APPLY_ENABLED is not true");
    }

    const connection = await this.connectionRepository.findById(
      command.tenantId,
      command.connectionId,
    );
    if (!connection) {
      return baseFail("connection_not_found", "not_found");
    }
    if (connection.inventoryApplyEnabled !== true) {
      return baseFail(
        "inventory_apply_disabled",
        "connection inventory apply is not enabled",
      );
    }
    if (connection.status !== "active") {
      return baseFail("inactive_connection", "not_active");
    }
    if (connection.provider !== "ical" || command.provider !== "ical") {
      return baseFail("provider_mismatch", "provider_mismatch");
    }
    if (connection.semanticConfigVersion !== command.observedSemanticConfigVersion) {
      return baseFail("semantic_epoch_stale", "semantic epoch stale", "deferred_retry", true);
    }
    if (connection.semanticMode !== "availability_block_feed") {
      return baseFail(
        "feed_semantic_mode_not_availability_block",
        "feedSemanticMode must be availability_block_feed",
      );
    }

    const mappings = await this.mappingRepository.listByConnection(
      command.tenantId,
      command.connectionId,
    );
    const active = mappings.filter((m) => m.status === "active");
    if (active.length !== 1) {
      return baseFail(
        "mapping_count_invalid",
        `expected exactly one active mapping, found ${active.length}`,
      );
    }
    const mapping = active[0]!;

    const buildGeneration = (
      cursorVersion: number,
      now: Date,
    ): ChannelInventoryReconciliationRecord => ({
      tenantId: command.tenantId,
      connectionId: command.connectionId,
      cursorVersion,
      semanticConfigVersion: command.observedSemanticConfigVersion,
      mappingId: mapping.id,
      mappingVersion: mapping.mappingVersion,
      unitId: mapping.unitId,
      propertyId: mapping.propertyId,
      snapshotHash: command.inventorySnapshot.snapshotHash,
      actionableSnapshot: JSON.parse(command.inventorySnapshot.canonicalJson) as unknown,
      completeObservedEvidence: command.inventorySnapshot.completeObservedEvidence === true,
      observedSourceIdentityKeys: [
        ...(command.inventorySnapshot.observedSourceIdentityKeys ?? []),
      ],
      cancelledSourceIdentityKeys: [
        ...(command.inventorySnapshot.cancelledSourceIdentityKeys ?? []),
      ],
      reconcileStatus: "pending",
      reconcileErrorCode: null,
      createdAt: now,
      appliedAt: null,
    });

    const pushOutbox = (cursorVersion: number): void => {
      const deliveryKey = buildIcalInventoryReconcileDeliveryKey({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        cursorVersion,
        semanticConfigVersion: command.observedSemanticConfigVersion,
        mappingId: mapping.id,
        mappingVersion: mapping.mappingVersion,
      });
      if (!this.outbox.some((e) => e.deliveryKey === deliveryKey)) {
        this.outbox.push({
          eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
          aggregateType: ICAL_INVENTORY_RECONCILE_AGGREGATE_TYPE,
          aggregateId: uuidFromSha256Hex(deliveryKey),
          tenantId: command.tenantId,
          deliveryKey,
          payload: {
            connectionId: command.connectionId,
            cursorVersion,
            semanticConfigVersion: command.observedSemanticConfigVersion,
            mappingId: mapping.id,
            mappingVersion: mapping.mappingVersion,
          },
        });
      }
    };

    let committedVersion: number;
    try {
      const advanced = await this.cursorRepository.advanceCursor({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        observedSemanticConfigVersion: command.observedSemanticConfigVersion,
        expectedCursorVersion: command.expectedCursorVersion,
        nextPayload: command.proposedNextCursor,
      });
      committedVersion = advanced.version;
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }
      const reloaded = await this.cursorRepository.getCursor(
        command.tenantId,
        command.connectionId,
      );
      if (
        reloaded?.payload === command.proposedNextCursor &&
        reloaded.semanticConfigVersion === command.observedSemanticConfigVersion
      ) {
        // Finding B: backfill missing generation for already-committed cursor version.
        const genKey = `${command.tenantId}:${command.connectionId}:${reloaded.version}`;
        if (!this.generations.has(genKey)) {
          const now = new Date();
          this.generations.set(genKey, buildGeneration(reloaded.version, now));
          if (this.cursorRepository instanceof InMemoryChannelPollCursorRepository) {
            this.cursorRepository.noteReconciliationCursorVersion(
              command.tenantId,
              command.connectionId,
              reloaded.version,
            );
          }
          pushOutbox(reloaded.version);
        }
        return {
          ok: true,
          pollResult: mapBatchToPollConnectionResult(
            command.batch,
            command.loadedCursorVersion,
            "already_committed",
            false,
            false,
            "none",
            reloaded.version,
          ),
        };
      }
      return baseFail("cursor_conflict", "cursor CAS conflict", "deferred_retry", true);
    }

    const now = new Date();
    const generation = buildGeneration(committedVersion, now);
    this.generations.set(
      `${command.tenantId}:${command.connectionId}:${committedVersion}`,
      generation,
    );
    if (this.cursorRepository instanceof InMemoryChannelPollCursorRepository) {
      this.cursorRepository.noteReconciliationCursorVersion(
        command.tenantId,
        command.connectionId,
        committedVersion,
      );
    }

    pushOutbox(committedVersion);

    const pollResult: ChannelPollConnectionResult = mapBatchToPollConnectionResult(
      command.batch,
      command.loadedCursorVersion,
      "advanced",
      true,
      false,
      "none",
      committedVersion,
    );
    return { ok: true, pollResult };
  }
}
