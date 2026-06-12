"use client";

import { useMemo } from "react";
import {
  CellPosition,
  SIXTEENTH_STEPS,
  STEPS_PER_MEASURE,
  TabDataV3,
  TabEvent,
  eventsToGrid,
  findEventAtStep,
  getCellFret,
  getMeasureDisplaySteps,
  getVisibleStepsForMeasure,
  isMeasureOverflowing,
  isStepBlockedForNewStart,
} from "../tabModel";

export type DisplayCell = {
  measureIndex: number;
  stepIndex: number;
  slotIndex: number;
};

type UseNotationLayoutParams = {
  tabData: TabDataV3;
  selected: CellPosition;
  inputLen: number;
  isRestMode: boolean;
  tabLabelWidth: number;
  tabMeasureWidth: number;
};

/**
 * Derives all display-layout state from tabData + selection:
 * display unit, per-measure step/slot tables, grids, blocked steps,
 * overflow set, and horizontal measure positions.
 */
export function useNotationLayout({
  tabData,
  selected,
  inputLen,
  isRestMode,
  tabLabelWidth,
  tabMeasureWidth,
}: UseNotationLayoutParams) {
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
  const selectedStringNumber = selected.rowIndex + 1;
  const selectedNote =
    selectedEvent && !("rest" in selectedEvent && selectedEvent.rest)
      ? selectedEvent.notes.find((note) => note.string === selectedStringNumber)
      : undefined;
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
  const shouldRenderEveryStep = activeInputLen > SIXTEENTH_STEPS;
  const effectiveMinLen = Math.min(minEventLenAcrossMeasures, activeInputLen);
  const displayUnit =
    shouldRenderEveryStep || effectiveMinLen <= SIXTEENTH_STEPS
      ? SIXTEENTH_STEPS
      : SIXTEENTH_STEPS * 2;
  const displaySlots = STEPS_PER_MEASURE / displayUnit;
  const stepWidth = tabMeasureWidth / displaySlots;

  const blockedStepsByMeasure = useMemo(
    () =>
      tabData.measures.map((measure) => {
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
  const displayCells = useMemo<DisplayCell[]>(
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
  const measuresEvents = useMemo<TabEvent[][]>(
    () => tabData.measures.map((measure) => measure.events),
    [tabData.measures]
  );
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

  return {
    selectedMeasureIndex,
    events,
    selectedEvent,
    selectedFret,
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
    measureDisplaySlotsByMeasure,
    selectedMeasureDisplaySteps,
    measureGrids,
    displayCells,
    measuresEvents,
    measureStartXs,
    timelineWidth,
  };
}

export type NotationLayout = ReturnType<typeof useNotationLayout>;
