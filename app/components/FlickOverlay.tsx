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

// Ordered top to bottom: shortest duration at top, longest at bottom
// This matches the flick direction (up = shorter, down = longer)
const DURATION_LABELS: { level: number; symbol: string }[] = [
  { level: -2, symbol: "1/16" },
  { level: -1, symbol: "1/8" },
  { level: 0, symbol: "1/4" },
  { level: 1, symbol: "1/2" },
  { level: 2, symbol: "1" },
];

const ITEM_HEIGHT = 28;
const GAP = 2;

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

  // Center the overlay horizontally on the anchor cell
  // Position vertically so the current selection (level 0 = center item) aligns with the cell
  const centerIndex = 2; // index of level 0 (quarter note) in the array
  const totalHeight = DURATION_LABELS.length * ITEM_HEIGHT + (DURATION_LABELS.length - 1) * GAP;
  const centerItemOffset = centerIndex * (ITEM_HEIGHT + GAP) + ITEM_HEIGHT / 2;

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;

  const left = anchorCenterX;
  const top = anchorCenterY - centerItemOffset;

  // Build modifier label
  const modifierText =
    horizontalLevel === -1 ? "3\u9023" : horizontalLevel === 1 ? "\u4ed8\u70b9" : "";

  const overlay = (
    <div
      className={styles.overlay}
      style={{ left, top }}
    >
      {DURATION_LABELS.map((item) => {
        const isSelected = item.level === verticalLevel;
        return (
          <div
            key={item.level}
            className={`${styles.item} ${isSelected ? styles.selected : ""}`}
          >
            <span className={styles.symbol}>{item.symbol}</span>
            {isSelected && modifierText && (
              <span className={styles.modifier}>{modifierText}</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return createPortal(overlay, document.body);
}
