export const STEPS_PER_MEASURE = 96;
export const STRINGS_COUNT = 6;
export const MAX_FRET = 24;
export const SIXTEENTH_STEPS = STEPS_PER_MEASURE / 16;

export const TUNING = ["E4", "B3", "G3", "D3", "A2", "E2"];

// string number mapping: 1 = high E (E4), 6 = low E (E2)
// UI row index mapping: rowIndex 0 => string 1, rowIndex 5 => string 6
export const OPEN_STRING_MIDI_BY_STRING = [64, 59, 55, 50, 45, 40];

export type Technique = "slide" | "hammer" | "pulloff" | "bend" | "vibrato";

export type TabNoteEventNote = {
  string: number;
  fret: number;
  technique?: Technique;
};

export type DurationModifier = "normal" | "dotted" | "triplet";

export type TabNoteEvent = {
  step: number;
  len: number;
  notes: TabNoteEventNote[];
  rest?: false;
  dot?: boolean;
  triplet?: boolean;
};

export type TabRestEvent = {
  step: number;
  len: number;
  rest: true;
  notes?: never;
  dot?: boolean;
  triplet?: boolean;
};

export type TabEvent = TabNoteEvent | TabRestEvent;

export type TabMeasureV3 = {
  events: TabEvent[];
};

export type KeySignature =
  | "C" | "G" | "D" | "A" | "E" | "B" | "F#" | "C#"
  | "F" | "Bb" | "Eb" | "Ab" | "Db" | "Gb" | "Cb";

export const KEY_SIGNATURES: KeySignature[] = [
  "C#", "F#", "B", "E", "A", "D", "G", "C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
];

export const KEY_ACCIDENTAL_COUNTS: Record<KeySignature, { sharps: number; flats: number }> = {
  "C#": { sharps: 7, flats: 0 }, "F#": { sharps: 6, flats: 0 },
  "B":  { sharps: 5, flats: 0 }, "E":  { sharps: 4, flats: 0 },
  "A":  { sharps: 3, flats: 0 }, "D":  { sharps: 2, flats: 0 },
  "G":  { sharps: 1, flats: 0 }, "C":  { sharps: 0, flats: 0 },
  "F":  { sharps: 0, flats: 1 }, "Bb": { sharps: 0, flats: 2 },
  "Eb": { sharps: 0, flats: 3 }, "Ab": { sharps: 0, flats: 4 },
  "Db": { sharps: 0, flats: 5 }, "Gb": { sharps: 0, flats: 6 },
  "Cb": { sharps: 0, flats: 7 },
};

export type TabDataV3 = {
  version: "v3";
  tempo: number;
  timeSig: "4/4";
  key?: KeySignature;
  stepsPerMeasure: number;
  tuning: string[];
  measures: TabMeasureV3[];
};

export type TabMeasureV2 = {
  events: TabEvent[];
};

export type TabDataV2 = {
  version: 2;
  tempo: number;
  timeSig: "4/4";
  stepsPerMeasure: number;
  tuning: string[];
  measures: TabMeasureV2[];
};

export type CellPosition = {
  measureIndex: number;
  rowIndex: number;
  stepIndex: number;
};

export type GridCell = {
  fret: number | null;
  isRestStart: boolean;
};

export type DurationOption = {
  label: string;
  len: number;
  isRest: boolean;
};

export type StepRangePoint = {
  measureIndex: number;
  stepIndex: number;
};

export type StepRangeSelection = {
  startMeasureIndex: number;
  startStepIndex: number;
  endMeasureIndex: number;
  endStepIndex: number;
};

export type StepRangeClipboard = {
  sourceMeasureIndex: number;
  startStepIndex: number;
  length: number;
  events: TabEvent[];
};

type PlacementOptions = {
  ignoreStep?: number;
};

// Flick gesture: vertical level (-2..+2) to step-based len
export const FLICK_DURATION_MAP: Record<number, number> = {
  [-2]: 6,   // ↑↑ 16th note
  [-1]: 12,  // ↑  8th note
  [0]: 24,   // tap quarter note
  [1]: 48,   // ↓  half note
  [2]: 96,   // ↓↓ whole note
};

export const getPlaybackDuration = (event: TabEvent): number => {
  if (event.dot) return event.len * 1.5;
  if (event.triplet) return event.len * (2 / 3);
  return event.len;
};

/**
 * Effective occupied steps for an event, including dotted / triplet modifiers.
 * The 96-step grid keeps these values integral.
 */
export const getEventOccupiedSteps = (event: TabEvent): number => {
  if (event.dot) return Math.round(event.len * 1.5);
  if (event.triplet) return Math.round(event.len * (2 / 3));
  return event.len;
};

