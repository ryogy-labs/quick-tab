"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./TechniquePalette.module.css";
import { TECHNIQUES, Technique } from "../tabModel";

const TECHNIQUE_NAMES: Record<Technique, string> = {
  slide: "Slide",
  hammer: "Hammer-on",
  pulloff: "Pull-off",
  bend: "Bend",
  vibrato: "Vibrato",
};

const TECHNIQUE_SHORT: Record<Technique, string> = {
  slide: "S",
  hammer: "H",
  pulloff: "P",
  bend: "B",
  vibrato: "~",
};

type TechniquePaletteProps = {
  activeTechnique: Technique | undefined;
  disabled: boolean;
  onSelect: (technique: Technique | null) => void;
};

/**
 * Compact popover for assigning a playing technique to the selected note.
 * The trigger shows the active technique's glyph when one is set.
 */
export default function TechniquePalette({
  activeTechnique,
  disabled,
  onSelect,
}: TechniquePaletteProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={styles.wrapper}>
      <button
        type="button"
        className={`${styles.trigger} ${activeTechnique ? styles.triggerActive : ""}`.trim()}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label="Technique"
        title="Technique"
      >
        {activeTechnique ? TECHNIQUE_SHORT[activeTechnique] : "Fx"}
      </button>
      {open && (
        <div className={styles.menu}>
          <button
            type="button"
            className={`${styles.item} ${!activeTechnique ? styles.itemActive : ""}`.trim()}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            None
          </button>
          {TECHNIQUES.map((technique) => (
            <button
              key={technique}
              type="button"
              className={`${styles.item} ${
                activeTechnique === technique ? styles.itemActive : ""
              }`.trim()}
              onClick={() => {
                onSelect(technique);
                setOpen(false);
              }}
            >
              <span className={styles.short}>{TECHNIQUE_SHORT[technique]}</span>
              {TECHNIQUE_NAMES[technique]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
