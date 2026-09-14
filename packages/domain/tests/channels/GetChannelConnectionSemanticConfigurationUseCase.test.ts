import { describe, expect, it, beforeEach } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { withDefaultProviderRegistrationPolicies } from "../../src/channels/ports/providers/ChannelProviderRegistration";
import { createProviderCapabilities } from "../../src/channels/types/ChannelCapabilities";
import { FEED_SEMANTIC_MODES } from "../../src/channels/types/FeedSemanticMode";
import {
  GetChannelConnectionSemanticConfigurationUseCase,
  sortAllowedFeedSemanticModes,
} from "../../src/channels/application/GetChannelConnectionSemanticConfigurationUseCase";
import { ChannelProviderRegistrationError } from "../../src/channels/errors/ChannelProviderRegistrationError";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { ForbiddenError, NotFoundError } from "../../src/shared/errors/DomainError";
import { TestChannelPollingProvider } from "../../src/channels/simulation/TestChannelPollingProvider";
import { PERMISSIONS } from "@hcp/permissions";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440700";
const OTHER_TENANT_ID = "550e8400-e29b-41d4-a716-446655440701";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440702";
const OPAQUE_CONNECTION_ID = "opaque-semantic-conn-1";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440703";

function registerFlexibleProvider(registry: ChannelProviderRegistry): void {
  registry.register(
    withDefaultProviderRegistrationPolicies({
      providerId: "manual",
      capabilities: createProviderCapabilities({
        inbound: { polling: true, webhooks: false, reservationImport: false },
      }),
      status: "active",
      auth: null,
      webhooks: null,
      polling: new TestChannelPollingProvider(),
      reservationImport: null,
      availabilityExport: null,
      rateRestrictionExport: null,
      reservationExport: null,
      allowedFeedSemanticModes: [...FEED_SEMANTIC_MODES],
    }),
  );
}

function registerNarrowProvider(registry: ChannelProviderRegistry): void {
  registry.register(
    withDefaultProviderRegistrationPolicies({
      providerId: "manual",
      capabilities: createProviderCapabilities({
        inbound: { polling: true, webhooks: false, reservationImport: false },
      }),
      status: "active",
      auth: null,
      webhooks: null,
      polling: new TestChannelPollingProvider(),
      reservationImport: null,
      availabilityExport: null,
      rateRestrictionExport: null,
      reservationExport: null,
      allowedFeedSemanticModes: ["mixed_or_unknown_feed"],
    }),
  );
}

