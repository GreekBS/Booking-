import { describe, it, expect, beforeEach } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440020";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440021";

describe("ChannelConnection provider immutability", () => {
  const repository = new InMemoryChannelConnectionRepository();

  beforeEach(() => {
    repository.clear();
  });

  it("preserves provider on repository save even when reconstituted props differ", async () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "booking_com",
      displayName: "Booking.com",
    });
    connection.attachCredentials(CredentialReference.create("cred_fake_001"));
    await repository.create(connection);

    const mutated = ChannelConnection.reconstitute({
      ...connection.toProps(),
      provider: "airbnb",
      displayName: "Renamed",
    });
    await repository.saveNonSemanticChanges(mutated);

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.provider).toBe("booking_com");
    expect(found?.displayName).toBe("Renamed");
  });

  it("does not expose a domain setter for provider", () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "ical",
      displayName: "iCal",
    });

    expect(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(connection), "provider")?.set).toBeUndefined();
  });
});
