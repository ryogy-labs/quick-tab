"use client";

import { useMemo } from "react";
import {
  CellPosition,
  SIXTEENTH_STEPS,
  TabData,
  getDataMeasureTicks,
  getTrackMeasures,
  TabEvent,
  eventsToGrid,
  findEventAtStep,
  getCellFret,
  getEventOccupiedSteps,
  getMeasureDisplaySteps,
  getVisibleStepsForEvents,
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
  trackIndex: number;
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
  trackIndex,
  selected,
  inputLen,
  isRestMode,
  tabLabelWidth,
  tabMeasureWidth,
}: UseNotationLayoutParams) {
  const measureTicks = getDataMeasureTicks(tabData);
  const trackMeasures = getTrackMeasures(tabData, trackIndex);
  const selectedMeasureIndex = Math.max(
    0,
    Math.min(trackMeasures.length - 1, selected.measureIndex)
  );
  const events = trackMeasures.at(selectedMeasureIndex)?.events ?? [];
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
  const totalMeasures = trackMeasures.length;

  const minEventLenAcrossMeasures = trackMeasures.reduce((globalMin, measure) => {
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
      trackMeasures.map((measure) => {
        const visibleSteps = getVisibleStepsForEvents(
          measure.events,
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
    [displayUnit, measureTicks, trackMeasures]
  );
  const overflowingMeasureSet = useMemo(
    () =>
      new Set(
        trackMeasures
          .map((measure, index) =>
            isMeasureOverflowing(measure.events, measureTicks) ? index : -1
          )
          .filter((index) => index >= 0)
      ),
    [measureTicks, trackMeasures]
  );
  const measureDisplayStepsByMeasure = useMemo(
    () =>
      trackMeasures.map((measure) =>
        getMeasureDisplaySteps(measure.events, displayUnit, measureTicks)
      ),
    [displayUnit, measureTicks, trackMeasures]
  );
  const measureVisibleStepsByMeasure = useMemo(
    () =>
      measureDisplayStepsByMeasure.map((displaySteps, measureIndex) =>
        getVisibleStepsForEvents(
          trackMeasures[measureIndex]?.events ?? [],
          displaySteps,
          displayUnit
        )
      ),
    [displayUnit, measureDisplayStepsByMeasure, trackMeasures]
  );

  // Proportional spacing: an event slot's width grows sub-linearly with its
  // duration; empty grid slots stay at the base step width.
  const slotWidthsByMeasure = useMemo(
    () =>
      measureVisibleStepsByMeasure.map((visibleSteps, measureIndex) => {
        const events = trackMeasures[measureIndex]?.events ?? [];
        return visibleSteps.map((step) => {
          const event = findEventAtStep(events, step);
          if (!event || event.step !== step) {
            return stepWidth;
          }
          const units = Math.max(1, getEventOccupiedSteps(event)) / displayUnit;
          return Math.max(stepWidth * 0.8, stepWidth * Math.pow(units, 0.62));
        });
      }),
    [displayUnit, measureVisibleStepsByMeasure, stepWidth, trackMeasures]
  );
  const slotOffsetsByMeasure = useMemo(
    () =>
      slotWidthsByMeasure.map((widths) => {
        const offsets: number[] = [];
        let cursor = 0;
        widths.forEach((width) => {
          offsets.push(cursor);
          cursor += width;
        });
        return offsets;
      }),
    [slotWidthsByMeasure]
  );
  const measureWidthsByMeasure = useMemo(
    () => slotWidthsByMeasure.map((widths) => widths.reduce((sum, w) => sum + w, 0)),
    [slotWidthsByMeasure]
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
      trackMeasures.map((measure, index) =>
        eventsToGrid(measure.events, measureDisplayStepsByMeasure[index] ?? measureTicks)
      ),
    [measureDisplayStepsByMeasure, measureTicks, trackMeasures]
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
    () => trackMeasures.map((measure) => measure.events),
    [trackMeasures]
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
    slotWidthsByMeasure,
    slotOffsetsByMeasure,
    measureWidthsByMeasure,
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
  measureWidths: number[],
  slotsByMeasure: number[],
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
      cursor += measureWidths[measureIndex] ?? 0;
      slotCount += slotsByMeasure[measureIndex] ?? 0;
      startXs.push(cursor);
    });
    systems.push({ measureIndices: current, startXs, width: cursor, slotCount });
    current = [];
    currentWidth = 0;
  };

  measureWidths.forEach((measureWidth, measureIndex) => {
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
