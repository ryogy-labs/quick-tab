"use client";

import { useCallback, useEffect, useRef } from "react";
import { TabDataV3, normalizeToTabDataV3 } from "../tabModel";

const STORAGE_KEY = "quick-tab:mvp:v3";
const LEGACY_STORAGE_KEY_V2 = "quick-tab:mvp:v2";
const LEGACY_STORAGE_KEY_V1 = "quick-tab:mvp:v1";

type UseTabStorageOptions = {
  tabData: TabDataV3;
  onLoad: (data: TabDataV3) => void;
};

const tryLoad = (raw: string | null): TabDataV3 | null => {
  if (!raw) return null;
  try {
    return normalizeToTabDataV3(JSON.parse(raw), true);
  } catch {
    return null;
  }
};

export function useTabStorage({ tabData, onLoad }: UseTabStorageOptions) {
  // Stable ref so the load effect never needs onLoad in its deps
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  // Load once on mount, trying v3 → v2 → v1 in order
  useEffect(() => {
    const loaded =
      tryLoad(localStorage.getItem(STORAGE_KEY)) ??
      tryLoad(localStorage.getItem(LEGACY_STORAGE_KEY_V2)) ??
      tryLoad(localStorage.getItem(LEGACY_STORAGE_KEY_V1));

    if (loaded) {
      onLoadRef.current(loaded);
    }
  }, []);

  // Persist on every tabData change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabData));
  }, [tabData]);
}
