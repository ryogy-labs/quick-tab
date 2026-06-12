"use client";

import { useMemo } from "react";
import {
  CellPosition,
  GridCell,
  SIXTEENTH_STEPS,
  TabData,
  TabEvent,
  TabMeasureV3,
  eventsToGrid,
  findEventAtStep,
  getCellFret,
  getDataMeasureTicks,
  getEventOccupiedSteps,
  getMeasureDisplaySteps,
  getTrackMeasures,
  getVisibleStepsForEvents,
  isMeasureOverflowing,
  isStepBlockedForNewStart,
} from "../tabModel";

export type DisplayCell = {
  measureIndex: number;
  stepIndex: number;
  slotIndex: number;
};

export type TrackLayout = {
  measuresEvents: TabEvent[][];
  measureDisplayStepsByMeasure: number[];
  measureVisibleStepsByMeasure: number[][];
  slotWidthsByMeasure: number[][];
  slotOffsetsByMeasure: number[][];
  measureWidthsByMeasure: number[];
  measureGrids: GridCell[][][];
  blockedStepsByMeasure: Set<number>[];
  overflowingMeasureSet: Set<number>;
};

const computeTrackLayout = (
  measures: TabMeasureV3[],
  displayUnit: number,
  measureTicks: number,
  stepWidth: number
): TrackLayout => {
  const measuresEvents = measures.map((measure) => measure.events);
  const measureDisplayStepsByMeasure = measures.map((measure) =>
    getMeasureDisplaySteps(measure.events, displayUnit, measureTicks)
  );
  const measureVisibleStepsByMeasure = measureDisplayStepsByMeasure.map(
    (displaySteps, measureIndex) =>
      getVisibleStepsForEvents(
        measures[measureIndex]?.events ?? [],
        displaySteps,
        displayUnit
      )
  );
  // Proportional spacing: an event slot's width grows sub-linearly with its
  // duration; empty grid slots stay at the base step width.
  const slotWidthsByMeasure = measureVisibleStepsByMeasure.map(
    (visibleSteps, measureIndex) => {
      const events = measures[measureIndex]?.events ?? [];
      return visibleSteps.map((step) => {
        const event = findEventAtStep(events, step);
        if (!event || event.step !== step) {
          return stepWidth;
        }
        const units = Math.max(1, getEventOccupiedSteps(event)) / displayUnit;
        return Math.max(stepWidth * 0.8, stepWidth * Math.pow(units, 0.62));
      });
    }
  );
  const slotOffsetsByMeasure = slotWidthsByMeasure.map((widths) => {
    const offsets: number[] = [];
    let cursor = 0;
    widths.forEach((width) => {
      offsets.push(cursor);
      cursor += width;
    });
    return offsets;
  });
  const measureWidthsByMeasure = slotWidthsByMeasure.map((widths) =>
    widths.reduce((sum, w) => sum + w, 0)
  );
  const measureGrids = measures.map((measure, index) =>
    eventsToGrid(measure.events, measureDisplayStepsByMeasure[index] ?? measureTicks)
  );
  const blockedStepsByMeasure = measures.map((measure) => {
    const set = new Set<number>();
    const displaySteps = getMeasureDisplaySteps(measure.events, displayUnit, measureTicks);
    getVisibleStepsForEvents(measure.events, displaySteps, displayUnit).forEach((step) => {
      if (isStepBlockedForNewStart(measure.events, step, displaySteps)) {
        set.add(step);
      }
    });
    return set;
  });
  const overflowingMeasureSet = new Set(
    measures
      .map((measure, index) =>
        isMeasureOverflowing(measure.events, measureTicks) ? index : -1
      )
      .filter((index) => index >= 0)
  );

  return {
    measuresEvents,
    measureDisplayStepsByMeasure,
    measureVisibleStepsByMeasure,
    slotWidthsByMeasure,
    slotOffsetsByMeasure,
    measureWidthsByMeasure,
    measureGrids,
    blockedStepsByMeasure,
    overflowingMeasureSet,
  };
};

type UseNotationLayoutParams = {
  tabData: TabData;
  trackIndex: number;
  /** Tracks taking part in width alignment (the visible ones). */
  visibleTrackIndices: number[];
  selected: CellPosition;
  inputLen: number;
  isRestMode: boolean;
  tabMeasureWidth: number;
};

/**
 * Derives display-layout state for every track plus active-track selection
 * aliases: display unit, per-measure step/slot tables, grids, blocked steps,
 * overflow sets, and the shared (aligned) measure widths across the
 * visible tracks.
 */
