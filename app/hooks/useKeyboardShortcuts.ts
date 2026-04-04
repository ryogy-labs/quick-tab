"use client";

import { useEffect, useRef } from "react";
import { StepRangeClipboard, StepRangeSelection, TabMeasureV3 } from "../tabModel";

type UseKeyboardShortcutsOptions = {
  // actions
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onPlay: () => void;
  onDigitInput: (digit: string) => void;
  onPlaceRest: (stepIndex: number) => void;
  onMoveRowUp: () => void;
  onMoveRowDown: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onCopyMeasure: () => void;
  onCopyRange: () => void;
  onPasteMeasure: () => void;
  onPasteRange: () => void;
  onClearDigitBuffer: () => void;
  // state needed for conditional logic
  isPlaying: boolean;
  activeIsRestMode: boolean;
  selectedStep: number;
  selectedRange: StepRangeSelection | null;
  measureClipboard: TabMeasureV3 | null;
  rangeClipboard: StepRangeClipboard | null;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || target.isContentEditable;
};

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  // Store options in a ref so the listener never needs to be re-registered
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const withCommandKey = e.metaKey || e.ctrlKey;
      const editable = isEditableTarget(e.target);
      const opts = optsRef.current;

      if (withCommandKey && !editable) {
        if (key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? opts.onRedo() : opts.onUndo();
          return;
        }
        if (key.toLowerCase() === "y") {
          e.preventDefault();
          opts.onRedo();
          return;
        }
        if (key.toLowerCase() === "c") {
          e.preventDefault();
          opts.selectedRange ? opts.onCopyRange() : opts.onCopyMeasure();
          return;
        }
        if (key.toLowerCase() === "v") {
          if (opts.rangeClipboard) {
            if (opts.isPlaying) return;
            e.preventDefault();
            opts.onPasteRange();
            return;
          }
          if (!opts.measureClipboard || opts.isPlaying) return;
          e.preventDefault();
          opts.onPasteMeasure();
          return;
        }
      }

      if (key >= "0" && key <= "9") {
        e.preventDefault();
        opts.onDigitInput(key);
        return;
      }

      if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        opts.onDelete();
        return;
      }

      if (key === " ") {
        e.preventDefault();
        opts.onPlay();
        return;
      }

      if (key === "Enter" && opts.activeIsRestMode) {
        e.preventDefault();
        opts.onPlaceRest(opts.selectedStep);
        return;
      }

      if (key === "ArrowUp" || key.toLowerCase() === "w") {
        e.preventDefault();
        opts.onClearDigitBuffer();
        opts.onMoveRowUp();
        return;
      }

      if (key === "ArrowDown" || key.toLowerCase() === "s") {
        e.preventDefault();
        opts.onClearDigitBuffer();
        opts.onMoveRowDown();
        return;
      }

      if (key === "ArrowLeft" || key.toLowerCase() === "a") {
        e.preventDefault();
        opts.onClearDigitBuffer();
        opts.onMoveLeft();
        return;
      }

      if (key === "ArrowRight" || key.toLowerCase() === "d") {
        e.preventDefault();
        opts.onClearDigitBuffer();
        opts.onMoveRight();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []); // empty deps — latest state/callbacks always read via optsRef
}
