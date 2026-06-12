"use client";

import { useRef, useState } from "react";

const DIGIT_COMMIT_DELAY_MS = 420;
const MAX_FRET_INPUT = 24;

type UseDigitInputParams = {
  onCommitFret: (fret: number) => void;
  isRestMode: boolean;
};

/**
 * Two-digit fret number input buffer shared by keyboard and mobile numpad.
 * Digits within the buffer window combine into a two-digit fret; the buffer
 * commits on timeout or when two digits are entered.
 */
export function useDigitInput({ onCommitFret, isRestMode }: UseDigitInputParams) {
  const [numpadBuffer, setNumpadBuffer] = useState<string>("");
  const digitBufferRef = useRef<string>("");
  const digitTimerRef = useRef<number | null>(null);

  const clearDigitBuffer = () => {
    digitBufferRef.current = "";
    setNumpadBuffer("");
    if (digitTimerRef.current !== null) {
      window.clearTimeout(digitTimerRef.current);
      digitTimerRef.current = null;
    }
  };

  const handleDigitInput = (digit: string) => {
    if (isRestMode) {
      return;
    }

    const nextBuffer = `${digitBufferRef.current}${digit}`.slice(0, 2);
    digitBufferRef.current = nextBuffer;
    const parsed = Number(nextBuffer);

    if (Number.isNaN(parsed) || parsed > MAX_FRET_INPUT) {
      digitBufferRef.current = digit;
    }

    setNumpadBuffer(digitBufferRef.current);

    if (digitTimerRef.current !== null) {
      window.clearTimeout(digitTimerRef.current);
      digitTimerRef.current = null;
    }

    const commit = () => {
      if (digitBufferRef.current === "") {
        return;
      }
      const fret = Number(digitBufferRef.current);
      clearDigitBuffer();
      setNumpadBuffer("");
      if (!Number.isNaN(fret)) {
        onCommitFret(fret);
      }
    };

    if (digitBufferRef.current.length >= 2) {
      commit();
      return;
    }

    digitTimerRef.current = window.setTimeout(commit, DIGIT_COMMIT_DELAY_MS);
  };

  return { numpadBuffer, clearDigitBuffer, handleDigitInput };
}
