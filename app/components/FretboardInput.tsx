"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import styles from "./FretboardInput.module.css";
import { DurationModifier } from "../tabModel";
import { useFlickGesture, FlickResult } from "../hooks/useFlickGesture";
import FlickOverlay from "./FlickOverlay";

type FretboardInputProps = {
  activeNotes: Array<{ string: number; fret: number }>;
  onFlickCommit: (rowIndex: number, fret: number, len: number, modifier: DurationModifier) => void;
  isPlaying: boolean;
  scale: number;
  onScaleChange: (scale: number) => void;
};

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.5;

const FRET_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);

const FRETBOARD_ROWS = [
  { rowIndex: 0, label: "E4 (1)" },
  { rowIndex: 1, label: "B3 (2)" },
  { rowIndex: 2, label: "G3 (3)" },
  { rowIndex: 3, label: "D3 (4)" },
  { rowIndex: 4, label: "A2 (5)" },
  { rowIndex: 5, label: "E2 (6)" },
];

const MARKER_FRETS = new Set([3, 5, 7, 9, 12]);

const DESKTOP_THRESHOLD = 42;
const MOBILE_THRESHOLD = 55;

export default function FretboardInput({
  activeNotes,
  onFlickCommit,
  isPlaying,
  scale,
  onScaleChange,
}: FretboardInputProps) {
  const activeNoteSet = new Set(activeNotes.map((note) => `${note.string}:${note.fret}`));

  // Track which cell is being flicked
  const [flickCell, setFlickCell] = useState<{ rowIndex: number; fret: number } | null>(null);
  const [flickAnchorRect, setFlickAnchorRect] = useState<DOMRect | null>(null);

  // Responsive threshold
  const [threshold, setThreshold] = useState(DESKTOP_THRESHOLD);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setThreshold(mq.matches ? MOBILE_THRESHOLD : DESKTOP_THRESHOLD);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Store flickCell in a ref so the commit callback can access it without stale closure
  const flickCellRef = useRef(flickCell);
  flickCellRef.current = flickCell;

  const handleCommit = useCallback(
    (result: FlickResult) => {
      const cell = flickCellRef.current;
      if (cell) {
        onFlickCommit(cell.rowIndex, cell.fret, result.len, result.modifier);
      }
      setFlickCell(null);
      setFlickAnchorRect(null);
    },
    [onFlickCommit]
  );

  const { state: flickState, anchorRef, handlers } = useFlickGesture({
    threshold,
    onCommit: handleCommit,
    disabled: isPlaying,
  });

  // Wrap pointerdown to capture which cell was touched and set anchor center
  const createPointerDown = useCallback(
    (rowIndex: number, fret: number) => (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setFlickCell({ rowIndex, fret });
      setFlickAnchorRect(rect);
      // Align flick detection origin to cell center so it matches the overlay position
      anchorRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      handlers.onPointerDown(e);
    },
    [handlers, anchorRef]
  );

  const fretboardScrollRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ initialDist: number; initialScale: number } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    const el = fretboardScrollRef.current;
    if (!el) return;

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDist: getDistance(e.touches[0], e.touches[1]),
          initialScale: scaleRef.current,
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
        onScaleChange(newScale);
      }
    };

    const onTouchEnd = () => { pinchRef.current = null; };

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
  }, [onScaleChange]);

  return (
    <div className={styles.fretboardWrapper}>
      <div className={styles.fretboardHeader}>
        <p className={styles.description}>
          Tap to place a quarter note. Flick up/down to change duration, left/right for triplet/dotted.
        </p>
        <div className={styles.zoomControl}>
          <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
          <input
            type="range"
            min={String(MIN_SCALE * 100)}
            max={String(MAX_SCALE * 100)}
            value={Math.round(scale * 100)}
            onChange={(e) => onScaleChange(Number(e.target.value) / 100)}
            className={styles.zoomSlider}
          />
        </div>
      </div>
      <div className={styles.fretboard} style={{ zoom: scale }}>
        <div ref={fretboardScrollRef} className={styles.fretboardScroll}>
        <div className={styles.fretNumbers}>
          <div className={styles.nutSpacer}>Open</div>
          {FRET_NUMBERS.map((fret) => (
            <div key={`header-${fret}`} className={styles.fretHeader}>
              <span className={styles.fretHeaderLabel}>{fret}</span>
            </div>
          ))}
        </div>

        <div className={styles.board}>
          <div className={styles.markersLayer} aria-hidden="true">
            <div className={styles.markerSpacer} />
            {FRET_NUMBERS.map((fret) => (
              <div key={`marker-${fret}`} className={styles.markerSlot}>
                {MARKER_FRETS.has(fret) ? <span className={styles.markerDot} /> : null}
              </div>
            ))}
          </div>

          {FRETBOARD_ROWS.map((stringRow) => (
            <div key={`row-${stringRow.rowIndex}`} className={styles.stringRow}>
              <button
                type="button"
                className={`${styles.openString} ${
                  activeNoteSet.has(`${stringRow.rowIndex + 1}:0`) ? styles.activeNote : ""
                } ${
                  flickState.isActive && flickCell?.rowIndex === stringRow.rowIndex && flickCell?.fret === 0
                    ? styles.flickActive
                    : ""
                }`.trim()}
                onPointerDown={createPointerDown(stringRow.rowIndex, 0)}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onPointerCancel={handlers.onPointerCancel}
                disabled={isPlaying}
              >
                <span className={styles.stringName}>{stringRow.label}</span>
              </button>

              {FRET_NUMBERS.map((fret) => (
                <button
                  key={`fret-${stringRow.rowIndex}-${fret}`}
                  type="button"
                  className={`${styles.fretCell} ${
                    activeNoteSet.has(`${stringRow.rowIndex + 1}:${fret}`) ? styles.activeNote : ""
                  } ${
                    flickState.isActive && flickCell?.rowIndex === stringRow.rowIndex && flickCell?.fret === fret
                      ? styles.flickActive
                      : ""
                  }`.trim()}
                  onPointerDown={createPointerDown(stringRow.rowIndex, fret)}
                  onPointerMove={handlers.onPointerMove}
                  onPointerUp={handlers.onPointerUp}
                  onPointerCancel={handlers.onPointerCancel}
                  disabled={isPlaying}
                >
                  <span className={styles.stringLine} />
                  <span className={styles.hitArea} aria-hidden="true" />
                </button>
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>

      <FlickOverlay
        isActive={flickState.isActive}
        anchorRect={flickAnchorRect}
        verticalLevel={flickState.verticalLevel}
        horizontalLevel={flickState.horizontalLevel}
        threshold={threshold}
      />
    </div>
  );
}
