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
};

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
const MOBILE_THRESHOLD = 78;

export default function FretboardInput({
  activeNotes,
  onFlickCommit,
  isPlaying,
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

  const { state: flickState, handlers } = useFlickGesture({
    threshold,
    onCommit: handleCommit,
    disabled: isPlaying,
  });

  // Wrap pointerdown to capture which cell was touched
  const createPointerDown = useCallback(
    (rowIndex: number, fret: number) => (e: React.PointerEvent) => {
      setFlickCell({ rowIndex, fret });
      setFlickAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
      handlers.onPointerDown(e);
    },
    [handlers]
  );

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Fretboard Input</h2>
      <p className={styles.description}>
        Tap to place a quarter note. Flick up/down to change duration, left/right for triplet/dotted.
      </p>
      <div className={styles.fretboard}>
        <div className={styles.fretboardScroll}>
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
      />
    </section>
  );
}
