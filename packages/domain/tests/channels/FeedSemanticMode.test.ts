import { describe, expect, it, beforeEach, vi } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { withDefaultProviderRegistrationPolicies } from "../../src/channels/ports/providers/ChannelProviderRegistration";
import { createProviderCapabilities } from "../../src/channels/types/ChannelCapabilities";
import { FEED_SEMANTIC_MODES } from "../../src/channels/types/FeedSemanticMode";
import {
  DEFAULT_ALLOWED_FEED_SEMANTIC_MODES,
  resolveAllowedFeedSemanticModes,
} from "../../src/channels/types/FeedSemanticModePolicy";
import {
  mayEmitBookingAffectingCancel,
  mayEmitReservationCreate,
} from "../../src/channels/types/ReservationEmissionPolicy";
import {
  createSemanticEvidenceStamp,
  SEMANTIC_EVIDENCE_CONTEXT_PAYLOAD_KEY,
} from "../../src/channels/types/SemanticEvidenceStamp";
import {
  assertSemanticConfigVersionCurrent,
  isStaleSemanticConfigVersion,
} from "../../src/channels/types/SemanticConfigVersion";
import { EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD } from "../../src/channels/providers/ical/map/icalEmptyCursorBaseline";
import { SetChannelConnectionSemanticModeUseCase } from "../../src/channels/application/SetChannelConnectionSemanticModeUseCase";
import {
  InMemoryChannelSemanticModeTransitionStore,
  InMemoryTransitionAuditLog,
} from "../../src/channels/repositories/InMemoryChannelSemanticModeTransitionStore";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import { ForbiddenError, ValidationError } from "../../src/shared/errors/DomainError";
import { TestChannelPollingProvider } from "../../src/channels/simulation/TestChannelPollingProvider";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440100";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440101";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440102";

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

function registerDefaultPolicyProvider(registry: ChannelProviderRegistry): void {
  registry.register(
    withDefaultProviderRegistrationPolicies({
      providerId: "ical",
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
      // allowedFeedSemanticModes omitted → fail-closed default
    }),
  );
}