export const getMeasureOccupiedSteps = (
  events: TabEvent[],
  stepsPerMeasure = STEPS_PER_MEASURE
): number =>
  sanitizeEvents(events, stepsPerMeasure, true).reduce(
    (sum, event) => sum + getEventOccupiedSteps(event),
    0
  );

export const isMeasureOverflowing = (
  events: TabEvent[],
  stepsPerMeasure = STEPS_PER_MEASURE
): boolean => getMeasureOccupiedSteps(events, stepsPerMeasure) > stepsPerMeasure;

export const getMeasureDisplaySteps = (
  events: TabEvent[],
  displayUnit: number,
  stepsPerMeasure = STEPS_PER_MEASURE
): number => {
  const safeDisplayUnit = Math.max(1, Math.trunc(displayUnit));
  const maxStepExclusive = sanitizeEvents(events, stepsPerMeasure, true).reduce(
    (max, event) => Math.max(max, event.step + Math.max(1, getEventOccupiedSteps(event))),
    stepsPerMeasure
  );
  return Math.max(
    stepsPerMeasure,
    Math.ceil(maxStepExclusive / safeDisplayUnit) * safeDisplayUnit
  );
};

export const getVisibleStepsForMeasure = (
  displaySteps: number,
  displayUnit: number
): number[] => {
  const safeDisplayUnit = Math.max(1, Math.trunc(displayUnit));
  const slotCount = Math.max(1, Math.ceil(displaySteps / safeDisplayUnit));
  return Array.from({ length: slotCount }, (_, index) => index * safeDisplayUnit);
};

export const DURATION_OPTIONS: DurationOption[] = [
  { label: "1/16", len: 6, isRest: false },
  { label: "1/8", len: 12, isRest: false },
  { label: "1/4", len: 24, isRest: false },
  { label: "1/2", len: 48, isRest: false },
  { label: "1", len: 96, isRest: false },
  { label: "Rest", len: 6, isRest: true },
];

export const createEmptyTabDataV3 = (): TabDataV3 => ({
  version: "v3",
  tempo: 120,
  timeSig: "4/4",
  key: "C",
  stepsPerMeasure: STEPS_PER_MEASURE,
  tuning: [...TUNING],
  measures: [{ events: [] }],
});

export const sanitizeTabDataV3 = (
  data: TabDataV3,
  allowOverflow = false
): TabDataV3 => {
  const sanitizedMeasures =
    data.measures.length > 0
      ? data.measures.map((measure) => ({
          events: sanitizeEvents(
            measure?.events ?? [],
            STEPS_PER_MEASURE,
            allowOverflow
          ),
        }))
      : [{ events: [] }];
  return {
    ...data,
    version: "v3",
    stepsPerMeasure: STEPS_PER_MEASURE,
    measures: sanitizedMeasures,
  };
};

export const migrateV2ToV3 = (v2: TabDataV2): TabDataV3 => {
  const multiplier = v2.stepsPerMeasure === STEPS_PER_MEASURE ? 1 : 6;
  return sanitizeTabDataV3({
    version: "v3",
    tempo: clampTempo(v2.tempo),
    timeSig: "4/4",
    stepsPerMeasure: STEPS_PER_MEASURE,
    tuning:
      Array.isArray(v2.tuning) && v2.tuning.length === STRINGS_COUNT
        ? v2.tuning.slice(0, STRINGS_COUNT)
        : [...TUNING],
    measures: v2.measures.map((measure) => ({
      events: (measure.events ?? []).map((event) => ({
        ...event,
        step: event.step * multiplier,
        len: event.len * multiplier,
      })),
    })),
  });
};

const cloneNote = (note: TabNoteEventNote): TabNoteEventNote => ({
  string: note.string,
  fret: note.fret,
  ...(note.technique ? { technique: note.technique } : {}),
});

const cloneEvent = (event: TabEvent): TabEvent => {
  if ("rest" in event && event.rest) {
    return {
      step: event.step,
      len: event.len,
      rest: true,
      ...(event.dot ? { dot: true } : {}),
      ...(event.triplet ? { triplet: true } : {}),
    };
  }
  return {
    step: event.step,
    len: event.len,
    notes: event.notes.map(cloneNote),
    ...(event.dot ? { dot: true } : {}),
    ...(event.triplet ? { triplet: true } : {}),
  };
};

export const cloneMeasure = (measure: TabMeasureV3): TabMeasureV3 => ({
  events: measure.events.map(cloneEvent),
});

