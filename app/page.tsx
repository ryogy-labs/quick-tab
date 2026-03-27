"use client";

import { ChangeEvent, CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import StaffPreview from "./components/StaffPreview";
import { STAFF_BOTTOM, STAFF_TOP, STAFF_VIEWBOX_HEIGHT } from "./components/StaffPreview";
import FretboardInput from "./components/FretboardInput";
import RestFlickButton from "./components/RestFlickButton";
import DropdownMenu from "./components/DropdownMenu";
import {
  CellPosition,

  DurationModifier,
  OPEN_STRING_MIDI_BY_STRING,
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
  clampFret,
  clampTempo,
  canPlaceEvent,
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
  getEventOccupiedSteps,
  getPlaybackDuration,
  insertMeasure,
  isMeasureOverflowing,
  isStepBlockedForNewStart,
  isStepInRange,
  normalizeToTabDataV3,
  normalizeStepRange,
  pasteMeasure,
  pasteRangeClipboardIntoMeasure,
  sanitizeTabDataV3,
  toFrequency,
  updateEventLengthAtStep,
  upsertNoteAtCell,
  upsertRestAtStep,
} from "./tabModel";

const STORAGE_KEY = "quick-tab:mvp:v3";
const LEGACY_STORAGE_KEY_V2 = "quick-tab:mvp:v2";
const LEGACY_STORAGE_KEY_V1 = "quick-tab:mvp:v1";
const TAB_LABEL_WIDTH = 92;
const TAB_LABEL_WIDTH_MOBILE = 64;
const TAB_SLOT_WIDTH = 48;
const TAB_SLOT_WIDTH_MOBILE = 34;
const MEASURE_SCROLL_PADDING = 24;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.5;

type PlayCursor = {
  measureIndex: number;
  stepIndex: number;
};

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

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    target.isContentEditable
  );
};

const appendEmptyMeasure = (data: TabDataV3): TabDataV3 => ({
  ...data,
  measures: [...data.measures, { events: [] }],
});