describe("GetChannelConnectionSemanticConfigurationUseCase (CM-4b S3f)", () => {
  let connections: InMemoryChannelConnectionRepository;
  let registry: ChannelProviderRegistry;
  let useCase: GetChannelConnectionSemanticConfigurationUseCase;
  const permissionChecker = new PermissionChecker();

  const adminActor = {
    userId: ACTOR_ID,
    role: "admin" as const,
    propertyIds: null,
  };

  const managerActor = {
    userId: "550e8400-e29b-41d4-a716-446655440704",
    role: "manager" as const,
    propertyIds: ["prop-1"],
  };

  async function seedConnection(
    overrides: {
      id?: string;
      tenantId?: string;
      status?: "active" | "paused" | "error";
      semanticMode?: "mixed_or_unknown_feed" | "availability_block_feed" | "reservation_feed";
      semanticConfigVersion?: number;
      updatedAt?: Date;
    } = {},
  ): Promise<ChannelConnection> {
    const id = overrides.id ?? CONNECTION_ID;
    const tenantId = overrides.tenantId ?? TENANT_ID;
    const connection = ChannelConnection.createDraft({
      id,
      tenantId,
      provider: "manual",
      displayName: "Manual",
    });
    connection.attachCredentials(CredentialReference.create("cred_read"));
    connection.activate();
    if (overrides.status === "paused") {
      connection.pause();
    } else if (overrides.status === "error") {
      connection.markError("provider timeout");
    }
    await connections.create(connection);

    if (
      overrides.semanticMode != null ||
      overrides.semanticConfigVersion != null ||
      overrides.updatedAt != null
    ) {
      const loaded = await connections.findById(tenantId, id);
      await connections.persistSemanticState({
        tenantId,
        connectionId: id,
        expectedSemanticConfigVersion: loaded!.semanticConfigVersion,
        semanticMode: overrides.semanticMode ?? loaded!.semanticMode,
        semanticConfigVersion:
          overrides.semanticConfigVersion ?? loaded!.semanticConfigVersion,
        updatedAt: overrides.updatedAt ?? loaded!.updatedAt,
      });
    }

    return (await connections.findById(tenantId, id))!;
  }

  beforeEach(() => {
    connections = new InMemoryChannelConnectionRepository();
    registry = new ChannelProviderRegistry();
    registerFlexibleProvider(registry);
    useCase = new GetChannelConnectionSemanticConfigurationUseCase(
      connections,
      registry,
      permissionChecker,
    );
  });

  it("sorts allowed modes deterministically", () => {
    expect(
      sortAllowedFeedSemanticModes([
        "reservation_feed",
        "mixed_or_unknown_feed",
        "availability_block_feed",
      ]),
    ).toEqual([...FEED_SEMANTIC_MODES]);
  });

  it("returns authorized semantic configuration", async () => {
    const seeded = await seedConnection({ status: "active" });
    const result = await useCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value).toMatchObject({
      connectionId: CONNECTION_ID,
      provider: "manual",
      lifecycleStatus: "active",
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 1,
      canDeclareReservationFeed: true,
    });
    expect(value.allowedSemanticModes).toEqual([...FEED_SEMANTIC_MODES]);
    expect(value.connectionUpdatedAt).toEqual(seeded.updatedAt);
  });

  it("denies actors without manage permission", async () => {
    await seedConnection();
    const result = await useCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      managerActor,
    );
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("returns NotFound for missing connection", async () => {
    const result = await useCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });

  it("returns NotFound for cross-tenant invisible connection", async () => {
    await seedConnection({ tenantId: OTHER_TENANT_ID });
    const result = await useCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });

  it("fails closed when provider registration is missing", async () => {
    await seedConnection();
    const emptyRegistry = new ChannelProviderRegistry();
    const emptyUseCase = new GetChannelConnectionSemanticConfigurationUseCase(
      connections,
      emptyRegistry,
      permissionChecker,
    );
    const result = await emptyUseCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.getError()).toBeInstanceOf(ChannelProviderRegistrationError);
  });

  it("returns provider allow-list independently of actor reservation capability", async () => {
    await seedConnection();
    const limitedChecker = {
      hasPermission: (_actor: unknown, permission: string) =>
        permission === PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
    } as PermissionChecker;
    const limited = new GetChannelConnectionSemanticConfigurationUseCase(
      connections,
      registry,
      limitedChecker,
    );
    const result = await limited.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().allowedSemanticModes).toContain("reservation_feed");
    expect(result.getValue().canDeclareReservationFeed).toBe(false);
  });

  it("reports canDeclareReservationFeed true for admin", async () => {
    await seedConnection();
    const result = await useCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.getValue().canDeclareReservationFeed).toBe(true);
  });

  it("returns persisted mode even when outside current provider allow-list", async () => {
    await seedConnection({
      semanticMode: "reservation_feed",
      semanticConfigVersion: 2,
    });
    const narrow = new ChannelProviderRegistry();
    registerNarrowProvider(narrow);
    const narrowUseCase = new GetChannelConnectionSemanticConfigurationUseCase(
      connections,
      narrow,
      permissionChecker,
    );
    const result = await narrowUseCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().semanticMode).toBe("reservation_feed");
    expect(result.getValue().allowedSemanticModes).toEqual(["mixed_or_unknown_feed"]);
  });

  it("maps paused and error lifecycle statuses", async () => {
    await seedConnection({ status: "paused" });
    expect(
      (
        await useCase.execute(
          { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
          adminActor,
        )
      ).getValue().lifecycleStatus,
    ).toBe("paused");

    const errorConn = ChannelConnection.createDraft({
      id: "err-conn",
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "Err",
    });
    errorConn.attachCredentials(CredentialReference.create("cred_err"));
    errorConn.activate();
    errorConn.markError("boom");
    await connections.create(errorConn);
    expect(
      (
        await useCase.execute({ tenantId: TENANT_ID, connectionId: "err-conn" }, adminActor)
      ).getValue().lifecycleStatus,
    ).toBe("error");
  });

  it("maps connectionUpdatedAt from connection.updatedAt", async () => {
    const stamped = new Date("2026-01-15T12:00:00.000Z");
    await seedConnection({ updatedAt: stamped });
    const result = await useCase.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.getValue().connectionUpdatedAt.toISOString()).toBe(stamped.toISOString());
  });

  it("supports opaque non-UUID connection ids", async () => {
    await seedConnection({ id: OPAQUE_CONNECTION_ID });
    const result = await useCase.execute(
      { tenantId: TENANT_ID, connectionId: OPAQUE_CONNECTION_ID },
      adminActor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().connectionId).toBe(OPAQUE_CONNECTION_ID);
  });
});
