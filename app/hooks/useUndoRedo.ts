"use client";

import { useCallback, useRef, useState } from "react";
import { TabDataV3 } from "../tabModel";

const MAX_UNDO_STACK = 50;

type UseUndoRedoOptions = {
  tabData: TabDataV3;
  onDataChange: (data: TabDataV3) => void;
};

export function useUndoRedo({ tabData, onDataChange }: UseUndoRedoOptions) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const undoStackRef = useRef<TabDataV3[]>([]);
  const redoStackRef = useRef<TabDataV3[]>([]);
  // Always read the latest tabData inside callbacks without adding it to deps
  const tabDataRef = useRef(tabData);
  tabDataRef.current = tabData;

  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  const commit = useCallback((nextData: TabDataV3) => {
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO_STACK - 1)), tabDataRef.current];
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    onDataChangeRef.current(nextData);
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, tabDataRef.current];
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    onDataChangeRef.current(prev);
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, tabDataRef.current];
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    onDataChangeRef.current(next);
  }, []);

  return { commit, undo, redo, canUndo, canRedo };
}