export const copyMeasure = (
  data: TabDataV3,
  measureIndex: number
): TabMeasureV3 => {
  const source = data.measures.at(measureIndex) ?? { events: [] };
  return cloneMeasure(source);
};

export const duplicateMeasure = (
  data: TabDataV3,
  measureIndex: number
): TabDataV3 => {
  const safeIndex = clampInt(measureIndex, 0, Math.max(0, data.measures.length - 1));
  const duplicate = copyMeasure(data, safeIndex);
  const measures = [...data.measures];
  measures.splice(safeIndex + 1, 0, duplicate);
  return sanitizeTabDataV3({ ...data, measures });
};

export const pasteMeasure = (
  data: TabDataV3,
  measureIndex: number,
  source: TabMeasureV3
): TabDataV3 => {
  const safeIndex = clampInt(measureIndex, 0, Math.max(0, data.measures.length - 1));
  const measures = [...data.measures];
  measures[safeIndex] = cloneMeasure(source);
  return sanitizeTabDataV3({ ...data, measures });
};

export const insertMeasure = (
  data: TabDataV3,
  measureIndex: number
): TabDataV3 => {
  const safeIndex = clampInt(measureIndex, 0, data.measures.length);
  const measures = [...data.measures];
  measures.splice(safeIndex, 0, { events: [] });
  return sanitizeTabDataV3({ ...data, measures });
};

export const deleteMeasure = (
  data: TabDataV3,
  measureIndex: number
): TabDataV3 => {
  if (data.measures.length <= 1) {
    return sanitizeTabDataV3(data);
  }

  const safeIndex = clampInt(measureIndex, 0, data.measures.length - 1);
  const measures = [...data.measures];
  measures.splice(safeIndex, 1);
  return sanitizeTabDataV3({ ...data, measures });
};

export const normalizeStepRange = (
  anchor: StepRangePoint,
  current: StepRangePoint
): StepRangeSelection => {
  // MVP: range selection is clamped to the anchor measure only.
  const measureIndex = anchor.measureIndex;
  const currentStepIndex =
    current.measureIndex === anchor.measureIndex ? current.stepIndex : anchor.stepIndex;
  return {
    startMeasureIndex: measureIndex,
    startStepIndex: Math.min(anchor.stepIndex, currentStepIndex),
    endMeasureIndex: measureIndex,
    endStepIndex: Math.max(anchor.stepIndex, currentStepIndex),
  };
};

export const isStepInRange = (
  range: StepRangeSelection | null,
  measureIndex: number,
  stepIndex: number
): boolean => {
  if (!range) {
    return false;
  }
  return (
    measureIndex === range.startMeasureIndex &&
    measureIndex === range.endMeasureIndex &&
    stepIndex >= range.startStepIndex &&
    stepIndex <= range.endStepIndex
  );
};

export const extractRangeClipboardFromMeasure = (
  events: TabEvent[],
  range: StepRangeSelection
): StepRangeClipboard => {
  const clippedEvents = sanitizeEvents(events, STEPS_PER_MEASURE, true)
    .filter((event) => event.step >= range.startStepIndex && event.step <= range.endStepIndex)
    .map((event) => {
      if ("rest" in event && event.rest) {
        return {
          step: event.step - range.startStepIndex,
          len: event.len,
          rest: true as const,
          ...(event.dot ? { dot: true as const } : {}),
          ...(event.triplet ? { triplet: true as const } : {}),
        };
      }
      return {
        step: event.step - range.startStepIndex,
        len: event.len,
        notes: event.notes.map(cloneNote),
        ...(event.dot ? { dot: true as const } : {}),
        ...(event.triplet ? { triplet: true as const } : {}),
      };
    });

  return {
    sourceMeasureIndex: range.startMeasureIndex,
    startStepIndex: range.startStepIndex,
    length: range.endStepIndex - range.startStepIndex + 1,
    events: clippedEvents,
  };
};

