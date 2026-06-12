"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { STAFF_BOTTOM, STAFF_TOP, STAFF_VIEWBOX_HEIGHT } from "../components/StaffPreview";

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 1.5;

export type StaffBarMetrics = {
  top: number;
  height: number;
};

type UseNotationZoomParams = {
  isMobile: boolean;
  timelineScrollRef: RefObject<HTMLDivElement | null>;
  staffSectionRef: RefObject<HTMLDivElement | null>;
  totalMeasures: number;
  stepWidth: number;
  displayUnit: number;
};

/**
 * Notation/fretboard zoom scales (slider + pinch gesture) and the measured
 * staff bar-line overlay metrics, which must be recomputed whenever the
 * zoomed staff section resizes.
 */
export function useNotationZoom({
  isMobile,
  timelineScrollRef,
  staffSectionRef,
  totalMeasures,
  stepWidth,
  displayUnit,
}: UseNotationZoomParams) {
  const [notationScale, setNotationScale] = useState(1);
  const notationScaleRef = useRef(1);
  notationScaleRef.current = notationScale;

  const [fretboardScale, setFretboardScale] = useState(1);
  const handleFretboardScaleChange = useCallback(
    (s: number) => setFretboardScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))),
    []
  );

  const [staffBarMetrics, setStaffBarMetrics] = useState<StaffBarMetrics | null>(null);

  // Set initial mobile scale
  useEffect(() => {
    setNotationScale(isMobile ? 0.5 : 1);
    setFretboardScale(isMobile ? 0.7 : 1);
  }, [isMobile]);

  useEffect(() => {
    const staffSectionEl = staffSectionRef.current;
    if (!staffSectionEl) {
      return;
    }

    const updateMetrics = () => {
      // notationContent uses CSS zoom, so getBoundingClientRect() returns already-scaled pixels.
      // The overlay lives inside the same zoomed subtree, therefore its top/height must be
      // computed from unscaled layout units to avoid double-scaling.
      const layoutHeight = staffSectionEl.offsetHeight;
      const scale = layoutHeight / STAFF_VIEWBOX_HEIGHT;
      const lineHeight = Math.max(0, (STAFF_BOTTOM - STAFF_TOP) * scale - 2);
      setStaffBarMetrics({
        top: STAFF_TOP * scale,
        height: lineHeight,
      });
    };

    updateMetrics();

    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(staffSectionEl);
    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [staffSectionRef, notationScale, totalMeasures, stepWidth, displayUnit]);

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
    staffBarMetrics,
  };
}
