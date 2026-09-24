import {
  ConflictError,
  NotFoundError,
  ValidationError,
  ChannelConnection as ChannelConnectionAggregate,
  parseFeedSemanticMode,
  parseSemanticConfigVersion,
  DEFAULT_FEED_SEMANTIC_MODE,
  INITIAL_SEMANTIC_CONFIG_VERSION,
  type ChannelConnection,
  type ChannelConnectionStatus,
  type ChannelSource,
  type IChannelConnectionRepository,
  type PersistChannelConnectionSemanticStateParams,
} from "@hcp/domain";
import type { PrismaClient } from "@prisma/client";
import type {
  ChannelConnection as PrismaChannelConnection,
  ChannelConnectionStatus as PrismaChannelConnectionStatus,
  ChannelFeedSemanticMode as PrismaChannelFeedSemanticMode,
} from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";

type ConnectionDatabaseClient = PrismaClient | PrismaTransactionClient;

function assertCreateSemanticDefaults(connection: ChannelConnection): void {
  if (
    connection.semanticMode !== DEFAULT_FEED_SEMANTIC_MODE ||
    connection.semanticConfigVersion !== INITIAL_SEMANTIC_CONFIG_VERSION
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

function toDomain(record: PrismaChannelConnection): ChannelConnection {
  return ChannelConnectionAggregate.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    provider: record.provider as ChannelSource,
    displayName: record.displayName,
    status: record.status as ChannelConnectionStatus,
    credentialRef: record.credentialRef,
    webhookVerificationRef: record.webhookVerificationRef,
    lastError: record.lastError,
    semanticMode: parseFeedSemanticMode(record.semanticMode),
    semanticConfigVersion: parseSemanticConfigVersion(record.semanticConfigVersion),
    inventoryApplyEnabled: record.inventoryApplyEnabled === true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export class PrismaChannelConnectionRepository implements IChannelConnectionRepository {
  constructor(private readonly client: ConnectionDatabaseClient = prisma) {}

  async create(connection: ChannelConnection): Promise<void> {
    assertCreateSemanticDefaults(connection);
    const props = connection.toProps();

    await this.withTransaction(props.tenantId, async (tx) => {
      try {
        await tx.channelConnection.create({
          data: {
            tenantId: props.tenantId,
            id: props.id,
            provider: props.provider,
            displayName: props.displayName,
            status: props.status as PrismaChannelConnectionStatus,
            credentialRef: props.credentialRef,
            webhookVerificationRef: props.webhookVerificationRef,
            lastError: props.lastError,
            semanticMode: DEFAULT_FEED_SEMANTIC_MODE,
            semanticConfigVersion: INITIAL_SEMANTIC_CONFIG_VERSION,
            inventoryApplyEnabled: false,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          throw new ConflictError(`ChannelConnection already exists: ${props.id}`);
        }
        throw error;
      }
    });
  }

  async findById(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnection | null> {
    return this.withTransaction(tenantId, async (tx) => {
      const record = await tx.channelConnection.findUnique({
        where: { tenantId_id: { tenantId, id: connectionId } },
      });
      return record ? toDomain(record) : null;
    });
  }

  async listByTenant(tenantId: string): Promise<ChannelConnection[]> {
    return this.withTransaction(tenantId, async (tx) => {
      const records = await tx.channelConnection.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
      });
      return records.map(toDomain);
    });
  }

  async saveNonSemanticChanges(connection: ChannelConnection): Promise<void> {
    const props = connection.toProps();

    await this.withTransaction(props.tenantId, async (tx) => {
      // Physically omit status (and semantic columns / provider).
      const result = await tx.channelConnection.updateMany({
        where: { tenantId: props.tenantId, id: props.id },
        data: {
          displayName: props.displayName,
          credentialRef: props.credentialRef,
          webhookVerificationRef: props.webhookVerificationRef,
          lastError: props.lastError,
          updatedAt: props.updatedAt,
        },
      });
      if (result.count === 0) {
        throw new NotFoundError("ChannelConnection", props.id);
      }
    });
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

    await this.withTransaction(props.tenantId, async (tx) => {
      const result = await tx.channelConnection.updateMany({
        where: {
          tenantId: props.tenantId,
          id: props.id,
          status: expectedStatus as PrismaChannelConnectionStatus,
        },
        data: {
          status: "pending_auth",
          credentialRef: props.credentialRef,
          webhookVerificationRef: props.webhookVerificationRef,
          lastError: null,
          displayName: props.displayName,
          updatedAt: props.updatedAt,
        },
      });
      if (result.count === 0) {
        const existing = await tx.channelConnection.findUnique({
          where: { tenantId_id: { tenantId: props.tenantId, id: props.id } },
        });
        if (!existing) {
          throw new NotFoundError("ChannelConnection", props.id);
        }
        throw new ConflictError(
          "ChannelConnection status conflict during credential attachment",
          "lifecycle_status_conflict",
        );
      }
    });
  }

  async persistSemanticState(
    params: PersistChannelConnectionSemanticStateParams,
  ): Promise<void> {
    const semanticMode = parseFeedSemanticMode(params.semanticMode);
    const semanticConfigVersion = parseSemanticConfigVersion(
      params.semanticConfigVersion,
    );
    const expectedSemanticConfigVersion = parseSemanticConfigVersion(
      params.expectedSemanticConfigVersion,
    );

    await this.withTransaction(params.tenantId, async (tx) => {
      const result = await tx.channelConnection.updateMany({
        where: {
          tenantId: params.tenantId,
          id: params.connectionId,
          semanticConfigVersion: expectedSemanticConfigVersion,
        },
        data: {
          semanticMode: semanticMode as PrismaChannelFeedSemanticMode,
          semanticConfigVersion,
          updatedAt: params.updatedAt,
        },
      });

      if (result.count === 1) {
        return;
      }

      const existing = await tx.channelConnection.findUnique({
        where: {
          tenantId_id: {
            tenantId: params.tenantId,
            id: params.connectionId,
          },
        },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundError("ChannelConnection", params.connectionId);
      }
      throw new ConflictError(
        "ChannelConnection semantic configuration version is stale",
        "semantic_epoch_conflict",
      );
    });
  }

  async activateWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void> {
    await this.persistLifecycleStatusCas({
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
    await this.persistLifecycleStatusCas({
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
    await this.persistLifecycleStatusCas({
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
    await this.persistLifecycleStatusCas({
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
    await this.persistLifecycleStatusCas({
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

  private async persistLifecycleStatusCas(params: {
    tenantId: string;
    connectionId: string;
    expectedSemanticConfigVersion: number;
    expectedStatus: ChannelConnectionStatus;
    nextStatus: ChannelConnectionStatus;
    lastError: string | null;
    updatedAt: Date;
    requireCredentialRef?: boolean;
    credentialRef?: string | null;
    webhookVerificationRef?: string | null;
  }): Promise<void> {
    const expectedSemanticConfigVersion = parseSemanticConfigVersion(
      params.expectedSemanticConfigVersion,
    );

    await this.withTransaction(params.tenantId, async (tx) => {
      const result = await tx.channelConnection.updateMany({
        where: {
          tenantId: params.tenantId,
          id: params.connectionId,
          semanticConfigVersion: expectedSemanticConfigVersion,
          status: params.expectedStatus as PrismaChannelConnectionStatus,
          ...(params.requireCredentialRef ? { credentialRef: { not: null } } : {}),
        },
        data: {
          status: params.nextStatus as PrismaChannelConnectionStatus,
          lastError: params.lastError,
          updatedAt: params.updatedAt,
          ...(params.credentialRef !== undefined
            ? { credentialRef: params.credentialRef }
            : {}),
          ...(params.webhookVerificationRef !== undefined
            ? { webhookVerificationRef: params.webhookVerificationRef }
            : {}),
        },
      });

      if (result.count === 1) {
        return;
      }

      const existing = await tx.channelConnection.findUnique({
        where: {
          tenantId_id: {
            tenantId: params.tenantId,
            id: params.connectionId,
          },
        },
        select: {
          id: true,
          status: true,
          semanticConfigVersion: true,
          credentialRef: true,
        },
      });
      if (!existing) {
        throw new NotFoundError("ChannelConnection", params.connectionId);
      }

      if (params.requireCredentialRef && existing.credentialRef == null) {
        throw new ConflictError(
          "ChannelConnection credentials are unavailable",
          "credential_conflict",
        );
      }
      if (existing.semanticConfigVersion !== expectedSemanticConfigVersion) {
        throw new ConflictError(
          "ChannelConnection semantic configuration version is stale",
          "semantic_epoch_conflict",
        );
      }
      if (existing.status !== params.expectedStatus) {
        throw new ConflictError(
          "ChannelConnection lifecycle status is stale",
          "lifecycle_status_conflict",
        );
      }
      throw new ConflictError("ChannelConnection lifecycle or semantic version is stale");
    });
  }

  private async withTransaction<T>(
    tenantId: string,
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(tenantId, operation);
  }
}