export const pasteRangeClipboardIntoMeasure = (
  events: TabEvent[],
  startStepIndex: number,
  clipboard: StepRangeClipboard,
  stepLimit = STEPS_PER_MEASURE
): TabEvent[] => {
  const safeStartStep = clampStep(startStepIndex, stepLimit);
  const targetWindowLen = Math.max(1, clipboard.length);
  const baseEvents = sanitizeEvents(events, stepLimit, true).filter(
    (event) => !rangesOverlap(event.step, event.len, safeStartStep, targetWindowLen)
  );

  let nextEvents = [...baseEvents];
  clipboard.events.forEach((event) => {
    const shiftedStep = safeStartStep + event.step;
    const shiftedEvent: TabEvent =
      "rest" in event && event.rest
        ? { step: shiftedStep, len: event.len, rest: true }
        : {
            step: shiftedStep,
            len: event.len,
            notes: event.notes.map(cloneNote),
          };
    if ("dot" in event && event.dot) {
      shiftedEvent.dot = true;
    }
    if ("triplet" in event && event.triplet) {
      shiftedEvent.triplet = true;
    }

    if (
      !canPlaceEvent(
        nextEvents,
        shiftedEvent.step,
        shiftedEvent.len,
        { ignoreStep: shiftedEvent.step },
        stepLimit
      )
    ) {
      console.warn(`[tabModel] skipped pasted event due to collision: step=${shiftedEvent.step}`);
      return;
    }

    nextEvents = [...nextEvents.filter((existing) => existing.step !== shiftedEvent.step), shiftedEvent];
    nextEvents = sanitizeEvents(nextEvents, stepLimit, true);
  });

  return sanitizeEvents(nextEvents, stepLimit, true);
};

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.trunc(value)));

export const clampFret = (value: number): number => clampInt(value, 0, MAX_FRET);

export const clampTempo = (value: number): number => clampInt(value, 30, 300);

const clampStep = (value: number, stepLimit = STEPS_PER_MEASURE): number =>
  clampInt(value, 0, Math.max(0, stepLimit - 1));

const clampLen = (len: number, step: number, stepLimit = STEPS_PER_MEASURE): number => {
  const maxLen = stepLimit - step;
  return clampInt(len, 1, Math.max(1, maxLen));
};

const clampLenAllowOverflow = (len: number): number => clampInt(len, 1, STEPS_PER_MEASURE);

const clampStepByMeasure = (value: number, stepsPerMeasure: number): number =>
  clampInt(value, 0, stepsPerMeasure - 1);

const clampDisplayStep = (value: number, stepLimit: number): number =>
  clampInt(value, 0, Math.max(0, stepLimit - 1));

const clampLenByMeasure = (len: number, step: number, stepsPerMeasure: number): number => {
  const maxLen = stepsPerMeasure - step;
  return clampInt(len, 1, Math.max(1, maxLen));
};

const sortAndDedupeNotes = (notes: TabNoteEventNote[]): TabNoteEventNote[] => {
  const map = new Map<number, TabNoteEventNote>();
  notes.forEach((note) => {
    if (note.string < 1 || note.string > STRINGS_COUNT) {
      return;
    }
    map.set(note.string, {
      string: note.string,
      fret: clampFret(note.fret),
      ...(note.technique ? { technique: note.technique } : {}),
    });
  });

  return Array.from(map.values()).sort((a, b) => a.string - b.string);
};

export const rangesOverlap = (
  startA: number,
  lenA: number,
  startB: number,
  lenB: number
): boolean => {
  const endA = startA + lenA;
  const endB = startB + lenB;
  return startA < endB && startB < endA;
};

const sanitizeEvent = (
  event: TabEvent,
  stepsPerMeasure: number,
  allowOverflow: boolean
): TabEvent | null => {
  const rawStep = Math.trunc(event.step);
  if (allowOverflow && rawStep < 0) {
    return null;
  }

  const step = allowOverflow
    ? Math.max(0, rawStep)
    : clampStepByMeasure(rawStep, stepsPerMeasure);
  const len = allowOverflow
    ? clampInt(event.len, 1, Math.max(1, stepsPerMeasure))
    : clampLenByMeasure(event.len, step, stepsPerMeasure);

  // Preserve dot/triplet but strip invalid combo (both set)
  const dot = event.dot && !event.triplet ? true : undefined;
  const triplet = event.triplet && !event.dot ? true : undefined;

  if ("rest" in event && event.rest) {
    return { step, len, rest: true, ...(dot && { dot }), ...(triplet && { triplet }) };
  }

  const notes = sortAndDedupeNotes(event.notes ?? []);
  if (notes.length === 0) {
    return null;
  }

  return { step, len, notes, ...(dot && { dot }), ...(triplet && { triplet }) };
};

export const sanitizeEvents = (
  events: TabEvent[],
  stepsPerMeasure = STEPS_PER_MEASURE,
  allowOverflow = false
): TabEvent[] => {
  const sorted = events
    .map((event) => sanitizeEvent(event, stepsPerMeasure, allowOverflow))
    .filter((event): event is TabEvent => event !== null)
    .filter((event) => allowOverflow || event.step < stepsPerMeasure)
    .sort((a, b) => a.step - b.step);

  const accepted: TabEvent[] = [];
  sorted.forEach((candidate) => {
    const hasOverlap = accepted.some((existing) =>
      rangesOverlap(existing.step, existing.len, candidate.step, candidate.len)
    );
    if (hasOverlap) {
      console.warn(
        `[tabModel] overlap removed: step=${candidate.step}, len=${candidate.len}`
      );
      return;
    }
    accepted.push(candidate);
  });

  return accepted;
};

