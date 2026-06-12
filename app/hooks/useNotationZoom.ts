"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 1.5;

type UseNotationZoomParams = {
  isMobile: boolean;
  timelineScrollRef: RefObject<HTMLDivElement | null>;
};

/**
 * Notation/fretboard zoom scales (slider + pinch gesture).
 */
export function useNotationZoom({
  isMobile,
  timelineScrollRef,
}: UseNotationZoomParams) {
  const [notationScale, setNotationScale] = useState(1);
  const notationScaleRef = useRef(1);
  notationScaleRef.current = notationScale;

  const [fretboardScale, setFretboardScale] = useState(1);
  const handleFretboardScaleChange = useCallback(
    (s: number) => setFretboardScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))),
    []
  );

  // Set initial mobile scale
  useEffect(() => {
    setNotationScale(isMobile ? 0.5 : 1);
    setFretboardScale(isMobile ? 0.7 : 1);
  }, [isMobile]);

  // Pinch-to-zoom on notation area
  const pinchRef = useRef<{ initialDist: number; initialScale: number } | null>(null);
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDist: getDistance(e.touches[0], e.touches[1]),
          initialScale: notationScaleRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dist = getDistance(e.touches[0], e.touches[1]);
        const ratio = dist / pinchRef.current.initialDist;
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchRef.current.initialScale * ratio)
        );
        setNotationScale(newScale);
      }
    };

    const onTouchEnd = () => {
      pinchRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [timelineScrollRef]);

  return {
    notationScale,
    setNotationScale,
    fretboardScale,
    handleFretboardScaleChange,
  };
}
