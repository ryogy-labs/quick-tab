"use client";

import { Dispatch, SetStateAction } from "react";
import {
  CellPosition,
  DurationModifier,
  STEPS_PER_MEASURE,
  STRINGS_COUNT,
  StepRangeSelection,
  TabDataV3,
  applySequentialDeleteShift,
  applySequentialShift,
  canPlaceEvent,
  clampFret,
  deleteCellOrRestAtStep,
  deleteSpecificNoteAtStep,
  findEventAtStep,
  findOwningEventStep,
  findPreviousNoteOnString,
  getCellFret,
  getMeasureEvents,
  getNextCursorPositionWithAutoAppend,
  getSequentialPlacementContext,
  sanitizeEvents,
  setTieAtStep,
  toggleTieAtStep,
  updateEventLengthAtStep,
  updateMeasureEvents,
  upsertNoteAtCell,
  upsertRestAtStep,
} from "../tabModel";

type UseTabEditingParams = {
  tabData: TabDataV3;
  commitTabData: (data: TabDataV3) => void;
  selected: CellPosition;
  setSelected: Dispatch<SetStateAction<CellPosition>>;
  setSingleCellSelection: (next: CellPosition) => void;
  selectedRange: StepRangeSelection | null;
  setSelectedRange: Dispatch<SetStateAction<StepRangeSelection | null>>;
  clearDigitBuffer: () => void;
  selectedMeasureIndex: number;
  selectedMeasureDisplaySteps: number;
  measureDisplayStepsByMeasure: number[];
  events: ReturnType<typeof getMeasureEvents>;
  selectedNote: { fret: number } | undefined;
  selectedStringNumber: number;
  activeInputLen: number;
  activeIsRestMode: boolean;
  activeFretboardNotes: { string: number; fret: number }[];
  displayUnit: number;
  autoShift: boolean;
  tieInputMode: boolean;
  setTieInputMode: Dispatch<SetStateAction<boolean>>;
  setInputLen: Dispatch<SetStateAction<number>>;
  setIsRestMode: Dispatch<SetStateAction<boolean>>;
  isPlaying: boolean;
  playNotePreview: (data: TabDataV3, measureIndex: number, stepIndex: number) => void;
};

/**
 * Note/rest placement, flick placement, duration change, deletion, and tie
 * handlers. All edit rules delegate to tabModel; this hook only wires editor
 * state (selection, clipboard-free UI state, playback preview) to them.
 */
