import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AvailabilityEvaluator } from "../../src/commerce/availability/AvailabilityEvaluator";
import { StayPeriod } from "../../src/commerce/shared/value-objects/StayPeriod";
import { GuestCount } from "../../src/commerce/shared/value-objects/GuestCount";
import { LocalDate } from "../../src/commerce/shared/value-objects/LocalDate";
import { mayEmitReservationCreate } from "../../src/channels/types/ReservationEmissionPolicy";
import { ICAL_PROVIDER_CAPABILITIES } from "../../src/channels/types/ChannelCapabilities";
import { createIcalProviderRegistration } from "../../src/channels/providers/ical/createIcalProviderRegistration";

describe("Inbound iCal production-readiness invariants", () => {
  it("never enables reservation.create emission or reservationImport", () => {
    expect(
      mayEmitReservationCreate({
        semanticMode: "availability_block_feed",
        semanticConfigVersion: 1,
      }),
    ).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.inbound.reservationImport).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.core.availabilityExport).toBe(false);

    const registration = createIcalProviderRegistration({
      feedFetcher: { fetch: async () => new Uint8Array() },
    });
    expect(registration.reservationImport).toBeNull();
    expect(registration.availabilityExport).toBeNull();
  });

  it("channel_import active blocks make stays unavailable (advisory inventory safety)", () => {
    const evaluator = new AvailabilityEvaluator();
    const result = evaluator.evaluate({
      stayPeriod: StayPeriod.create("2026-09-10", "2026-09-12"),
      guestCount: GuestCount.create(2),
      unitMaxGuests: 4,
      rules: {
        minNights: 1,
        maxNights: 30,
        checkInDays: [0, 1, 2, 3, 4, 5, 6],
        checkOutDays: [0, 1, 2, 3, 4, 5, 6],
        advanceMinDays: 0,
        advanceMaxDays: 365,
        turnoverNights: 0,
      },
      activeBlocks: [
        {
          blockType: "channel_import",
          status: "active",
          checkIn: "2026-09-10",
          checkOut: "2026-09-13",
          sourceId: null,
        },
      ],
      propertyLocalToday: LocalDate.create("2026-09-01"),
    });
    expect(result.available).toBe(false);
    expect(result.reasons.some((r) => r.code === "BLOCKED")).toBe(true);
  });

  it("disconnect use case wires imported-inventory cleanup port", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/channels/application/DisconnectChannelConnectionUseCase.ts",
      ),
      "utf8",
    );
    expect(source).toContain("IChannelImportedInventoryCleanupStore");
    expect(source).toContain("releaseAllForConnection");
    expect(source).toContain("releasedImportedInventoryCount");
  });

  it("rotation and mapping epoch bumps release superseded channel_import only", () => {
    const rotation = readFileSync(
      path.join(
        process.cwd(),
        "../database/src/repositories/channels/IcalCredentialRotationStore.ts",
      ),
      "utf8",
    );
    const mapping = readFileSync(
      path.join(
        process.cwd(),
        "../database/src/repositories/channels/IcalChannelMappingLifecycleStore.ts",
      ),
      "utf8",
    );
    expect(rotation).toContain('block_type" = \'channel_import\'');
    expect(rotation).toContain("semantic_config_version\" < ${resultingVersion}");
    expect(mapping).toContain("releasedSupersededImportedInventoryCount");
    expect(mapping).toContain("semantic_config_version\" < ${resultingSemanticConfigVersion}");
  });

  it("EXCLUDE still covers hold/booking only (ADR-023 intentional — no silent migration)", () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "../database/prisma/migrations/20250628120000_commerce_core/migration.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("unit_calendar_no_overlap");
    expect(migration).toContain("\"block_type\" IN ('hold', 'booking')");
    expect(migration).not.toMatch(/channel_import.*EXCLUDE|EXCLUDE.*channel_import/s);
  });
});
