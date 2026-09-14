import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import { ChannelConnection } from "../domain/ChannelConnection";
import type { ChannelConnectionProps } from "../domain/ChannelConnection";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import {
  DEFAULT_FEED_SEMANTIC_MODE,
  INITIAL_SEMANTIC_CONFIG_VERSION,
  isFeedSemanticMode,
  parseFeedSemanticMode,
  parseSemanticConfigVersion,
} from "../types/FeedSemanticMode";
import type {
  IChannelConnectionRepository,
  PersistChannelConnectionLifecycleStatusParams,
  PersistChannelConnectionSemanticStateParams,
} from "../ports/IChannelConnectionRepository";

function storeKey(tenantId: string, connectionId: string): string {
  return `${tenantId}:${connectionId}`;
}

function cloneProps(props: ChannelConnectionProps): ChannelConnectionProps {
  return {
    ...props,
    createdAt: new Date(props.createdAt),
    updatedAt: new Date(props.updatedAt),
  };
}

function assertCreateSemanticDefaults(props: ChannelConnectionProps): void {
  if (
    props.semanticMode !== DEFAULT_FEED_SEMANTIC_MODE ||
    props.semanticConfigVersion !== INITIAL_SEMANTIC_CONFIG_VERSION
  ) {
    throw new ValidationError(
      "ChannelConnection.create requires mixed_or_unknown_feed at semanticConfigVersion 1",
    );
  }
}

function assertNeverWritesActive(
  nextStatus: ChannelConnectionStatus,
  operation: string,
): void {
  if (nextStatus === "active") {
    throw new ValidationError(
      `${operation} must never write status=active; use activate/resume helpers`,
    );
  }
}

export class InMemoryChannelConnectionRepository implements IChannelConnectionRepository {
  private readonly store = new Map<string, ChannelConnectionProps>();

  async create(connection: ChannelConnection): Promise<void> {
    const props = connection.toProps();
    assertCreateSemanticDefaults(props);

    const key = storeKey(props.tenantId, props.id);
    if (this.store.has(key)) {
      throw new ConflictError(`ChannelConnection already exists: ${props.id}`);
    }

    this.store.set(
      key,
      cloneProps({
        ...props,
        semanticMode: DEFAULT_FEED_SEMANTIC_MODE,
        semanticConfigVersion: INITIAL_SEMANTIC_CONFIG_VERSION,
        inventoryApplyEnabled: false,
      }),
    );
  }

