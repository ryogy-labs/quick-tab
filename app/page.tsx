"use client";

import { ChangeEvent, CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import StaffPreview from "./components/StaffPreview";
import { STAFF_BOTTOM, STAFF_TOP, STAFF_VIEWBOX_HEIGHT } from "./components/StaffPreview";
import FretboardInput from "./components/FretboardInput";
import RestFlickButton from "./components/RestFlickButton";
import DropdownMenu from "./components/DropdownMenu";
import { usePlayback, PlayCursor } from "./hooks/usePlayback";
import { useTabStorage } from "./hooks/useTabStorage";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  CellPosition,
  DurationModifier,
  SIXTEENTH_STEPS,
  STEPS_PER_MEASURE,
  StepRangeClipboard,
  StepRangePoint,
  StepRangeSelection,
  STRINGS_COUNT,
  TUNING,
  TabDataV3,
  TabEvent,
  TabMeasureV3,
  applySequentialDeleteShift,
  applySequentialShift,
  clampFret,
  clampTempo,
  canPlaceEvent,
  getSequentialPlacementContext,
  copyMeasure,
  createEmptyTabDataV3,
  deleteMeasure,
  deleteSpecificNoteAtStep,
  deleteCellOrRestAtStep,
  duplicateMeasure,
  eventsToGrid,
  extractRangeClipboardFromMeasure,
  findEventAtStep,
  findOwningEventStep,
  getCellFret,
  getMeasureDisplaySteps,
  getEventOccupiedSteps,
  getMeasureOccupiedSteps,
  getVisibleStepsForMeasure,
  insertMeasure,
  isMeasureOverflowing,
  isStepBlockedForNewStart,
  isStepInRange,
  normalizeToTabDataV3,
  normalizeStepRange,
  pasteMeasure,
  pasteRangeClipboardIntoMeasure,
  sanitizeEvents,
  sanitizeTabDataV3,
  shiftEventsFromStep,
  updateEventLengthAtStep,
  upsertNoteAtCell,
  upsertRestAtStep,
} from "./tabModel";

const TAB_LABEL_WIDTH = 92;
const TAB_LABEL_WIDTH_MOBILE = 64;
const TAB_SLOT_WIDTH = 48;
const TAB_SLOT_WIDTH_MOBILE = 34;
const MEASURE_SCROLL_PADDING = 24;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.5;

type CursorAdvanceResult = {
  nextData: TabDataV3;
  nextSelected: CellPosition;
  didAppendMeasure: boolean;
};

type StaffBarMetrics = {
  top: number;
  height: number;
};

const toGlobalStep = (cursor: PlayCursor): number =>
  cursor.measureIndex * STEPS_PER_MEASURE + cursor.stepIndex;

const appendEmptyMeasure = (data: TabDataV3): TabDataV3 => ({
  ...data,
  measures: [...data.measures, { events: [] }],
});

const getNextCursorPositionWithAutoAppend = (
  data: TabDataV3,
  selected: CellPosition,
  moveAmount: number,
  isPlaying: boolean,
  displayUnit: number
): CursorAdvanceResult => {
  const safeMoveAmount = Math.max(1, Math.trunc(moveAmount));
  let nextData = data;
  let measureIndex = Math.max(0, Math.min(data.measures.length - 1, selected.measureIndex));
  let stepIndex = Math.max(0, selected.stepIndex);
  let remaining = safeMoveAmount;
  let didAppendMeasure = false;

  while (remaining > 0) {
    const measureEvents = nextData.measures.at(measureIndex)?.events ?? [];
    const displaySteps = getMeasureDisplaySteps(measureEvents, displayUnit);
    const targetStep = stepIndex + remaining;

    if (targetStep < displaySteps) {
      return {
        nextData,
        nextSelected: {
          ...selected,
          measureIndex,
          stepIndex: targetStep,
        },
        didAppendMeasure,
      };
    }

    remaining = targetStep - displaySteps;

    if (measureIndex < nextData.measures.length - 1) {
      measureIndex += 1;
      stepIndex = 0;
      continue;
    }

    if (isPlaying) {
      return {
        nextData,
        nextSelected: {
          ...selected,
          measureIndex,
          stepIndex: Math.max(0, displaySteps - displayUnit),
        },
        didAppendMeasure,
      };
    }

    nextData = appendEmptyMeasure(nextData);
    didAppendMeasure = true;
    measureIndex += 1;
    stepIndex = 0;
  }

  return {
    nextData,
    nextSelected: {
      ...selected,
      measureIndex,
      stepIndex,
    },
    didAppendMeasure,
  };
};

