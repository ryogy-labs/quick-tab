"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import styles from "./FlickOverlay.module.css";

type FlickOverlayProps = {
  isActive: boolean;
  anchorRect: DOMRect | null;
  verticalLevel: number;   // -2..+2
  horizontalLevel: number; // -1, 0, +1
  threshold: number;       // px per level (matches flick detection)
};

// Ordered top to bottom: shortest duration at top, longest at bottom
// This matches the flick direction (up = shorter, down = longer)
const DURATION_LABELS: { level: number; symbol: string }[] = [
  { level: -2, symbol: "1/16" },
  { level: -1, symbol: "1/8" },
  { level: 0, symbol: "1/4" },
  { level: 1, symbol: "1/2" },
  { level: 2, symbol: "1" },
];

export default function FlickOverlay({
  isActive,
  anchorRect,
  verticalLevel,
  horizontalLevel,
  threshold,
}: FlickOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isActive || !anchorRect) return null;

  // Each row height matches the threshold so the visual aligns with the detection area
  const rowHeight = threshold;
  // Modifier display width matches vertical row height (threshold) for visual consistency
  const hWidth = threshold;
  const centerIndex = 2; // index of level 0 (quarter note) in the array
  const centerItemOffset = centerIndex * rowHeight + rowHeight / 2;

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;

  const left = anchorCenterX;
  const top = anchorCenterY - centerItemOffset;

  const overlay = (
    <div
      className={styles.overlay}
      style={{ left, top }}
    >
      {DURATION_LABELS.map((item) => {
        const isCurrentRow = item.level === verticalLevel;
        const isTripletSelected = isCurrentRow && horizontalLevel === -1;
        const isDottedSelected = isCurrentRow && horizontalLevel === 1;
        const isBaseSelected = isCurrentRow && horizontalLevel === 0;

        return (
          <div
            key={item.level}
            className={`${styles.row} ${isCurrentRow ? styles.activeRow : ""}`}
            style={{ height: rowHeight }}
          >
            {/* Left: 3連 (triplet) */}
            <span
              className={`${styles.modifier} ${styles.left} ${
                isTripletSelected ? styles.modifierSelected : ""
              } ${isCurrentRow ? styles.modifierVisible : ""}`}
              style={{ width: hWidth, minWidth: hWidth }}
            >
              3連
            </span>

            {/* Center: base duration */}
            <span
              className={`${styles.item} ${
                isCurrentRow
                  ? isBaseSelected
                    ? styles.selected
                    : styles.selectedRow
                  : ""
              }`}
              style={{ minWidth: threshold }}
            >
              {item.symbol}
            </span>

            {/* Right: 付点 (dotted) */}
            <span
              className={`${styles.modifier} ${styles.right} ${
                isDottedSelected ? styles.modifierSelected : ""
              } ${isCurrentRow ? styles.modifierVisible : ""}`}
              style={{ width: hWidth, minWidth: hWidth }}
            >
              付点
            </span>
          </div>
        );
      })}
    </div>
  );

  return createPortal(overlay, document.body);
}