  /**
   * Test/helper: set connection inventory apply fence without enable preconditions.
   * Production operators must use Enable/Disable inventory-apply use cases.
   */
  async setInventoryApplyEnabledForTests(
    tenantId: string,
    connectionId: string,
    enabled: boolean,
  ): Promise<void> {
    const key = storeKey(tenantId, connectionId);
    const existing = this.store.get(key);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError("ChannelConnection", connectionId);
    }
    this.store.set(
      key,
      cloneProps({
        ...existing,
        inventoryApplyEnabled: enabled === true,
        updatedAt: new Date(),
      }),
    );
  }

  async findById(tenantId: string, connectionId: string): Promise<ChannelConnection | null> {
    const props = this.store.get(storeKey(tenantId, connectionId));
    if (!props || props.tenantId !== tenantId) {
      return null;
    }
    return ChannelConnection.reconstitute(cloneProps(props));
  }

  async listByTenant(tenantId: string): Promise<ChannelConnection[]> {
    return [...this.store.values()]
      .filter((props) => props.tenantId === tenantId)
      .map((props) => ChannelConnection.reconstitute(cloneProps(props)));
  }

  async saveNonSemanticChanges(connection: ChannelConnection): Promise<void> {
    const props = connection.toProps();
    const key = storeKey(props.tenantId, props.id);
    const existing = this.store.get(key);
    if (!existing || existing.tenantId !== props.tenantId) {
      throw new NotFoundError("ChannelConnection", props.id);
    }

    // Intentionally omits status (and semantic columns / provider).
    this.store.set(
      key,
      cloneProps({
        ...existing,
        displayName: props.displayName,
        credentialRef: props.credentialRef,
        webhookVerificationRef: props.webhookVerificationRef,
        lastError: props.lastError,
        updatedAt: props.updatedAt,
      }),
    );
  }

  async persistCredentialAttachment(
    connection: ChannelConnection,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void> {
    if (expectedStatus !== "draft" && expectedStatus !== "error") {
      throw new ValidationError(
        "persistCredentialAttachment expectedStatus must be draft or error",
      );
    }
    if (connection.status !== "pending_auth") {
      throw new ValidationError(
        "persistCredentialAttachment requires connection status pending_auth",
      );
    }
    const props = connection.toProps();
    const key = storeKey(props.tenantId, props.id);
    const existing = this.store.get(key);
    if (!existing || existing.tenantId !== props.tenantId) {
      throw new NotFoundError("ChannelConnection", props.id);
    }
    if (existing.status !== expectedStatus) {
      throw new ConflictError(
        "ChannelConnection status conflict during credential attachment",
        "lifecycle_status_conflict",
      );
    }

    this.store.set(
      key,
      cloneProps({
        ...existing,
        status: "pending_auth",
        credentialRef: props.credentialRef,
        webhookVerificationRef: props.webhookVerificationRef,
        lastError: null,
        updatedAt: props.updatedAt,
        displayName: props.displayName,
      }),
    );
  }

  async persistSemanticState(
    params: PersistChannelConnectionSemanticStateParams,
  ): Promise<void> {
    if (!isFeedSemanticMode(params.semanticMode)) {
      throw new ValidationError(`Invalid feed semantic mode: ${String(params.semanticMode)}`);
    }
    parseSemanticConfigVersion(params.semanticConfigVersion);
    parseSemanticConfigVersion(params.expectedSemanticConfigVersion);

    const key = storeKey(params.tenantId, params.connectionId);
    const existing = this.store.get(key);
    if (!existing || existing.tenantId !== params.tenantId) {
      throw new NotFoundError("ChannelConnection", params.connectionId);
    }
    if (existing.semanticConfigVersion !== params.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "ChannelConnection semantic configuration version is stale",
        "semantic_epoch_conflict",
      );
    }

    this.store.set(
      key,
      cloneProps({
        ...existing,
        semanticMode: parseFeedSemanticMode(params.semanticMode),
        semanticConfigVersion: params.semanticConfigVersion,
        updatedAt: new Date(params.updatedAt),
      }),
    );
  }

  async activateWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void> {
    await this.persistLifecycleStatus({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      expectedSemanticConfigVersion,
      expectedStatus,
      nextStatus: "active",
      lastError: null,
      updatedAt: connection.updatedAt,
      requireCredentialRef: true,
    });
  }

  async resumeWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void> {
    await this.persistLifecycleStatus({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      expectedSemanticConfigVersion,
      expectedStatus,
      nextStatus: "active",
      lastError: null,
      updatedAt: connection.updatedAt,
      requireCredentialRef: true,
    });
  }

  async pauseWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void> {
    assertNeverWritesActive(connection.status, "pauseWithExpectedSemanticVersion");
    await this.persistLifecycleStatus({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      expectedSemanticConfigVersion,
      expectedStatus,
      nextStatus: "paused",
      lastError: connection.lastError,
      updatedAt: connection.updatedAt,
    });
  }

  async markErrorWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void> {
    assertNeverWritesActive(connection.status, "markErrorWithExpectedSemanticVersion");
    await this.persistLifecycleStatus({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      expectedSemanticConfigVersion,
      expectedStatus,
      nextStatus: "error",
      lastError: connection.lastError,
      updatedAt: connection.updatedAt,
    });
  }

  async disconnectWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void> {
    assertNeverWritesActive(connection.status, "disconnectWithExpectedSemanticVersion");
    const props = connection.toProps();
    await this.persistLifecycleStatus({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      expectedSemanticConfigVersion,
      expectedStatus,
      nextStatus: "disconnected",
      lastError: null,
      updatedAt: connection.updatedAt,
      credentialRef: props.credentialRef,
      webhookVerificationRef: props.webhookVerificationRef,
    });
  }

  private async persistLifecycleStatus(
    params: PersistChannelConnectionLifecycleStatusParams,
  ): Promise<void> {
    parseSemanticConfigVersion(params.expectedSemanticConfigVersion);

    const key = storeKey(params.tenantId, params.connectionId);
    const existing = this.store.get(key);
    if (!existing || existing.tenantId !== params.tenantId) {
      throw new NotFoundError("ChannelConnection", params.connectionId);
    }

    const credentialOk =
      !params.requireCredentialRef || existing.credentialRef != null;
    const versionOk =
      existing.semanticConfigVersion === params.expectedSemanticConfigVersion;
    const statusOk = existing.status === params.expectedStatus;

    if (!credentialOk || !versionOk || !statusOk) {
      throw this.classifyLifecycleConflict(existing, params);
    }

    this.store.set(
      key,
      cloneProps({
        ...existing,
        status: params.nextStatus,
        lastError: params.lastError,
        updatedAt: new Date(params.updatedAt),
        ...(params.credentialRef !== undefined
          ? { credentialRef: params.credentialRef }
          : {}),
        ...(params.webhookVerificationRef !== undefined
          ? { webhookVerificationRef: params.webhookVerificationRef }
          : {}),
      }),
    );
  }

  private classifyLifecycleConflict(
    existing: ChannelConnectionProps,
    params: PersistChannelConnectionLifecycleStatusParams,
  ): ConflictError {
    if (params.requireCredentialRef && existing.credentialRef == null) {
      return new ConflictError(
        "ChannelConnection credentials are unavailable",
        "credential_conflict",
      );
    }
    if (existing.semanticConfigVersion !== params.expectedSemanticConfigVersion) {
      return new ConflictError(
        "ChannelConnection semantic configuration version is stale",
        "semantic_epoch_conflict",
      );
    }
    if (existing.status !== params.expectedStatus) {
      return new ConflictError(
        "ChannelConnection lifecycle status is stale",
        "lifecycle_status_conflict",
      );
    }
    return new ConflictError("ChannelConnection lifecycle or semantic version is stale");
  }

  clear(): void {
    this.store.clear();
  }

  /** Test/parity helper: deep-clone internal store for transactional rollback. */
  exportStoreSnapshot(): Map<string, ChannelConnectionProps> {
    return new Map(
      [...this.store.entries()].map(([key, props]) => [key, cloneProps(props)]),
    );
  }

  restoreStoreSnapshot(snapshot: Map<string, ChannelConnectionProps>): void {
    this.store.clear();
    for (const [key, props] of snapshot) {
      this.store.set(key, cloneProps(props));
    }
  }
}