export const shiftEventsFromStep = (
  events: TabEvent[],
  fromStep: number,
  deltaSteps: number,
  stepsPerMeasure = STEPS_PER_MEASURE
): TabEvent[] => {
  if (deltaSteps === 0) {
    return sanitizeEvents(events, stepsPerMeasure, true);
  }

  return sanitizeEvents(
    events
      .map((event) => {
        if (event.step < fromStep) {
          return event;
        }
        const newStep = event.step + deltaSteps;
        if (newStep < 0) {
          return null;
        }
        return { ...event, step: newStep };
      })
      .filter((event): event is TabEvent => event !== null),
    stepsPerMeasure,
    true
  );
};

export const canPlaceEvent = (
  events: TabEvent[],
  stepIndex: number,
  len: number,
  options: PlacementOptions = {},
  stepsPerMeasure = STEPS_PER_MEASURE,
  allowOverflow = false
): boolean => {
  const safeStep = allowOverflow
    ? Math.max(0, Math.trunc(stepIndex))
    : clampStepByMeasure(stepIndex, stepsPerMeasure);
  const safeLen = allowOverflow
    ? clampLenAllowOverflow(len)
    : clampLenByMeasure(len, safeStep, stepsPerMeasure);

  return sanitizeEvents(events, stepsPerMeasure, allowOverflow)
    .filter((event) => event.step !== options.ignoreStep)
    .every((event) => !rangesOverlap(event.step, event.len, safeStep, safeLen));
};

export const isStepBlockedForNewStart = (
  events: TabEvent[],
  stepIndex: number,
  stepsPerMeasure = STEPS_PER_MEASURE
): boolean => {
  const safeStep = clampDisplayStep(stepIndex, stepsPerMeasure);
  return sanitizeEvents(events, stepsPerMeasure, true).some(
    (event) => safeStep > event.step && safeStep < event.step + event.len
  );
};

/** If stepIndex falls inside an existing event (but isn't its start),
 *  return that event's start step. Otherwise return stepIndex unchanged. */
export const findOwningEventStep = (
  events: TabEvent[],
  stepIndex: number,
  stepsPerMeasure = STEPS_PER_MEASURE
): number => {
  const safeStep = clampDisplayStep(stepIndex, stepsPerMeasure);
  const owning = sanitizeEvents(events, stepsPerMeasure, true).find(
    (event) => safeStep > event.step && safeStep < event.step + event.len
  );
  return owning ? owning.step : safeStep;
};

export const eventsToGrid = (
  events: TabEvent[],
  displayColumns = STEPS_PER_MEASURE
): GridCell[][] => {
  const grid: GridCell[][] = Array.from({ length: STRINGS_COUNT }, () =>
    Array.from({ length: displayColumns }, () => ({
      fret: null,
      isRestStart: false,
    }))
  );

  // Allow overflow events so overflow measures render correctly when displayColumns > STEPS_PER_MEASURE
  sanitizeEvents(events, STEPS_PER_MEASURE, true).forEach((event) => {
    if (event.step >= displayColumns) {
      return;
    }
    if ("rest" in event && event.rest) {
      grid[0][event.step].isRestStart = true;
      return;
    }

    event.notes.forEach((note) => {
      const rowIndex = note.string - 1;
      if (rowIndex < 0 || rowIndex >= STRINGS_COUNT) {
        return;
      }
      grid[rowIndex][event.step].fret = note.fret;
    });
  });

  return grid;
};

export const findEventAtStep = (events: TabEvent[], stepIndex: number): TabEvent | null => {
  const safeStep = Math.max(0, Math.trunc(stepIndex));
  return sanitizeEvents(events, STEPS_PER_MEASURE, true).find((event) => event.step === safeStep) ?? null;
};

export const getCellFret = (
  events: TabEvent[],
  rowIndex: number,
  stepIndex: number
): number | null => {
  const event = findEventAtStep(events, stepIndex);
  if (!event || ("rest" in event && event.rest)) {
    return null;
  }

  const stringNumber = rowIndex + 1;
  const note = event.notes.find((item) => item.string === stringNumber);
  return note ? note.fret : null;
};

