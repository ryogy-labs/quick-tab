"use client";

import { ChangeEvent, CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import StaffPreview from "./components/StaffPreview";
import {
  CellPosition,
  DURATION_OPTIONS,
  OPEN_STRING_MIDI_BY_STRING,
  STEPS_PER_MEASURE,
  STRINGS_COUNT,
  TUNING,
  TabDataV2,
  TabEvent,
  TabMeasureV2,
  clampFret,
  clampTempo,
  canPlaceEvent,
  copyMeasure,
  createEmptyTabDataV2,
  deleteCellOrRestAtStep,
  duplicateMeasure,
  eventsToGrid,
  findEventAtStep,
  getCellFret,
  isStepBlockedForNewStart,
  moveStepByLen,
  normalizeToTabDataV2,
  pasteMeasure,
  sanitizeTabDataV2,
  toFrequency,
  updateEventLengthAtStep,
  upsertNoteAtCell,
  upsertRestAtStep,
} from "./tabModel";

const STORAGE_KEY = "quick-tab:mvp:v2";
const TAB_LABEL_WIDTH = 92;
const TAB_SLOT_WIDTH = 48;
const TAB_MEASURE_WIDTH = TAB_SLOT_WIDTH * STEPS_PER_MEASURE;
const MEASURE_SCROLL_PADDING = 24;

type PlayCursor = {
  measureIndex: number;
  stepIndex: number;
};

type TimelineLayout = {
  labelWidth: number;
  stepWidth: number;
  stepUnit: number;
  stepsPerMeasure: number;
};

const toGlobalStep = (cursor: PlayCursor): number =>
  cursor.measureIndex * STEPS_PER_MEASURE + cursor.stepIndex;

const getMeasureStartX = (measureIndex: number, layout: TimelineLayout): number => {
  const measureWidth = (layout.stepsPerMeasure / layout.stepUnit) * layout.stepWidth;
  return layout.labelWidth + measureIndex * measureWidth;
};

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

export default function Home() {
  const [tabData, setTabData] = useState<TabDataV2>(createEmptyTabDataV2);
  const [selected, setSelected] = useState<CellPosition>({
    measureIndex: 0,
    rowIndex: 5,
    stepIndex: 0,
  });
  const [inputLen, setInputLen] = useState<number>(1);
  const [isRestMode, setIsRestMode] = useState<boolean>(false);
  const [tempoInput, setTempoInput] = useState<string>("120");
  const [mobileFretInput, setMobileFretInput] = useState<string>("");
  const [measureClipboard, setMeasureClipboard] = useState<TabMeasureV2 | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCursor, setPlayCursor] = useState<PlayCursor | null>(null);

  const digitBufferRef = useRef<string>("");
  const digitTimerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const prevPlaybackMeasureIndexRef = useRef<number | null>(null);

  const selectedMeasureIndex = Math.max(
    0,
    Math.min(tabData.measures.length - 1, selected.measureIndex)
  );
  const events = tabData.measures.at(selectedMeasureIndex)?.events ?? [];
  const totalMeasures = tabData.measures.length;
  const minEventLenAcrossMeasures = tabData.measures.reduce((globalMin, measure) => {
    const localMin = measure.events.reduce(
      (min, event) => Math.min(min, Math.max(1, event.len)),
      16
    );
    return Math.min(globalMin, localMin);
  }, 16);
  const effectiveMinLen = Math.min(minEventLenAcrossMeasures, inputLen);
  const displayUnit = effectiveMinLen === 1 ? 1 : 2;
  const displaySlots = STEPS_PER_MEASURE / displayUnit;
  const stepWidth = TAB_MEASURE_WIDTH / displaySlots;
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

  const getNearestSelectableStep = (targetStep: number): number => {
    const selectable = visibleSteps.filter((step) => !blockedStepSet.has(step));
    if (selectable.length === 0) {
      return 0;
    }
    return selectable.reduce((best, step) =>
      Math.abs(step - targetStep) < Math.abs(best - targetStep) ? step : best
    );
  };

  const getMeasureEvents = (data: TabDataV2, measureIndex: number): TabEvent[] =>
    data.measures.at(measureIndex)?.events ?? [];

  const updateMeasureEvents = (
    data: TabDataV2,
    measureIndex: number,
    nextEvents: TabEvent[]
  ): TabDataV2 => {
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
    if (digitTimerRef.current !== null) {
      window.clearTimeout(digitTimerRef.current);
      digitTimerRef.current = null;
    }
  };

  const moveSelection = (next: CellPosition) => {
    const clampedMeasure = Math.max(
      0,
      Math.min(tabData.measures.length - 1, next.measureIndex)
    );
    const clampedStep = Math.max(0, Math.min(STEPS_PER_MEASURE - 1, next.stepIndex));
    setSelected({
      measureIndex: clampedMeasure,
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, next.rowIndex)),
      stepIndex: getNearestSelectableStep(clampedStep),
    });
  };

  const moveHorizontal = (delta: number) => {
    setSelected((prev) => {
      const current = getNearestSelectableStep(prev.stepIndex);
      const currentIndex = visibleSteps.indexOf(current);
      if (currentIndex === -1) {
        return { ...prev, stepIndex: getNearestSelectableStep(0) };
      }

      let nextIndex = currentIndex + delta;
      while (nextIndex >= 0 && nextIndex < visibleSteps.length) {
        const candidate = visibleSteps[nextIndex];
        if (!blockedStepSet.has(candidate)) {
          return { ...prev, stepIndex: candidate };
        }
        nextIndex += delta;
      }

      return { ...prev, stepIndex: current };
    });
  };

  const commitNoteAtSelected = (fret: number) => {
    const safeFret = clampFret(fret);
    if (!canPlaceEvent(events, selected.stepIndex, inputLen, { ignoreStep: selected.stepIndex })) {
      return;
    }
    setTabData((prev) => {
      const measureEvents = getMeasureEvents(prev, selectedMeasureIndex);
      const nextEvents = upsertNoteAtCell(measureEvents, selected, safeFret, inputLen);
      return updateMeasureEvents(prev, selectedMeasureIndex, nextEvents);
    });

    setSelected((prev) => ({
      ...prev,
      stepIndex: moveStepByLen(prev.stepIndex, inputLen),
    }));
  };

  const placeRestAtStep = (stepIndex: number) => {
    if (!canPlaceEvent(events, stepIndex, inputLen, { ignoreStep: stepIndex })) {
      return;
    }
    setTabData((prev) => {
      const measureEvents = getMeasureEvents(prev, selectedMeasureIndex);
      const nextEvents = upsertRestAtStep(measureEvents, stepIndex, inputLen);
      return updateMeasureEvents(prev, selectedMeasureIndex, nextEvents);
    });

    setSelected((prev) => ({
      ...prev,
      stepIndex: moveStepByLen(stepIndex, inputLen),
    }));
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
        const normalized = normalizeToTabDataV2(parsed);
        if (normalized) {
          setTabData(sanitizeTabDataV2(normalized));
        }
      } catch {
        // ignore
      }
      return;
    }

    const legacy = localStorage.getItem("quick-tab:mvp:v1");
    if (!legacy) {
      return;
    }

    try {
      const parsed = JSON.parse(legacy);
      const normalized = normalizeToTabDataV2(parsed);
      if (normalized) {
        setTabData(sanitizeTabDataV2(normalized));
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
    return () => {
      stopPlayback();
      clearDigitBuffer();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
      }
    };
  }, [stopPlayback]);

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

    const stepSec = (60 / tempo) / 4;
    const durationSec = stepSec * event.len;
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

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.03, durationSec * 0.95));

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(now + durationSec);
    });
  };

  const handlePlay = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const startMeasureIndex = selectedMeasureIndex;
    let linearIndex = startMeasureIndex * STEPS_PER_MEASURE;
    const endLinearExclusive = tabData.measures.length * STEPS_PER_MEASURE;
    const tempo = tabData.tempo;
    const stepDurationMs = (60_000 / tempo) / 4;

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
        return;
      }

      const cursor = {
        measureIndex: Math.floor(linearIndex / STEPS_PER_MEASURE),
        stepIndex: linearIndex % STEPS_PER_MEASURE,
      };
      setPlayCursor(cursor);

      const eventsForMeasure = getMeasureEvents(tabData, cursor.measureIndex);
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
    if (isPlaying || selectedMeasureIndex >= totalMeasures - 1) {
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
    setTabData((prev) => ({
      ...prev,
      measures: [...prev.measures, { events: [] }],
    }));
    setSelected({
      measureIndex: nextMeasureIndex,
      rowIndex: 0,
      stepIndex: 0,
    });
  };

  const handleDuplicateMeasure = () => {
    if (isPlaying) {
      return;
    }

    setTabData((prev) => duplicateMeasure(prev, selectedMeasureIndex));
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

    setTabData((prev) => pasteMeasure(prev, selectedMeasureIndex, measureClipboard));
  };

  const handleDelete = () => {
    clearDigitBuffer();
    setTabData((prev) => {
      const measureEvents = getMeasureEvents(prev, selectedMeasureIndex);
      const nextEvents = deleteCellOrRestAtStep(measureEvents, selected);
      return updateMeasureEvents(prev, selectedMeasureIndex, nextEvents);
    });
  };

  const handleTempoCommit = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setTempoInput(String(tabData.tempo));
      return;
    }

    const nextTempo = clampTempo(parsed);
    setTabData((prev) => ({ ...prev, tempo: nextTempo }));
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

    setTabData((prev) => {
      const measureEvents = getMeasureEvents(prev, selectedMeasureIndex);
      const nextEvents = updateEventLengthAtStep(measureEvents, selected.stepIndex, len);
      return updateMeasureEvents(prev, selectedMeasureIndex, nextEvents);
    });
  };

  const handleDigitInput = (digit: string) => {
    if (isRestMode) {
      return;
    }

    const nextBuffer = `${digitBufferRef.current}${digit}`.slice(0, 2);
    digitBufferRef.current = nextBuffer;
    const parsed = Number(nextBuffer);

    if (Number.isNaN(parsed) || parsed > 24) {
      digitBufferRef.current = digit;
    }

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
        if (key.toLowerCase() === "c") {
          event.preventDefault();
          handleCopyMeasure();
          return;
        }

        if (key.toLowerCase() === "v") {
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

      if (key === "Enter" && isRestMode) {
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
  }, [inputLen, isPlaying, isRestMode, measureClipboard, selected, selectedMeasureIndex, tabData]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(tabData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quick-tab-v2.json";
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
      const normalized = normalizeToTabDataV2(parsed);
      if (!normalized) {
        alert("Invalid JSON format.");
        return;
      }

      setTabData(sanitizeTabDataV2(normalized));
      stopPlayback();
      clearDigitBuffer();
    } catch {
      alert("Failed to import JSON.");
    } finally {
      event.target.value = "";
    }
  };

  const selectedEvent = findEventAtStep(events, selected.stepIndex);
  const selectedFret = getCellFret(events, selected.rowIndex, selected.stepIndex);
  const measuresEvents = useMemo(
    () => tabData.measures.map((measure) => measure.events),
    [tabData.measures]
  );
  const totalDisplaySlots = displaySlots * totalMeasures;
  const currentGlobalStep = playCursor ? toGlobalStep(playCursor) : null;
  const currentPlaybackMeasureIndex =
    currentGlobalStep === null
      ? null
      : Math.floor(currentGlobalStep / STEPS_PER_MEASURE);
  const notationStyle = {
    "--label-width": `${TAB_LABEL_WIDTH}px`,
    "--step-width": `${stepWidth}px`,
    "--slot-count": String(totalDisplaySlots),
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

    const measureStartX = getMeasureStartX(currentPlaybackMeasureIndex, {
      labelWidth: TAB_LABEL_WIDTH,
      stepWidth,
      stepUnit: displayUnit,
      stepsPerMeasure: STEPS_PER_MEASURE,
    });
    const nextLeft = Math.max(0, measureStartX - MEASURE_SCROLL_PADDING);
    container.scrollTo({ left: nextLeft, behavior: "auto" });
    prevPlaybackMeasureIndexRef.current = currentPlaybackMeasureIndex;
  }, [currentPlaybackMeasureIndex, displayUnit, isPlaying, stepWidth]);

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
      const nextStep = getNearestSelectableStep(prev.stepIndex);
      if (nextStep === prev.stepIndex) {
        return prev;
      }
      return { ...prev, stepIndex: nextStep };
    });
  }, [displayUnit, blockedStepSet]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    if ("rest" in selectedEvent && selectedEvent.rest) {
      setInputLen(selectedEvent.len);
      setIsRestMode(true);
      return;
    }

    if (selectedFret !== null) {
      setInputLen(selectedEvent.len);
      setIsRestMode(false);
    }
  }, [selectedEvent, selectedFret]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.headerRow}>
          <h1>Quick TAB MVP (Event Mode)</h1>
          <p>Duration first then choose cell then type fret number</p>
        </div>

        <div className={styles.measureNav}>
          <button
            type="button"
            onClick={handlePrevMeasure}
            disabled={isPlaying || selectedMeasureIndex <= 0}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={handleNextMeasure}
            disabled={isPlaying || selectedMeasureIndex >= totalMeasures - 1}
          >
            Next
          </button>
          <button type="button" onClick={handleAddMeasure} disabled={isPlaying}>
            + Measure
          </button>
          <button type="button" onClick={handleDuplicateMeasure} disabled={isPlaying}>
            Duplicate Measure
          </button>
          <button type="button" onClick={handleCopyMeasure}>
            Copy Measure
          </button>
          <button
            type="button"
            onClick={handlePasteMeasure}
            disabled={isPlaying || measureClipboard === null}
          >
            Paste Measure
          </button>
          <span>Measure {selectedMeasureIndex + 1} / {totalMeasures}</span>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.durationCard}>
            <h3>Duration</h3>
            <div className={styles.durationGroup}>
            {DURATION_OPTIONS.filter((item) => !item.isRest).map((item) => (
              <button
                key={item.label}
                type="button"
                className={`${styles.toolButton} ${
                  !isRestMode && inputLen === item.len ? styles.toolActive : ""
                }`.trim()}
                onClick={() => handleSelectDuration(item.len, false)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.toolButton} ${isRestMode ? styles.toolActive : ""}`.trim()}
              onClick={() => handleSelectDuration(inputLen, !isRestMode)}
            >
              Rest
            </button>
            </div>
          </div>

          <div className={styles.tempoCard}>
            <h3>Tempo</h3>
            <div className={styles.tempoControl}>
            <span>BPM</span>
            <button
              type="button"
              onClick={() => handleTempoCommit(String(tabData.tempo - 1))}
            >
              -
            </button>
            <input
              type="number"
              value={tempoInput}
              min={30}
              max={300}
              onChange={(event) => setTempoInput(event.target.value)}
              onBlur={() => handleTempoCommit(tempoInput)}
            />
            <button
              type="button"
              onClick={() => handleTempoCommit(String(tabData.tempo + 1))}
            >
              +
            </button>
            </div>
          </div>
        </div>

        <div className={styles.controls}>
          <button type="button" onClick={handlePlay}>
            {isPlaying ? "Stop" : "Play"}
          </button>
          <button type="button" onClick={handleExport}>
            Export JSON
          </button>
          <label className={styles.importLabel}>
            Import JSON
            <input type="file" accept="application/json" onChange={handleImportFile} />
          </label>
          {isRestMode && (
            <button type="button" onClick={() => placeRestAtStep(selected.stepIndex)}>
              Place Rest
            </button>
          )}
        </div>

        <div className={styles.notationFrame}>
          <h2 className={styles.notationTitle}>Standard Notation + TAB (Horizontal)</h2>
          <p className={styles.measureBadge}>Selected Measure {selectedMeasureIndex + 1} / {totalMeasures}</p>
          <div ref={timelineScrollRef} className={styles.notationScroll}>
            <div className={styles.notationContent} style={notationStyle}>
              <StaffPreview
                measuresEvents={measuresEvents}
                currentCursor={playCursor}
                labelWidth={TAB_LABEL_WIDTH}
                stepWidth={stepWidth}
                stepUnit={displayUnit}
              />
              <div className={styles.grid}>
                {Array.from({ length: STRINGS_COUNT }, (_, rowIndex) => (
                  <div key={`row-${rowIndex}`} className={styles.row}>
                    <div className={styles.stringLabel}>
                      {TUNING[rowIndex]} ({rowIndex + 1})
                    </div>
                    {Array.from({ length: totalDisplaySlots }, (_, globalSlotIndex) => {
                      const measureIndex = Math.floor(globalSlotIndex / displaySlots);
                      const slotIndex = globalSlotIndex % displaySlots;
                      const stepIndex = visibleSteps[slotIndex] ?? 0;
                      const cell = measureGrids[measureIndex]?.[rowIndex]?.[stepIndex];
                      const isSelected =
                        selected.measureIndex === measureIndex &&
                        selected.rowIndex === rowIndex &&
                        selected.stepIndex === stepIndex;
                      const isCurrentStep =
                        playCursor?.measureIndex === measureIndex &&
                        playCursor?.stepIndex === stepIndex;
                      const isBarStart = slotIndex === 0;
                      const isBarEnd = slotIndex === displaySlots - 1;
                      const isBlocked = blockedStepsByMeasure[measureIndex]?.has(stepIndex) ?? false;
                      return (
                        <button
                          key={`cell-${measureIndex}-${rowIndex}-${stepIndex}`}
                          type="button"
                          className={`${styles.cell} ${
                            isSelected ? styles.selected : ""
                          } ${isCurrentStep ? styles.playing : ""} ${
                            isBarStart ? styles.barStart : ""
                          } ${isBarEnd ? styles.barEnd : ""} ${
                            isBlocked ? styles.blocked : ""
                          }`.trim()}
                          onClick={() => {
                            if (isBlocked) {
                              return;
                            }
                            setSelected({ measureIndex, rowIndex, stepIndex });
                          }}
                          disabled={isBlocked}
                        >
                          <span className={styles.cellValue}>
                            {cell?.fret !== null && cell?.fret !== undefined
                              ? cell.fret
                              : rowIndex === 0 && cell?.isRestStart
                                ? "R"
                                : ""}
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

        <div className={styles.editPanel}>
          <h2>
            Selected: String {selected.rowIndex + 1} / Step {selected.stepIndex + 1}
          </h2>
          <p>
            Mode: {isRestMode ? "Rest" : `Note (${inputLen} step)`} | Current fret: {selectedFret ?? "-"}
          </p>
          <p>
            Event at step: {selectedEvent ? JSON.stringify(selectedEvent) : "none"}
          </p>

          <div className={styles.editRow}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={24}
              placeholder="fret"
              value={mobileFretInput}
              onChange={(event) => setMobileFretInput(event.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                const parsed = Number(mobileFretInput);
                if (Number.isNaN(parsed)) {
                  return;
                }
                commitNoteAtSelected(parsed);
                setMobileFretInput("");
              }}
              disabled={isRestMode}
            >
              Set Note
            </button>
            <button type="button" onClick={handleDelete}>
              Delete
            </button>
          </div>
          <p>
            Keyboard: digits for fret (supports 2 digits), Backspace/Delete to clear, Arrow/WASD to move,
            Enter to place rest in Rest mode.
          </p>
        </div>
      </main>
    </div>
  );
}
