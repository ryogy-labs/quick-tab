"use client";

import { useState } from "react";
import styles from "./CollapsibleSection.module.css";

type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export default function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.title}>{title}</span>
        <span className={`${styles.chevron} ${isOpen ? styles.open : ""}`}>
          &#9660;
        </span>
      </button>
      {isOpen && <div className={styles.content}>{children}</div>}
    </div>
  );
}