export function useNotationLayout({
  tabData,
  trackIndex,
  visibleTrackIndices,
  selected,
  inputLen,
  isRestMode,
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

  // Display unit derives from the shortest event across all tracks so the
  // empty-grid granularity matches everywhere.
  const minEventLenAcrossTracks = tabData.tracks.reduce(
    (globalMin, track) =>
      track.measures.reduce(
        (trackMin, measure) =>
          measure.events.reduce(
            (min, event) => Math.min(min, Math.max(1, event.len)),
            trackMin
          ),
        globalMin
      ),
    measureTicks
  );
  const shouldRenderEveryStep = activeInputLen > SIXTEENTH_STEPS;
  const effectiveMinLen = Math.min(minEventLenAcrossTracks, activeInputLen);
  const displayUnit =
    shouldRenderEveryStep || effectiveMinLen <= SIXTEENTH_STEPS
      ? SIXTEENTH_STEPS
      : SIXTEENTH_STEPS * 2;
  // Keep per-16th-slot width constant regardless of time signature, so a
  // 3/4 measure renders narrower than a 4/4 one instead of stretching.
  const stepWidth = (tabMeasureWidth / 16) * (displayUnit / SIXTEENTH_STEPS);

  const trackLayouts = useMemo<TrackLayout[]>(
    () =>
      tabData.tracks.map((track) =>
        computeTrackLayout(track.measures, displayUnit, measureTicks, stepWidth)
      ),
    [displayUnit, measureTicks, stepWidth, tabData.tracks]
  );

  // Shared measure widths align bar lines across the visible tracks.
  const sharedMeasureWidths = useMemo(() => {
    const participating = new Set([...visibleTrackIndices, trackIndex]);
    const count = trackLayouts[trackIndex]?.measureWidthsByMeasure.length ?? 0;
    return Array.from({ length: count }, (_, measureIndex) =>
      Math.max(
        stepWidth,
        ...trackLayouts
          .filter((_, index) => participating.has(index))
          .map((layout) => layout.measureWidthsByMeasure[measureIndex] ?? 0)
      )
    );
  }, [stepWidth, trackIndex, trackLayouts, visibleTrackIndices]);

  const activeLayout = useMemo<TrackLayout>(
    () =>
      trackLayouts[trackIndex] ??
      trackLayouts[0] ??
      computeTrackLayout([], displayUnit, measureTicks, stepWidth),
    [displayUnit, measureTicks, stepWidth, trackIndex, trackLayouts]
  );

  const blockedStepsByMeasure = activeLayout.blockedStepsByMeasure;
  const measureDisplayStepsByMeasure = activeLayout.measureDisplayStepsByMeasure;
  const measureVisibleStepsByMeasure = activeLayout.measureVisibleStepsByMeasure;
  const slotWidthsByMeasure = activeLayout.slotWidthsByMeasure;
  const slotOffsetsByMeasure = activeLayout.slotOffsetsByMeasure;
  const measureWidthsByMeasure = activeLayout.measureWidthsByMeasure;
  const measureGrids = activeLayout.measureGrids;
  const measuresEvents = activeLayout.measuresEvents;
  const overflowingMeasureSet = activeLayout.overflowingMeasureSet;
  const measureDisplaySlotsByMeasure = useMemo(
    () => measureVisibleStepsByMeasure.map((steps) => steps.length),
    [measureVisibleStepsByMeasure]
  );

  const selectedMeasureDisplaySteps =
    measureDisplayStepsByMeasure[selectedMeasureIndex] ?? measureTicks;
  const blockedStepSet = blockedStepsByMeasure[selectedMeasureIndex] ?? new Set<number>();
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

  // Union of overflow across all tracks, for shared bar-line warnings.
  const anyTrackOverflowSet = useMemo(() => {
    const set = new Set<number>();
    trackLayouts.forEach((layout) => {
      layout.overflowingMeasureSet.forEach((index) => set.add(index));
    });
    return set;
  }, [trackLayouts]);

  return {
    measureTicks,
    displayUnit,
    stepWidth,
    trackLayouts,
    sharedMeasureWidths,
    anyTrackOverflowSet,
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
    blockedStepsByMeasure,
    blockedStepSet,
    overflowingMeasureSet,
    measureDisplayStepsByMeasure,
    measureVisibleStepsByMeasure,
    measureDisplaySlotsByMeasure,
    slotWidthsByMeasure,
    slotOffsetsByMeasure,
    measureWidthsByMeasure,
    selectedMeasureDisplaySteps,
    measureGrids,
    displayCells,
    measuresEvents,
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
};

/**
 * Greedily pack measures into systems (wrapped rows) that fit within
 * availableWidth. A system always holds at least one measure, so an
 * overflowing measure wider than the viewport gets its own row.
 */
export const computeSystems = (
  measureWidths: number[],
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
    current.forEach((measureIndex) => {
      cursor += measureWidths[measureIndex] ?? 0;
      startXs.push(cursor);
    });
    systems.push({ measureIndices: current, startXs, width: cursor });
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
    : [{ measureIndices: [0], startXs: [labelWidth, labelWidth], width: labelWidth }];
};
