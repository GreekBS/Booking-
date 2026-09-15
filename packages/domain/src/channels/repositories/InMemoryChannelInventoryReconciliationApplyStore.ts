import { isChannelInventoryApplyEnabled } from "../application/channelInventoryApplyGate";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type {
  ChannelInventoryApplyCommand,
  ChannelInventoryApplyFailure,
  ChannelInventoryApplyResult,
  ChannelInventoryApplyTestHooks,
  IChannelInventoryReconciliationApplyStore,
} from "../ports/IChannelInventoryReconciliationApplyStore";
import {
  parseAuthoritativeObservedEvidence,
  shouldReleaseProviderIdentity,
} from "../providers/ical/inventory/authoritativeInventoryRemoval";
import { projectDesiredChannelImportBlocks } from "../providers/ical/inventory/projectDesiredChannelImportBlocks";
import type {
  ChannelInventoryReconcileStatus,
  ChannelInventoryReconciliationRecord,
} from "../types/ChannelInventoryReconciliation";

type MutableGeneration = {
  -readonly [K in keyof ChannelInventoryReconciliationRecord]: ChannelInventoryReconciliationRecord[K];
};

export interface InMemoryChannelImportBlock {
  readonly id: string;
  readonly tenantId: string;
  readonly unitId: string;
  propertyId: string;
  readonly blockType: "channel_import";
  status: "active" | "released";
  readonly connectionId: string;
  readonly semanticConfigVersion: number;
  readonly mappingId: string;
  readonly sourceIdentityKey: string;
  entryContentHash: string;
  identityKind: "uid_only" | "uid_rid";
  checkIn: string;
  checkOut: string;
}

function durableIdentityKey(parts: {
  tenantId: string;
  connectionId: string;
  semanticConfigVersion: number;
  mappingId: string;
  unitId: string;
  sourceIdentityKey: string;
}): string {
  return [
    parts.tenantId,
    parts.connectionId,
    String(parts.semanticConfigVersion),
    parts.mappingId,
    parts.unitId,
    parts.sourceIdentityKey,
  ].join("|");
}

/**
 * In-memory TX2 for domain tests. Mirrors fence table without calendar EXCLUDE.
 * Active identities use durableIdentityKey; released history uses `${key}|released:${id}`.
 */
