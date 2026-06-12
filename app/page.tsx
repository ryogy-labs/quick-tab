"use client";

import { ChangeEvent, CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import StaffPreview from "./components/StaffPreview";
import FretboardInput from "./components/FretboardInput";
import RestFlickButton from "./components/RestFlickButton";
import DropdownMenu from "./components/DropdownMenu";
import { usePlayback, PlayCursor } from "./hooks/usePlayback";
import { useTabStorage } from "./hooks/useTabStorage";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useNotationLayout } from "./hooks/useNotationLayout";
import { useRangeSelection } from "./hooks/useRangeSelection";
import { useDigitInput } from "./hooks/useDigitInput";
import { useTabEditing } from "./hooks/useTabEditing";
import { useMeasureOps } from "./hooks/useMeasureOps";
import { useNotationZoom, MIN_SCALE, MAX_SCALE } from "./hooks/useNotationZoom";
import { downloadTabDataAsJson, readTabDataFile } from "./services/tabFile";
import { downloadTabDataAsMusicXml } from "./services/musicXml";
import {
  CellPosition,
  KEY_SIGNATURES,
  KeySignature,
  SIXTEENTH_STEPS,
  TIME_SIGNATURES,
  TimeSignature,
  sanitizeTabData,
  STRINGS_COUNT,
  TUNING,
  TabData,
  clampTempo,
  createEmptyTabData,
  findEventAtStep,
  findOwningEventStep,
  getMeasureEvents,
  getNextCursorPositionWithAutoAppend,
  isStepInRange,
} from "./tabModel";

const TAB_LABEL_WIDTH = 92;
const TAB_LABEL_WIDTH_MOBILE = 64;
const TAB_SLOT_WIDTH = 48;
const TAB_SLOT_WIDTH_MOBILE = 34;
const MEASURE_SCROLL_PADDING = 24;

const toGlobalStep = (cursor: PlayCursor, measureTicks: number): number =>
  cursor.measureIndex * measureTicks + cursor.stepIndex;

