// Canonical time resolution. 1 step === 1 tick; a quarter note spans
// TICKS_PER_QUARTER ticks. 960 matches Guitar Pro's internal PPQ and keeps
// 64ths, dotted values, triplets, and quintuplets integral.
export const TICKS_PER_QUARTER = 960;
// Historical resolution of v1-v3 documents. Legacy migration paths must use
// these literals (not the derived constants) so raising TICKS_PER_QUARTER
// later rescales old data instead of silently misreading it.
const LEGACY_TPQ = 24;
const LEGACY_STEPS_PER_MEASURE = LEGACY_TPQ * 4;
// 4/4 measure capacity, kept as the default for legacy (v3) call paths.
export const STEPS_PER_MEASURE = TICKS_PER_QUARTER * 4;
export const STRINGS_COUNT = 6;
export const MAX_FRET = 24;
export const SIXTEENTH_STEPS = TICKS_PER_QUARTER / 4;

// Supported time signatures. All are capped so a measure never exceeds
// STEPS_PER_MEASURE ticks, which keeps legacy len-clamp paths valid.
export type TimeSignature = "4/4" | "3/4" | "2/4" | "6/8";

export const TIME_SIGNATURES: TimeSignature[] = ["4/4", "3/4", "2/4", "6/8"];

/** Measure capacity in ticks for a time signature. */
export const getMeasureTicks = (timeSig: TimeSignature): number => {
  const [beats, unit] = timeSig.split("/").map(Number);
  return Math.round(beats * TICKS_PER_QUARTER * (4 / unit));
};

export const TUNING = ["E4", "B3", "G3", "D3", "A2", "E2"];

// string number mapping: 1 = high E (E4), 6 = low E (E2)
// UI row index mapping: rowIndex 0 => string 1, rowIndex 5 => string 6
export const OPEN_STRING_MIDI_BY_STRING = [64, 59, 55, 50, 45, 40];

export type Technique = "slide" | "hammer" | "pulloff" | "bend" | "vibrato";

export const TECHNIQUES: Technique[] = ["slide", "hammer", "pulloff", "bend", "vibrato"];

/** Short glyphs used in the TAB grid and staff preview. */
export const TECHNIQUE_GLYPHS: Record<Technique, string> = {
  slide: "s",
  hammer: "h",
  pulloff: "p",
  bend: "b",
  vibrato: "~",
};

