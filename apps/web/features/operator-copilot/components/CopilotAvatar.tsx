"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AVATAR_DRAG_THRESHOLD,
  AVATAR_SIZE,
  clampAvatarPosition,
  type AvatarPosition,
  type ViewportSize,
} from "../lib/avatar-position";
import { usePrefersReducedMotion } from "../lib/prefers-reduced-motion";
import { copilotStrings } from "../lib/strings";
import { TaliaPortrait } from "./TaliaPortrait";

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
  lastClientX: number;
  lastClientY: number;
  lastMoveAt: number;
  velocityX: number;
  velocityY: number;
}

interface SpringOffset {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const PRESS_SCALE = 0.94;
const DRAG_SCALE = 0.96;
const REST_SCALE = 1;
const SPRING_STIFFNESS = 320;
const SPRING_DAMPING = 24;
const VELOCITY_SCALE = 0.18;
const MAX_RELEASE_VELOCITY = 1800;

/**
 * Draggable circular Talia portrait launcher for the Copilot.
 * Pointer events only (no drag library). A press that moves less than
 * AVATAR_DRAG_THRESHOLD px is treated as a click. Keyboard activation uses
 * the native button click (Enter / Space).
 *
 * Visual polish: press/drag scale + a short release spring on a transform
 * offset that settles back to the exact committed position (no edge snap).
 */
export const CopilotAvatar = forwardRef<HTMLButtonElement, CopilotAvatarProps>(
  function CopilotAvatar(
    { position, viewport, onPositionCommit, onActivate, open = false, unreadCount = 0 },
    ref,
  ) {
    const reducedMotion = usePrefersReducedMotion();
    const dragRef = useRef<DragState | null>(null);
    const suppressClickRef = useRef(false);
    const lastDragPositionRef = useRef<AvatarPosition | null>(null);
    const springRef = useRef<SpringOffset>({ x: 0, y: 0, vx: 0, vy: 0 });
    const springRafRef = useRef<number>(0);
    const [dragPosition, setDragPosition] = useState<AvatarPosition | null>(null);
    const [dragging, setDragging] = useState(false);
    const [pressed, setPressed] = useState(false);
    const [springOffset, setSpringOffset] = useState({ x: 0, y: 0 });

    const current = dragPosition ?? position;

    const stopSpring = useCallback(() => {
      if (springRafRef.current) {
        cancelAnimationFrame(springRafRef.current);
        springRafRef.current = 0;
      }
      springRef.current = { x: 0, y: 0, vx: 0, vy: 0 };
      setSpringOffset({ x: 0, y: 0 });
    }, []);

    useEffect(() => () => stopSpring(), [stopSpring]);

    const startReleaseSpring = useCallback(
      (velocityX: number, velocityY: number) => {
        if (reducedMotion) {
          stopSpring();
          return;
        }
        const clampV = (v: number) =>
          Math.max(-MAX_RELEASE_VELOCITY, Math.min(MAX_RELEASE_VELOCITY, v));
        springRef.current = {
          x: 0,
          y: 0,
          vx: clampV(velocityX) * VELOCITY_SCALE,
          vy: clampV(velocityY) * VELOCITY_SCALE,
        };
        let last = performance.now();

        const step = (now: number) => {
          const dt = Math.min(0.032, (now - last) / 1000);
          last = now;
          const s = springRef.current;
          const ax = -SPRING_STIFFNESS * s.x - SPRING_DAMPING * s.vx;
          const ay = -SPRING_STIFFNESS * s.y - SPRING_DAMPING * s.vy;
          s.vx += ax * dt;
          s.vy += ay * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          setSpringOffset({ x: s.x, y: s.y });
          const settled =
            Math.hypot(s.x, s.y) < 0.4 && Math.hypot(s.vx, s.vy) < 8;
          if (settled) {
            stopSpring();
            return;
          }
          springRafRef.current = requestAnimationFrame(step);
        };
        if (springRafRef.current) cancelAnimationFrame(springRafRef.current);
        springRafRef.current = requestAnimationFrame(step);
      },
      [reducedMotion, stopSpring],
    );

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        stopSpring();
        const now = performance.now();
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: position.x,
          originY: position.y,
          dragging: false,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
          lastMoveAt: now,
          velocityX: 0,
          velocityY: 0,
        };
        suppressClickRef.current = false;
        setPressed(true);
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          /* capture is best-effort */
        }
      },
      [position.x, position.y, stopSpring],
    );

    const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const now = performance.now();
        const dt = Math.max(1, now - drag.lastMoveAt);
        drag.velocityX = ((event.clientX - drag.lastClientX) / dt) * 1000;
        drag.velocityY = ((event.clientY - drag.lastClientY) / dt) * 1000;
        drag.lastClientX = event.clientX;
        drag.lastClientY = event.clientY;
        drag.lastMoveAt = now;

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
        setPressed(false);
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
          /* ignore */
        }
        if (drag.dragging) {
          // The click that follows pointerup must not open the panel.
          suppressClickRef.current = true;
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 50);
          setDragging(false);
          const finalPosition = lastDragPositionRef.current;
          if (!cancelled && finalPosition) {
            onPositionCommit(finalPosition);
            startReleaseSpring(drag.velocityX, drag.velocityY);
          } else {
            stopSpring();
          }
          lastDragPositionRef.current = null;
          setDragPosition(null);
        }
      },
      [onPositionCommit, startReleaseSpring, stopSpring],
    );

    const handleClick = useCallback(() => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onActivate();
    }, [onActivate]);

    const scale = dragging ? DRAG_SCALE : pressed ? PRESS_SCALE : REST_SCALE;
    const transform = reducedMotion
      ? undefined
      : `translate(${springOffset.x}px, ${springOffset.y}px) scale(${scale})`;

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
          transform,
          transition: reducedMotion
            ? undefined
            : dragging
              ? "transform 80ms ease-out"
              : "transform 280ms cubic-bezier(0.34, 1.45, 0.64, 1)",
          willChange: reducedMotion ? undefined : "transform",
        }}
        className={cn(
          "z-40 flex select-none items-center justify-center rounded-full bg-transparent p-0",
          "transition-shadow motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <TaliaPortrait size={AVATAR_SIZE} showOnline />
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