export const upsertNoteAtCell = (
  events: TabEvent[],
  cell: CellPosition,
  fret: number,
  len: number,
  stepLimit = STEPS_PER_MEASURE,
  allowOverflow = false
): TabEvent[] => {
  const stepIndex = clampStep(cell.stepIndex, stepLimit);
  const stringNumber = clampInt(cell.rowIndex + 1, 1, STRINGS_COUNT);
  const safeLen = allowOverflow
    ? clampLenAllowOverflow(len)
    : clampLen(len, stepIndex, stepLimit);
  const safeFret = clampFret(fret);

  if (!canPlaceEvent(events, stepIndex, safeLen, { ignoreStep: stepIndex }, stepLimit, allowOverflow)) {
    return sanitizeEvents(events, stepLimit, allowOverflow);
  }

  const next = sanitizeEvents(events, stepLimit, allowOverflow).filter(
    (event) => event.step !== stepIndex
  );
  const existing = findEventAtStep(events, stepIndex);

  let notes: TabNoteEventNote[] = [];
  if (existing && !("rest" in existing && existing.rest)) {
    notes = [...existing.notes];
  }

  const withoutTarget = notes.filter((note) => note.string !== stringNumber);
  const merged = sortAndDedupeNotes([...withoutTarget, { string: stringNumber, fret: safeFret }]);

  next.push({ step: stepIndex, len: safeLen, notes: merged });
  return sanitizeEvents(next, stepLimit, allowOverflow);
};

export const upsertRestAtStep = (
  events: TabEvent[],
  stepIndex: number,
  len: number,
  stepLimit = STEPS_PER_MEASURE,
  allowOverflow = false
): TabEvent[] => {
  const safeStep = clampStep(stepIndex, stepLimit);
  const safeLen = allowOverflow
    ? clampLenAllowOverflow(len)
    : clampLen(len, safeStep, stepLimit);
  if (!canPlaceEvent(events, safeStep, safeLen, { ignoreStep: safeStep }, stepLimit, allowOverflow)) {
    return sanitizeEvents(events, stepLimit, allowOverflow);
  }
  const next = sanitizeEvents(events, stepLimit, allowOverflow).filter(
    (event) => event.step !== safeStep
  );
  next.push({ step: safeStep, len: safeLen, rest: true });
  return sanitizeEvents(next, stepLimit, allowOverflow);
};

export const updateEventLengthAtStep = (
  events: TabEvent[],
  stepIndex: number,
  len: number,
  stepLimit = STEPS_PER_MEASURE,
  allowOverflow = false
): TabEvent[] => {
  const safeStep = clampStep(stepIndex, stepLimit);
  const existing = findEventAtStep(events, safeStep);
  if (!existing) {
    return sanitizeEvents(events, stepLimit, allowOverflow);
  }

  const safeLen = allowOverflow
    ? clampLenAllowOverflow(len)
    : clampLen(len, safeStep, stepLimit);
  if (!canPlaceEvent(events, safeStep, safeLen, { ignoreStep: safeStep }, stepLimit, allowOverflow)) {
    return sanitizeEvents(events, stepLimit, allowOverflow);
  }
  const next = sanitizeEvents(events, stepLimit, allowOverflow).filter(
    (event) => event.step !== safeStep
  );

  if ("rest" in existing && existing.rest) {
    next.push({ step: existing.step, len: safeLen, rest: true });
    return sanitizeEvents(next, stepLimit, allowOverflow);
  }

  next.push({ step: existing.step, len: safeLen, notes: existing.notes });
  return sanitizeEvents(next, stepLimit, allowOverflow);
};

export const deleteCellOrRestAtStep = (
  events: TabEvent[],
  cell: CellPosition,
  stepLimit = STEPS_PER_MEASURE
): TabEvent[] => {
  const safeStep = clampStep(cell.stepIndex, stepLimit);
  const stringNumber = clampInt(cell.rowIndex + 1, 1, STRINGS_COUNT);
  const existing = findEventAtStep(events, safeStep);

  if (!existing) {
    return sanitizeEvents(events, stepLimit, true);
  }

  const next = sanitizeEvents(events, stepLimit, true).filter((event) => event.step !== safeStep);

  if ("rest" in existing && existing.rest) {
    return next;
  }

  const remaining = existing.notes.filter((note) => note.string !== stringNumber);
  if (remaining.length === 0) {
    return next;
  }

  next.push({ step: existing.step, len: existing.len, notes: remaining });
  return sanitizeEvents(next, stepLimit, true);
};

export const deleteEventAtStep = (
  events: TabEvent[],
  stepIndex: number,
  stepLimit = STEPS_PER_MEASURE
): TabEvent[] => {
  const safeStep = clampStep(stepIndex, stepLimit);
  return sanitizeEvents(events, stepLimit, true).filter((event) => event.step !== safeStep);
};

