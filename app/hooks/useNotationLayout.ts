"use client";

import { useMemo } from "react";
import {
  CellPosition,
  SIXTEENTH_STEPS,
  TabData,
  getDataMeasureTicks,
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
  tabData: TabData;
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
  const measureTicks = getDataMeasureTicks(tabData);
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
      measureTicks
    );
    return Math.min(globalMin, localMin);
  }, measureTicks);
  const shouldRenderEveryStep = activeInputLen > SIXTEENTH_STEPS;
  const effectiveMinLen = Math.min(minEventLenAcrossMeasures, activeInputLen);
  const displayUnit =
    shouldRenderEveryStep || effectiveMinLen <= SIXTEENTH_STEPS
      ? SIXTEENTH_STEPS
      : SIXTEENTH_STEPS * 2;
  // Keep per-16th-slot width constant regardless of time signature, so a
  // 3/4 measure renders narrower than a 4/4 one instead of stretching.
  const stepWidth = (tabMeasureWidth / 16) * (displayUnit / SIXTEENTH_STEPS);

  const blockedStepsByMeasure = useMemo(
    () =>
      tabData.measures.map((measure) => {
        const visibleSteps = getVisibleStepsForMeasure(
          getMeasureDisplaySteps(measure.events, displayUnit, measureTicks),
          displayUnit
        );
        const set = new Set<number>();
        visibleSteps.forEach((step) => {
          if (
            isStepBlockedForNewStart(
              measure.events,
              step,
              getMeasureDisplaySteps(measure.events, displayUnit, measureTicks)
            )
          ) {
            set.add(step);
          }
        });
        return set;
      }),
    [displayUnit, measureTicks, tabData.measures]
  );
  const overflowingMeasureSet = useMemo(
    () =>
      new Set(
        tabData.measures
          .map((measure, index) =>
            isMeasureOverflowing(measure.events, measureTicks) ? index : -1
          )
          .filter((index) => index >= 0)
      ),
    [measureTicks, tabData.measures]
  );
  const measureDisplayStepsByMeasure = useMemo(
    () =>
      tabData.measures.map((measure) =>
        getMeasureDisplaySteps(measure.events, displayUnit, measureTicks)
      ),
    [displayUnit, measureTicks, tabData.measures]
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
    measureDisplayStepsByMeasure[selectedMeasureIndex] ?? measureTicks;
  const blockedStepSet = blockedStepsByMeasure[selectedMeasureIndex] ?? new Set<number>();
  const measureGrids = useMemo(
    () =>
      tabData.measures.map((measure, index) =>
        eventsToGrid(measure.events, measureDisplayStepsByMeasure[index] ?? measureTicks)
      ),
    [measureDisplayStepsByMeasure, measureTicks, tabData.measures]
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
    measureTicks,
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

export type SystemLayout = {
  /** Global measure indices contained in this system (row). */
  measureIndices: number[];
  /** X positions of measure starts, plus the trailing end X. */
  startXs: number[];
  /** Total system width including the leading label area. */
  width: number;
  /** Total number of visible slots across the system's measures. */
  slotCount: number;
};

/**
 * Greedily pack measures into systems (wrapped rows) that fit within
 * availableWidth. A system always holds at least one measure, so an
 * overflowing measure wider than the viewport gets its own row.
 */
export const computeSystems = (
  slotsByMeasure: number[],
  stepWidth: number,
  labelWidth: number,
  availableWidth: number
): SystemLayout[] => {
  const systems: SystemLayout[] = [];
  let current: number[] = [];
  let currentWidth = 0;

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    const startXs = [labelWidth];
    let cursor = labelWidth;
    let slotCount = 0;
    current.forEach((measureIndex) => {
      const slots = slotsByMeasure[measureIndex] ?? 0;
      cursor += slots * stepWidth;
      slotCount += slots;
      startXs.push(cursor);
    });
    systems.push({ measureIndices: current, startXs, width: cursor, slotCount });
    current = [];
    currentWidth = 0;
  };

  slotsByMeasure.forEach((slots, measureIndex) => {
    const measureWidth = slots * stepWidth;
    if (current.length > 0 && labelWidth + currentWidth + measureWidth > availableWidth) {
      flush();
    }
    current.push(measureIndex);
    currentWidth += measureWidth;
  });
  flush();

  return systems.length > 0
    ? systems
    : [{ measureIndices: [0], startXs: [labelWidth, labelWidth], width: labelWidth, slotCount: 0 }];
};
