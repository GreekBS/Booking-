import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ChannelConnection, CredentialReference } from "@hcp/domain";
import { PrismaChannelConnectionRepository } from "../../src";
import { prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("ChannelConnection provider immutability (CM-4a-1)", () => {
  const connectionRepository = new PrismaChannelConnectionRepository();

  const TENANT_ID = "550e8400-e29b-41d4-a716-446655440030";
  const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440031";

  beforeEach(async () => {
    await prisma.channelConnection.deleteMany();
  });

  afterAll(async () => {
    await prisma.channelConnection.deleteMany();
    await prisma.$disconnect();
  });

  it("does not update provider on subsequent save", async () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "booking_com",
      displayName: "Booking.com",
    });
    connection.attachCredentials(CredentialReference.create("cred_fake_001"));
    connection.activate();
    await connectionRepository.create(connection);

    const mutated = ChannelConnection.reconstitute({
      ...connection.toProps(),
      provider: "airbnb",
      displayName: "Renamed connection",
    });
    await connectionRepository.saveNonSemanticChanges(mutated);

    const found = await connectionRepository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.provider).toBe("booking_com");
    expect(found?.displayName).toBe("Renamed connection");

    const raw = await prisma.channelConnection.findUnique({
      where: { tenantId_id: { tenantId: TENANT_ID, id: CONNECTION_ID } },
    });
    expect(raw?.provider).toBe("booking_com");
  });
});
