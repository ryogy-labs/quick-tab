"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import styles from "./RestFlickButton.module.css";
import { DurationModifier } from "../tabModel";
import { useFlickGesture, FlickResult } from "../hooks/useFlickGesture";
import FlickOverlay from "./FlickOverlay";

type RestFlickButtonProps = {
  onFlickCommit: (len: number, modifier: DurationModifier) => void;
  disabled: boolean;
};

const DESKTOP_THRESHOLD = 42;
const MOBILE_THRESHOLD = 78;

export default function RestFlickButton({
  onFlickCommit,
  disabled,
}: RestFlickButtonProps) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const [threshold, setThreshold] = useState(DESKTOP_THRESHOLD);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setThreshold(mq.matches ? MOBILE_THRESHOLD : DESKTOP_THRESHOLD);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const handleCommit = useCallback(
    (result: FlickResult) => {
      onFlickCommit(result.len, result.modifier);
      setAnchorRect(null);
    },
    [onFlickCommit]
  );

  const { state: flickState, handlers } = useFlickGesture({
    threshold,
    onCommit: handleCommit,
    disabled,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
      handlers.onPointerDown(e);
    },
    [handlers]
  );

  return (
    <>
      <button
        type="button"
        className={`${styles.restButton} ${flickState.isActive ? styles.active : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
        disabled={disabled}
      >
        R
      </button>

      <FlickOverlay
        isActive={flickState.isActive}
        anchorRect={anchorRect}
        verticalLevel={flickState.verticalLevel}
        horizontalLevel={flickState.horizontalLevel}
      />
    </>
  );
}
