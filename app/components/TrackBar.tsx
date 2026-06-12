"use client";

import styles from "./TrackBar.module.css";

type TrackBarProps = {
  trackNames: string[];
  activeIndex: number;
  hiddenTracks: Set<number>;
  disabled: boolean;
  onSelect: (index: number) => void;
  onToggleVisible: (index: number) => void;
  onAdd: () => void;
  onRename: (index: number) => void;
};

export default function TrackBar({
  trackNames,
  activeIndex,
  hiddenTracks,
  disabled,
  onSelect,
  onToggleVisible,
  onAdd,
  onRename,
}: TrackBarProps) {
  return (
    <div className={styles.bar}>
      {trackNames.map((name, index) => {
        const isActive = index === activeIndex;
        const isHidden = hiddenTracks.has(index);
        return (
          <div
            key={`track-${index}`}
            className={`${styles.chip} ${isActive ? styles.chipActive : ""} ${
              isHidden ? styles.chipHidden : ""
            }`.trim()}
          >
            <button
              type="button"
              className={styles.name}
              disabled={disabled}
              onClick={() => onSelect(index)}
              onDoubleClick={() => onRename(index)}
              title={`${name} (double-click to rename)`}
            >
              {name}
            </button>
            <button
              type="button"
              className={styles.eye}
              disabled={disabled || isActive}
              onClick={() => onToggleVisible(index)}
              aria-pressed={!isHidden}
              aria-label={isHidden ? `Show ${name}` : `Hide ${name}`}
              title={isActive ? "Active track is always shown" : isHidden ? "Show" : "Hide"}
            >
              {isHidden ? "🚫" : "👁"}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className={styles.addBtn}
        disabled={disabled}
        onClick={onAdd}
        aria-label="Add track"
        title="Add track"
      >
        ＋
      </button>
    </div>
  );
}