export class InMemoryChannelInventoryReconciliationApplyStore
  implements IChannelInventoryReconciliationApplyStore
{
  readonly blocks = new Map<string, InMemoryChannelImportBlock>();
  private generations = new Map<string, MutableGeneration>();
  private idSeq = 0;

  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly applyEnabled: () => boolean = () => isChannelInventoryApplyEnabled(),
    private readonly hooks: ChannelInventoryApplyTestHooks = {},
  ) {}

  seedGeneration(record: ChannelInventoryReconciliationRecord): void {
    // Record fields are authoritative (including evidence flags). Copy into a
    // MutableGeneration so later apply/supersede can update reconcileStatus.
    this.generations.set(
      `${record.tenantId}:${record.connectionId}:${record.cursorVersion}`,
      { ...record },
    );
  }

  getGeneration(
    tenantId: string,
    connectionId: string,
    cursorVersion: number,
  ): ChannelInventoryReconciliationRecord | null {
    return (
      this.generations.get(`${tenantId}:${connectionId}:${cursorVersion}`) ?? null
    );
  }

  listGenerations(
    tenantId: string,
    connectionId: string,
  ): ChannelInventoryReconciliationRecord[] {
    return [...this.generations.values()].filter(
      (g) => g.tenantId === tenantId && g.connectionId === connectionId,
    );
  }

  /**
   * P1-S6c: supersede every pending generation for a connection.
   * Used by credential rotation / mapping epoch mutations; writes no blocks.
   */
  supersedePendingForConnection(tenantId: string, connectionId: string): number {
    let superseded = 0;
    for (const generation of this.generations.values()) {
      if (
        generation.tenantId === tenantId &&
        generation.connectionId === connectionId &&
        generation.reconcileStatus === "pending"
      ) {
        generation.reconcileStatus = "superseded";
        superseded += 1;
      }
    }
    return superseded;
  }

  async apply(command: ChannelInventoryApplyCommand): Promise<ChannelInventoryApplyResult> {
    if (!this.applyEnabled()) {
      return {
        ok: true,
        execution: "DEFER",
        reconcileStatus: "pending",
        deferReason: "inventory_apply_disabled",
        desiredItemCount: 0,
        createdCount: 0,
        updatedCount: 0,
        retainedStaleCount: 0,
        deactivatedCount: 0,
      };
    }

    const connection = await this.connectionRepository.findById(
      command.tenantId,
      command.connectionId,
    );
    if (!connection) {
      return this.failPermanent(command, "connection_not_found", "not_found");
    }

    if (connection.inventoryApplyEnabled !== true) {
      return {
        ok: true,
        execution: "DEFER",
        reconcileStatus: "pending",
        deferReason: "inventory_apply_disabled",
        desiredItemCount: 0,
        createdCount: 0,
        updatedCount: 0,
        retainedStaleCount: 0,
        deactivatedCount: 0,
      };
    }

    // Lock order mirrors TX2: connection (above) → mappings → reconciliation.
    // Terminal generations NOOP even while paused (S6c supersession fencing).
    const mappings = await this.mappingRepository.listByConnection(
      command.tenantId,
      command.connectionId,
    );

    const genKey = `${command.tenantId}:${command.connectionId}:${command.cursorVersion}`;
    const generation = this.generations.get(genKey);
    if (!generation) {
      return this.failPermanent(command, "invariant_corruption", "generation_not_found");
    }

    if (this.hooks.afterReconciliationLock) {
      await this.hooks.afterReconciliationLock();
    }

    if (generation.reconcileStatus === "applied") {
      return this.noop("applied");
    }
    if (generation.reconcileStatus === "superseded") {
      return this.noop("superseded");
    }
    if (generation.reconcileStatus === "failed") {
      return this.noop("failed");
    }

    if (connection.status !== "active") {
      return {
        ok: true,
        execution: "DEFER",
        reconcileStatus: "pending",
        deferReason: "inactive_connection",
        desiredItemCount: 0,
        createdCount: 0,
        updatedCount: 0,
        retainedStaleCount: 0,
        deactivatedCount: 0,
      };
    }
    if (connection.provider !== "ical") {
      return this.failPermanent(command, "provider_mismatch", "provider_mismatch");
    }
    if (connection.semanticMode !== "availability_block_feed") {
      return this.failPermanent(
        command,
        "feed_semantic_mode_not_availability_block",
        "feedSemanticMode must be availability_block_feed",
      );
    }

    if (
      (command.observedSemanticConfigVersion !== undefined &&
        command.observedSemanticConfigVersion !== generation.semanticConfigVersion) ||
      (command.observedMappingId !== undefined &&
        command.observedMappingId !== generation.mappingId) ||
      (command.observedMappingVersion !== undefined &&
        command.observedMappingVersion !== generation.mappingVersion)
    ) {
      return this.failPermanent(command, "invariant_corruption", "observed_fence_mismatch");
    }

    if (connection.semanticConfigVersion !== generation.semanticConfigVersion) {
      return this.supersede(generation);
    }

    const active = mappings.filter((m) => m.status === "active");
    if (active.length === 0 || active.length > 1) {
      return this.failPermanent(
        command,
        "mapping_count_invalid",
        `expected exactly one active mapping, found ${active.length}`,
      );
    }
    const mapping = active[0]!;
    if (mapping.id !== generation.mappingId) {
      return this.supersede(generation);
    }
    if (mapping.mappingVersion !== generation.mappingVersion) {
      return this.supersede(generation);
    }
    if (mapping.unitId !== generation.unitId) {
      return this.failPermanent(command, "unit_id_mismatch", "unit_id_mismatch");
    }
    if (mapping.propertyId !== generation.propertyId) {
      return this.failPermanent(command, "property_id_mismatch", "property_id_mismatch");
    }

    const newer = [...this.generations.values()].some(
      (g) =>
        g.tenantId === command.tenantId &&
        g.connectionId === command.connectionId &&
        g.cursorVersion > command.cursorVersion &&
        (g.reconcileStatus === "pending" || g.reconcileStatus === "applied"),
    );
    if (newer) {
      return this.supersede(generation);
    }

    const projected = projectDesiredChannelImportBlocks(generation.actionableSnapshot);
    if (!projected.ok) {
      return this.failPermanent(command, "invalid_snapshot", projected.message);
    }

    let createdCount = 0;
    let updatedCount = 0;
    let firstWrite = true;
    for (const desired of projected.blocks) {
      const key = durableIdentityKey({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        semanticConfigVersion: generation.semanticConfigVersion,
        mappingId: generation.mappingId,
        unitId: generation.unitId,
        sourceIdentityKey: desired.sourceIdentityKey,
      });
      const existing = this.blocks.get(key);
      if (!existing || existing.status !== "active") {
        // Reappearance after release: insert a new active row; keep historical released.
        this.idSeq += 1;
        this.blocks.set(key, {
          id: `blk-${this.idSeq}`,
          tenantId: command.tenantId,
          unitId: generation.unitId,
          propertyId: generation.propertyId,
          blockType: "channel_import",
          status: "active",
          connectionId: command.connectionId,
          semanticConfigVersion: generation.semanticConfigVersion,
          mappingId: generation.mappingId,
          sourceIdentityKey: desired.sourceIdentityKey,
          entryContentHash: desired.entryContentHash,
          identityKind: desired.identityKind,
          checkIn: desired.checkIn,
          checkOut: desired.checkOut,
        });
        createdCount += 1;
      } else {
        const changed =
          existing.checkIn !== desired.checkIn ||
          existing.checkOut !== desired.checkOut ||
          existing.entryContentHash !== desired.entryContentHash ||
          existing.identityKind !== desired.identityKind ||
          existing.propertyId !== generation.propertyId;
        existing.checkIn = desired.checkIn;
        existing.checkOut = desired.checkOut;
        existing.entryContentHash = desired.entryContentHash;
        existing.identityKind = desired.identityKind;
        existing.propertyId = generation.propertyId;
        if (changed) {
          updatedCount += 1;
        }
      }
      if (firstWrite && this.hooks.afterFirstBlockWrite) {
        firstWrite = false;
        await this.hooks.afterFirstBlockWrite();
      }
    }

    const evidence = parseAuthoritativeObservedEvidence({
      completeObservedEvidence: generation.completeObservedEvidence,
      observedSourceIdentityKeys: generation.observedSourceIdentityKeys,
      cancelledSourceIdentityKeys: generation.cancelledSourceIdentityKeys,
    });

    let deactivatedCount = 0;
    for (const [key, block] of [...this.blocks.entries()]) {
      if (
        block.status !== "active" ||
        block.tenantId !== command.tenantId ||
        block.connectionId !== command.connectionId ||
        block.semanticConfigVersion !== generation.semanticConfigVersion ||
        block.mappingId !== generation.mappingId ||
        block.unitId !== generation.unitId
      ) {
        continue;
      }
      if (
        evidence.completeObservedEvidence &&
        shouldReleaseProviderIdentity(block.sourceIdentityKey, evidence)
      ) {
        this.blocks.delete(key);
        block.status = "released";
        this.blocks.set(`${key}|released:${block.id}`, block);
        deactivatedCount += 1;
      }
    }

    const desiredKeys = new Set(projected.blocks.map((b) => b.sourceIdentityKey));
    let retainedStaleCount = 0;
    for (const block of this.blocks.values()) {
      if (
        block.status === "active" &&
        block.tenantId === command.tenantId &&
        block.connectionId === command.connectionId &&
        block.semanticConfigVersion === generation.semanticConfigVersion &&
        block.mappingId === generation.mappingId &&
        block.unitId === generation.unitId &&
        !desiredKeys.has(block.sourceIdentityKey)
      ) {
        retainedStaleCount += 1;
      }
    }

    generation.reconcileStatus = "applied";
    generation.appliedAt = new Date();

    for (const g of this.generations.values()) {
      if (
        g.tenantId === command.tenantId &&
        g.connectionId === command.connectionId &&
        g.cursorVersion < command.cursorVersion &&
        g.reconcileStatus === "pending"
      ) {
        g.reconcileStatus = "superseded";
      }
    }

    return {
      ok: true,
      execution: "APPLY",
      reconcileStatus: "applied",
      desiredItemCount: projected.blocks.length,
      createdCount,
      updatedCount,
      retainedStaleCount,
      deactivatedCount,
    };
  }

  private noop(
    status: Extract<ChannelInventoryReconcileStatus, "applied" | "superseded" | "failed">,
  ): ChannelInventoryApplyResult {
    return {
      ok: true,
      execution: "NOOP",
      reconcileStatus: status,
      desiredItemCount: 0,
      createdCount: 0,
      updatedCount: 0,
      retainedStaleCount: 0,
      deactivatedCount: 0,
    };
  }

  private supersede(
    generation: MutableGeneration,
  ): ChannelInventoryApplyResult {
    generation.reconcileStatus = "superseded";
    return {
      ok: true,
      execution: "SUPERSEDE",
      reconcileStatus: "superseded",
      desiredItemCount: 0,
      createdCount: 0,
      updatedCount: 0,
      retainedStaleCount: 0,
      deactivatedCount: 0,
    };
  }

  private failPermanent(
    command: ChannelInventoryApplyCommand,
    code: ChannelInventoryApplyFailure["code"],
    message: string,
    markFailed = true,
  ): ChannelInventoryApplyResult {
    if (markFailed) {
      const gen = this.generations.get(
        `${command.tenantId}:${command.connectionId}:${command.cursorVersion}`,
      );
      if (gen && gen.reconcileStatus === "pending") {
        gen.reconcileStatus = "failed";
        gen.reconcileErrorCode = code;
      }
    }
    return {
      ok: false,
      execution: "PERMANENT_FAIL",
      code,
      message,
      reconcileStatus: markFailed ? "failed" : "pending",
      shouldRetryJob: false,
    };
  }
}