export default function Home() {
  const [tabData, setTabData] = useState<TabDataV3>(createEmptyTabDataV3);
  const [selected, setSelected] = useState<CellPosition>({
    measureIndex: 0,
    rowIndex: 5,
    stepIndex: 0,
  });
  const [inputLen, setInputLen] = useState<number>(SIXTEENTH_STEPS);
  const [isRestMode, setIsRestMode] = useState<boolean>(false);
  const [tempoInput, setTempoInput] = useState<string>("120");
  const [numpadBuffer, setNumpadBuffer] = useState<string>("");
  const [measureClipboard, setMeasureClipboard] = useState<TabMeasureV3 | null>(null);
  const [rangeClipboard, setRangeClipboard] = useState<StepRangeClipboard | null>(null);
  const [staffBarMetrics, setStaffBarMetrics] = useState<StaffBarMetrics | null>(null);
  const [dragSelectionAnchor, setDragSelectionAnchor] = useState<StepRangePoint | null>(null);
  const [selectedRange, setSelectedRange] = useState<StepRangeSelection | null>(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [autoShift, setAutoShift] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const tabLabelWidth = isMobile ? TAB_LABEL_WIDTH_MOBILE : TAB_LABEL_WIDTH;
  const tabSlotWidth = isMobile ? TAB_SLOT_WIDTH_MOBILE : TAB_SLOT_WIDTH;
  const tabMeasureWidth = tabSlotWidth * 16;

  const [notationScale, setNotationScale] = useState(1);
  const notationScaleRef = useRef(1);
  notationScaleRef.current = notationScale;

  const [fretboardScale, setFretboardScale] = useState(1);
  const handleFretboardScaleChange = useCallback(
    (s: number) => setFretboardScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))),
    []
  );

  // Set initial mobile scale
  useEffect(() => {
    setNotationScale(isMobile ? 0.5 : 1);
    setFretboardScale(isMobile ? 0.7 : 1);
  }, [isMobile]);

  useTabStorage({
    tabData,
    onLoad: useCallback((data: TabDataV3) => setTabData(data), []),
  });

  const digitBufferRef = useRef<string>("");
  const digitTimerRef = useRef<number | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const staffSectionRef = useRef<HTMLDivElement | null>(null);
  const prevPlaybackMeasureIndexRef = useRef<number | null>(null);
  const didDragRangeRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const selectedMeasureIndex = Math.max(
    0,
    Math.min(tabData.measures.length - 1, selected.measureIndex)
  );
  const events = tabData.measures.at(selectedMeasureIndex)?.events ?? [];
  const selectedEvent = findEventAtStep(events, selected.stepIndex);
  const selectedFret = getCellFret(events, selected.rowIndex, selected.stepIndex);
  const activeFretboardNotes =
    selectedEvent && !("rest" in selectedEvent && selectedEvent.rest)
      ? selectedEvent.notes
      : [];
  const activeInputLen = selectedEvent ? selectedEvent.len : inputLen;
  const activeIsRestMode =
    selectedEvent && "rest" in selectedEvent && selectedEvent.rest ? true : isRestMode;
  const totalMeasures = tabData.measures.length;
  const minEventLenAcrossMeasures = tabData.measures.reduce((globalMin, measure) => {
    const localMin = measure.events.reduce(
      (min, event) => Math.min(min, Math.max(1, event.len)),
      STEPS_PER_MEASURE
    );
    return Math.min(globalMin, localMin);
  }, STEPS_PER_MEASURE);
  const shouldRenderEveryStep =
    selectedRange !== null || activeInputLen > SIXTEENTH_STEPS;
  const effectiveMinLen = Math.min(minEventLenAcrossMeasures, activeInputLen);
  const displayUnit =
    shouldRenderEveryStep || effectiveMinLen <= SIXTEENTH_STEPS
      ? SIXTEENTH_STEPS
      : SIXTEENTH_STEPS * 2;
  const displaySlots = STEPS_PER_MEASURE / displayUnit;
  const stepWidth = tabMeasureWidth / displaySlots;
  const blockedStepsByMeasure = useMemo(
    () =>
      tabData.measures.map((measure, index) => {
        const visibleSteps = getVisibleStepsForMeasure(
          getMeasureDisplaySteps(measure.events, displayUnit),
          displayUnit
        );
        const set = new Set<number>();
        visibleSteps.forEach((step) => {
          if (
            isStepBlockedForNewStart(
              measure.events,
              step,
              getMeasureDisplaySteps(measure.events, displayUnit)
            )
          ) {
            set.add(step);
          }
        });
        return set;
      }),
    [displayUnit, tabData.measures]
  );
  const overflowingMeasureSet = useMemo(
    () =>
      new Set(
        tabData.measures
          .map((measure, index) => (isMeasureOverflowing(measure.events) ? index : -1))
          .filter((index) => index >= 0)
      ),
    [tabData.measures]
  );
  const measureDisplayStepsByMeasure = useMemo(
    () =>
      tabData.measures.map((measure) =>
        getMeasureDisplaySteps(measure.events, displayUnit)
      ),
    [displayUnit, tabData.measures]
  );
  const measureVisibleStepsByMeasure = useMemo(
    () =>
      measureDisplayStepsByMeasure.map((displaySteps) =>
        getVisibleStepsForMeasure(displaySteps, displayUnit)
      ),
    [displayUnit, measureDisplayStepsByMeasure]
  );
  const measureDisplaySlotsByMeasure = useMemo(
    () => measureVisibleStepsByMeasure.map((steps) => steps.length),
    [measureVisibleStepsByMeasure]
  );
  const selectedMeasureDisplaySteps =
    measureDisplayStepsByMeasure[selectedMeasureIndex] ?? STEPS_PER_MEASURE;
  const blockedStepSet = blockedStepsByMeasure[selectedMeasureIndex] ?? new Set<number>();
  const measureGrids = useMemo(
    () =>
      tabData.measures.map((measure, index) =>
        eventsToGrid(measure.events, measureDisplayStepsByMeasure[index] ?? STEPS_PER_MEASURE)
      ),
    [measureDisplayStepsByMeasure, tabData.measures]
  );
  const displayCells = useMemo(
    () =>
      measureVisibleStepsByMeasure.flatMap((visibleSteps, measureIndex) =>
        visibleSteps.map((stepIndex, slotIndex) => ({
          measureIndex,
          stepIndex,
          slotIndex,
        }))
      ),
    [measureVisibleStepsByMeasure]
  );

  const { commit: commitTabData, undo: handleUndo, redo: handleRedo, canUndo, canRedo } = useUndoRedo({
    tabData,
    onDataChange: useCallback((data: TabDataV3) => setTabData(data), []),
  });

  const { isPlaying, playCursor, handlePlay, stopPlayback, playNotePreview } = usePlayback({
    tabData,
    selectedMeasureIndex,
    overflowingMeasureSet,
    onPlaybackEnd: useCallback(() => {
      setSelected((prev) => ({ ...prev, measureIndex: 0, stepIndex: 0 }));
    }, []),
  });

  const getNearestSelectableStep = (
    targetStep: number,
    measureIndex = selectedMeasureIndex
  ): number => {
    const visibleSteps = measureVisibleStepsByMeasure[measureIndex] ?? [0];
    const blockedSteps = blockedStepsByMeasure[measureIndex] ?? new Set<number>();
    const selectable = visibleSteps.filter((step) => !blockedSteps.has(step));
    if (selectable.length === 0) {
      return 0;
    }
    return selectable.reduce((best, step) =>
      Math.abs(step - targetStep) < Math.abs(best - targetStep) ? step : best
    );
  };

  const getMeasureEvents = (data: TabDataV3, measureIndex: number): TabEvent[] =>
    data.measures.at(measureIndex)?.events ?? [];

  const updateMeasureEvents = (
    data: TabDataV3,
    measureIndex: number,
    nextEvents: TabEvent[]
  ): TabDataV3 => {
    const safeIndex = Math.max(0, measureIndex);
    const measures = [...data.measures];
    while (measures.length <= safeIndex) {
      measures.push({ events: [] });
    }
    measures[safeIndex] = { events: nextEvents };
    return { ...data, measures };
  };

  const clearDigitBuffer = () => {
    digitBufferRef.current = "";
    setNumpadBuffer("");
    if (digitTimerRef.current !== null) {
      window.clearTimeout(digitTimerRef.current);
      digitTimerRef.current = null;
    }
  };

  const setSingleCellSelection = (next: CellPosition) => {
    setSelected(next);
    setSelectedRange(null);
    setDragSelectionAnchor(null);
    setIsDraggingRange(false);
  };

  const moveSelection = (next: CellPosition) => {
    const clampedMeasure = Math.max(
      0,
      Math.min(tabData.measures.length - 1, next.measureIndex)
    );
    const displaySteps =
      measureDisplayStepsByMeasure[clampedMeasure] ?? STEPS_PER_MEASURE;
    const clampedStep = Math.max(0, Math.min(displaySteps - 1, next.stepIndex));
    setSingleCellSelection({
      measureIndex: clampedMeasure,
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, next.rowIndex)),
      stepIndex: getNearestSelectableStep(clampedStep, clampedMeasure),
    });
  };

  const moveHorizontal = (delta: number) => {
    const currentVisibleSteps = measureVisibleStepsByMeasure[selected.measureIndex] ?? [0];
    const currentBlockedSteps = blockedStepsByMeasure[selected.measureIndex] ?? new Set<number>();
    const current = getNearestSelectableStep(selected.stepIndex, selected.measureIndex);
    const currentIndex = currentVisibleSteps.indexOf(current);
    if (currentIndex === -1) {
      setSingleCellSelection({
        ...selected,
        stepIndex: getNearestSelectableStep(0, selected.measureIndex),
      });
      return;
    }

    let nextIndex = currentIndex + delta;
    while (nextIndex >= 0 && nextIndex < currentVisibleSteps.length) {
      const candidate = currentVisibleSteps[nextIndex];
      if (!currentBlockedSteps.has(candidate)) {
        setSingleCellSelection({ ...selected, stepIndex: candidate });
        return;
      }
      nextIndex += delta;
    }

    if (delta > 0) {
      const advanceAmount =
        selectedEvent && selectedEvent.step === current ? selectedEvent.len : displayUnit;
      const result = getNextCursorPositionWithAutoAppend(
        tabData,
        { ...selected, stepIndex: current },
        advanceAmount,
        isPlaying,
        displayUnit
      );
      if (result.didAppendMeasure) {
        commitTabData(result.nextData);
      }
      setSingleCellSelection(result.nextSelected);
      return;
    }

    if (delta < 0 && current === 0 && selected.measureIndex > 0) {
      const prevMeasureIndex = selected.measureIndex - 1;
      const prevVisibleSteps = measureVisibleStepsByMeasure[prevMeasureIndex] ?? [0];
      setSingleCellSelection({
        ...selected,
        measureIndex: prevMeasureIndex,
        stepIndex: prevVisibleSteps[prevVisibleSteps.length - 1] ?? 0,
      });
      return;
    }

    setSingleCellSelection({ ...selected, stepIndex: current });
  };

  const commitNoteAtSelected = (fret: number) => {
    const safeFret = clampFret(fret);
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const { oldEvent, placementEvents, deferredEvents } = getSequentialPlacementContext(
      measureEvents,
      selected.stepIndex,
      autoShift
    );
    const placementSource =
      autoShift && oldEvent ? placementEvents : measureEvents;

    if (
      !canPlaceEvent(
        placementSource,
        selected.stepIndex,
        activeInputLen,
        { ignoreStep: selected.stepIndex },
        selectedMeasureDisplaySteps,
        true
      )
    ) {
      return;
    }
    const nextEvents = upsertNoteAtCell(
      placementSource,
      selected,
      safeFret,
      activeInputLen,
      selectedMeasureDisplaySteps,
      true
    );
    const newEvent = findEventAtStep(nextEvents, selected.stepIndex);
    const finalEvents = applySequentialShift(nextEvents, deferredEvents, oldEvent, newEvent, autoShift);
    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents);
      const result = getNextCursorPositionWithAutoAppend(
        updatedData,
        selected,
        activeInputLen,
        isPlaying,
        displayUnit
      );
    commitTabData(result.nextData);
    setSingleCellSelection(result.nextSelected);
    playNotePreview(updatedData, selectedMeasureIndex, selected.stepIndex);
  };

  const commitFretboardNote = (rowIndex: number, fret: number) => {
    if (isPlaying) {
      return;
    }

    const stringNumber = rowIndex + 1;
    const safeFret = clampFret(fret);
    const isActiveNote = activeFretboardNotes.some(
      (note) => note.string === stringNumber && note.fret === safeFret
    );

    // TAB row mapping: rowIndex 0 => 1st string (E4), rowIndex 5 => 6th string (E2).
    const nextSelected = {
      ...selected,
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, rowIndex)),
    };
    setSelected(nextSelected);
    setSelectedRange(null);
    setDragSelectionAnchor(null);
    setIsDraggingRange(false);

    if (isActiveNote) {
      const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
      const oldEvent = findEventAtStep(measureEvents, nextSelected.stepIndex);
      const nextEvents = deleteSpecificNoteAtStep(
        measureEvents,
        nextSelected.stepIndex,
        stringNumber,
        safeFret,
        selectedMeasureDisplaySteps
      );
      const remainingEvent = findEventAtStep(nextEvents, nextSelected.stepIndex);
      const finalEvents =
        oldEvent && !remainingEvent
          ? applySequentialDeleteShift(nextEvents, oldEvent, autoShift)
          : sanitizeEvents(nextEvents, STEPS_PER_MEASURE, true);
      commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents));
      return;
    }

    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const { oldEvent, placementEvents, deferredEvents } = getSequentialPlacementContext(
      measureEvents,
      nextSelected.stepIndex,
      autoShift
    );
    const placementSource =
      autoShift && oldEvent ? placementEvents : measureEvents;

    if (
      !canPlaceEvent(
        placementSource,
        nextSelected.stepIndex,
        activeInputLen,
        { ignoreStep: nextSelected.stepIndex },
        selectedMeasureDisplaySteps,
        true
      )
    ) {
      return;
    }
    const nextEvents = upsertNoteAtCell(
      placementSource,
      nextSelected,
      safeFret,
      activeInputLen,
      selectedMeasureDisplaySteps,
      true
    );
    const newEvent = findEventAtStep(nextEvents, nextSelected.stepIndex);
    const finalEvents = applySequentialShift(nextEvents, deferredEvents, oldEvent, newEvent, autoShift);
    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      nextSelected,
      activeInputLen,
      isPlaying,
      displayUnit
    );
    commitTabData(result.nextData);
    setSingleCellSelection(result.nextSelected);
    playNotePreview(updatedData, selectedMeasureIndex, nextSelected.stepIndex);
  };

  const placeRestAtStep = (stepIndex: number) => {
    if (
      !canPlaceEvent(
        events,
        stepIndex,
        activeInputLen,
        { ignoreStep: stepIndex },
        selectedMeasureDisplaySteps,
        true
      )
    ) {
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = upsertRestAtStep(
      measureEvents,
      stepIndex,
      activeInputLen,
      selectedMeasureDisplaySteps,
      true
    );
    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      { ...selected, stepIndex },
      activeInputLen,
      isPlaying,
      displayUnit
    );
    commitTabData(result.nextData);
    setSingleCellSelection(result.nextSelected);
  };

  // --- Flick-based input (音程+音価を1アクションで入力) ---

  const commitFretboardFlick = (
    rowIndex: number,
    fret: number,
    len: number,
    modifier: DurationModifier
  ) => {
    if (isPlaying) return;

    const safeFret = clampFret(fret);

    const nextSelected = {
      ...selected,
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, rowIndex)),
    };
    setSelected(nextSelected);
    setSelectedRange(null);
    setDragSelectionAnchor(null);
    setIsDraggingRange(false);

    // Always overwrite (no toggle) — flick is an intentional placement gesture
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const { oldEvent, placementEvents, deferredEvents } = getSequentialPlacementContext(
      measureEvents,
      nextSelected.stepIndex,
      autoShift
    );
    const placementSource =
      autoShift && oldEvent ? placementEvents : measureEvents;

    if (
      !canPlaceEvent(
        placementSource,
        nextSelected.stepIndex,
        len,
        { ignoreStep: nextSelected.stepIndex },
        selectedMeasureDisplaySteps,
        true
      )
    ) {
      return;
    }
    const nextEvents = upsertNoteAtCell(
      placementSource,
      nextSelected,
      safeFret,
      len,
      selectedMeasureDisplaySteps,
      true
    );

    // Apply dot/triplet modifier to the inserted event
    const modifiedEvents = nextEvents.map((ev) => {
      if (ev.step !== nextSelected.stepIndex) return ev;
      const base = { ...ev };
      delete base.dot;
      delete base.triplet;
      if (modifier === "dotted") return { ...base, dot: true as const };
      if (modifier === "triplet") return { ...base, triplet: true as const };
      return base;
    });
    const newEvent = findEventAtStep(modifiedEvents, nextSelected.stepIndex);
    const finalEvents = applySequentialShift(modifiedEvents, deferredEvents, oldEvent, newEvent, autoShift);
    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      nextSelected,
      len,
      isPlaying,
      displayUnit
    );
    commitTabData(result.nextData);
    setSingleCellSelection(result.nextSelected);
    playNotePreview(updatedData, selectedMeasureIndex, nextSelected.stepIndex);

    // Sync toolbar duration display
    setInputLen(len);
    setIsRestMode(false);
  };

  const placeRestWithFlick = (len: number, modifier: DurationModifier) => {
    if (isPlaying) return;
    const stepIndex = selected.stepIndex;
    if (
      !canPlaceEvent(
        events,
        stepIndex,
        len,
        { ignoreStep: stepIndex },
        selectedMeasureDisplaySteps,
        true
      )
    ) {
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = upsertRestAtStep(
      measureEvents,
      stepIndex,
      len,
      selectedMeasureDisplaySteps,
      true
    );

    // Apply dot/triplet modifier
    const modifiedEvents = nextEvents.map((ev) => {
      if (ev.step !== stepIndex) return ev;
      const base = { ...ev };
      delete base.dot;
      delete base.triplet;
      if (modifier === "dotted") return { ...base, dot: true as const };
      if (modifier === "triplet") return { ...base, triplet: true as const };
      return base;
    });

    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, modifiedEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      { ...selected, stepIndex },
      len,
      isPlaying,
      displayUnit
    );
    commitTabData(result.nextData);
    setSingleCellSelection(result.nextSelected);

    // Sync toolbar
    setInputLen(len);
    setIsRestMode(true);
  };

  useEffect(() => {
    setTempoInput(String(tabData.tempo));
  }, [tabData]);

  useEffect(() => {
    if (!isDraggingRange) {
      return;
    }

    const handleDragEnd = () => {
      setIsDraggingRange(false);
      setDragSelectionAnchor(null);
    };

    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchend", handleDragEnd);
    return () => {
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDraggingRange]);

  const handleRangeMouseEnterRef = useRef<(measureIndex: number, stepIndex: number) => void>(() => undefined);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !isDraggingRange) {
      return;
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
      const cell = el?.closest("[data-measure-index]") as HTMLElement | null;
      if (!cell) {
        return;
      }
      const mi = cell.getAttribute("data-measure-index");
      const si = cell.getAttribute("data-step-index");
      if (mi !== null && si !== null) {
        handleRangeMouseEnterRef.current(Number(mi), Number(si));
      }
    };

    grid.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => grid.removeEventListener("touchmove", handleTouchMove);
  }, [isDraggingRange]);

  useEffect(() => {
    return () => {
      stopPlayback();
      clearDigitBuffer();
    };
  }, [stopPlayback]);

  const handlePrevMeasure = () => {
    if (isPlaying || selectedMeasureIndex <= 0) {
      return;
    }
    setSelected((prev) => {
      const nextMeasureIndex = Math.max(0, prev.measureIndex - 1);
      const nextDisplaySteps =
        measureDisplayStepsByMeasure[nextMeasureIndex] ?? STEPS_PER_MEASURE;
      return {
        ...prev,
        measureIndex: nextMeasureIndex,
        rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
        stepIndex: Math.max(0, Math.min(nextDisplaySteps - 1, prev.stepIndex)),
      };
    });
  };

  const handleNextMeasure = () => {
    if (isPlaying) {
      return;
    }

    if (selectedMeasureIndex >= totalMeasures - 1) {
      commitTabData({
        ...tabData,
        measures: [...tabData.measures, { events: [] }],
      });
      setSelected((prev) => ({
        ...prev,
        measureIndex: totalMeasures,
        rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
        stepIndex: 0,
      }));
      return;
    }

    setSelected((prev) => {
      const nextMeasureIndex = Math.min(totalMeasures - 1, prev.measureIndex + 1);
      const nextDisplaySteps =
        measureDisplayStepsByMeasure[nextMeasureIndex] ?? STEPS_PER_MEASURE;
      return {
        ...prev,
        measureIndex: nextMeasureIndex,
        rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
        stepIndex: Math.max(0, Math.min(nextDisplaySteps - 1, prev.stepIndex)),
      };
    });
  };

  const handleAddMeasure = () => {
    if (isPlaying) {
      return;
    }
    const nextMeasureIndex = totalMeasures;
    commitTabData({
      ...tabData,
      measures: [...tabData.measures, { events: [] }],
    });
    setSelected({
      measureIndex: nextMeasureIndex,
      rowIndex: 0,
      stepIndex: 0,
    });
  };

  const handleInsertMeasure = () => {
    if (isPlaying) {
      return;
    }

    commitTabData(insertMeasure(tabData, selectedMeasureIndex));
    setSelected({
      measureIndex: selectedMeasureIndex,
      rowIndex: 0,
      stepIndex: 0,
    });
  };

  const handleDuplicateMeasure = () => {
    if (isPlaying) {
      return;
    }

    commitTabData(duplicateMeasure(tabData, selectedMeasureIndex));
    setSelected((prev) => ({
      ...prev,
      measureIndex: Math.min(totalMeasures, selectedMeasureIndex + 1),
    }));
  };

  const handleCopyMeasure = () => {
    setMeasureClipboard(copyMeasure(tabData, selectedMeasureIndex));
  };

  const handlePasteMeasure = () => {
    if (!measureClipboard || isPlaying) {
      return;
    }

    commitTabData(pasteMeasure(tabData, selectedMeasureIndex, measureClipboard));
  };

  const handleRangeMouseDown = (measureIndex: number, stepIndex: number) => {
    const anchor = { measureIndex, stepIndex };
    didDragRangeRef.current = false;
    setDragSelectionAnchor(anchor);
    setSelectedRange(normalizeStepRange(anchor, anchor));
    setIsDraggingRange(true);
  };

  const handleRangeMouseEnter = (measureIndex: number, stepIndex: number) => {
    if (!isDraggingRange || !dragSelectionAnchor) {
      return;
    }
    if (
      dragSelectionAnchor.measureIndex !== measureIndex ||
      dragSelectionAnchor.stepIndex !== stepIndex
    ) {
      didDragRangeRef.current = true;
    }
    setSelectedRange(
      normalizeStepRange(dragSelectionAnchor, {
        measureIndex,
        stepIndex,
      })
    );
  };
  handleRangeMouseEnterRef.current = handleRangeMouseEnter;

  const handleCopyRange = () => {
    if (!selectedRange) {
      return;
    }
    const sourceEvents = getMeasureEvents(tabData, selectedRange.startMeasureIndex);
    setRangeClipboard(extractRangeClipboardFromMeasure(sourceEvents, selectedRange));
  };

  const handlePasteRange = () => {
    if (!rangeClipboard || isPlaying) {
      return;
    }

    const targetDisplaySteps =
      measureDisplayStepsByMeasure[selectedMeasureIndex] ?? STEPS_PER_MEASURE;
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = pasteRangeClipboardIntoMeasure(
      measureEvents,
      selected.stepIndex,
      rangeClipboard,
      targetDisplaySteps
    );
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents));
  };

  const handleDeleteMeasure = () => {
    if (isPlaying || totalMeasures <= 1) {
      return;
    }

    commitTabData(deleteMeasure(tabData, selectedMeasureIndex));
    setSelected((prev) => ({
      ...prev,
      measureIndex: Math.min(selectedMeasureIndex, totalMeasures - 2),
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
      stepIndex: Math.max(
        0,
        Math.min(
          (measureDisplayStepsByMeasure[Math.min(selectedMeasureIndex, totalMeasures - 2)] ??
            STEPS_PER_MEASURE) - 1,
          prev.stepIndex
        )
      ),
    }));
  };

  const handleDelete = () => {
    clearDigitBuffer();
    if (selectedRange) {
      // Delete all events within the range selection
      const measureEvents = getMeasureEvents(tabData, selectedRange.startMeasureIndex);
      const nextEvents = measureEvents.filter(
        (event) => event.step < selectedRange.startStepIndex || event.step > selectedRange.endStepIndex
      );
      commitTabData(updateMeasureEvents(tabData, selectedRange.startMeasureIndex, nextEvents));
      setSelectedRange(null);
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const owningStep = findOwningEventStep(measureEvents, selected.stepIndex);
    const oldEvent = findEventAtStep(measureEvents, owningStep);
    const nextEvents = deleteCellOrRestAtStep(measureEvents, {
      ...selected,
      stepIndex: owningStep,
    }, selectedMeasureDisplaySteps);
    const remainingEvent = findEventAtStep(nextEvents, owningStep);
    const finalEvents =
      oldEvent && !remainingEvent
        ? applySequentialDeleteShift(nextEvents, oldEvent, autoShift)
        : sanitizeEvents(nextEvents, STEPS_PER_MEASURE, true);
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents));
  };

  const handleDeleteEvent = () => {
    clearDigitBuffer();
    if (selectedRange) {
      const measureEvents = getMeasureEvents(tabData, selectedRange.startMeasureIndex);
      const nextEvents = measureEvents.filter(
        (event) => event.step < selectedRange.startStepIndex || event.step > selectedRange.endStepIndex
      );
      commitTabData(updateMeasureEvents(tabData, selectedRange.startMeasureIndex, nextEvents));
      setSelectedRange(null);
      return;
    }

    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const owningStep = findOwningEventStep(measureEvents, selected.stepIndex);
    const oldEvent = findEventAtStep(measureEvents, owningStep);
    const nextEvents = sanitizeEvents(measureEvents, selectedMeasureDisplaySteps, true).filter(
      (event) => event.step !== owningStep
    );
    const finalEvents = applySequentialDeleteShift(nextEvents, oldEvent, autoShift);
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents));
  };

  const handleTempoCommit = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setTempoInput(String(tabData.tempo));
      return;
    }

    const nextTempo = clampTempo(parsed);
    commitTabData({ ...tabData, tempo: nextTempo });
  };

  const handleSelectDuration = (len: number, nextRestMode: boolean) => {
    setInputLen(len);
    setIsRestMode(nextRestMode);

    const currentEvent = findEventAtStep(events, selected.stepIndex);
    if (!currentEvent) {
      return;
    }

    if (!nextRestMode) {
      const selectedFret = getCellFret(events, selected.rowIndex, selected.stepIndex);
      if (selectedFret === null) {
        return;
      }
    }

    if (nextRestMode && !("rest" in currentEvent && currentEvent.rest)) {
      return;
    }

    const measureEventsForLen = getMeasureEvents(tabData, selectedMeasureIndex);
    const { oldEvent, placementEvents, deferredEvents } = getSequentialPlacementContext(
      measureEventsForLen,
      selected.stepIndex,
      autoShift
    );
    const placementSource =
      autoShift && oldEvent ? placementEvents : measureEventsForLen;

    if (
      !canPlaceEvent(
        placementSource,
        selected.stepIndex,
        len,
        { ignoreStep: selected.stepIndex },
        selectedMeasureDisplaySteps,
        true
      )
    ) {
      return;
    }

    const nextEventsForLen = updateEventLengthAtStep(
      placementSource,
      selected.stepIndex,
      len,
      selectedMeasureDisplaySteps,
      true
    );
    const newEvent = findEventAtStep(nextEventsForLen, selected.stepIndex);
    const finalEvents = applySequentialShift(
      nextEventsForLen,
      deferredEvents,
      oldEvent,
      newEvent,
      autoShift
    );
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents));
  };

  const handleDigitInput = (digit: string) => {
    if (activeIsRestMode) {
      return;
    }

    const nextBuffer = `${digitBufferRef.current}${digit}`.slice(0, 2);
    digitBufferRef.current = nextBuffer;
    const parsed = Number(nextBuffer);

    if (Number.isNaN(parsed) || parsed > 24) {
      digitBufferRef.current = digit;
    }

    setNumpadBuffer(digitBufferRef.current);

    if (digitTimerRef.current !== null) {
      window.clearTimeout(digitTimerRef.current);
      digitTimerRef.current = null;
    }

    const commit = () => {
      if (digitBufferRef.current === "") {
        return;
      }
      const fret = Number(digitBufferRef.current);
      clearDigitBuffer();
      setNumpadBuffer("");
      if (!Number.isNaN(fret)) {
        commitNoteAtSelected(fret);
      }
    };

    if (digitBufferRef.current.length >= 2) {
      commit();
      return;
    }

    digitTimerRef.current = window.setTimeout(commit, 420);
  };

  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDelete: handleDelete,
    onPlay: handlePlay,
    onDigitInput: handleDigitInput,
    onPlaceRest: placeRestAtStep,
    onMoveRowUp: () => moveSelection({ ...selected, rowIndex: selected.rowIndex - 1 }),
    onMoveRowDown: () => moveSelection({ ...selected, rowIndex: selected.rowIndex + 1 }),
    onMoveLeft: () => moveHorizontal(-1),
    onMoveRight: () => moveHorizontal(1),
    onCopyMeasure: handleCopyMeasure,
    onCopyRange: handleCopyRange,
    onPasteMeasure: handlePasteMeasure,
    onPasteRange: handlePasteRange,
    onClearDigitBuffer: clearDigitBuffer,
    isPlaying,
    activeIsRestMode,
    selectedStep: selected.stepIndex,
    selectedRange,
    measureClipboard,
    rangeClipboard,
  });

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(tabData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quick-tab-v3.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeToTabDataV3(parsed, true);
      if (!normalized) {
        alert("Invalid JSON format.");
        return;
      }

      setTabData(normalized);
      stopPlayback();
      clearDigitBuffer();
    } catch {
      alert("Failed to import JSON.");
    } finally {
      event.target.value = "";
    }
  };

  const durationPreviewEndStep = Math.min(
    selectedMeasureDisplaySteps,
    selected.stepIndex + activeInputLen
  );
  // Duration preview is a time-band highlight. It depends only on measure + step span,
  // never on the selected string row or whether the cell already has a value.
  const isDurationPreviewStep = (measureIndex: number, stepIndex: number): boolean =>
    selectedRange === null &&
    measureIndex === selected.measureIndex &&
    stepIndex >= selected.stepIndex &&
    stepIndex < durationPreviewEndStep;
  const measuresEvents = useMemo(
    () => tabData.measures.map((measure) => measure.events),
    [tabData.measures]
  );
  const totalDisplaySlots = displayCells.length;
  const measureStartXs = useMemo(() => {
    const starts = [tabLabelWidth];
    let cursor = tabLabelWidth;
    measureDisplaySlotsByMeasure.forEach((slotCount) => {
      cursor += slotCount * stepWidth;
      starts.push(cursor);
    });
    return starts;
  }, [measureDisplaySlotsByMeasure, stepWidth, tabLabelWidth]);
  const timelineWidth = measureStartXs[measureStartXs.length - 1] ?? tabLabelWidth;
  const currentGlobalStep = playCursor ? toGlobalStep(playCursor) : null;
  const currentPlaybackMeasureIndex =
    currentGlobalStep === null
      ? null
      : Math.floor(currentGlobalStep / STEPS_PER_MEASURE);
  const notationStyle = {
    "--label-width": `${tabLabelWidth}px`,
    "--step-width": `${stepWidth}px`,
    "--slot-count": String(totalDisplaySlots),
    "--notation-scale": String(notationScale),
  } as CSSProperties;

  useEffect(() => {
    if (!isPlaying || currentPlaybackMeasureIndex === null) {
      prevPlaybackMeasureIndexRef.current = null;
      return;
    }

    if (prevPlaybackMeasureIndexRef.current === currentPlaybackMeasureIndex) {
      return;
    }

    const container = timelineScrollRef.current;
    if (!container) {
      prevPlaybackMeasureIndexRef.current = currentPlaybackMeasureIndex;
      return;
    }

    const measureStartX = measureStartXs[currentPlaybackMeasureIndex] ?? measureStartXs[0] ?? 0;
    const nextLeft = Math.max(0, measureStartX - MEASURE_SCROLL_PADDING);
    container.scrollTo({ left: nextLeft, behavior: "auto" });
    prevPlaybackMeasureIndexRef.current = currentPlaybackMeasureIndex;
  }, [currentPlaybackMeasureIndex, isPlaying, measureStartXs]);

  useEffect(() => {
    const staffSectionEl = staffSectionRef.current;
    if (!staffSectionEl) {
      return;
    }

    const updateMetrics = () => {
      // notationContent uses CSS zoom, so getBoundingClientRect() returns already-scaled pixels.
      // The overlay lives inside the same zoomed subtree, therefore its top/height must be
      // computed from unscaled layout units to avoid double-scaling.
      const layoutHeight = staffSectionEl.offsetHeight;
      const scale = layoutHeight / STAFF_VIEWBOX_HEIGHT;
      const lineHeight = Math.max(0, (STAFF_BOTTOM - STAFF_TOP) * scale - 2);
      setStaffBarMetrics({
        top: STAFF_TOP * scale,
        height: lineHeight,
      });
    };

    updateMetrics();

    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(staffSectionEl);
    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [notationScale, totalMeasures, stepWidth, displayUnit]);

  // Pinch-to-zoom on notation area
  const pinchRef = useRef<{ initialDist: number; initialScale: number } | null>(null);
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDist: getDistance(e.touches[0], e.touches[1]),
          initialScale: notationScaleRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dist = getDistance(e.touches[0], e.touches[1]);
        const ratio = dist / pinchRef.current.initialDist;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.initialScale * ratio));
        setNotationScale(newScale);
      }
    };

    const onTouchEnd = () => { pinchRef.current = null; };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.measureIndex === selectedMeasureIndex) {
        return prev;
      }
      return { ...prev, measureIndex: selectedMeasureIndex };
    });
  }, [selectedMeasureIndex]);

  useEffect(() => {
    setSelected((prev) => {
      // If cursor is on a blocked step (inside an event's duration),
      // snap to that event's start step so the full range is highlighted
      if (blockedStepSet.has(prev.stepIndex)) {
        const owningStep = findOwningEventStep(
          events,
          prev.stepIndex,
          selectedMeasureDisplaySteps
        );
        if (owningStep !== prev.stepIndex) {
          return { ...prev, stepIndex: owningStep };
        }
      }
      const nextStep = getNearestSelectableStep(prev.stepIndex);
      if (nextStep === prev.stepIndex) {
        return prev;
      }
      return { ...prev, stepIndex: nextStep };
    });
  }, [displayUnit, blockedStepSet, events]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    if ("rest" in selectedEvent && selectedEvent.rest) {
      setInputLen(selectedEvent.len);
      setIsRestMode(true);
      return;
    }

    setInputLen(selectedEvent.len);
    setIsRestMode(false);
  }, [selectedEvent]);

  const [tempoEditing, setTempoEditing] = useState(false);

  const menuItems = useMemo(() => [
    { type: "button" as const, label: "Undo", onClick: handleUndo, disabled: !canUndo },
    { type: "button" as const, label: "Redo", onClick: handleRedo, disabled: !canRedo },
    { type: "separator" as const },
    { type: "button" as const, label: "Add Measure", onClick: handleAddMeasure, disabled: isPlaying },
    { type: "button" as const, label: "Insert Measure", onClick: handleInsertMeasure, disabled: isPlaying },
    { type: "button" as const, label: "Delete Measure", onClick: handleDeleteMeasure, disabled: isPlaying || totalMeasures <= 1 },
    { type: "button" as const, label: "Duplicate Measure", onClick: handleDuplicateMeasure, disabled: isPlaying },
    { type: "separator" as const },
    { type: "button" as const, label: "Copy Measure", onClick: handleCopyMeasure },
    { type: "button" as const, label: "Paste Measure", onClick: handlePasteMeasure, disabled: isPlaying || measureClipboard === null },
    { type: "button" as const, label: "Copy Range", onClick: handleCopyRange, disabled: selectedRange === null },
    { type: "button" as const, label: "Paste Range", onClick: handlePasteRange, disabled: isPlaying || rangeClipboard === null },
    { type: "separator" as const },
    { type: "button" as const, label: "Export JSON", onClick: handleExport },
    { type: "file" as const, label: "Import JSON", accept: "application/json", onChange: handleImportFile },
    { type: "separator" as const },
    {
      type: "custom" as const,
      content: (
        <div>
          <div className={styles.menuSectionTitle}>Input Mode</div>
          <div className={styles.modeToggleRow}>
            <button
              type="button"
              className={`${styles.modeToggleButton} ${
                !autoShift ? styles.modeToggleActive : ""
              }`.trim()}
              onClick={() => setAutoShift(false)}
            >
              Grid
            </button>
            <button
              type="button"
              className={`${styles.modeToggleButton} ${
                autoShift ? styles.modeToggleActive : ""
              }`.trim()}
              onClick={() => setAutoShift(true)}
            >
              Sequential
            </button>
          </div>
        </div>
      ),
    },
  ], [autoShift, canUndo, canRedo, isPlaying, totalMeasures, measureClipboard, selectedRange, rangeClipboard, handleUndo, handleRedo, handleAddMeasure, handleInsertMeasure, handleDeleteMeasure, handleDuplicateMeasure, handleCopyMeasure, handlePasteMeasure, handleCopyRange, handlePasteRange, handleExport, handleImportFile]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {/* Mini header */}
        <div className={styles.miniHeader}>
          <div className={styles.navGroup}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={handlePrevMeasure}
              disabled={isPlaying || selectedMeasureIndex <= 0}
            >
              ◀
            </button>
            <button
              type="button"
              className={styles.navBtn}
              onClick={handleNextMeasure}
              disabled={isPlaying}
            >
              ▶
            </button>
          </div>

          <span className={styles.measureInfo}>
            M{selectedMeasureIndex + 1}/{totalMeasures}
          </span>

          {tempoEditing ? (
            <input
              type="number"
              className={styles.tempoInput}
              value={tempoInput}
              min={30}
              max={300}
              autoFocus
              onChange={(e) => setTempoInput(e.target.value)}
              onBlur={() => {
                handleTempoCommit(tempoInput);
                setTempoEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTempoCommit(tempoInput);
                  setTempoEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className={styles.tempoDisplay}
              onClick={() => setTempoEditing(true)}
            >
              ♩={tabData.tempo}
            </button>
          )}

          <button
            type="button"
            className={`${styles.playBtn} ${isPlaying ? styles.playBtnActive : ""}`}
            onClick={handlePlay}
          >
            {isPlaying ? "■" : "▶"}
          </button>

          <button
            type="button"
            className={styles.deleteBtn}
            onClick={handleDeleteEvent}
            disabled={isPlaying}
            aria-label="Delete current event or selection"
            title="Delete event"
          >
            ×
          </button>

          <DropdownMenu items={menuItems} />
        </div>

        {/* Notation: Staff + TAB */}
        <div className={styles.notationFrame}>
          <div className={styles.zoomControl}>
            <span className={styles.zoomLabel}>{Math.round(notationScale * 100)}%</span>
            <input
              type="range"
              min={String(MIN_SCALE * 100)}
              max={String(MAX_SCALE * 100)}
              value={Math.round(notationScale * 100)}
              onChange={(e) => setNotationScale(Number(e.target.value) / 100)}
              className={styles.zoomSlider}
            />
          </div>
          <div ref={timelineScrollRef} className={styles.notationScroll}>
            <div className={styles.notationContent} style={notationStyle}>
              <div ref={staffSectionRef} className={styles.staffSection}>
                <div className={styles.measureBarOverlay} aria-hidden="true">
                  {measureStartXs.map((left, i) => {
                    const isEnd = i === totalMeasures;
                    const boundaryMeasureIndex = isEnd ? totalMeasures - 1 : i;
                    return (
                      <div
                        key={`staff-barline-${i}`}
                        className={`${styles.measureBarLine} ${
                          overflowingMeasureSet.has(boundaryMeasureIndex) ? styles.measureOverflow : ""
                        } ${isEnd ? styles.measureBarLineEnd : ""}`}
                        style={{
                          left: `${left}px`,
                          top: staffBarMetrics ? `${staffBarMetrics.top}px` : "0",
                          height: staffBarMetrics ? `${staffBarMetrics.height}px` : "0",
                        }}
                      />
                    );
                  })}
                </div>
                <StaffPreview
                  measuresEvents={measuresEvents}
                  currentCursor={playCursor}
                  stepWidth={stepWidth}
                  stepUnit={displayUnit}
                  measureDisplaySlots={measureDisplaySlotsByMeasure}
                  measureStartXs={measureStartXs}
                  timelineWidth={timelineWidth}
                  overflowingMeasures={overflowingMeasureSet}
                  showBarLines={false}
                />
              </div>
              <div className={styles.gridSection}>
                <div className={styles.measureBarOverlay} aria-hidden="true">
                  {measureStartXs.map((left, i) => {
                    const isEnd = i === totalMeasures;
                    const boundaryMeasureIndex = isEnd ? totalMeasures - 1 : i;
                    return (
                      <div
                        key={`grid-barline-${i}`}
                        className={`${styles.measureBarLine} ${styles.measureBarLineFullHeight} ${
                          overflowingMeasureSet.has(boundaryMeasureIndex) ? styles.measureOverflow : ""
                        } ${isEnd ? styles.measureBarLineEnd : ""}`}
                        style={{ left: `${left}px` }}
                      />
                    );
                  })}
                </div>
                <div className={styles.grid} ref={gridRef}>
                {Array.from({ length: STRINGS_COUNT }, (_, rowIndex) => (
                  <div key={`row-${rowIndex}`} className={styles.row}>
                    <div className={styles.stringLabel}>
                      {TUNING[rowIndex]}
                    </div>
                    {displayCells.map(({ measureIndex, stepIndex }, globalSlotIndex) => {
                      const measureEvents = getMeasureEvents(tabData, measureIndex);
                      const cell = measureGrids[measureIndex]?.[rowIndex]?.[stepIndex];
                      const displayValue =
                        cell?.fret !== null && cell?.fret !== undefined
                          ? String(cell.fret)
                          : "";
                      const hasDisplayValue = displayValue !== "";
                      const isSelected =
                        selected.measureIndex === measureIndex &&
                        selected.rowIndex === rowIndex &&
                        selected.stepIndex === stepIndex;
                      const isCurrentStep =
                        playCursor?.measureIndex === measureIndex &&
                        playCursor?.stepIndex === stepIndex;
                      const isStepHighlighted =
                        selectedRange !== null
                          ? isStepInRange(selectedRange, measureIndex, stepIndex)
                          : isDurationPreviewStep(measureIndex, stepIndex);
                      const isBlocked = blockedStepsByMeasure[measureIndex]?.has(stepIndex) ?? false;
                      const isOverflowingMeasure = overflowingMeasureSet.has(measureIndex);
                      return (
                        <button
                          key={`cell-${measureIndex}-${rowIndex}-${stepIndex}`}
                          type="button"
                          data-measure-index={measureIndex}
                          data-step-index={stepIndex}
                          className={`${styles.cell} ${
                            isSelected ? styles.selected : ""
                          } ${isStepHighlighted ? styles.durationPreview : ""} ${
                            isDraggingRange ? styles.dragSelecting : ""
                          } ${isCurrentStep ? styles.playing : ""} ${
                            isBlocked ? styles.blocked : ""
                          } ${isOverflowingMeasure ? styles.measureOverflow : ""
                          }`.trim()}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleRangeMouseDown(measureIndex, stepIndex);
                          }}
                          onMouseEnter={() => handleRangeMouseEnter(measureIndex, stepIndex)}
                          onTouchStart={(event) => {
                            event.preventDefault();
                            handleRangeMouseDown(measureIndex, stepIndex);
                          }}
                          onClick={() => {
                            if (didDragRangeRef.current) {
                              didDragRangeRef.current = false;
                              return;
                            }
                            if (isBlocked) {
                              const owningStep = findOwningEventStep(
                                measureEvents,
                                stepIndex,
                                measureDisplayStepsByMeasure[measureIndex] ?? STEPS_PER_MEASURE
                              );
                              setSingleCellSelection({ measureIndex, rowIndex, stepIndex: owningStep });
                              return;
                            }
                            setSingleCellSelection({ measureIndex, rowIndex, stepIndex });
                          }}
                        >
                          <span
                            className={`${styles.cellValue} ${
                              hasDisplayValue ? styles.cellValueFilled : ""
                            }`.trim()}
                          >
                            {displayValue}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fretboard + Rest */}
        <div className={styles.inputArea}>
          <FretboardInput
            activeNotes={activeFretboardNotes}
            onFlickCommit={commitFretboardFlick}
            isPlaying={isPlaying}
            scale={fretboardScale}
            onScaleChange={handleFretboardScaleChange}
            tuning={tabData.tuning}
          />
          <div className={styles.restFlickRow}>
            <RestFlickButton
              onFlickCommit={placeRestWithFlick}
              disabled={isPlaying}
            />
            <span className={styles.restFlickHint}>
              R: Tap for quarter rest, flick for other durations
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
