import type { IcalInventoryActionableIdentityKind } from "./buildIcalInventoryActionableSnapshot";

/**
 * Desired provider-owned channel_import block derived from S6a actionable snapshot.
 * Dates are DATE-only half-open [checkIn, checkOut).
 */
export interface DesiredChannelImportBlock {
  readonly sourceIdentityKey: string;
  readonly entryContentHash: string;
  readonly identityKind: IcalInventoryActionableIdentityKind;
  readonly checkIn: string;
  readonly checkOut: string;
}

export type ProjectDesiredChannelImportBlocksResult =
  | { readonly ok: true; readonly blocks: readonly DesiredChannelImportBlock[] }
  | { readonly ok: false; readonly code: "INVALID_SNAPSHOT"; readonly message: string };

function isIdentityKind(value: unknown): value is IcalInventoryActionableIdentityKind {
  return value === "uid_only" || value === "uid_rid";
}

function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Project durable S6a actionable snapshot JSON into desired channel_import blocks.
 * Accepts either the stored compact array shape or hydrated item objects.
 */
export function projectDesiredChannelImportBlocks(
  actionableSnapshot: unknown,
): ProjectDesiredChannelImportBlocksResult {
  if (!Array.isArray(actionableSnapshot)) {
    return {
      ok: false,
      code: "INVALID_SNAPSHOT",
      message: "actionableSnapshot must be an array",
    };
  }

  const blocks: DesiredChannelImportBlock[] = [];
  const seen = new Set<string>();

  for (const raw of actionableSnapshot) {
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        code: "INVALID_SNAPSHOT",
        message: "actionableSnapshot item must be an object",
      };
    }
    const item = raw as Record<string, unknown>;

    // Compact encoding: { i, h, k, s, e } or hydrated IcalInventoryActionableItem
    const sourceIdentityKey =
      typeof item.sourceIdentityKey === "string"
        ? item.sourceIdentityKey
        : typeof item.i === "string"
          ? item.i
          : null;
    const entryContentHash =
      typeof item.entryContentHash === "string"
        ? item.entryContentHash
        : typeof item.h === "string"
          ? item.h
          : null;
    const identityKindRaw =
      item.identityKind !== undefined
        ? item.identityKind
        : item.k === 1
          ? "uid_only"
          : item.k === 2
            ? "uid_rid"
            : null;
    const checkIn =
      typeof item.checkIn === "string"
        ? item.checkIn
        : typeof item.s === "string"
          ? item.s
          : null;
    const checkOut =
      typeof item.checkOut === "string"
        ? item.checkOut
        : typeof item.e === "string"
          ? item.e
          : null;

    if (
      sourceIdentityKey === null ||
      entryContentHash === null ||
      !isIdentityKind(identityKindRaw) ||
      !isDateOnly(checkIn) ||
      !isDateOnly(checkOut)
    ) {
      return {
        ok: false,
        code: "INVALID_SNAPSHOT",
        message: "actionableSnapshot item missing required fields",
      };
    }
    if (sourceIdentityKey.length < 1 || sourceIdentityKey.length > 324) {
      return {
        ok: false,
        code: "INVALID_SNAPSHOT",
        message: "sourceIdentityKey length out of bounds",
      };
    }
    if (!/^[0-9a-f]{64}$/.test(entryContentHash)) {
      return {
        ok: false,
        code: "INVALID_SNAPSHOT",
        message: "entryContentHash must be 64 lowercase hex",
      };
    }
    if (checkOut <= checkIn) {
      return {
        ok: false,
        code: "INVALID_SNAPSHOT",
        message: "checkOut must be after checkIn",
      };
    }
    if (seen.has(sourceIdentityKey)) {
      return {
        ok: false,
        code: "INVALID_SNAPSHOT",
        message: "duplicate sourceIdentityKey in snapshot",
      };
    }
    seen.add(sourceIdentityKey);
    blocks.push({
      sourceIdentityKey,
      entryContentHash,
      identityKind: identityKindRaw,
      checkIn,
      checkOut,
    });
  }

  blocks.sort((a, b) =>
    a.sourceIdentityKey < b.sourceIdentityKey
      ? -1
      : a.sourceIdentityKey > b.sourceIdentityKey
        ? 1
        : 0,
  );

  return { ok: true, blocks };
}
