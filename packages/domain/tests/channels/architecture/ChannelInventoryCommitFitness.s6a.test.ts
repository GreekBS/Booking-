import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");
const DATABASE_CHANNELS = join(DOMAIN_ROOT, "..", "database", "src", "repositories", "channels");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("P1-S6a architecture fitness", () => {
  it("inventory commit store does not import calendar mutation APIs", () => {
    const prismaStore = read(join(DATABASE_CHANNELS, "ChannelPollInventoryCommitStore.ts"));
    const memoryStore = read(
      join(CHANNELS_SRC, "repositories/InMemoryChannelPollInventoryCommitStore.ts"),
    );
    for (const source of [prismaStore, memoryStore]) {
      expect(source).not.toMatch(
        /from ["'].*CalendarBlock|from ["'].*BookingRepository|unitCalendarBlock\./,
      );
      expect(source).not.toMatch(/channel_imported_inventory_blocks|ReconcileIcalImportedInventory/);
    }
  });

  it("S6c credential rotation is exported alongside S6b reconcile", () => {
    const domainIndex = read(join(CHANNELS_SRC, "index.ts"));
    expect(domainIndex).toMatch(/ReconcileIcalImportedInventoryUseCase/);
    // P1-S6c is IMPLEMENTED (not operationally activated).
    expect(domainIndex).toMatch(/RotateIcalConnectionCredentialsUseCase/);
    expect(domainIndex).toMatch(/UpsertChannelListingMappingUseCase/);
    expect(domainIndex).toMatch(/DeactivateChannelListingMappingUseCase/);
  });

  it("inventory apply gate defaults off in gate implementation", () => {
    const gate = read(join(CHANNELS_SRC, "application/channelInventoryApplyGate.ts"));
    expect(gate).toMatch(/CHANNELS_INVENTORY_APPLY_ENABLED === "true"/);
  });
});
