/**
 * Draggable Copilot avatar positioning helpers (pure + storage-safe).
 *
 * Position = top-left corner of the avatar in viewport (CSS fixed) pixels.
 * Stored in localStorage scoped by tenant + user so a shared browser never
 * leaks one operator's layout preference to another.
 */

export const AVATAR_SIZE = 56;
export const AVATAR_EDGE_MARGIN = 8;
export const AVATAR_DEFAULT_MARGIN = 20;
/** Pointer movement (px) below which a press counts as a click, not a drag. */
export const AVATAR_DRAG_THRESHOLD = 5;

const STORAGE_PREFIX = "talos.copilot.avatar.v1";

export interface AvatarPosition {
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export function avatarPositionStorageKey(tenantId: string, userId: string): string {
  return `${STORAGE_PREFIX}:${tenantId}:${userId}`;
}

/** Default: bottom-right corner. */
export function defaultAvatarPosition(
  viewport: ViewportSize,
  size: number = AVATAR_SIZE,
): AvatarPosition {
  return clampAvatarPosition(
    {
      x: viewport.width - size - AVATAR_DEFAULT_MARGIN,
      y: viewport.height - size - AVATAR_DEFAULT_MARGIN,
    },
    viewport,
    size,
  );
}

/** Keep the whole avatar inside the viewport (tiny viewports pin to the margin). */
export function clampAvatarPosition(
  position: AvatarPosition,
  viewport: ViewportSize,
  size: number = AVATAR_SIZE,
): AvatarPosition {
  const maxX = Math.max(AVATAR_EDGE_MARGIN, viewport.width - size - AVATAR_EDGE_MARGIN);
  const maxY = Math.max(AVATAR_EDGE_MARGIN, viewport.height - size - AVATAR_EDGE_MARGIN);
  return {
    x: Math.min(Math.max(position.x, AVATAR_EDGE_MARGIN), maxX),
    y: Math.min(Math.max(position.y, AVATAR_EDGE_MARGIN), maxY),
  };
}

function safeStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredAvatarPosition(
  tenantId: string,
  userId: string,
  storage?: Storage | null,
): AvatarPosition | null {
  const store = safeStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(avatarPositionStorageKey(tenantId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AvatarPosition> | null;
    if (
      !parsed ||
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function writeStoredAvatarPosition(
  tenantId: string,
  userId: string,
  position: AvatarPosition,
  storage?: Storage | null,
): void {
  const store = safeStorage(storage);
  if (!store) return;
  try {
    store.setItem(
      avatarPositionStorageKey(tenantId, userId),
      JSON.stringify({ x: Math.round(position.x), y: Math.round(position.y) }),
    );
  } catch {
    /* quota / private mode: position is a preference only */
  }
}

/** Stored position (clamped to the current viewport) or the bottom-right default. */
export function loadAvatarPosition(
  tenantId: string,
  userId: string,
  viewport: ViewportSize,
  storage?: Storage | null,
  size: number = AVATAR_SIZE,
): AvatarPosition {
  const stored = readStoredAvatarPosition(tenantId, userId, storage);
  return stored
    ? clampAvatarPosition(stored, viewport, size)
    : defaultAvatarPosition(viewport, size);
}

// ---------------------------------------------------------------------------
// Panel placement (desktop)
// ---------------------------------------------------------------------------

export interface PanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const PANEL_WIDTH = 380;
export const PANEL_MAX_HEIGHT = 560;
export const PANEL_GAP = 12;

/**
 * Floating panel rect anchored next to the avatar: above it when the avatar is
 * in the lower half of the viewport, below it otherwise; right edge aligned to
 * the avatar and clamped inside the viewport.
 */
export function computePanelRect(
  avatar: AvatarPosition,
  viewport: ViewportSize,
  size: number = AVATAR_SIZE,
): PanelRect {
  const width = Math.min(PANEL_WIDTH, viewport.width - 2 * AVATAR_EDGE_MARGIN);
  const avatarCenterY = avatar.y + size / 2;
  const placeAbove = avatarCenterY > viewport.height / 2;

  const availableHeight = placeAbove
    ? avatar.y - PANEL_GAP - AVATAR_EDGE_MARGIN
    : viewport.height - (avatar.y + size) - PANEL_GAP - AVATAR_EDGE_MARGIN;
  const height = Math.max(
    240,
    Math.min(PANEL_MAX_HEIGHT, availableHeight, viewport.height - 2 * AVATAR_EDGE_MARGIN),
  );

  const rawLeft = avatar.x + size - width;
  const left = Math.min(
    Math.max(rawLeft, AVATAR_EDGE_MARGIN),
    Math.max(AVATAR_EDGE_MARGIN, viewport.width - width - AVATAR_EDGE_MARGIN),
  );
  const rawTop = placeAbove ? avatar.y - PANEL_GAP - height : avatar.y + size + PANEL_GAP;
  const top = Math.min(
    Math.max(rawTop, AVATAR_EDGE_MARGIN),
    Math.max(AVATAR_EDGE_MARGIN, viewport.height - height - AVATAR_EDGE_MARGIN),
  );
  return { left, top, width, height };
}