export default function Home() {
  const [tabData, setTabData] = useState<TabData>(createEmptyTabData);
  const [selected, setSelected] = useState<CellPosition>({
    measureIndex: 0,
    rowIndex: 5,
    stepIndex: 0,
  });
  const [inputLen, setInputLen] = useState<number>(SIXTEENTH_STEPS);
  const [isRestMode, setIsRestMode] = useState<boolean>(false);
  const [tempoInput, setTempoInput] = useState<string>("120");
  const [tempoEditing, setTempoEditing] = useState(false);
  const [autoShift, setAutoShift] = useState(true);
  const [tieInputMode, setTieInputMode] = useState(false);

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

  useTabStorage({
    tabData,
    onLoad: useCallback((data: TabData) => setTabData(data), []),
  });

  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const staffSectionRef = useRef<HTMLDivElement | null>(null);
  const prevPlaybackMeasureIndexRef = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const layout = useNotationLayout({
    tabData,
    selected,
    inputLen,
    isRestMode,
    tabLabelWidth,
    tabMeasureWidth,
  });
  const {
    measureTicks,
    selectedMeasureIndex,
    events,
    selectedEvent,
    activeFretboardNotes,
    selectedStringNumber,
    selectedNote,
    activeInputLen,
    activeIsRestMode,
    totalMeasures,
    displayUnit,
    stepWidth,
    blockedStepsByMeasure,
    blockedStepSet,
    overflowingMeasureSet,
    measureDisplayStepsByMeasure,
    measureVisibleStepsByMeasure,
    selectedMeasureDisplaySteps,
    measureGrids,
    displayCells,
    measuresEvents,
    measureStartXs,
    timelineWidth,
  } = layout;

  const selectedNoteTieActive = selectedNote?.tie === true;
  const tieButtonActive = selectedNote ? selectedNoteTieActive : tieInputMode;

  const { commit: commitTabData, undo: handleUndo, redo: handleRedo, canUndo, canRedo } = useUndoRedo({
    tabData,
    onDataChange: useCallback((data: TabData) => setTabData(data), []),
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

  const getClampedDisplayStep = (stepIndex: number, measureIndex: number): number => {
    const displaySteps = measureDisplayStepsByMeasure[measureIndex] ?? measureTicks;
    return Math.max(0, Math.min(displaySteps - 1, stepIndex));
  };

  const getRangeSelectableStep = (measureIndex: number, stepIndex: number): number => {
    const clampedStep = getClampedDisplayStep(stepIndex, measureIndex);
    const measureEvents = getMeasureEvents(tabData, measureIndex);
    const displaySteps = measureDisplayStepsByMeasure[measureIndex] ?? measureTicks;
    return findOwningEventStep(measureEvents, clampedStep, displaySteps);
  };

  const {
    selectedRange,
    setSelectedRange,
    isDraggingRange,
    didDragRangeRef,
    clearRangeSelection,
    handleRangeMouseDown,
    handleRangeMouseEnter,
  } = useRangeSelection({ gridRef, getRangeSelectableStep });

  const setSingleCellSelection = (next: CellPosition) => {
    setSelected(next);
    clearRangeSelection();
  };

  const moveSelection = (next: CellPosition) => {
    const clampedMeasure = Math.max(0, Math.min(tabData.measures.length - 1, next.measureIndex));
    setSingleCellSelection({
      measureIndex: clampedMeasure,
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, next.rowIndex)),
      stepIndex: getNearestSelectableStep(
        getClampedDisplayStep(next.stepIndex, clampedMeasure),
        clampedMeasure
      ),
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

  // Late-bound so useDigitInput can be created before useTabEditing while the
  // commit target still resolves to the freshest closure on every render.
  const commitFretRef = useRef<(fret: number) => void>(() => undefined);
  const { clearDigitBuffer, handleDigitInput } = useDigitInput({
    onCommitFret: (fret) => commitFretRef.current(fret),
    isRestMode: activeIsRestMode,
  });

  const {
    commitNoteAtSelected,
    commitFretboardFlick,
    placeRestAtStep,
    placeRestWithFlick,
    handleDelete,
    handleDeleteEvent,
    handleToggleTie,
  } = useTabEditing({
    tabData,
    commitTabData,
    selected,
    setSelected,
    setSingleCellSelection,
    selectedRange,
    setSelectedRange,
    clearDigitBuffer,
    selectedMeasureIndex,
    measureTicks,
    selectedMeasureDisplaySteps,
    measureDisplayStepsByMeasure,
    events,
    selectedNote,
    selectedStringNumber,
    activeInputLen,
    activeIsRestMode,
    activeFretboardNotes,
    displayUnit,
    autoShift,
    tieInputMode,
    setTieInputMode,
    setInputLen,
    setIsRestMode,
    isPlaying,
    playNotePreview,
  });
  commitFretRef.current = commitNoteAtSelected;

  const {
    measureClipboard,
    rangeClipboard,
    handlePrevMeasure,
    handleNextMeasure,
    handleAddMeasure,
    handleInsertMeasure,
    handleDuplicateMeasure,
    handleDeleteMeasure,
    handleCopyMeasure,
    handlePasteMeasure,
    handleCopyRange,
    handlePasteRange,
  } = useMeasureOps({
    tabData,
    commitTabData,
    isPlaying,
    selected,
    setSelected,
    selectedMeasureIndex,
    totalMeasures,
    selectedRange,
    measureTicks,
    measureDisplayStepsByMeasure,
    getClampedDisplayStep,
  });

  const {
    notationScale,
    setNotationScale,
    fretboardScale,
    handleFretboardScaleChange,
    staffBarMetrics,
  } = useNotationZoom({
    isMobile,
    timelineScrollRef,
    staffSectionRef,
    totalMeasures,
    stepWidth,
    displayUnit,
  });

  useEffect(() => {
    setTempoInput(String(tabData.tempo));
  }, [tabData]);

  useEffect(() => {
    return () => {
      stopPlayback();
      clearDigitBuffer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPlayback]);

  const handleTempoCommit = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setTempoInput(String(tabData.tempo));
      return;
    }

    const nextTempo = clampTempo(parsed);
    commitTabData({ ...tabData, tempo: nextTempo });
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
    onToggleTie: handleToggleTie,
    onClearDigitBuffer: clearDigitBuffer,
    isPlaying,
    activeIsRestMode,
    selectedStep: selected.stepIndex,
    selectedRange,
    measureClipboard,
    rangeClipboard,
  });

  const handleExport = useCallback(() => {
    downloadTabDataAsJson(tabData);
  }, [tabData]);

  const handleExportMusicXml = useCallback(() => {
    downloadTabDataAsMusicXml(tabData);
  }, [tabData]);

  const handleImportFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const normalized = await readTabDataFile(file);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPlayback]);

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
  const isRangeHighlightedStep = (measureIndex: number, stepIndex: number): boolean => {
    if (!selectedRange) {
      return false;
    }

    const measureEvents = getMeasureEvents(tabData, measureIndex);
    const displaySteps = measureDisplayStepsByMeasure[measureIndex] ?? measureTicks;
    const owningStep = findOwningEventStep(measureEvents, stepIndex, displaySteps);
    return isStepInRange(selectedRange, measureIndex, owningStep);
  };

  const totalDisplaySlots = displayCells.length;
  const currentGlobalStep = playCursor ? toGlobalStep(playCursor, measureTicks) : null;
  const currentPlaybackMeasureIndex =
    currentGlobalStep === null ? null : Math.floor(currentGlobalStep / measureTicks);
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
        const owningStep = findOwningEventStep(events, prev.stepIndex, selectedMeasureDisplaySteps);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    { type: "button" as const, label: "Export MusicXML", onClick: handleExportMusicXml },
    { type: "file" as const, label: "Import JSON", accept: "application/json", onChange: handleImportFile },
    { type: "separator" as const },
    {
      type: "custom" as const,
      content: (
        <div>
          <div className={styles.menuSectionTitle}>Time Sig</div>
          <select
            className={styles.keySelect}
            value={tabData.timeSig}
            disabled={isPlaying}
            onChange={(e) => {
              const next = e.target.value as TimeSignature;
              // allowOverflow keeps existing events visible as overflow
              // instead of clamping them into the shorter measure
              commitTabData(sanitizeTabData({ ...tabData, timeSig: next }, true));
            }}
          >
            {TIME_SIGNATURES.map((sig) => (
              <option key={sig} value={sig}>{sig}</option>
            ))}
          </select>
        </div>
      ),
    },
    { type: "separator" as const },
    {
      type: "custom" as const,
      content: (
        <div>
          <div className={styles.menuSectionTitle}>Key</div>
          <select
            className={styles.keySelect}
            value={tabData.key ?? "C"}
            onChange={(e) => {
              const k = e.target.value as KeySignature;
              commitTabData({ ...tabData, key: k });
            }}
          >
            {KEY_SIGNATURES.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      ),
    },
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
  ], [autoShift, tabData, canUndo, canRedo, isPlaying, totalMeasures, measureClipboard, selectedRange, rangeClipboard, commitTabData, handleUndo, handleRedo, handleAddMeasure, handleInsertMeasure, handleDeleteMeasure, handleDuplicateMeasure, handleCopyMeasure, handlePasteMeasure, handleCopyRange, handlePasteRange, handleExport, handleExportMusicXml, handleImportFile]);

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

          <button
            type="button"
            className={`${styles.tieBtn} ${
              tieButtonActive ? styles.tieBtnActive : ""
            }`.trim()}
            onClick={handleToggleTie}
            disabled={isPlaying}
            aria-pressed={tieButtonActive}
            aria-label="Toggle tie"
            title="Toggle tie (T)"
          >
            Tie
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
                  measureDisplaySlots={layout.measureDisplaySlotsByMeasure}
                  measureStartXs={measureStartXs}
                  timelineWidth={timelineWidth}
                  overflowingMeasures={overflowingMeasureSet}
                  showBarLines={false}
                  keySignature={tabData.key}
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
                    {displayCells.map(({ measureIndex, stepIndex }) => {
                      const measureEvents = getMeasureEvents(tabData, measureIndex);
                      const cell = measureGrids[measureIndex]?.[rowIndex]?.[stepIndex];
                      const cellEvent = findEventAtStep(measureEvents, stepIndex);
                      const hasTie =
                        cellEvent && !("rest" in cellEvent && cellEvent.rest)
                          ? cellEvent.notes.some((note) => note.string === rowIndex + 1 && note.tie)
                          : false;
                      const displayValue =
                        cell?.fret !== null && cell?.fret !== undefined
                          ? hasTie
                            ? `(${cell.fret})`
                            : String(cell.fret)
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
                          ? isRangeHighlightedStep(measureIndex, stepIndex)
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
                                measureDisplayStepsByMeasure[measureIndex] ?? measureTicks
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
                            } ${hasTie ? styles.cellValueTied : ""
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
