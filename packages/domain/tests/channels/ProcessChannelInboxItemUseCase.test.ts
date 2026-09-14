import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProcessChannelInboxItemUseCase } from "../../src/channels/application/ProcessChannelInboxItemUseCase";
import { ChannelInboxItem } from "../../src/channels/domain/ChannelInboxItem";
import { ChannelInboxDeduplicationKey } from "../../src/channels/domain/value-objects/ChannelInboxDeduplicationKey";
import { InMemoryChannelInboxRepository } from "../../src/channels/repositories/InMemoryChannelInboxRepository";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";
import { TEST_CHANNEL_TRANSPORT_PROVIDER_ID } from "../../src/channels/simulation/TestChannelTransportProviderBundle";
import type { ImportChannelReservationCreateDryRunUseCase } from "../../src/channels/application/ImportChannelReservationCreateDryRunUseCase";
import type { ImportChannelReservationCommandUseCase } from "../../src/channels/application/ImportChannelReservationCommandUseCase";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440300";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440301";

describe("ProcessChannelInboxItemUseCase unsupported reservation kinds", () => {
  let inboxRepository: InMemoryChannelInboxRepository;
  let dryRunUseCase: ImportChannelReservationCreateDryRunUseCase;
  let importCommandUseCase: ImportChannelReservationCommandUseCase;
  let useCase: ProcessChannelInboxItemUseCase;

  beforeEach(() => {
    inboxRepository = new InMemoryChannelInboxRepository();
    dryRunUseCase = {
      execute: vi.fn(),
    } as unknown as ImportChannelReservationCreateDryRunUseCase;
    importCommandUseCase = {
      execute: vi.fn(),
    } as unknown as ImportChannelReservationCommandUseCase;
    useCase = new ProcessChannelInboxItemUseCase(
      inboxRepository,
      dryRunUseCase,
      importCommandUseCase,
      { generate: () => "processing-token-1" },
    );
  });

  async function seedInboxItem(kind: "reservation.modify" | "reservation.cancel" | "reservation.unknown") {
    const message = buildTransportTestMessage({
      messageId: `msg-${kind}`,
      kind,
      connectionId: CONNECTION_ID,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      externalReservationId:
        kind === "reservation.unknown" ? undefined : `ext-${kind}`,
      payload: kind === "reservation.unknown" ? { providerEventId: "evt-1" } : { externalRevision: "rev-1" },
    });

    const deduplicationKey =
      kind === "reservation.unknown"
        ? ChannelInboxDeduplicationKey.forUnknown(CONNECTION_ID, "evt-1")
        : kind === "reservation.modify"
          ? ChannelInboxDeduplicationKey.forModify(CONNECTION_ID, `ext-${kind}`, "rev-1")
          : ChannelInboxDeduplicationKey.forCancel(CONNECTION_ID, `ext-${kind}`, "rev-1");

    const item = ChannelInboxItem.createNew({
      id: `inbox-${kind}`,
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      ingressKind: "webhook",
      message,
      deduplicationKey,
    });
    await inboxRepository.insert(item);
    return item.id;
  }

  it.each([
    ["reservation.modify", "msg-reservation.modify"],
    ["reservation.cancel", "msg-reservation.cancel"],
    ["reservation.unknown", "msg-reservation.unknown"],
  ] as const)("classifies %s as UNSUPPORTED without invoking import pipeline", async (kind) => {
    const inboxItemId = await seedInboxItem(kind);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      inboxItemId,
      workerId: "worker-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().outcome).toBe("UNSUPPORTED");
    expect(result.getValue().shouldRetryJob).toBe(false);
    expect(dryRunUseCase.execute).not.toHaveBeenCalled();
    expect(importCommandUseCase.execute).not.toHaveBeenCalled();

    const stored = await inboxRepository.findById(TENANT_ID, inboxItemId);
    expect(stored?.outcome).toBe("UNSUPPORTED");
    expect(stored?.resultBookingId).toBeNull();
  });
});