export type TabNoteEventNote = {
  string: number;
  fret: number;
  technique?: Technique;
  tie?: boolean;
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

export type TabDataV4 = {
  version: "v4";
  tempo: number;
  timeSig: TimeSignature;
  key?: KeySignature;
  ticksPerQuarter: number;
  tuning: string[];
  measures: TabMeasureV3[];
};

export type TabTrack = {
  name: string;
  tuning: string[];
  measures: TabMeasureV3[];
};

export type TabDataV5 = {
  version: "v5";
  tempo: number;
  timeSig: TimeSignature;
  key?: KeySignature;
  ticksPerQuarter: number;
  tracks: TabTrack[];
};

/** Current canonical model. */
export type TabData = TabDataV5;

/** Measure capacity in ticks for the document's time signature. */
export const getDataMeasureTicks = (data: TabData | TabDataV4): number =>
  getMeasureTicks(data.timeSig);

/** All tracks share the same measure count (sanitize enforces this). */
export const getMeasureCount = (data: TabData): number =>
  data.tracks[0]?.measures.length ?? 0;

export const getTrackMeasures = (data: TabData, trackIndex: number): TabMeasureV3[] =>
  data.tracks[trackIndex]?.measures ?? [];

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

// Flick gesture: vertical level (-2..+2) to note length in ticks
export const FLICK_DURATION_MAP: Record<number, number> = {
  [-2]: TICKS_PER_QUARTER / 4, // ↑↑ 16th note
  [-1]: TICKS_PER_QUARTER / 2, // ↑  8th note
  [0]: TICKS_PER_QUARTER,      // tap quarter note
  [1]: TICKS_PER_QUARTER * 2,  // ↓  half note
  [2]: TICKS_PER_QUARTER * 4,  // ↓↓ whole note
};

export const getPlaybackDuration = (event: TabEvent): number => {
  if (event.dot) return event.len * 1.5;
  if (event.triplet) return event.len * (2 / 3);
  return event.len;
};

/**
 * Effective occupied ticks for an event, including dotted / triplet
 * modifiers. TICKS_PER_QUARTER is chosen so these stay integral.
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

/**
 * Visible input slots for proportional spacing: one slot per event start,
 * plus unit-grid positions in empty regions. Covered (blocked) ticks inside
 * an event's duration produce no slot of their own.
 */
export const getVisibleStepsForEvents = (
  events: TabEvent[],
  displaySteps: number,
  displayUnit: number
): number[] => {
  const unit = Math.max(1, Math.trunc(displayUnit));
  const sorted = sanitizeEvents(events, displaySteps, true)
    .filter((event) => event.step < displaySteps)
    .sort((a, b) => a.step - b.step);

  const steps: number[] = [];
  let cursor = 0;

  sorted.forEach((event) => {
    while (cursor < event.step) {
      steps.push(cursor);
      const misalignment = cursor % unit;
      cursor += misalignment === 0 ? unit : unit - misalignment;
      if (cursor > event.step) {
        cursor = event.step;
      }
    }
    if (steps[steps.length - 1] !== event.step) {
      steps.push(event.step);
    }
    cursor = event.step + Math.max(1, getEventOccupiedSteps(event));
  });

  while (cursor < displaySteps) {
    steps.push(cursor);
    const misalignment = cursor % unit;
    cursor += misalignment === 0 ? unit : unit - misalignment;
  }

  return steps.length > 0 ? steps : [0];
};

export const DURATION_OPTIONS: DurationOption[] = [
  { label: "1/16", len: TICKS_PER_QUARTER / 4, isRest: false },
  { label: "1/8", len: TICKS_PER_QUARTER / 2, isRest: false },
  { label: "1/4", len: TICKS_PER_QUARTER, isRest: false },
  { label: "1/2", len: TICKS_PER_QUARTER * 2, isRest: false },
  { label: "1", len: TICKS_PER_QUARTER * 4, isRest: false },
  { label: "Rest", len: TICKS_PER_QUARTER / 4, isRest: true },
];

export const createEmptyTrack = (name = "Guitar"): TabTrack => ({
  name,
  tuning: [...TUNING],
  measures: [{ events: [] }],
});

export const createEmptyTabData = (): TabData => ({
  version: "v5",
  tempo: 120,
  timeSig: "4/4",
  key: "C",
  ticksPerQuarter: TICKS_PER_QUARTER,
  tracks: [createEmptyTrack()],
});

export const sanitizeTabData = (
  data: TabData,
  allowOverflow = false
): TabData => {
  const measureTicks = getMeasureTicks(data.timeSig);
  const tracks = data.tracks.length > 0 ? data.tracks : [createEmptyTrack()];
  const measureCount = Math.max(
    1,
    ...tracks.map((track) => track.measures.length)
  );
  const sanitizedTracks = tracks.map((track, index) => {
    const measures = Array.from({ length: measureCount }, (_, measureIndex) => ({
      events: sanitizeEvents(
        track.measures[measureIndex]?.events ?? [],
        measureTicks,
        allowOverflow
      ),
    }));
    return {
      name: typeof track.name === "string" && track.name !== "" ? track.name : `Track ${index + 1}`,
      tuning:
        Array.isArray(track.tuning) && track.tuning.length === STRINGS_COUNT
          ? track.tuning.slice(0, STRINGS_COUNT)
          : [...TUNING],
      measures,
    };
  });
  return {
    ...data,
    version: "v5",
    ticksPerQuarter: TICKS_PER_QUARTER,
    tracks: sanitizedTracks,
  };
};

/** v4 -> v5: wrap the single measure list into one track. */
export const migrateV4ToV5 = (v4: TabDataV4, allowOverflow = false): TabData =>
  sanitizeTabData(
    {
      version: "v5",
      tempo: clampTempo(v4.tempo),
      timeSig: v4.timeSig,
      key: v4.key ?? "C",
      ticksPerQuarter: TICKS_PER_QUARTER,
      tracks: [
        {
          name: "Guitar",
          tuning: v4.tuning,
          measures: v4.measures,
        },
      ],
    },
    allowOverflow
  );

/** Legacy v3 sanitize, used only on the migration path. */
export const sanitizeTabDataV3 = (
  data: TabDataV3,
  allowOverflow = false
): TabDataV3 => {
  const sanitizedMeasures =
    data.measures.length > 0
      ? data.measures.map((measure) => ({
          events: sanitizeEvents(
            measure?.events ?? [],
            LEGACY_STEPS_PER_MEASURE,
            allowOverflow
          ),
        }))
      : [{ events: [] }];
  return {
    ...data,
    version: "v3",
    stepsPerMeasure: LEGACY_STEPS_PER_MEASURE,
    measures: sanitizedMeasures,
  };
};

/** v3 -> v4: v3 steps are 24-TPQ ticks; rescale into the canonical TPQ. */
export const migrateV3ToV4 = (v3: TabDataV3): TabDataV4 => {
  const scale = TICKS_PER_QUARTER / LEGACY_TPQ;
  return {
    version: "v4",
    tempo: clampTempo(v3.tempo),
    timeSig: "4/4",
    key: v3.key ?? "C",
    ticksPerQuarter: TICKS_PER_QUARTER,
    tuning: v3.tuning,
    measures: v3.measures.map((measure) => ({
      events: measure.events.map((event) => ({
        ...event,
        step: Math.round(event.step * scale),
        len: Math.round(event.len * scale),
      })),
    })),
  };
};

export const migrateV2ToV3 = (v2: TabDataV2): TabDataV3 => {
  // v2 used either a 16-slot grid (16th steps) or the 96-tick grid.
  const multiplier = v2.stepsPerMeasure === LEGACY_STEPS_PER_MEASURE ? 1 : LEGACY_TPQ / 4;
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
  ...(note.tie ? { tie: true } : {}),
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
  data: TabData,
  trackIndex: number,
  measureIndex: number
): TabMeasureV3 => {
  const source = getTrackMeasures(data, trackIndex).at(measureIndex) ?? { events: [] };
  return cloneMeasure(source);
};

/** Duplicates the measure at measureIndex in every track (bars are global). */
export const duplicateMeasure = (
  data: TabData,
  measureIndex: number
): TabData => {
  const safeIndex = clampInt(measureIndex, 0, Math.max(0, getMeasureCount(data) - 1));
  const tracks = data.tracks.map((track) => {
    const measures = [...track.measures];
    measures.splice(safeIndex + 1, 0, cloneMeasure(measures[safeIndex] ?? { events: [] }));
    return { ...track, measures };
  });
  return sanitizeTabData({ ...data, tracks });
};

export const pasteMeasure = (
  data: TabData,
  trackIndex: number,
  measureIndex: number,
  source: TabMeasureV3
): TabData => {
  const safeIndex = clampInt(measureIndex, 0, Math.max(0, getMeasureCount(data) - 1));
  const tracks = data.tracks.map((track, index) => {
    if (index !== trackIndex) {
      return track;
    }
    const measures = [...track.measures];
    measures[safeIndex] = cloneMeasure(source);
    return { ...track, measures };
  });
  return sanitizeTabData({ ...data, tracks });
};

/** Inserts an empty measure at measureIndex in every track. */
export const insertMeasure = (
  data: TabData,
  measureIndex: number
): TabData => {
  const safeIndex = clampInt(measureIndex, 0, getMeasureCount(data));
  const tracks = data.tracks.map((track) => {
    const measures = [...track.measures];
    measures.splice(safeIndex, 0, { events: [] });
    return { ...track, measures };
  });
  return sanitizeTabData({ ...data, tracks });
};

/** Deletes the measure at measureIndex from every track. */
export const deleteMeasure = (
  data: TabData,
  measureIndex: number
): TabData => {
  if (getMeasureCount(data) <= 1) {
    return sanitizeTabData(data);
  }

  const safeIndex = clampInt(measureIndex, 0, getMeasureCount(data) - 1);
  const tracks = data.tracks.map((track) => {
    const measures = [...track.measures];
    measures.splice(safeIndex, 1);
    return { ...track, measures };
  });
  return sanitizeTabData({ ...data, tracks });
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
      ...(note.tie ? { tie: true } : {}),
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
      rangesOverlap(
        existing.step,
        Math.max(1, getEventOccupiedSteps(existing)),
        candidate.step,
        Math.max(1, getEventOccupiedSteps(candidate))
      )
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
    .every(
      (event) =>
        !rangesOverlap(
          event.step,
          Math.max(1, getEventOccupiedSteps(event)),
          safeStep,
          safeLen
        )
    );
};

export const isStepBlockedForNewStart = (
  events: TabEvent[],
  stepIndex: number,
  stepsPerMeasure = STEPS_PER_MEASURE
): boolean => {
  const safeStep = clampDisplayStep(stepIndex, stepsPerMeasure);
  return sanitizeEvents(events, stepsPerMeasure, true).some(
    (event) =>
      safeStep > event.step &&
      safeStep < event.step + Math.max(1, getEventOccupiedSteps(event))
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
    (event) =>
      safeStep > event.step &&
      safeStep < event.step + Math.max(1, getEventOccupiedSteps(event))
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

export const toggleTieAtStep = (
  events: TabEvent[],
  stepIndex: number,
  stringNumber: number,
  stepLimit = STEPS_PER_MEASURE
): TabEvent[] => {
  const safeStep = clampStep(stepIndex, stepLimit);
  const safeString = clampInt(stringNumber, 1, STRINGS_COUNT);
  const existing = findEventAtStep(events, safeStep);

  if (!existing || ("rest" in existing && existing.rest)) {
    return sanitizeEvents(events, stepLimit, true);
  }

  const next = sanitizeEvents(events, stepLimit, true).filter(
    (event) => event.step !== safeStep
  );
  const notes = existing.notes.map((note) => {
    if (note.string !== safeString) {
      return note;
    }
    const { tie, ...rest } = note;
    return tie ? rest : { ...rest, tie: true };
  });

  next.push({
    step: existing.step,
    len: existing.len,
    notes,
    ...(existing.dot ? { dot: true } : {}),
    ...(existing.triplet ? { triplet: true } : {}),
  });
  return sanitizeEvents(next, stepLimit, true);
};

export const setTieAtStep = (
  events: TabEvent[],
  stepIndex: number,
  stringNumber: number,
  tied: boolean,
  stepLimit = STEPS_PER_MEASURE
): TabEvent[] => {
  const safeStep = clampStep(stepIndex, stepLimit);
  const safeString = clampInt(stringNumber, 1, STRINGS_COUNT);
  const existing = findEventAtStep(events, safeStep);

  if (!existing || ("rest" in existing && existing.rest)) {
    return sanitizeEvents(events, stepLimit, true);
  }

  const next = sanitizeEvents(events, stepLimit, true).filter(
    (event) => event.step !== safeStep
  );
  const notes = existing.notes.map((note) => {
    if (note.string !== safeString) {
      return note;
    }
    return {
      string: note.string,
      fret: note.fret,
      ...(note.technique ? { technique: note.technique } : {}),
      ...(tied ? { tie: true } : {}),
    };
  });

  next.push({
    step: existing.step,
    len: existing.len,
    notes,
    ...(existing.dot ? { dot: true } : {}),
    ...(existing.triplet ? { triplet: true } : {}),
  });
  return sanitizeEvents(next, stepLimit, true);
};

export const setTechniqueAtStep = (
  events: TabEvent[],
  stepIndex: number,
  stringNumber: number,
  technique: Technique | null,
  stepLimit = STEPS_PER_MEASURE
): TabEvent[] => {
  const safeStep = clampStep(stepIndex, stepLimit);
  const safeString = clampInt(stringNumber, 1, STRINGS_COUNT);
  const existing = findEventAtStep(events, safeStep);

  if (!existing || ("rest" in existing && existing.rest)) {
    return sanitizeEvents(events, stepLimit, true);
  }

  const next = sanitizeEvents(events, stepLimit, true).filter(
    (event) => event.step !== safeStep
  );
  const notes = existing.notes.map((note) => {
    if (note.string !== safeString) {
      return note;
    }
    return {
      string: note.string,
      fret: note.fret,
      ...(technique ? { technique } : {}),
      ...(note.tie ? { tie: true } : {}),
    };
  });

  next.push({
    step: existing.step,
    len: existing.len,
    notes,
    ...(existing.dot ? { dot: true } : {}),
    ...(existing.triplet ? { triplet: true } : {}),
  });
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
  timeSig?: unknown;
  key?: unknown;
  tuning?: unknown;
  stepsPerMeasure?: unknown;
  ticksPerQuarter?: unknown;
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
            LEGACY_STEPS_PER_MEASURE,
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
      stepsPerMeasure: LEGACY_STEPS_PER_MEASURE,
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
        events.push({ step: stepIndex * (LEGACY_TPQ / 4), len: LEGACY_TPQ / 4, notes });
      }
    });

    return sanitizeTabDataV3({
      version: "v3",
      tempo,
      timeSig: "4/4",
      stepsPerMeasure: LEGACY_STEPS_PER_MEASURE,
      tuning:
        Array.isArray(candidate.tuning) && candidate.tuning.length === STRINGS_COUNT
          ? (candidate.tuning as string[]).slice(0, STRINGS_COUNT)
          : [...TUNING],
      measures: [{ events: sanitizeEvents(events, LEGACY_STEPS_PER_MEASURE) }],
    });
  }

  return null;
};