export const deleteSpecificNoteAtStep = (
  events: TabEvent[],
  stepIndex: number,
  stringNumber: number,
  fret: number,
  stepLimit = STEPS_PER_MEASURE
): TabEvent[] => {
  const safeStep = clampStep(stepIndex, stepLimit);
  const safeString = clampInt(stringNumber, 1, STRINGS_COUNT);
  const safeFret = clampFret(fret);
  const existing = findEventAtStep(events, safeStep);

  if (!existing) {
    return sanitizeEvents(events, stepLimit, true);
  }

  const next = sanitizeEvents(events, stepLimit, true).filter((event) => event.step !== safeStep);

  if ("rest" in existing && existing.rest) {
    return next;
  }

  const remaining = existing.notes.filter(
    (note) => !(note.string === safeString && note.fret === safeFret)
  );
  if (remaining.length === 0) {
    return next;
  }

  next.push({ step: existing.step, len: existing.len, notes: remaining });
  return sanitizeEvents(next, stepLimit, true);
};

export const moveStepByLen = (
  stepIndex: number,
  len: number,
  stepLimit = STEPS_PER_MEASURE
): number => {
  return clampStep(stepIndex + Math.max(1, Math.trunc(len)), stepLimit);
};

export const toFrequency = (midiNote: number): number =>
  440 * Math.pow(2, (midiNote - 69) / 12);

type RawTabData = {
  version?: unknown;
  tempo?: unknown;
  key?: unknown;
  tuning?: unknown;
  stepsPerMeasure?: unknown;
  measures?: unknown;
};

export const normalizeToTabDataV3 = (
  raw: unknown,
  allowOverflow = false
): TabDataV3 | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as RawTabData;

  if (candidate.version === "v3") {
    const measures = Array.isArray(candidate.measures) ? candidate.measures : [];
    if (measures.length === 0) {
      return null;
    }

    const normalizedMeasures = measures
      .map((measure) => {
        const typed = measure as { events?: unknown };
        if (!Array.isArray(typed.events)) {
          return null;
        }
        return {
          events: sanitizeEvents(
            typed.events as TabEvent[],
            STEPS_PER_MEASURE,
            allowOverflow
          ),
        };
      })
      .filter((measure): measure is TabMeasureV3 => measure !== null);

    if (normalizedMeasures.length === 0) {
      return null;
    }

    const rawKey = candidate.key;
    const key: KeySignature =
      typeof rawKey === "string" && rawKey in KEY_ACCIDENTAL_COUNTS
        ? (rawKey as KeySignature)
        : "C";

    return sanitizeTabDataV3({
      version: "v3",
      tempo: clampTempo(typeof candidate.tempo === "number" ? candidate.tempo : 120),
      timeSig: "4/4",
      key,
      stepsPerMeasure: STEPS_PER_MEASURE,
      tuning:
        Array.isArray(candidate.tuning) && candidate.tuning.length === STRINGS_COUNT
          ? (candidate.tuning as string[]).slice(0, STRINGS_COUNT)
          : [...TUNING],
      measures: normalizedMeasures,
    }, allowOverflow);
  }

  if (candidate.version === 2) {
    const measures = Array.isArray(candidate.measures) ? candidate.measures : [];
    if (measures.length === 0) {
      return null;
    }

    const normalizedMeasures = measures
      .map((measure) => {
        const typed = measure as { events?: unknown };
        if (!Array.isArray(typed.events)) {
          return null;
        }
        return {
          events: Array.isArray(typed.events)
            ? (typed.events as TabEvent[])
            : [],
        };
      })
      .filter((measure): measure is TabMeasureV2 => measure !== null);

    if (normalizedMeasures.length === 0) {
      return null;
    }

    return migrateV2ToV3({
      version: 2,
      tempo: clampTempo(typeof candidate.tempo === "number" ? candidate.tempo : 120),
      timeSig: "4/4",
      stepsPerMeasure:
        typeof candidate.stepsPerMeasure === "number" ? Math.trunc(candidate.stepsPerMeasure) : 16,
      tuning:
        Array.isArray(candidate.tuning) && candidate.tuning.length === STRINGS_COUNT
          ? (candidate.tuning as string[]).slice(0, STRINGS_COUNT)
          : [...TUNING],
      measures: normalizedMeasures,
    });
  }

  if (candidate.version === 1) {
    const tempo = clampTempo(typeof candidate.tempo === "number" ? candidate.tempo : 120);
    const measures = Array.isArray(candidate.measures) ? candidate.measures : [];
    const firstMeasure = measures.at(0) as { steps?: unknown } | undefined;
    const steps = Array.isArray(firstMeasure?.steps) ? firstMeasure.steps : [];

    const events: TabEvent[] = [];

    steps.slice(0, 16).forEach((stepItem, stepIndex) => {
      const strings =
        typeof stepItem === "object" && stepItem && Array.isArray((stepItem as { strings?: unknown }).strings)
          ? ((stepItem as { strings: unknown[] }).strings as unknown[])
          : [];

      const notes: TabNoteEventNote[] = [];
      strings.slice(0, STRINGS_COUNT).forEach((fret, rowIndex) => {
        if (typeof fret !== "number" || Number.isNaN(fret)) {
          return;
        }
        notes.push({ string: rowIndex + 1, fret: clampFret(fret) });
      });

      if (notes.length > 0) {
        events.push({ step: stepIndex * 6, len: 6, notes });
      }
    });

    return sanitizeTabDataV3({
      version: "v3",
      tempo,
      timeSig: "4/4",
      stepsPerMeasure: STEPS_PER_MEASURE,
      tuning:
        Array.isArray(candidate.tuning) && candidate.tuning.length === STRINGS_COUNT
          ? (candidate.tuning as string[]).slice(0, STRINGS_COUNT)
          : [...TUNING],
      measures: [{ events: sanitizeEvents(events, STEPS_PER_MEASURE) }],
    });
  }

  return null;
};

