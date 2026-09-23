import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");

describe("CM-4c certification architecture fitness", () => {
  it("paused ARI push is retryable (durable work survives resume)", () => {
    const source = readFileSync(
      join(CHANNELS_SRC, "application/ExecuteBookingComAriPushUseCase.ts"),
      "utf8",
    );
    expect(source).toMatch(/Connection paused — ARI push deferred until resume/);
    expect(source).toMatch(/BookingComAriRetryablePushError/);
    expect(source).toMatch(/status === "paused"/);
  });

  it("Confirm fails closed when every projection is rejected", () => {
    const source = readFileSync(
      join(CHANNELS_SRC, "application/ConfirmBookingComInitialSyncUseCase.ts"),
      "utf8",
    );
    expect(source).toMatch(/could not enqueue any ARI work; preview not consumed/);
    expect(source).toMatch(/markConfirmed/);
  });

  it("reservation mapping redacts payment/VCC before inbox persistence", () => {
    const mapSource = readFileSync(
      join(
        CHANNELS_SRC,
        "providers/booking_com/parse/mapBookingComReservationToProviderMessage.ts",
      ),
      "utf8",
    );
    const redactSource = readFileSync(
      join(
        CHANNELS_SRC,
        "providers/booking_com/parse/redactBookingComSensitiveReservationXml.ts",
      ),
      "utf8",
    );
    expect(mapSource).toMatch(/redactBookingComSensitiveReservationXml/);
    expect(redactSource).toMatch(/PaymentCard/);
    expect(redactSource).toMatch(/REDACTED:PaymentCard/);
  });

  it("summary recovery depends on ReceiveChannelEventUseCase only", () => {
    const source = readFileSync(
      join(
        CHANNELS_SRC,
        "providers/booking_com/recovery/BookingComSummaryRecoveryUseCase.ts",
      ),
      "utf8",
    );
    expect(source).toMatch(/ReceiveChannelEventUseCase/);
    expect(source).toMatch(/receiveChannelEventUseCase\.execute/);
    expect(source).not.toMatch(/CreateBooking/);
    expect(source).not.toMatch(/CommerceUseCases/);
  });

  it("loop suppression stays generic (not Commerce-hardcoded)", () => {
    const source = readFileSync(
      join(CHANNELS_SRC, "application/channelOutboundLoopSuppression.ts"),
      "utf8",
    );
    expect(source).toMatch(/shouldSuppressChannelOutboundEcho/);
    expect(source).not.toMatch(/CreateBookingUseCase/);
    expect(source).not.toMatch(/HoldConversion/);
  });
});
