import { describe, it, expect, beforeEach } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { WebhookVerificationReference } from "../../src/channels/domain/value-objects/WebhookVerificationReference";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440001";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440002";
const CREDENTIAL_REF = CredentialReference.create("cred_fake_001");
const WEBHOOK_REF = WebhookVerificationReference.create("whsec_fake_001");

function createDraft() {
  return ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId: TENANT_ID,
    provider: "booking_com",
    displayName: "Booking.com Main",
    now: new Date("2027-01-01T00:00:00.000Z"),
  });
}

function attachAndActivate(connection: ChannelConnection) {
  connection.attachCredentials(CREDENTIAL_REF);
  connection.activate(new Date("2027-01-01T01:00:00.000Z"));
}

describe("ChannelConnection", () => {
  it("creates a draft connection with null references", () => {
    const connection = createDraft();

    expect(connection.status).toBe("draft");
    expect(connection.credentialRef).toBeNull();
    expect(connection.webhookVerificationRef).toBeNull();
    expect(connection.lastError).toBeNull();
    expect(connection.semanticMode).toBe("mixed_or_unknown_feed");
    expect(connection.semanticConfigVersion).toBe(1);
  });

  it("attaches credentials from draft and moves to pending_auth", () => {
    const connection = createDraft();
    connection.attachCredentials(CREDENTIAL_REF);

    expect(connection.status).toBe("pending_auth");
    expect(connection.credentialRef?.value).toBe("cred_fake_001");
  });

  it("attaches credentials from error and moves to pending_auth", () => {
    const connection = createDraft();
    attachAndActivate(connection);
    connection.markError("sync failed");
    connection.attachCredentials(CredentialReference.create("cred_fake_002"));

    expect(connection.status).toBe("pending_auth");
    expect(connection.lastError).toBeNull();
  });

  it("rejects attachCredentials from active", () => {
    const connection = createDraft();
    attachAndActivate(connection);

    expect(() => connection.attachCredentials(CREDENTIAL_REF)).toThrow(ConflictError);
  });

  it("activates from pending_auth when credential reference is present", () => {
    const connection = createDraft();
    connection.attachCredentials(CREDENTIAL_REF);
    connection.activate(new Date("2027-01-01T01:00:00.000Z"));

    expect(connection.status).toBe("active");
    expect(connection.lastError).toBeNull();
  });

  it("rejects activate from pending_auth without credential reference", () => {
    const connection = ChannelConnection.hydrateFromLegacyPersistence({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "booking_com",
      displayName: "Broken",
      status: "pending_auth",
      credentialRef: null,
      webhookVerificationRef: null,
      lastError: null,
      createdAt: new Date("2027-01-01T00:00:00.000Z"),
      updatedAt: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(() => connection.activate()).toThrow(ValidationError);
  });

  it("rejects activate from draft even when credentials were never attached", () => {
    const connection = createDraft();

    expect(() => connection.activate()).toThrow(ConflictError);
  });

  it("activates from error when credential reference is present", () => {
    const connection = createDraft();
    attachAndActivate(connection);
    connection.markError("provider unavailable");

    connection.activate(new Date("2027-01-01T02:00:00.000Z"));

    expect(connection.status).toBe("active");
    expect(connection.lastError).toBeNull();
  });

  it("pauses and resumes an active connection", () => {
    const connection = createDraft();
    attachAndActivate(connection);

    connection.pause(new Date("2027-01-01T03:00:00.000Z"));
    expect(connection.status).toBe("paused");

    connection.resume(new Date("2027-01-01T04:00:00.000Z"));
    expect(connection.status).toBe("active");
  });

  it("rejects pause from draft", () => {
    expect(() => createDraft().pause()).toThrow(ConflictError);
  });

  it("rejects resume from active", () => {
    const connection = createDraft();
    attachAndActivate(connection);

    expect(() => connection.resume()).toThrow(ConflictError);
  });

  it("rejects resume without credential reference", () => {
    const connection = ChannelConnection.hydrateFromLegacyPersistence({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "ical",
      displayName: "iCal",
      status: "paused",
      credentialRef: null,
      webhookVerificationRef: null,
      lastError: null,
      createdAt: new Date("2027-01-01T00:00:00.000Z"),
      updatedAt: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(() => connection.resume()).toThrow(ValidationError);
  });

  it("marks error with a safe message", () => {
    const connection = createDraft();
    attachAndActivate(connection);

    connection.markError("mapping not found");

    expect(connection.status).toBe("error");
    expect(connection.lastError).toBe("mapping not found");
  });

  it("rejects markError on disconnected connection", () => {
    const connection = createDraft();
    attachAndActivate(connection);
    connection.disconnect();

    expect(() => connection.markError("too late")).toThrow(ConflictError);
  });

  it("disconnects and clears references", () => {
    const connection = createDraft();
    connection.attachWebhookVerification(WEBHOOK_REF);
    connection.attachCredentials(CREDENTIAL_REF);
    connection.activate();
    connection.disconnect(new Date("2027-01-01T05:00:00.000Z"));

    expect(connection.status).toBe("disconnected");
    expect(connection.credentialRef).toBeNull();
    expect(connection.webhookVerificationRef).toBeNull();
    expect(connection.lastError).toBeNull();
  });

  it("attaches webhook verification without changing status on draft", () => {
    const connection = createDraft();
    connection.attachWebhookVerification(WEBHOOK_REF);

    expect(connection.status).toBe("draft");
    expect(connection.webhookVerificationRef?.value).toBe("whsec_fake_001");
  });

  it("rejects mutations on disconnected connection", () => {
    const connection = createDraft();
    attachAndActivate(connection);
    connection.disconnect();

    expect(() => connection.attachWebhookVerification(WEBHOOK_REF)).toThrow(ConflictError);
    expect(() => connection.attachCredentials(CREDENTIAL_REF)).toThrow(ConflictError);
    expect(() => connection.pause()).toThrow(ConflictError);
  });

  it("rejects empty credential reference values", () => {
    expect(() => CredentialReference.create("")).toThrow(ValidationError);
  });

  it("does not expose credential material beyond opaque reference values", () => {
    const connection = createDraft();
    connection.attachCredentials(CREDENTIAL_REF);
    const serialized = JSON.stringify(connection.toProps());

    expect(serialized).not.toMatch(/token|secret|api_key|oauth/i);
    expect(serialized).toContain("cred_fake_001");
  });
});

describe("InMemoryChannelConnectionRepository", () => {
  const repository = new InMemoryChannelConnectionRepository();

  beforeEach(() => {
    repository.clear();
  });

  it("creates and finds a connection by tenant and id", async () => {
    const connection = createDraft();
    connection.attachCredentials(CREDENTIAL_REF);
    await repository.create(connection);

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.status).toBe("pending_auth");
    expect(found?.credentialRef?.value).toBe("cred_fake_001");
    expect(found?.semanticMode).toBe("mixed_or_unknown_feed");
    expect(found?.semanticConfigVersion).toBe(1);
  });

  it("enforces tenant isolation on findById", async () => {
    const connection = createDraft();
    await repository.create(connection);

    const found = await repository.findById("other-tenant", CONNECTION_ID);
    expect(found).toBeNull();
  });

  it("lists connections for a tenant", async () => {
    const first = createDraft();
    const second = ChannelConnection.createDraft({
      id: "550e8400-e29b-41d4-a716-446655440003",
      tenantId: TENANT_ID,
      provider: "airbnb",
      displayName: "Airbnb",
    });
    const otherTenant = ChannelConnection.createDraft({
      id: "550e8400-e29b-41d4-a716-446655440004",
      tenantId: "550e8400-e29b-41d4-a716-446655440099",
      provider: "vrbo",
      displayName: "Vrbo",
    });

    await repository.create(first);
    await repository.create(second);
    await repository.create(otherTenant);

    const listed = await repository.listByTenant(TENANT_ID);
    expect(listed).toHaveLength(2);
    expect(listed.map((entry) => entry.id).sort()).toEqual([
      CONNECTION_ID,
      "550e8400-e29b-41d4-a716-446655440003",
    ]);
  });

  it("updates non-semantic fields without rewriting semantic state or status", async () => {
    const connection = createDraft();
    await repository.create(connection);

    connection.attachCredentials(CREDENTIAL_REF);
    await repository.saveNonSemanticChanges(connection);

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    // Status is omitted from generic save; attachCredentials status change needs a lifecycle path.
    expect(found?.status).toBe("draft");
    expect(found?.credentialRef?.value).toBe("cred_fake_001");
    expect(found?.semanticMode).toBe("mixed_or_unknown_feed");
    expect(found?.semanticConfigVersion).toBe(1);
  });
});
