import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import { nextChannelPollCursorVersion } from "../application/nextChannelPollCursorVersion";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import {
  hydrateChannelPollCursor,
  type ChannelPollCursor,
} from "../types/ChannelPollCursor";
import type {
  AdvanceChannelPollCursorParams,
  IChannelPollCursorRepository,
  ResetPollCursorBaselineParams,
  ResetPollCursorBaselineResult,
} from "../ports/IChannelPollCursorRepository";

function cursorKey(tenantId: string, connectionId: string): string {
  return `${tenantId}:${connectionId}`;
}

export class InMemoryChannelPollCursorRepository implements IChannelPollCursorRepository {
  private readonly store = new Map<string, ChannelPollCursor>();
  /** Tracks MAX(reconciliation.cursor_version) for monotonic create/advance. */
  private readonly maxReconciliationVersions = new Map<string, number>();

  constructor(
    private readonly connectionRepository: Pick<IChannelConnectionRepository, "findById">,
  ) {}

  /**
   * Record a durable reconciliation generation version for monotonic nextVersion.
   * Call sites that insert channel_inventory_reconciliations must invoke this.
   */
  noteReconciliationCursorVersion(
    tenantId: string,
    connectionId: string,
    cursorVersion: number,
  ): void {
    if (!Number.isInteger(cursorVersion) || cursorVersion < 1) {
      throw new ValidationError("cursorVersion must be a positive integer");
    }
    const key = cursorKey(tenantId, connectionId);
    const prev = this.maxReconciliationVersions.get(key) ?? 0;
    if (cursorVersion > prev) {
      this.maxReconciliationVersions.set(key, cursorVersion);
    }
  }

  getMaxReconciliationCursorVersion(tenantId: string, connectionId: string): number {
    return this.maxReconciliationVersions.get(cursorKey(tenantId, connectionId)) ?? 0;
  }

  async getCursor(tenantId: string, connectionId: string): Promise<ChannelPollCursor | null> {
    const cursor = this.store.get(cursorKey(tenantId, connectionId));
    return cursor ? hydrateChannelPollCursor(cursor) : null;
  }

  async advanceCursor(params: AdvanceChannelPollCursorParams): Promise<ChannelPollCursor> {
    if (
      !Number.isInteger(params.observedSemanticConfigVersion) ||
      params.observedSemanticConfigVersion < 1
    ) {
      throw new ValidationError("observedSemanticConfigVersion must be a positive integer");
    }
    if (
      !Number.isInteger(params.expectedCursorVersion) ||
      params.expectedCursorVersion < 0
    ) {
      throw new ValidationError("expectedCursorVersion must be a non-negative integer");
    }

    const connection = await this.connectionRepository.findById(
      params.tenantId,
      params.connectionId,
    );
    if (!connection) {
      throw new NotFoundError("ChannelConnection", params.connectionId);
    }
    if (connection.semanticConfigVersion !== params.observedSemanticConfigVersion) {
      throw new ConflictError("Channel poll cursor semantic epoch is stale");
    }

    const key = cursorKey(params.tenantId, params.connectionId);
    const current = this.store.get(key);
    const maxRecon = this.getMaxReconciliationCursorVersion(
      params.tenantId,
      params.connectionId,
    );

    if (!current) {
      if (params.expectedCursorVersion !== 0) {
        throw new ConflictError("Channel poll cursor version is stale");
      }
      const version = nextChannelPollCursorVersion(0, maxRecon);
      const created = hydrateChannelPollCursor({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        payload: params.nextPayload,
        version,
        semanticConfigVersion: params.observedSemanticConfigVersion,
        updatedAt: new Date(),
      });
      this.store.set(key, created);
      return hydrateChannelPollCursor(created);
    }

    if (
      current.version !== params.expectedCursorVersion ||
      current.semanticConfigVersion !== params.observedSemanticConfigVersion
    ) {
      throw new ConflictError("Channel poll cursor version or semantic epoch is stale");
    }

    const version = nextChannelPollCursorVersion(current.version, maxRecon);
    const updated = hydrateChannelPollCursor({
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      payload: params.nextPayload,
      version,
      semanticConfigVersion: params.observedSemanticConfigVersion,
      updatedAt: new Date(),
    });
    this.store.set(key, updated);
    return hydrateChannelPollCursor(updated);
  }

  async resetPollCursorBaseline(
    params: ResetPollCursorBaselineParams,
  ): Promise<ResetPollCursorBaselineResult> {
    if (
      !Number.isInteger(params.semanticConfigVersion) ||
      params.semanticConfigVersion < 1
    ) {
      throw new ValidationError("semanticConfigVersion must be a positive integer");
    }
    if (typeof params.baselinePayload !== "string" || params.baselinePayload.length === 0) {
      throw new ValidationError("baselinePayload must be a non-empty string");
    }

    const connection = await this.connectionRepository.findById(
      params.tenantId,
      params.connectionId,
    );
    if (!connection) {
      throw new NotFoundError("ChannelConnection", params.connectionId);
    }

    const key = cursorKey(params.tenantId, params.connectionId);
    const current = this.store.get(key);
    if (!current) {
      return { cursorRowUpdated: false, retainedVersion: null };
    }

    const updated = hydrateChannelPollCursor({
      tenantId: current.tenantId,
      connectionId: current.connectionId,
      payload: params.baselinePayload,
      version: current.version,
      semanticConfigVersion: params.semanticConfigVersion,
      updatedAt: new Date(),
    });
    this.store.set(key, updated);
    return { cursorRowUpdated: true, retainedVersion: current.version };
  }

  clear(): void {
    this.store.clear();
    this.maxReconciliationVersions.clear();
  }

  /** Test/parity helper: deep-clone internal store for transactional rollback. */
  exportStoreSnapshot(): {
    cursors: Map<string, ChannelPollCursor>;
    maxReconciliationVersions: Map<string, number>;
  } {
    return {
      cursors: new Map(
        [...this.store.entries()].map(([key, cursor]) => [
          key,
          hydrateChannelPollCursor(cursor),
        ]),
      ),
      maxReconciliationVersions: new Map(this.maxReconciliationVersions),
    };
  }

  restoreStoreSnapshot(snapshot: {
    cursors: Map<string, ChannelPollCursor>;
    maxReconciliationVersions?: Map<string, number>;
  }): void {
    this.store.clear();
    for (const [key, cursor] of snapshot.cursors) {
      this.store.set(key, hydrateChannelPollCursor(cursor));
    }
    this.maxReconciliationVersions.clear();
    if (snapshot.maxReconciliationVersions) {
      for (const [key, version] of snapshot.maxReconciliationVersions) {
        this.maxReconciliationVersions.set(key, version);
      }
    }
  }
}