describe("CM-4b S2 semantic feed modes", () => {
  describe("defaults and types", () => {
    it("defaults new connections to mixed_or_unknown_feed at version 1", () => {
      const connection = ChannelConnection.createDraft({
        id: CONNECTION_ID,
        tenantId: TENANT_ID,
        provider: "manual",
        displayName: "Test",
      });
      expect(connection.semanticMode).toBe("mixed_or_unknown_feed");
      expect(connection.semanticConfigVersion).toBe(1);
    });

    it("accepts all three modes when provider policy permits", () => {
      const connection = ChannelConnection.createDraft({
        id: CONNECTION_ID,
        tenantId: TENANT_ID,
        provider: "manual",
        displayName: "Test",
      });
      connection.attachCredentials(CredentialReference.create("cred_1"));
      for (const mode of FEED_SEMANTIC_MODES) {
        connection.assertSemanticActivationAllowed({
          allowedFeedSemanticModes: FEED_SEMANTIC_MODES,
          actorMayDeclareReservationFeed: true,
        });
        if (mode !== connection.semanticMode) {
          const result = connection.applySemanticModeChange(mode);
          expect(result.changed).toBe(true);
        }
      }
    });

    it("rejects invalid runtime mode", () => {
      expect(() =>
        ChannelConnection.createDraft({
          id: CONNECTION_ID,
          tenantId: TENANT_ID,
          provider: "manual",
          displayName: "Test",
          semanticMode: "not_a_mode" as never,
        }),
      ).toThrow(ValidationError);
    });

    it("uses fail-closed allow-list when provider omit declaration", () => {
      expect(resolveAllowedFeedSemanticModes(null)).toEqual(DEFAULT_ALLOWED_FEED_SEMANTIC_MODES);
      expect(resolveAllowedFeedSemanticModes(undefined)).toEqual(
        DEFAULT_ALLOWED_FEED_SEMANTIC_MODES,
      );
      expect(resolveAllowedFeedSemanticModes([])).toEqual(DEFAULT_ALLOWED_FEED_SEMANTIC_MODES);
    });

    it("rejects provider-disallowed mode", () => {
      const connection = ChannelConnection.createDraft({
        id: CONNECTION_ID,
        tenantId: TENANT_ID,
        provider: "ical",
        displayName: "iCal",
      });
      expect(() =>
        connection.assertSemanticActivationAllowed({
          allowedFeedSemanticModes: null,
          actorMayDeclareReservationFeed: true,
        }),
      ).not.toThrow();

      connection.applySemanticModeChange("availability_block_feed");
      expect(() =>
        connection.assertSemanticActivationAllowed({
          allowedFeedSemanticModes: null,
          actorMayDeclareReservationFeed: true,
        }),
      ).toThrow(/not allowed by provider policy/i);
    });
  });

  describe("emission policy", () => {
    it("mayEmitReservationCreate is false for all modes in base CM-4b", () => {
      for (const mode of FEED_SEMANTIC_MODES) {
        expect(mayEmitReservationCreate({ semanticMode: mode, semanticConfigVersion: 1 })).toBe(
          false,
        );
        expect(
          mayEmitBookingAffectingCancel({ semanticMode: mode, semanticConfigVersion: 1 }),
        ).toBe(false);
      }
    });
  });

  describe("evidence stamp and stale version", () => {
    it("creates a stable semantic evidence stamp", () => {
      const stamp = createSemanticEvidenceStamp({
        mode: "availability_block_feed",
        configVersion: 3,
      });
      expect(stamp).toEqual({ mode: "availability_block_feed", configVersion: 3 });
      expect(SEMANTIC_EVIDENCE_CONTEXT_PAYLOAD_KEY).toBe("semanticContext");
    });

    it("detects stale semantic config versions", () => {
      expect(
        isStaleSemanticConfigVersion({ observedVersion: 1, currentVersion: 2 }),
      ).toBe(true);
      expect(
        isStaleSemanticConfigVersion({ observedVersion: 2, currentVersion: 2 }),
      ).toBe(false);
      expect(() =>
        assertSemanticConfigVersionCurrent({ observedVersion: 1, currentVersion: 2 }),
      ).toThrow(/mismatch/i);
    });
  });

  describe("migration hydration", () => {
    it("hydrates legacy persistence without audit or cursor side effects", () => {
      const connection = ChannelConnection.hydrateFromLegacyPersistence({
        id: CONNECTION_ID,
        tenantId: TENANT_ID,
        provider: "manual",
        displayName: "Legacy",
        status: "draft",
        credentialRef: null,
        webhookVerificationRef: null,
        lastError: null,
        createdAt: new Date("2027-01-01T00:00:00.000Z"),
        updatedAt: new Date("2027-01-01T00:00:00.000Z"),
      });
      expect(connection.semanticMode).toBe("mixed_or_unknown_feed");
      expect(connection.semanticConfigVersion).toBe(1);
    });
  });

  describe("SetChannelConnectionSemanticModeUseCase", () => {
    let connections: InMemoryChannelConnectionRepository;
    let cursors: InMemoryChannelPollCursorRepository;
    let registry: ChannelProviderRegistry;
    let auditLog: InMemoryTransitionAuditLog;
    let transitionStore: InMemoryChannelSemanticModeTransitionStore;
    let useCase: SetChannelConnectionSemanticModeUseCase;
    let commandSeq = 0;
    const permissionChecker = new PermissionChecker();

    const adminActor = {
      userId: ACTOR_ID,
      role: "admin" as const,
      propertyIds: null,
    };

    const managerActor = {
      userId: "550e8400-e29b-41d4-a716-446655440103",
      role: "manager" as const,
      propertyIds: ["prop-1"],
    };

    function nextCommandId(prefix = "cmd"): string {
      commandSeq += 1;
      return `${prefix}-${commandSeq}`;
    }

    beforeEach(async () => {
      connections = new InMemoryChannelConnectionRepository();
      cursors = new InMemoryChannelPollCursorRepository(connections);
      registry = new ChannelProviderRegistry();
      auditLog = new InMemoryTransitionAuditLog();
      transitionStore = new InMemoryChannelSemanticModeTransitionStore(
        connections,
        cursors,
        auditLog,
      );
      registerFlexibleProvider(registry);
      useCase = new SetChannelConnectionSemanticModeUseCase(
        transitionStore,
        connections,
        registry,
        permissionChecker,
      );

      const connection = ChannelConnection.createDraft({
        id: CONNECTION_ID,
        tenantId: TENANT_ID,
        provider: "manual",
        displayName: "Manual",
      });
      connection.attachCredentials(CredentialReference.create("cred_1"));
      connection.activate();
      await connections.create(connection);
      await cursors.advanceCursor({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
        nextPayload: "cursor-1",
      });
    });

    it("requires manage permission for mixed/availability modes", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "availability_block_feed",
          },
        },
        managerActor,
        { actorId: managerActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ForbiddenError);
    });

    it("requires elevated permission for reservation_feed", async () => {
      const limitedChecker = {
        hasPermission: (_actor: unknown, permission: string) =>
          permission === PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
      } as PermissionChecker;

      const limitedUseCase = new SetChannelConnectionSemanticModeUseCase(
        transitionStore,
        connections,
        registry,
        limitedChecker,
      );

      const result = await limitedUseCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "reservation_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "reservation_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ForbiddenError);
    });

    it("rejects missing confirmation", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: undefined as never,
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/confirmation/i);
    });

    it("changes mode, increments version once, audits, and resets cursor", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "availability_block_feed",
          },
          reason: "ops declared block feed",
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: "127.0.0.1" },
      );

      expect(result.isSuccess).toBe(true);
      const value = result.getValue();
      expect(value.changed).toBe(true);
      expect(value.previousMode).toBe("mixed_or_unknown_feed");
      expect(value.newMode).toBe("availability_block_feed");
      expect(value.previousSemanticConfigVersion).toBe(1);
      expect(value.newSemanticConfigVersion).toBe(2);
      expect(value.cursorReset).toBe(true);

      const stored = await connections.findById(TENANT_ID, CONNECTION_ID);
      expect(stored?.semanticMode).toBe("availability_block_feed");
      expect(stored?.semanticConfigVersion).toBe(2);
      // The cursor row survives the epoch change: it is baseline-reset in
      // place so the monotonic version is never restarted.
      expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).toMatchObject({
        payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
        version: 1,
        semanticConfigVersion: 2,
      });

      expect(auditLog.entries).toHaveLength(1);
      expect(auditLog.entries[0]?.action).toBe("channel.connection.semantic_mode_changed");
      expect(auditLog.entries[0]?.metadata).toMatchObject({
        previousMode: "mixed_or_unknown_feed",
        newMode: "availability_block_feed",
        previousSemanticConfigVersion: 1,
        newSemanticConfigVersion: 2,
        reason: "ops declared block feed",
      });
    });

    it("treats same-mode update as a no-op without audit or cursor reset", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "mixed_or_unknown_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "mixed_or_unknown_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().changed).toBe(false);
      expect(result.getValue().cursorReset).toBe(false);
      expect(auditLog.entries).toHaveLength(0);
      expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
    });

    it("does not succeed when cursor reset fails", async () => {
      vi.spyOn(cursors, "resetPollCursorBaseline").mockRejectedValueOnce(
        new Error("cursor store down"),
      );
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "reservation_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "reservation_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      const stored = await connections.findById(TENANT_ID, CONNECTION_ID);
      expect(stored?.semanticMode).toBe("mixed_or_unknown_feed");
      expect(stored?.semanticConfigVersion).toBe(1);
      expect(auditLog.entries).toHaveLength(0);
    });

    it("rejects disallowed mode for fail-closed provider", async () => {
      const icalRegistry = new ChannelProviderRegistry();
      registerDefaultPolicyProvider(icalRegistry);
      const icalConnection = ChannelConnection.createDraft({
        id: "550e8400-e29b-41d4-a716-446655440199",
        tenantId: TENANT_ID,
        provider: "ical",
        displayName: "iCal",
      });
      icalConnection.attachCredentials(CredentialReference.create("cred_ical"));
      icalConnection.activate();
      await connections.create(icalConnection);

      const icalUseCase = new SetChannelConnectionSemanticModeUseCase(
        transitionStore,
        connections,
        icalRegistry,
        permissionChecker,
      );

      const result = await icalUseCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: icalConnection.id,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "reservation_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "reservation_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/not allowed by provider policy/i);
    });

    it("does not touch Inbox repositories (no inbox dependency)", () => {
      expect(useCase).toBeDefined();
      // Structural: use case constructor has no inbox port — covered by architecture fitness.
    });

    it("rejects invalid expectedSemanticConfigVersion", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 0,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "availability_block_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ValidationError);
    });

    it("rejects confirmation from-mode mismatch", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "reservation_feed",
            acknowledgedToMode: "availability_block_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/confirmation/i);
    });

    it("rejects confirmation to-mode mismatch", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "reservation_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/confirmation/i);
    });

    it("conflicts on same-mode request with stale semantic version", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 9,
          targetMode: "mixed_or_unknown_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "mixed_or_unknown_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/stale|version|conflict/i);
    });

    it("replays exact same command without second mutation", async () => {
      const commandId = nextCommandId("replay");
      const command = {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId,
        expectedSemanticConfigVersion: 1,
        targetMode: "availability_block_feed" as const,
        confirmation: {
          confirmed: true as const,
          acknowledgedFromMode: "mixed_or_unknown_feed" as const,
          acknowledgedToMode: "availability_block_feed" as const,
        },
      };
      const first = await useCase.execute(command, adminActor, {
        actorId: adminActor.userId,
        ipAddress: null,
      });
      expect(first.isSuccess).toBe(true);
      expect(first.getValue().replayed).toBe(false);
      expect(first.getValue().changed).toBe(true);

      const second = await useCase.execute(command, adminActor, {
        actorId: adminActor.userId,
        ipAddress: null,
      });
      expect(second.isSuccess).toBe(true);
      expect(second.getValue().replayed).toBe(true);
      expect(second.getValue().changed).toBe(true);
      expect(auditLog.entries).toHaveLength(1);
      expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
        2,
      );
    });

    it("preserves active lifecycle status across semantic transition", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "availability_block_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isSuccess).toBe(true);
      expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");
    });

    it("preserves inactive lifecycle status across semantic transition", async () => {
      const loaded = await connections.findById(TENANT_ID, CONNECTION_ID);
      loaded!.pause();
      await connections.pauseWithExpectedSemanticVersion(loaded!, 1, "active");

      const result = await useCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: nextCommandId(),
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "availability_block_feed",
          },
        },
        adminActor,
        { actorId: adminActor.userId, ipAddress: null },
      );
      expect(result.isSuccess).toBe(true);
      expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("paused");
    });
  });
});
