"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import styles from "./FlickOverlay.module.css";

type FlickOverlayProps = {
  isActive: boolean;
  anchorRect: DOMRect | null;
  verticalLevel: number;   // -2..+2
  horizontalLevel: number; // -1, 0, +1
};

const DURATION_LABELS: { level: number; label: string; symbol: string }[] = [
  { level: -2, label: "16th", symbol: "1/16" },
  { level: -1, label: "8th", symbol: "1/8" },
  { level: 0, label: "Quarter", symbol: "1/4" },
  { level: 1, label: "Half", symbol: "1/2" },
  { level: 2, label: "Whole", symbol: "1" },
];

const MODIFIER_LABELS: { level: number; label: string }[] = [
  { level: -1, label: "3" },
  { level: 1, label: "." },
];

export default function FlickOverlay({
  isActive,
  anchorRect,
  verticalLevel,
  horizontalLevel,
}: FlickOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isActive || !anchorRect) return null;

  // Position overlay to the right of the anchor cell, centered vertically
  const left = anchorRect.right + 8;
  const top = anchorRect.top + anchorRect.height / 2 - 80;

  const overlay = (
    <div
      className={styles.overlay}
      style={{ left, top }}
    >
      <div className={styles.durationColumn}>
        {DURATION_LABELS.map((item) => {
          const isSelected = item.level === verticalLevel;
          return (
            <div
              key={item.level}
              className={`${styles.durationItem} ${isSelected ? styles.selected : ""}`}
            >
              <span className={styles.symbol}>{item.symbol}</span>
              {isSelected && horizontalLevel !== 0 && (
                <span className={styles.modifier}>
                  {horizontalLevel === -1 ? "3" : "."}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Show left/right hint when a duration is selected */}
      {verticalLevel >= -2 && verticalLevel <= 2 && (
        <div className={styles.modifierHints}>
          {MODIFIER_LABELS.map((mod) => {
            const isActive = mod.level === horizontalLevel;
            return (
              <span
                key={mod.level}
                className={`${styles.modifierHint} ${isActive ? styles.modifierActive : ""}`}
              >
                {mod.level === -1 ? "\u2190 3\u9023" : "\u2192 \u4ed8\u70b9"}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
