"use client";

import styles from "./FretboardInput.module.css";

type FretboardInputProps = {
  selectedRowIndex: number;
  onSelectFret: (rowIndex: number, fret: number) => void;
  isPlaying: boolean;
};

const FRET_NUMBERS = Array.from({ length: 13 }, (_, fret) => fret);

// UI order: low E (6th string) -> high E (1st string)
// TAB row index mapping used by the editor:
// rowIndex 0 => 1st string (E4), rowIndex 5 => 6th string (E2)
const FRETBOARD_ROWS = [
  { rowIndex: 5, label: "E2 (6)" },
  { rowIndex: 4, label: "A2 (5)" },
  { rowIndex: 3, label: "D3 (4)" },
  { rowIndex: 2, label: "G3 (3)" },
  { rowIndex: 1, label: "B3 (2)" },
  { rowIndex: 0, label: "E4 (1)" },
];

const MARKER_FRETS = new Set([3, 5, 7, 9, 12]);

export default function FretboardInput({
  selectedRowIndex,
  onSelectFret,
  isPlaying,
}: FretboardInputProps) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Fretboard Input</h2>
      <p className={styles.description}>
        Click a string and fret to write into the current TAB step. Playback disables fretboard input.
      </p>
      <div className={styles.grid}>
        <div className={styles.corner}>String</div>
        {FRET_NUMBERS.map((fret) => (
          <div key={`header-${fret}`} className={styles.fretHeader}>
            {fret}
          </div>
        ))}

        {FRETBOARD_ROWS.map((stringRow) => (
          <div key={`row-${stringRow.rowIndex}`} className={styles.stringRowFragment}>
            <div
              className={`${styles.stringLabel} ${
                selectedRowIndex === stringRow.rowIndex ? styles.activeString : ""
              }`.trim()}
            >
              {stringRow.label}
            </div>
            {FRET_NUMBERS.map((fret) => (
              <button
                key={`fret-${stringRow.rowIndex}-${fret}`}
                type="button"
                className={`${styles.cell} ${
                  selectedRowIndex === stringRow.rowIndex ? styles.activeCell : ""
                } ${MARKER_FRETS.has(fret) ? styles.marker : ""}`.trim()}
                onClick={() => onSelectFret(stringRow.rowIndex, fret)}
                disabled={isPlaying}
              >
                {fret}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
