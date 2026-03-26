"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./DropdownMenu.module.css";

type MenuItem =
  | { type: "button"; label: string; onClick: () => void; disabled?: boolean }
  | { type: "separator" }
  | { type: "file"; label: string; accept: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void };

type DropdownMenuProps = {
  items: MenuItem[];
};

export default function DropdownMenu({ items }: DropdownMenuProps) {
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
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
      >
        ⋯
      </button>
      {open && (
        <div className={styles.menu}>
          {items.map((item, i) => {
            if (item.type === "separator") {
              return <div key={`sep-${i}`} className={styles.separator} />;
            }
            if (item.type === "file") {
              return (
                <label key={`file-${i}`} className={styles.menuItem}>
                  {item.label}
                  <input
                    type="file"
                    accept={item.accept}
                    onChange={(e) => {
                      item.onChange(e);
                      setOpen(false);
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              );
            }
            return (
              <button
                key={`btn-${i}`}
                type="button"
                className={styles.menuItem}
                disabled={item.disabled}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