/**
 * Normalize any known persisted format (v4/v3/v2/v1) into the current
 * canonical TabData. Returns null when the payload is unrecognizable.
 */
const normalizeRawMeasures = (
  rawMeasures: unknown,
  scale: number
): TabMeasureV3[] | null => {
  const measures = Array.isArray(rawMeasures) ? rawMeasures : [];
  if (measures.length === 0) {
    return null;
  }
  const normalized = measures
    .map((measure) => {
      const typed = measure as { events?: unknown };
      if (!Array.isArray(typed.events)) {
        return null;
      }
      const scaled = (typed.events as TabEvent[]).map((event) => ({
        ...event,
        step: Math.round(event.step * scale),
        len: Math.round(event.len * scale),
      }));
      return { events: scaled };
    })
    .filter((measure): measure is TabMeasureV3 => measure !== null);
  return normalized.length > 0 ? normalized : null;
};

const normalizeKey = (rawKey: unknown): KeySignature =>
  typeof rawKey === "string" && rawKey in KEY_ACCIDENTAL_COUNTS
    ? (rawKey as KeySignature)
    : "C";

const normalizeTimeSig = (rawTimeSig: unknown): TimeSignature =>
  typeof rawTimeSig === "string" && (TIME_SIGNATURES as string[]).includes(rawTimeSig)
    ? (rawTimeSig as TimeSignature)
    : "4/4";

