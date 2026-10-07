import { describe, expect, it } from "vitest";
import {
  AVATAR_DEFAULT_MARGIN,
  AVATAR_EDGE_MARGIN,
  AVATAR_SIZE,
  avatarPositionStorageKey,
  clampAvatarPosition,
  computePanelRect,
  defaultAvatarPosition,
  loadAvatarPosition,
  readStoredAvatarPosition,
  writeStoredAvatarPosition,
} from "@/features/operator-copilot/lib/avatar-position";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const VIEWPORT = { width: 1200, height: 800 };

describe("avatar position", () => {
  it("scopes the storage key by tenant and user", () => {
    expect(avatarPositionStorageKey("t1", "u1")).not.toBe(avatarPositionStorageKey("t1", "u2"));
    expect(avatarPositionStorageKey("t1", "u1")).not.toBe(avatarPositionStorageKey("t2", "u1"));
  });

  it("defaults to the bottom-right corner", () => {
    expect(defaultAvatarPosition(VIEWPORT)).toEqual({
      x: VIEWPORT.width - AVATAR_SIZE - AVATAR_DEFAULT_MARGIN,
      y: VIEWPORT.height - AVATAR_SIZE - AVATAR_DEFAULT_MARGIN,
    });
  });

  it("clamps positions inside the viewport", () => {
    expect(clampAvatarPosition({ x: -50, y: -50 }, VIEWPORT)).toEqual({
      x: AVATAR_EDGE_MARGIN,
      y: AVATAR_EDGE_MARGIN,
    });
    expect(clampAvatarPosition({ x: 99999, y: 99999 }, VIEWPORT)).toEqual({
      x: VIEWPORT.width - AVATAR_SIZE - AVATAR_EDGE_MARGIN,
      y: VIEWPORT.height - AVATAR_SIZE - AVATAR_EDGE_MARGIN,
    });
    expect(clampAvatarPosition({ x: 300, y: 200 }, VIEWPORT)).toEqual({ x: 300, y: 200 });
  });

  it("never returns coordinates outside tiny viewports", () => {
    const pos = clampAvatarPosition({ x: 500, y: 500 }, { width: 40, height: 40 });
    expect(pos).toEqual({ x: AVATAR_EDGE_MARGIN, y: AVATAR_EDGE_MARGIN });
  });

  it("persists and restores a position per tenant+user", () => {
    const storage = memoryStorage();
    writeStoredAvatarPosition("t1", "u1", { x: 120.4, y: 80.6 }, storage);
    expect(readStoredAvatarPosition("t1", "u1", storage)).toEqual({ x: 120, y: 81 });
    expect(readStoredAvatarPosition("t1", "u2", storage)).toBeNull();
    expect(readStoredAvatarPosition("t2", "u1", storage)).toBeNull();
  });

  it("re-clamps a stored position to a smaller viewport", () => {
    const storage = memoryStorage();
    writeStoredAvatarPosition("t1", "u1", { x: 1100, y: 700 }, storage);
    const pos = loadAvatarPosition("t1", "u1", { width: 600, height: 400 }, storage);
    expect(pos).toEqual({
      x: 600 - AVATAR_SIZE - AVATAR_EDGE_MARGIN,
      y: 400 - AVATAR_SIZE - AVATAR_EDGE_MARGIN,
    });
  });

  it("falls back to the default for missing or corrupt storage", () => {
    const fallback = defaultAvatarPosition(VIEWPORT);
    expect(loadAvatarPosition("t1", "u1", VIEWPORT, memoryStorage())).toEqual(fallback);
    const corrupt = memoryStorage({
      [avatarPositionStorageKey("t1", "u1")]: "{not json",
    });
    expect(loadAvatarPosition("t1", "u1", VIEWPORT, corrupt)).toEqual(fallback);
    const wrongShape = memoryStorage({
      [avatarPositionStorageKey("t1", "u1")]: JSON.stringify({ x: "a", y: null }),
    });
    expect(loadAvatarPosition("t1", "u1", VIEWPORT, wrongShape)).toEqual(fallback);
  });

  it("tolerates unavailable storage", () => {
    expect(readStoredAvatarPosition("t1", "u1", null)).toBeNull();
    expect(() => writeStoredAvatarPosition("t1", "u1", { x: 1, y: 1 }, null)).not.toThrow();
  });
});

describe("panel placement", () => {
  it("opens above an avatar in the lower half and stays in the viewport", () => {
    const avatar = defaultAvatarPosition(VIEWPORT);
    const rect = computePanelRect(avatar, VIEWPORT);
    expect(rect.top + rect.height).toBeLessThanOrEqual(avatar.y);
    expect(rect.left).toBeGreaterThanOrEqual(AVATAR_EDGE_MARGIN);
    expect(rect.left + rect.width).toBeLessThanOrEqual(VIEWPORT.width - AVATAR_EDGE_MARGIN);
  });

  it("opens below an avatar in the upper half", () => {
    const rect = computePanelRect({ x: 20, y: 20 }, VIEWPORT);
    expect(rect.top).toBeGreaterThanOrEqual(20 + AVATAR_SIZE);
    expect(rect.top + rect.height).toBeLessThanOrEqual(VIEWPORT.height);
    expect(rect.left).toBeGreaterThanOrEqual(AVATAR_EDGE_MARGIN);
  });
});
