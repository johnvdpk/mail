"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  /** localStorage key the size is persisted under. */
  storageKey: string;
  defaultSize: number;
  min: number;
  max: number;
  /** Pixels nudged per arrow-key press when the handle has focus. */
  step?: number;
  /** Horizontal (column width) or vertical (row height). */
  axis?: "x" | "y";
  /** Grow when the pointer moves toward smaller coordinates (handle above a bottom panel). */
  inverted?: boolean;
};

/**
 * Drag-to-resize a single panel dimension (in pixels), clamped and persisted
 * per browser via localStorage. Attach the returned handlers directly to a
 * divider element; pointer capture keeps drag/keyboard events routed to it
 * even once the cursor leaves its bounds.
 */
export function useResizablePanel({
  storageKey,
  defaultSize,
  min,
  max,
  step = 16,
  axis = "x",
  inverted = false,
}: Options) {
  const [size, setSize] = useState(defaultSize);
  const sizeRef = useRef(defaultSize);
  const dragRef = useRef<{ startPos: number; startSize: number } | null>(null);
  const cursor = axis === "x" ? "col-resize" : "row-resize";

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? Number(stored) : NaN;
    if (!Number.isNaN(parsed)) {
      const clamped = clamp(parsed, min, max);
      sizeRef.current = clamped;
      setSize(clamped);
    }
    // Only re-read on mount / storage key change — min/max are stable per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const updateSize = useCallback((next: number) => {
    sizeRef.current = next;
    setSize(next);
  }, []);

  const pointerPos = useCallback(
    (event: { clientX: number; clientY: number }) => (axis === "x" ? event.clientX : event.clientY),
    [axis]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragRef.current = { startPos: pointerPos(event), startSize: sizeRef.current };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";
    },
    [cursor, pointerPos]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const raw = pointerPos(event) - dragRef.current.startPos;
      const delta = inverted ? -raw : raw;
      updateSize(clamp(dragRef.current.startSize + delta, min, max));
    },
    [inverted, min, max, pointerPos, updateSize]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(storageKey, String(sizeRef.current));
    },
    [storageKey]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const delta = keyboardDelta(event.key, axis, inverted, step);
      if (delta === 0) return;
      event.preventDefault();
      const next = clamp(sizeRef.current + delta, min, max);
      updateSize(next);
      window.localStorage.setItem(storageKey, String(next));
    },
    [axis, inverted, min, max, step, storageKey, updateSize]
  );

  return { size, onPointerDown, onPointerMove, onPointerUp, onKeyDown };
}

function keyboardDelta(key: string, axis: "x" | "y", inverted: boolean, step: number): number {
  if (axis === "x") {
    if (key === "ArrowLeft") return -step;
    if (key === "ArrowRight") return step;
    return 0;
  }
  if (key === "ArrowUp") return inverted ? step : -step;
  if (key === "ArrowDown") return inverted ? -step : step;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