const normalizeTpqScale = (rawTpq: unknown): number => {
  const tpq =
    typeof rawTpq === "number" && rawTpq > 0 ? Math.trunc(rawTpq) : TICKS_PER_QUARTER;
  return TICKS_PER_QUARTER / tpq;
};

const normalizeTuning = (rawTuning: unknown): string[] =>
  Array.isArray(rawTuning) && rawTuning.length === STRINGS_COUNT
    ? (rawTuning as string[]).slice(0, STRINGS_COUNT)
    : [...TUNING];

/**
 * Normalize any known persisted format (v5/v4/v3/v2/v1) into the current
 * canonical TabData. Returns null when the payload is unrecognizable.
 */
export const normalizeToTabData = (
  raw: unknown,
  allowOverflow = false
): TabData | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as RawTabData & { tracks?: unknown };

  if (candidate.version === "v5") {
    const rawTracks = Array.isArray(candidate.tracks) ? candidate.tracks : [];
    if (rawTracks.length === 0) {
      return null;
    }
    const scale = normalizeTpqScale(candidate.ticksPerQuarter);
    const tracks = rawTracks
      .map((rawTrack, index) => {
        const typed = rawTrack as { name?: unknown; tuning?: unknown; measures?: unknown };
        const measures = normalizeRawMeasures(typed.measures, scale);
        if (!measures) {
          return null;
        }
        return {
          name: typeof typed.name === "string" && typed.name !== "" ? typed.name : `Track ${index + 1}`,
          tuning: normalizeTuning(typed.tuning),
          measures,
        };
      })
      .filter((track): track is TabTrack => track !== null);

    if (tracks.length === 0) {
      return null;
    }

    return sanitizeTabData(
      {
        version: "v5",
        tempo: clampTempo(typeof candidate.tempo === "number" ? candidate.tempo : 120),
        timeSig: normalizeTimeSig(candidate.timeSig),
        key: normalizeKey(candidate.key),
        ticksPerQuarter: TICKS_PER_QUARTER,
        tracks,
      },
      allowOverflow
    );
  }

  if (candidate.version === "v4") {
    const scale = normalizeTpqScale(candidate.ticksPerQuarter);
    const measures = normalizeRawMeasures(candidate.measures, scale);
    if (!measures) {
      return null;
    }

    return migrateV4ToV5(
      {
        version: "v4",
        tempo: clampTempo(typeof candidate.tempo === "number" ? candidate.tempo : 120),
        timeSig: normalizeTimeSig(candidate.timeSig),
        key: normalizeKey(candidate.key),
        ticksPerQuarter: TICKS_PER_QUARTER,
        tuning: normalizeTuning(candidate.tuning),
        measures,
      },
      allowOverflow
    );
  }

  const legacy = normalizeToTabDataV3(raw, allowOverflow);
  return legacy ? migrateV4ToV5(migrateV3ToV4(legacy), allowOverflow) : null;
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
  autoShift: boolean,
  measureTicks = STEPS_PER_MEASURE
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
  const sanitized = sanitizeEvents(measureEvents, measureTicks, true);
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
  autoShift: boolean,
  measureTicks = STEPS_PER_MEASURE
): TabEvent[] => {
  const combinedEvents = [...placedEvents, ...deferredEvents];

  if (!autoShift || !oldEvent || !newEvent) {
    return sanitizeEvents(combinedEvents, measureTicks, true);
  }

  const oldOccupied = getEventOccupiedSteps(oldEvent);
  const newOccupied = getEventOccupiedSteps(newEvent);
  const delta = newOccupied - oldOccupied;
  if (delta === 0) {
    return sanitizeEvents(combinedEvents, measureTicks, true);
  }

  const fromStep = oldEvent.step + oldOccupied;
  return sanitizeEvents(
    shiftEventsFromStep(combinedEvents, fromStep, delta, measureTicks),
    measureTicks,
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
  autoShift: boolean,
  measureTicks = STEPS_PER_MEASURE
): TabEvent[] => {
  const sanitized = sanitizeEvents(events, measureTicks, true);
  if (!autoShift || !deletedEvent) {
    return sanitized;
  }

  const deletedOccupied = getEventOccupiedSteps(deletedEvent);
  const fromStep = deletedEvent.step + deletedOccupied;
  return sanitizeEvents(
    shiftEventsFromStep(sanitized, fromStep, -deletedOccupied, measureTicks),
    measureTicks,
    true
  );
};

export type CursorAdvanceResult = {
  nextData: TabData;
  nextSelected: CellPosition;
  didAppendMeasure: boolean;
};

/** Appends a new empty track, padded to the shared measure count. */
export const addTrack = (data: TabData, name?: string): TabData =>
  sanitizeTabData(
    {
      ...data,
      tracks: [
        ...data.tracks,
        {
          name: name ?? `Track ${data.tracks.length + 1}`,
          tuning: [...TUNING],
          measures: [],
        },
      ],
    },
    true
  );

/** Removes a track; the last remaining track cannot be deleted. */
export const deleteTrack = (data: TabData, trackIndex: number): TabData => {
  if (data.tracks.length <= 1) {
    return data;
  }
  return sanitizeTabData(
    { ...data, tracks: data.tracks.filter((_, index) => index !== trackIndex) },
    true
  );
};

export const renameTrack = (data: TabData, trackIndex: number, name: string): TabData => ({
  ...data,
  tracks: data.tracks.map((track, index) =>
    index === trackIndex ? { ...track, name: name.trim() === "" ? track.name : name.trim() } : track
  ),
});

/** Appends one empty measure to every track. */
export const appendEmptyMeasure = (data: TabData): TabData => ({
  ...data,
  tracks: data.tracks.map((track) => ({
    ...track,
    measures: [...track.measures, { events: [] }],
  })),
});

export const getMeasureEvents = (
  data: TabData,
  trackIndex: number,
  measureIndex: number
): TabEvent[] => getTrackMeasures(data, trackIndex).at(measureIndex)?.events ?? [];

/** Replaces one measure's events in one track, padding every track so the
 *  measure-count invariant holds. */
export const updateMeasureEvents = (
  data: TabData,
  trackIndex: number,
  measureIndex: number,
  nextEvents: TabEvent[]
): TabData => {
  const safeIndex = Math.max(0, measureIndex);
  const measureCount = Math.max(getMeasureCount(data), safeIndex + 1);
  const tracks = data.tracks.map((track, index) => {
    const measures = [...track.measures];
    while (measures.length < measureCount) {
      measures.push({ events: [] });
    }
    if (index === trackIndex) {
      measures[safeIndex] = { events: nextEvents };
    }
    return { ...track, measures };
  });
  return { ...data, tracks };
};

/**
 * Advance the cursor by moveAmount display steps, appending a new measure
 * when the cursor walks past the end of the last measure (unless playing).
 */
export const getNextCursorPositionWithAutoAppend = (
  data: TabData,
  trackIndex: number,
  selected: CellPosition,
  moveAmount: number,
  isPlaying: boolean,
  displayUnit: number
): CursorAdvanceResult => {
  const measureTicks = getDataMeasureTicks(data);
  const safeMoveAmount = Math.max(1, Math.trunc(moveAmount));
  let nextData = data;
  let measureIndex = Math.max(0, Math.min(getMeasureCount(data) - 1, selected.measureIndex));
  let stepIndex = Math.max(0, selected.stepIndex);
  let remaining = safeMoveAmount;
  let didAppendMeasure = false;

  while (remaining > 0) {
    const measureEvents =
      getTrackMeasures(nextData, trackIndex).at(measureIndex)?.events ?? [];
    const displaySteps = getMeasureDisplaySteps(measureEvents, displayUnit, measureTicks);
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

    if (measureIndex < getMeasureCount(nextData) - 1) {
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

/**
 * Find the most recent note on the given string at or before the given
 * position, searching backwards across measures.
 */
export const findPreviousNoteOnString = (
  data: TabData,
  trackIndex: number,
  measureIndex: number,
  stepIndex: number,
  stringNumber: number,
  displayStepsByMeasure: number[]
): { fret: number } | null => {
  for (let mi = measureIndex; mi >= 0; mi -= 1) {
    const limitStep = mi === measureIndex ? stepIndex : Infinity;
    const previousEvent = sanitizeEvents(
      getMeasureEvents(data, trackIndex, mi),
      displayStepsByMeasure[mi] ?? STEPS_PER_MEASURE,
      true
    )
      .filter((event) => event.step < limitStep && !("rest" in event && event.rest))
      .reverse()
      .find(
        (event) =>
          !("rest" in event && event.rest) &&
          event.notes.some((note) => note.string === stringNumber)
      );
    if (!previousEvent || ("rest" in previousEvent && previousEvent.rest)) {
      continue;
    }
    const previousNote = previousEvent.notes.find((note) => note.string === stringNumber);
    if (previousNote) {
      return { fret: previousNote.fret };
    }
  }
  return null;
};
