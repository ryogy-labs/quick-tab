"use client";

import styles from "./FretboardInput.module.css";

type FretboardInputProps = {
  activeNotes: Array<{ string: number; fret: number }>;
  onSelectFret: (rowIndex: number, fret: number) => void;
  isPlaying: boolean;
};

const FRET_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);

// UI order: high E (1st string) -> low E (6th string)
// TAB row index mapping used by the editor:
// rowIndex 0 => 1st string (E4), rowIndex 5 => 6th string (E2)
const FRETBOARD_ROWS = [
  { rowIndex: 0, label: "E4 (1)" },
  { rowIndex: 1, label: "B3 (2)" },
  { rowIndex: 2, label: "G3 (3)" },
  { rowIndex: 3, label: "D3 (4)" },
  { rowIndex: 4, label: "A2 (5)" },
  { rowIndex: 5, label: "E2 (6)" },
];

const MARKER_FRETS = new Set([3, 5, 7, 9, 12]);

export default function FretboardInput({
  activeNotes,
  onSelectFret,
  isPlaying,
}: FretboardInputProps) {
  const activeNoteSet = new Set(activeNotes.map((note) => `${note.string}:${note.fret}`));

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Fretboard Input</h2>
      <p className={styles.description}>
        Click a string and fret to write into the current TAB step. Playback disables fretboard input.
      </p>
      <div className={styles.fretboard}>
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
                }`.trim()}
                onClick={() => onSelectFret(stringRow.rowIndex, 0)}
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
                  }`.trim()}
                  onClick={() => onSelectFret(stringRow.rowIndex, fret)}
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
    </section>
  );
}