// --- Sequential mode ---
// These functions implement the Sequential input mode shift logic.
// They are pure data transforms and live here rather than in page.tsx.

export type SequentialPlacementContext = {
  oldEvent: TabEvent | null;
  placementEvents: TabEvent[];
  deferredEvents: TabEvent[];
};

/**
 * Split measure events into "before the target event ends" and "after", so
 * that the caller can place a new event and then re-merge with a shift applied.
 * When autoShift is false or no event exists at targetStepIndex the events are
 * returned unsplit (deferredEvents is empty).
 */
export const getSequentialPlacementContext = (
  measureEvents: TabEvent[],
  targetStepIndex: number,
  autoShift: boolean
): SequentialPlacementContext => {
  const oldEvent = findEventAtStep(measureEvents, targetStepIndex);
  if (!autoShift || !oldEvent) {
    return {
      oldEvent,
      placementEvents: measureEvents,
      deferredEvents: [],
    };
  }

  const fromStep = oldEvent.step + getEventOccupiedSteps(oldEvent);
  const sanitized = sanitizeEvents(measureEvents, STEPS_PER_MEASURE, true);
  return {
    oldEvent,
    placementEvents: sanitized.filter((event) => event.step < fromStep),
    deferredEvents: sanitized.filter((event) => event.step >= fromStep),
  };
};

/**
 * After placing a new event, shift all deferred events by the delta between
 * the old and new event lengths. No-ops when autoShift is false or either
 * event is null.
 */
export const applySequentialShift = (
  placedEvents: TabEvent[],
  deferredEvents: TabEvent[],
  oldEvent: TabEvent | null,
  newEvent: TabEvent | null,
  autoShift: boolean
): TabEvent[] => {
  const combinedEvents = [...placedEvents, ...deferredEvents];

  if (!autoShift || !oldEvent || !newEvent) {
    return sanitizeEvents(combinedEvents, STEPS_PER_MEASURE, true);
  }

  const oldOccupied = getEventOccupiedSteps(oldEvent);
  const newOccupied = getEventOccupiedSteps(newEvent);
  const delta = newOccupied - oldOccupied;
  if (delta === 0) {
    return sanitizeEvents(combinedEvents, STEPS_PER_MEASURE, true);
  }

  const fromStep = oldEvent.step + oldOccupied;
  return sanitizeEvents(
    shiftEventsFromStep(combinedEvents, fromStep, delta, STEPS_PER_MEASURE),
    STEPS_PER_MEASURE,
    true
  );
};

/**
 * After deleting an event, left-shift all subsequent events to close the gap.
 * No-ops when autoShift is false or deletedEvent is null.
 */
export const applySequentialDeleteShift = (
  events: TabEvent[],
  deletedEvent: TabEvent | null,
  autoShift: boolean
): TabEvent[] => {
  const sanitized = sanitizeEvents(events, STEPS_PER_MEASURE, true);
  if (!autoShift || !deletedEvent) {
    return sanitized;
  }

  const deletedOccupied = getEventOccupiedSteps(deletedEvent);
  const fromStep = deletedEvent.step + deletedOccupied;
  return sanitizeEvents(
    shiftEventsFromStep(sanitized, fromStep, -deletedOccupied, STEPS_PER_MEASURE),
    STEPS_PER_MEASURE,
    true
  );
};
