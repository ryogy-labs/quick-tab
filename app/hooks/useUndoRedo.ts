"use client";

import { useCallback, useRef, useState } from "react";
import { TabData } from "../tabModel";

const MAX_UNDO_STACK = 50;

type UseUndoRedoOptions = {
  tabData: TabData;
  onDataChange: (data: TabData) => void;
};

export function useUndoRedo({ tabData, onDataChange }: UseUndoRedoOptions) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const undoStackRef = useRef<TabData[]>([]);
  const redoStackRef = useRef<TabData[]>([]);
  // Always read the latest tabData inside callbacks without adding it to deps
  const tabDataRef = useRef(tabData);
  tabDataRef.current = tabData;

  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  const commit = useCallback((nextData: TabData) => {
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