const getNextCursorPositionWithAutoAppend = (
  data: TabDataV3,
  selected: CellPosition,
  moveAmount: number,
  isPlaying: boolean
): CursorAdvanceResult => {
  const safeMoveAmount = Math.max(1, Math.trunc(moveAmount));
  const totalMeasures = data.measures.length;
  const absoluteStep = selected.measureIndex * STEPS_PER_MEASURE + selected.stepIndex + safeMoveAmount;
  const maxStepExclusive = totalMeasures * STEPS_PER_MEASURE;

  if (absoluteStep < maxStepExclusive) {
    return {
      nextData: data,
      nextSelected: {
        ...selected,
        measureIndex: Math.floor(absoluteStep / STEPS_PER_MEASURE),
        stepIndex: absoluteStep % STEPS_PER_MEASURE,
      },
      didAppendMeasure: false,
    };
  }

  const isAtLastMeasure = selected.measureIndex === totalMeasures - 1;
  if (isPlaying || !isAtLastMeasure) {
    return {
      nextData: data,
      nextSelected: {
        ...selected,
        measureIndex: totalMeasures - 1,
        stepIndex: STEPS_PER_MEASURE - 1,
      },
      didAppendMeasure: false,
    };
  }

  const appendedData = appendEmptyMeasure(data);
  const overflowStep = absoluteStep - maxStepExclusive;
  return {
    nextData: appendedData,
    nextSelected: {
      ...selected,
      measureIndex: totalMeasures,
      stepIndex: Math.min(STEPS_PER_MEASURE - 1, Math.max(0, overflowStep)),
    },
    didAppendMeasure: true,
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCursor, setPlayCursor] = useState<PlayCursor | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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

  const digitBufferRef = useRef<string>("");
  const digitTimerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const staffSectionRef = useRef<HTMLDivElement | null>(null);
  const prevPlaybackMeasureIndexRef = useRef<number | null>(null);
  const didDragRangeRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const undoStackRef = useRef<TabDataV3[]>([]);
  const redoStackRef = useRef<TabDataV3[]>([]);

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
  const visibleSteps = useMemo(
    () => Array.from({ length: displaySlots }, (_, index) => index * displayUnit),
    [displaySlots, displayUnit]
  );
  const blockedStepSet = useMemo(() => {
    const set = new Set<number>();
    visibleSteps.forEach((step) => {
      if (isStepBlockedForNewStart(events, step)) {
        set.add(step);
      }
    });
    return set;
  }, [events, visibleSteps]);
  const measureGrids = useMemo(
    () => tabData.measures.map((measure) => eventsToGrid(measure.events)),
    [tabData.measures]
  );
  const blockedStepsByMeasure = useMemo(
    () =>
      tabData.measures.map((measure) => {
        const set = new Set<number>();
        visibleSteps.forEach((step) => {
          if (isStepBlockedForNewStart(measure.events, step)) {
            set.add(step);
          }
        });
        return set;
      }),
    [tabData.measures, visibleSteps]
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

  const getNearestSelectableStep = (targetStep: number): number => {
    const selectable = visibleSteps.filter((step) => !blockedStepSet.has(step));
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

  const commitTabData = (nextData: TabDataV3) => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), tabData];
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    setTabData(nextData);
  };

  const handleUndo = () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, tabData];
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    setTabData(prev);
  };

  const handleRedo = () => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, tabData];
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    setTabData(next);
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
    const clampedStep = Math.max(0, Math.min(STEPS_PER_MEASURE - 1, next.stepIndex));
    setSingleCellSelection({
      measureIndex: clampedMeasure,
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, next.rowIndex)),
      stepIndex: getNearestSelectableStep(clampedStep),
    });
  };

  const moveHorizontal = (delta: number) => {
    const current = getNearestSelectableStep(selected.stepIndex);
    const currentIndex = visibleSteps.indexOf(current);
    if (currentIndex === -1) {
      setSingleCellSelection({ ...selected, stepIndex: getNearestSelectableStep(0) });
      return;
    }

    let nextIndex = currentIndex + delta;
    while (nextIndex >= 0 && nextIndex < visibleSteps.length) {
      const candidate = visibleSteps[nextIndex];
      if (!blockedStepSet.has(candidate)) {
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
        isPlaying
      );
      if (result.didAppendMeasure) {
        commitTabData(result.nextData);
      }
      setSingleCellSelection(result.nextSelected);
      return;
    }

    if (delta < 0 && current === 0 && selected.measureIndex > 0) {
      setSingleCellSelection({
        ...selected,
        measureIndex: selected.measureIndex - 1,
        stepIndex: STEPS_PER_MEASURE - 1,
      });
      return;
    }

    setSingleCellSelection({ ...selected, stepIndex: current });
  };

  const commitNoteAtSelected = (fret: number) => {
    const safeFret = clampFret(fret);
    if (!canPlaceEvent(events, selected.stepIndex, activeInputLen, { ignoreStep: selected.stepIndex })) {
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = upsertNoteAtCell(measureEvents, selected, safeFret, activeInputLen);
    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      selected,
      activeInputLen,
      isPlaying
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
      const nextEvents = deleteSpecificNoteAtStep(
        measureEvents,
        nextSelected.stepIndex,
        stringNumber,
        safeFret
      );
      commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents));
      return;
    }

    if (!canPlaceEvent(events, nextSelected.stepIndex, activeInputLen, { ignoreStep: nextSelected.stepIndex })) {
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = upsertNoteAtCell(measureEvents, nextSelected, safeFret, activeInputLen);
    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      nextSelected,
      activeInputLen,
      isPlaying
    );
    commitTabData(result.nextData);
    setSingleCellSelection(result.nextSelected);
    playNotePreview(updatedData, selectedMeasureIndex, nextSelected.stepIndex);
  };

  const placeRestAtStep = (stepIndex: number) => {
    if (!canPlaceEvent(events, stepIndex, activeInputLen, { ignoreStep: stepIndex })) {
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = upsertRestAtStep(measureEvents, stepIndex, activeInputLen);
    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      { ...selected, stepIndex },
      activeInputLen,
      isPlaying
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
    if (!canPlaceEvent(events, nextSelected.stepIndex, len, { ignoreStep: nextSelected.stepIndex })) {
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = upsertNoteAtCell(measureEvents, nextSelected, safeFret, len);

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

    const updatedData = updateMeasureEvents(tabData, selectedMeasureIndex, modifiedEvents);
    const result = getNextCursorPositionWithAutoAppend(
      updatedData,
      nextSelected,
      len,
      isPlaying
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
    if (!canPlaceEvent(events, stepIndex, len, { ignoreStep: stepIndex })) {
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = upsertRestAtStep(measureEvents, stepIndex, len);

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
      isPlaying
    );
    commitTabData(result.nextData);
    setSingleCellSelection(result.nextSelected);

    // Sync toolbar
    setInputLen(len);
    setIsRestMode(true);
  };

  const stopPlayback = useMemo(
    () => () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPlaying(false);
      setPlayCursor(null);
    },
    []
  );

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const normalized = normalizeToTabDataV3(parsed);
        if (normalized) {
          setTabData(sanitizeTabDataV3(normalized));
        }
      } catch {
        // ignore
      }
      return;
    }

    const legacyV2 = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    if (legacyV2) {
      try {
        const parsed = JSON.parse(legacyV2);
        const normalized = normalizeToTabDataV3(parsed);
        if (normalized) {
          setTabData(sanitizeTabDataV3(normalized));
        }
      } catch {
        // ignore
      }
      return;
    }

    const legacyV1 = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
    if (!legacyV1) {
      return;
    }

    try {
      const parsed = JSON.parse(legacyV1);
      const normalized = normalizeToTabDataV3(parsed);
      if (normalized) {
        setTabData(sanitizeTabDataV3(normalized));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabData));
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
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
      }
    };
  }, [stopPlayback]);

  const playNotePreview = (data: TabDataV3, measureIndex: number, stepIndex: number) => {
    const evts = getMeasureEvents(data, measureIndex);
    const evt = findEventAtStep(evts, stepIndex);
    if (evt) {
      void playEvent(evt, data.tempo);
    }
  };

  const playEvent = async (event: TabEvent, tempo: number) => {
    if ("rest" in event && event.rest) {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const context = audioContextRef.current;
    if (context.state === "suspended") {
      await context.resume();
    }

    const stepSec = (60 / tempo) / (STEPS_PER_MEASURE / 4);
    const durationSec = stepSec * getPlaybackDuration(event);
    const now = context.currentTime;

    event.notes.forEach((note) => {
      const rowIndex = note.string - 1;
      const openMidi = OPEN_STRING_MIDI_BY_STRING[rowIndex];
      if (!openMidi) {
        return;
      }

      const midi = openMidi + note.fret;
      const frequency = toFrequency(midi);

      const osc = context.createOscillator();
      const gain = context.createGain();

      osc.type = "triangle";
      osc.frequency.value = frequency;

      // Guitar-like envelope: quick attack, sustain through full duration, gentle release
      const attackEnd = now + 0.005;
      const sustainEnd = now + durationSec * 0.95;
      const releaseEnd = now + durationSec;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, attackEnd);
      gain.gain.linearRampToValueAtTime(0.15, sustainEnd);
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(releaseEnd + 0.01);
    });
  };

  const handlePlay = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    // If the cursor is at the last measure, restart from the beginning
    const isAtEnd = selectedMeasureIndex >= tabData.measures.length - 1;
    const startMeasureIndex = isAtEnd ? 0 : selectedMeasureIndex;
    let linearIndex = startMeasureIndex * STEPS_PER_MEASURE;
    const endLinearExclusive = tabData.measures.length * STEPS_PER_MEASURE;
    const tempo = tabData.tempo;
    const stepDurationMs = (60_000 / tempo) / (STEPS_PER_MEASURE / 4);
    const measuresForPlayback = tabData.measures.map((measure) => measure.events);
    const overflowingMeasuresForPlayback = new Set(overflowingMeasureSet);

    setIsPlaying(true);
    const initialCursor = {
      measureIndex: Math.floor(linearIndex / STEPS_PER_MEASURE),
      stepIndex: linearIndex % STEPS_PER_MEASURE,
    };
    setPlayCursor(initialCursor);

    const firstEvents = getMeasureEvents(tabData, initialCursor.measureIndex);
    const firstEvent = findEventAtStep(firstEvents, initialCursor.stepIndex);
    if (firstEvent) {
      void playEvent(firstEvent, tempo);
    }

    intervalRef.current = window.setInterval(() => {
      linearIndex += 1;
      if (linearIndex >= endLinearExclusive) {
        stopPlayback();
        setSelected((prev) => ({ ...prev, measureIndex: 0, stepIndex: 0 }));
        return;
      }

      let cursorMeasureIndex = Math.floor(linearIndex / STEPS_PER_MEASURE);
      let cursorStepIndex = linearIndex % STEPS_PER_MEASURE;

      if (overflowingMeasuresForPlayback.has(cursorMeasureIndex)) {
        const eventsForMeasure = measuresForPlayback[cursorMeasureIndex] ?? [];
        const occupied = eventsForMeasure
          .filter((event) => event.step <= cursorStepIndex)
          .reduce((sum, event) => sum + getEventOccupiedSteps(event), 0);

        if (occupied >= STEPS_PER_MEASURE) {
          linearIndex = (cursorMeasureIndex + 1) * STEPS_PER_MEASURE;
          if (linearIndex >= endLinearExclusive) {
            stopPlayback();
            setSelected((prev) => ({ ...prev, measureIndex: 0, stepIndex: 0 }));
            return;
          }
          cursorMeasureIndex = Math.floor(linearIndex / STEPS_PER_MEASURE);
          cursorStepIndex = linearIndex % STEPS_PER_MEASURE;
        }
      }

      const cursor = {
        measureIndex: cursorMeasureIndex,
        stepIndex: cursorStepIndex,
      };
      setPlayCursor(cursor);

      const eventsForMeasure = measuresForPlayback[cursor.measureIndex] ?? [];
      const current = findEventAtStep(eventsForMeasure, cursor.stepIndex);
      if (current) {
        void playEvent(current, tempo);
      }
    }, stepDurationMs);
  };

  const handlePrevMeasure = () => {
    if (isPlaying || selectedMeasureIndex <= 0) {
      return;
    }
    setSelected((prev) => ({
      ...prev,
      measureIndex: Math.max(0, prev.measureIndex - 1),
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
      stepIndex: Math.max(0, Math.min(STEPS_PER_MEASURE - 1, prev.stepIndex)),
    }));
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
        stepIndex: Math.max(0, Math.min(STEPS_PER_MEASURE - 1, prev.stepIndex)),
      }));
      return;
    }

    setSelected((prev) => ({
      ...prev,
      measureIndex: Math.min(totalMeasures - 1, prev.measureIndex + 1),
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
      stepIndex: Math.max(0, Math.min(STEPS_PER_MEASURE - 1, prev.stepIndex)),
    }));
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

    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = pasteRangeClipboardIntoMeasure(
      measureEvents,
      selected.stepIndex,
      rangeClipboard
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
      stepIndex: Math.max(0, Math.min(STEPS_PER_MEASURE - 1, prev.stepIndex)),
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
    const nextEvents = deleteCellOrRestAtStep(measureEvents, {
      ...selected,
      stepIndex: owningStep,
    });
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents));
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

    if (!canPlaceEvent(events, selected.stepIndex, len, { ignoreStep: selected.stepIndex })) {
      return;
    }

    const measureEventsForLen = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEventsForLen = updateEventLengthAtStep(measureEventsForLen, selected.stepIndex, len);
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, nextEventsForLen));
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const withCommandKey = event.metaKey || event.ctrlKey;
      const editableTarget = isEditableTarget(event.target);

      if (withCommandKey && !editableTarget) {
        if (key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          return;
        }

        if (key.toLowerCase() === "y") {
          event.preventDefault();
          handleRedo();
          return;
        }

        if (key.toLowerCase() === "c") {
          event.preventDefault();
          if (selectedRange) {
            handleCopyRange();
          } else {
            handleCopyMeasure();
          }
          return;
        }

        if (key.toLowerCase() === "v") {
          if (rangeClipboard) {
            if (isPlaying) {
              return;
            }
            event.preventDefault();
            handlePasteRange();
            return;
          }

          if (!measureClipboard || isPlaying) {
            return;
          }
          event.preventDefault();
          handlePasteMeasure();
          return;
        }
      }

      if (key >= "0" && key <= "9") {
        event.preventDefault();
        handleDigitInput(key);
        return;
      }

      if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        handleDelete();
        return;
      }

      if (key === " ") {
        event.preventDefault();
        handlePlay();
        return;
      }

      if (key === "Enter" && activeIsRestMode) {
        event.preventDefault();
        placeRestAtStep(selected.stepIndex);
        return;
      }

      if (key === "ArrowUp" || key.toLowerCase() === "w") {
        event.preventDefault();
        clearDigitBuffer();
        moveSelection({ ...selected, rowIndex: selected.rowIndex - 1 });
        return;
      }

      if (key === "ArrowDown" || key.toLowerCase() === "s") {
        event.preventDefault();
        clearDigitBuffer();
        moveSelection({ ...selected, rowIndex: selected.rowIndex + 1 });
        return;
      }

      if (key === "ArrowLeft" || key.toLowerCase() === "a") {
        event.preventDefault();
        clearDigitBuffer();
        moveHorizontal(-1);
        return;
      }

      if (key === "ArrowRight" || key.toLowerCase() === "d") {
        event.preventDefault();
        clearDigitBuffer();
        moveHorizontal(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeInputLen,
    activeIsRestMode,
    canRedo,
    canUndo,
    inputLen,
    isPlaying,
    isRestMode,
    measureClipboard,
    rangeClipboard,
    selected,
    selectedMeasureIndex,
    selectedRange,
    tabData,
  ]);

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
      const normalized = normalizeToTabDataV3(parsed);
      if (!normalized) {
        alert("Invalid JSON format.");
        return;
      }

      setTabData(sanitizeTabDataV3(normalized));
      stopPlayback();
      clearDigitBuffer();
    } catch {
      alert("Failed to import JSON.");
    } finally {
      event.target.value = "";
    }
  };

  const durationPreviewEndStep = Math.min(STEPS_PER_MEASURE, selected.stepIndex + activeInputLen);
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
  const totalDisplaySlots = displaySlots * totalMeasures;
  const measureSlotWidth = stepWidth * displaySlots;
  const measureStartXs = useMemo(
    () => Array.from({ length: totalMeasures + 1 }, (_, index) => tabLabelWidth + index * measureSlotWidth),
    [measureSlotWidth, tabLabelWidth, totalMeasures]
  );
  const timelineWidth = tabLabelWidth + measureSlotWidth * totalMeasures;
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
        const owningStep = findOwningEventStep(events, prev.stepIndex);
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
  ], [canUndo, canRedo, isPlaying, totalMeasures, measureClipboard, selectedRange, rangeClipboard, handleUndo, handleRedo, handleAddMeasure, handleInsertMeasure, handleDeleteMeasure, handleDuplicateMeasure, handleCopyMeasure, handlePasteMeasure, handleCopyRange, handlePasteRange, handleExport, handleImportFile]);

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
            onClick={handleDelete}
            disabled={isPlaying}
            aria-label="Delete current note or selection"
            title="Delete"
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
                    {Array.from({ length: totalDisplaySlots }, (_, globalSlotIndex) => {
                      const measureIndex = Math.floor(globalSlotIndex / displaySlots);
                      const slotIndex = globalSlotIndex % displaySlots;
                      const stepIndex = visibleSteps[slotIndex] ?? 0;
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
                              const owningStep = findOwningEventStep(events, stepIndex);
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
