"use client";

import styles from "./MobileNumpad.module.css";

type MobileNumpadProps = {
  buffer: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onRest: () => void;
  isRestMode: boolean;
  disabled: boolean;
};

const DIGIT_ROWS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

export default function MobileNumpad({
  buffer,
  onDigit,
  onBackspace,
  onRest,
  isRestMode,
  disabled,
}: MobileNumpadProps) {
  return (
    <div className={styles.numpad}>
      <div className={styles.bufferDisplay}>
        <span className={styles.bufferLabel}>Fret:</span>
        <span className={styles.bufferValue}>{buffer !== "" ? buffer : "-"}</span>
      </div>

      <div className={styles.grid}>
        {DIGIT_ROWS.map((row) =>
          row.map((digit) => (
            <button
              key={digit}
              type="button"
              className={styles.digitBtn}
              onPointerDown={(e) => {
                e.preventDefault();
                onDigit(digit);
              }}
              disabled={disabled || isRestMode}
            >
              {digit}
            </button>
          ))
        )}

        {/* Bottom row: backspace / 0 / rest */}
        <button
          type="button"
          className={`${styles.digitBtn} ${styles.actionBtn}`}
          onPointerDown={(e) => {
            e.preventDefault();
            onBackspace();
          }}
          disabled={disabled}
        >
          ⌫
        </button>
        <button
          type="button"
          className={styles.digitBtn}
          onPointerDown={(e) => {
            e.preventDefault();
            onDigit("0");
          }}
          disabled={disabled || isRestMode}
        >
          0
        </button>
        <button
          type="button"
          className={`${styles.digitBtn} ${styles.actionBtn} ${isRestMode ? styles.restActive : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            onRest();
          }}
          disabled={disabled}
        >
          R
        </button>
      </div>
    </div>
  );
}