export function useTabEditing({
  tabData,
  commitTabData,
  selected,
  setSelected,
  setSingleCellSelection,
  selectedRange,
  setSelectedRange,
  clearDigitBuffer,
  selectedMeasureIndex,
  selectedMeasureDisplaySteps,
  measureDisplayStepsByMeasure,
  events,
  selectedNote,
  selectedStringNumber,
  activeInputLen,
  activeIsRestMode,
  displayUnit,
  autoShift,
  tieInputMode,
  setTieInputMode,
  setInputLen,
  setIsRestMode,
  isPlaying,
  playNotePreview,
  activeFretboardNotes,
}: UseTabEditingParams) {
  const commitNoteAtSelected = (fret: number, forceTie = false) => {
    const safeFret = clampFret(fret);
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const { oldEvent, placementEvents, deferredEvents } = getSequentialPlacementContext(
      measureEvents,
      selected.stepIndex,
      autoShift
    );
    const placementSource = autoShift && oldEvent ? placementEvents : measureEvents;

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
    const nextEventsWithoutTie = upsertNoteAtCell(
      placementSource,
      selected,
      safeFret,
      activeInputLen,
      selectedMeasureDisplaySteps,
      true
    );
    const shouldTie = tieInputMode || forceTie;
    const nextEvents = shouldTie
      ? setTieAtStep(
          nextEventsWithoutTie,
          selected.stepIndex,
          selectedStringNumber,
          true,
          selectedMeasureDisplaySteps
        )
      : nextEventsWithoutTie;
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
    setSingleCellSelection(nextSelected);

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
    const placementSource = autoShift && oldEvent ? placementEvents : measureEvents;

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
    const nextEventsWithoutTie = upsertNoteAtCell(
      placementSource,
      nextSelected,
      safeFret,
      activeInputLen,
      selectedMeasureDisplaySteps,
      true
    );
    const nextEvents = tieInputMode
      ? setTieAtStep(
          nextEventsWithoutTie,
          nextSelected.stepIndex,
          stringNumber,
          true,
          selectedMeasureDisplaySteps
        )
      : nextEventsWithoutTie;
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
    setSingleCellSelection(nextSelected);

    // Always overwrite (no toggle) — flick is an intentional placement gesture
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const { oldEvent, placementEvents, deferredEvents } = getSequentialPlacementContext(
      measureEvents,
      nextSelected.stepIndex,
      autoShift
    );
    const placementSource = autoShift && oldEvent ? placementEvents : measureEvents;

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
    const nextEventsWithoutTie = upsertNoteAtCell(
      placementSource,
      nextSelected,
      safeFret,
      len,
      selectedMeasureDisplaySteps,
      true
    );
    const nextEvents = tieInputMode
      ? setTieAtStep(
          nextEventsWithoutTie,
          nextSelected.stepIndex,
          rowIndex + 1,
          true,
          selectedMeasureDisplaySteps
        )
      : nextEventsWithoutTie;

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

  const handleDelete = () => {
    clearDigitBuffer();
    if (selectedRange) {
      // Delete all events within the range selection
      const measureEvents = getMeasureEvents(tabData, selectedRange.startMeasureIndex);
      const nextEvents = measureEvents.filter(
        (event) =>
          event.step < selectedRange.startStepIndex || event.step > selectedRange.endStepIndex
      );
      commitTabData(updateMeasureEvents(tabData, selectedRange.startMeasureIndex, nextEvents));
      setSelectedRange(null);
      return;
    }
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const owningStep = findOwningEventStep(
      measureEvents,
      selected.stepIndex,
      selectedMeasureDisplaySteps
    );
    const oldEvent = findEventAtStep(measureEvents, owningStep);
    const nextEvents = deleteCellOrRestAtStep(
      measureEvents,
      { ...selected, stepIndex: owningStep },
      selectedMeasureDisplaySteps
    );
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
        (event) =>
          event.step < selectedRange.startStepIndex || event.step > selectedRange.endStepIndex
      );
      commitTabData(updateMeasureEvents(tabData, selectedRange.startMeasureIndex, nextEvents));
      setSelectedRange(null);
      return;
    }

    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const owningStep = findOwningEventStep(
      measureEvents,
      selected.stepIndex,
      selectedMeasureDisplaySteps
    );
    const oldEvent = findEventAtStep(measureEvents, owningStep);
    const nextEvents = sanitizeEvents(measureEvents, selectedMeasureDisplaySteps, true).filter(
      (event) => event.step !== owningStep
    );
    const finalEvents = applySequentialDeleteShift(nextEvents, oldEvent, autoShift);
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents));
  };

  const handleToggleTie = () => {
    if (isPlaying) {
      return;
    }

    if (!selectedNote) {
      const previousNote = findPreviousNoteOnString(
        tabData,
        selectedMeasureIndex,
        selected.stepIndex,
        selectedStringNumber,
        measureDisplayStepsByMeasure
      );
      if (previousNote) {
        commitNoteAtSelected(previousNote.fret, true);
        setTieInputMode(false);
        return;
      }

      setTieInputMode((prev) => !prev);
      return;
    }

    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const owningStep = findOwningEventStep(
      measureEvents,
      selected.stepIndex,
      selectedMeasureDisplaySteps
    );
    const nextEvents = toggleTieAtStep(
      measureEvents,
      owningStep,
      selectedStringNumber,
      selectedMeasureDisplaySteps
    );
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents));
    setSelected((prev) => ({ ...prev, stepIndex: owningStep }));
  };

  const handleSelectDuration = (len: number, nextRestMode: boolean) => {
    setInputLen(len);
    setIsRestMode(nextRestMode);

    const targetStep = findOwningEventStep(events, selected.stepIndex, selectedMeasureDisplaySteps);
    const currentEvent = findEventAtStep(events, targetStep);
    if (!currentEvent) {
      return;
    }

    if (!nextRestMode) {
      const selectedFret = getCellFret(events, selected.rowIndex, targetStep);
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
      targetStep,
      autoShift
    );
    const placementSource = autoShift && oldEvent ? placementEvents : measureEventsForLen;

    if (
      !canPlaceEvent(
        placementSource,
        targetStep,
        len,
        { ignoreStep: targetStep },
        selectedMeasureDisplaySteps,
        true
      )
    ) {
      return;
    }

    const nextEventsForLen = updateEventLengthAtStep(
      placementSource,
      targetStep,
      len,
      selectedMeasureDisplaySteps,
      true
    );
    const newEvent = findEventAtStep(nextEventsForLen, targetStep);
    const finalEvents = applySequentialShift(
      nextEventsForLen,
      deferredEvents,
      oldEvent,
      newEvent,
      autoShift
    );
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, finalEvents));
    setSelected((prev) => ({ ...prev, stepIndex: targetStep }));
  };

  return {
    commitNoteAtSelected,
    commitFretboardNote,
    commitFretboardFlick,
    placeRestAtStep,
    placeRestWithFlick,
    handleDelete,
    handleDeleteEvent,
    handleToggleTie,
    handleSelectDuration,
  };
}
