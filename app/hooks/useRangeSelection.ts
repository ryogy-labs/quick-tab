"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import {
  StepRangePoint,
  StepRangeSelection,
  normalizeStepRange,
} from "../tabModel";

type UseRangeSelectionParams = {
  gridRef: RefObject<HTMLDivElement | null>;
  getRangeSelectableStep: (measureIndex: number, stepIndex: number) => number;
};

/**
 * Drag-based step range selection over the TAB grid (single-measure clamp is
 * enforced by normalizeStepRange in tabModel). Tracks the anchor, the live
 * range, and whether the pointer actually dragged (to suppress click).
 */
export function useRangeSelection({ gridRef, getRangeSelectableStep }: UseRangeSelectionParams) {
  const [dragSelectionAnchor, setDragSelectionAnchor] = useState<StepRangePoint | null>(null);
  const [selectedRange, setSelectedRange] = useState<StepRangeSelection | null>(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const didDragRangeRef = useRef(false);

  const clearRangeSelection = () => {
    setSelectedRange(null);
    setDragSelectionAnchor(null);
    setIsDraggingRange(false);
  };

  const handleRangeMouseDown = (measureIndex: number, stepIndex: number) => {
    const anchor = {
      measureIndex,
      stepIndex: getRangeSelectableStep(measureIndex, stepIndex),
    };
    didDragRangeRef.current = false;
    setDragSelectionAnchor(anchor);
    setSelectedRange(normalizeStepRange(anchor, anchor));
    setIsDraggingRange(true);
  };

  const handleRangeMouseEnter = (measureIndex: number, stepIndex: number) => {
    if (!isDraggingRange || !dragSelectionAnchor) {
      return;
    }
    const nextStepIndex = getRangeSelectableStep(measureIndex, stepIndex);
    if (
      dragSelectionAnchor.measureIndex !== measureIndex ||
      dragSelectionAnchor.stepIndex !== nextStepIndex
    ) {
      didDragRangeRef.current = true;
    }
    setSelectedRange(
      normalizeStepRange(dragSelectionAnchor, {
        measureIndex,
        stepIndex: nextStepIndex,
      })
    );
  };

  const handleRangeMouseEnterRef = useRef<(measureIndex: number, stepIndex: number) => void>(
    () => undefined
  );
  handleRangeMouseEnterRef.current = handleRangeMouseEnter;

  useEffect(() => {
    if (!isDraggingRange) {
      return;
    }

    const handleDragEnd = () => {
      setIsDraggingRange(false);
      setDragSelectionAnchor(null);
    };

    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchend", handleDragEnd);
    return () => {
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDraggingRange]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !isDraggingRange) {
      return;
    }

    const updateRangeFromPoint = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const cell = el?.closest("[data-measure-index]") as HTMLElement | null;
      if (!cell) {
        return;
      }
      const mi = cell.getAttribute("data-measure-index");
      const si = cell.getAttribute("data-step-index");
      if (mi !== null && si !== null) {
        handleRangeMouseEnterRef.current(Number(mi), Number(si));
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateRangeFromPoint(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      updateRangeFromPoint(touch.clientX, touch.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    grid.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      grid.removeEventListener("touchmove", handleTouchMove);
    };
  }, [gridRef, isDraggingRange]);

  return {
    selectedRange,
    setSelectedRange,
    isDraggingRange,
    didDragRangeRef,
    clearRangeSelection,
    handleRangeMouseDown,
    handleRangeMouseEnter,
  };
}
