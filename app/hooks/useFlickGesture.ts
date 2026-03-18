"use client";

import { useRef, useState, useCallback } from "react";
import { DurationModifier, FLICK_DURATION_MAP } from "../tabModel";

export type FlickResult = {
  len: number;
  modifier: DurationModifier;
};

export type FlickState = {
  isActive: boolean;
  currentResult: FlickResult;
  verticalLevel: number;   // -2..+2
  horizontalLevel: number; // -1, 0, +1
};

type UseFlickGestureOptions = {
  threshold: number;
  onCommit: (result: FlickResult) => void;
  disabled?: boolean;
};

const DEFAULT_RESULT: FlickResult = { len: 4, modifier: "normal" };
const DEFAULT_STATE: FlickState = {
  isActive: false,
  currentResult: DEFAULT_RESULT,
  verticalLevel: 0,
  horizontalLevel: 0,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const computeFlickResult = (
  verticalLevel: number,
  horizontalLevel: number
): FlickResult => {
  const len = FLICK_DURATION_MAP[verticalLevel] ?? 4;
  const modifier: DurationModifier =
    horizontalLevel > 0 ? "dotted" : horizontalLevel < 0 ? "triplet" : "normal";
  return { len, modifier };
};

export function useFlickGesture({ threshold, onCommit, disabled }: UseFlickGestureOptions) {
  const [state, setState] = useState<FlickState>(DEFAULT_STATE);

  // Track coordinates via refs to avoid re-renders on every move
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const prevLevelRef = useRef({ v: 0, h: 0 });
  // Store the latest result in a ref so pointerup can read it synchronously
  const latestResultRef = useRef<FlickResult>(DEFAULT_RESULT);

  const reset = useCallback(() => {
    activeRef.current = false;
    pointerIdRef.current = null;
    prevLevelRef.current = { v: 0, h: 0 };
    latestResultRef.current = DEFAULT_RESULT;
    setState(DEFAULT_STATE);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || activeRef.current) return;
      e.preventDefault();

      activeRef.current = true;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      prevLevelRef.current = { v: 0, h: 0 };
      latestResultRef.current = DEFAULT_RESULT;

      // Capture pointer to keep receiving events even if finger moves off element
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      setState({
        isActive: true,
        currentResult: DEFAULT_RESULT,
        verticalLevel: 0,
        horizontalLevel: 0,
      });
    },
    [disabled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!activeRef.current || e.pointerId !== pointerIdRef.current) return;
      e.preventDefault();

      const deltaX = e.clientX - startXRef.current;
      const deltaY = e.clientY - startYRef.current;

      // Y: positive = down (longer notes), negative = up (shorter notes)
      const verticalLevel = clamp(Math.round(deltaY / threshold), -2, 2);

      // X: evaluated independently for L-shaped gestures
      let horizontalLevel = 0;
      if (deltaX >= threshold) horizontalLevel = 1;       // right = dotted
      else if (deltaX <= -threshold) horizontalLevel = -1; // left = triplet

      // Only update state if levels actually changed
      if (
        verticalLevel !== prevLevelRef.current.v ||
        horizontalLevel !== prevLevelRef.current.h
      ) {
        prevLevelRef.current = { v: verticalLevel, h: horizontalLevel };
        const result = computeFlickResult(verticalLevel, horizontalLevel);
        latestResultRef.current = result;
        setState({
          isActive: true,
          currentResult: result,
          verticalLevel,
          horizontalLevel,
        });
      }
    },
    [threshold]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!activeRef.current || e.pointerId !== pointerIdRef.current) return;
      e.preventDefault();

      const result = latestResultRef.current;
      reset();
      onCommit(result);
    },
    [onCommit, reset]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (!activeRef.current || e.pointerId !== pointerIdRef.current) return;
      reset();
    },
    [reset]
  );

  return {
    state,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
