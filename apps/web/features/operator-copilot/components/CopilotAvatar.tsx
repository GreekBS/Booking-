"use client";

import { forwardRef, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AVATAR_DRAG_THRESHOLD,
  AVATAR_SIZE,
  clampAvatarPosition,
  type AvatarPosition,
  type ViewportSize,
} from "../lib/avatar-position";
import { copilotStrings } from "../lib/strings";

export interface CopilotAvatarProps {
  position: AvatarPosition;
  viewport: ViewportSize;
  /** Called once when a drag finishes (persist here). */
  onPositionCommit: (position: AvatarPosition) => void;
  /** Called on click / tap / Enter / Space (never after a drag). */
  onActivate: () => void;
  open?: boolean;
  unreadCount?: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  dragging: boolean;
}

/**
 * Draggable, circular, branded placeholder for the Copilot launcher.
 * Pointer events only (no drag library). A press that moves less than
 * AVATAR_DRAG_THRESHOLD px is treated as a click. Keyboard activation uses
 * the native button click (Enter / Space).
 */
export const CopilotAvatar = forwardRef<HTMLButtonElement, CopilotAvatarProps>(
  function CopilotAvatar(
    { position, viewport, onPositionCommit, onActivate, open = false, unreadCount = 0 },
    ref,
  ) {
    const dragRef = useRef<DragState | null>(null);
    const suppressClickRef = useRef(false);
    const lastDragPositionRef = useRef<AvatarPosition | null>(null);
    const [dragPosition, setDragPosition] = useState<AvatarPosition | null>(null);
    const [dragging, setDragging] = useState(false);

    const current = dragPosition ?? position;

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: position.x,
          originY: position.y,
          dragging: false,
        };
        suppressClickRef.current = false;
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          /* capture is best-effort */
        }
      },
      [position.x, position.y],
    );

    const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.dragging) {
          if (Math.hypot(dx, dy) < AVATAR_DRAG_THRESHOLD) return;
          drag.dragging = true;
          setDragging(true);
        }
        const next = clampAvatarPosition(
          { x: drag.originX + dx, y: drag.originY + dy },
          viewport,
          AVATAR_SIZE,
        );
        lastDragPositionRef.current = next;
        setDragPosition(next);
      },
      [viewport],
    );

    const finishPointer = useCallback(
      (event: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
          /* ignore */
        }
        if (drag.dragging) {
          // The click that follows pointerup must not open the panel.
          suppressClickRef.current = true;
          // If the browser never fires the click, don't swallow a later keyboard activation.
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 50);
          setDragging(false);
          const finalPosition = lastDragPositionRef.current;
          if (!cancelled && finalPosition) onPositionCommit(finalPosition);
          lastDragPositionRef.current = null;
          setDragPosition(null);
        }
      },
      [onPositionCommit],
    );

    const handleClick = useCallback(() => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onActivate();
    }, [onActivate]);

    return (
      <button
        ref={ref}
        type="button"
        data-testid="copilot-avatar"
        aria-label={copilotStrings.avatarLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => finishPointer(e, false)}
        onPointerCancel={(e) => finishPointer(e, true)}
        style={{
          position: "fixed",
          left: current.x,
          top: current.y,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          touchAction: "none",
        }}
        className={cn(
          "z-40 flex select-none items-center justify-center rounded-full border border-border",
          "bg-primary text-primary-foreground shadow-md",
          "text-[15px] font-semibold tracking-wide",
          "transition-shadow motion-reduce:transition-none hover:shadow-lg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dragging ? "cursor-grabbing shadow-lg" : "cursor-grab",
        )}
      >
        <span aria-hidden="true">{copilotStrings.avatarInitials}</span>
        {unreadCount > 0 && !open ? (
          <span
            data-testid="copilot-unread-badge"
            role="status"
            aria-label={copilotStrings.unreadLabel(unreadCount)}
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[11px] font-semibold leading-none text-destructive-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
    );
  },
);
