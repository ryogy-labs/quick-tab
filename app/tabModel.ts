export const STEPS_PER_MEASURE = 16;
export const STRINGS_COUNT = 6;
export const MAX_FRET = 24;

export const TUNING = ["E4", "B3", "G3", "D3", "A2", "E2"];

// string number mapping: 1 = high E (E4), 6 = low E (E2)
// UI row index mapping: rowIndex 0 => string 1, rowIndex 5 => string 6
export const OPEN_STRING_MIDI_BY_STRING = [64, 59, 55, 50, 45, 40];

export type TabNoteEventNote = {
  string: number;
  fret: number;
};

export type TabNoteEvent = {
  step: number;
  len: number;
  notes: TabNoteEventNote[];
  rest?: false;
};

export type TabRestEvent = {
  step: number;
  len: number;
  rest: true;
  notes?: never;
};

export type TabEvent = TabNoteEvent | TabRestEvent;

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

type PlacementOptions = {
  ignoreStep?: number;
};

export const DURATION_OPTIONS: DurationOption[] = [
  { label: "1/16", len: 1, isRest: false },
  { label: "1/8", len: 2, isRest: false },
  { label: "1/4", len: 4, isRest: false },
  { label: "1/2", len: 8, isRest: false },
  { label: "1", len: 16, isRest: false },
  { label: "Rest", len: 1, isRest: true },
];

export const createEmptyTabDataV2 = (): TabDataV2 => ({
  version: 2,
  tempo: 120,
  timeSig: "4/4",
  stepsPerMeasure: STEPS_PER_MEASURE,
  tuning: [...TUNING],
  measures: [{ events: [] }],
});

export const sanitizeTabDataV2 = (data: TabDataV2): TabDataV2 => {
  const sanitizedMeasures =
    data.measures.length > 0
      ? data.measures.map((measure) => ({
          events: sanitizeEvents(measure?.events ?? [], STEPS_PER_MEASURE),
        }))
      : [{ events: [] }];
  return {
    ...data,
    stepsPerMeasure: STEPS_PER_MEASURE,
    measures: sanitizedMeasures,
  };
};

const cloneNote = (note: TabNoteEventNote): TabNoteEventNote => ({
  string: note.string,
  fret: note.fret,
});

const cloneEvent = (event: TabEvent): TabEvent => {
  if ("rest" in event && event.rest) {
    return { step: event.step, len: event.len, rest: true };
  }
  return {
    step: event.step,
    len: event.len,
    notes: event.notes.map(cloneNote),
  };
};

export const cloneMeasure = (measure: TabMeasureV2): TabMeasureV2 => ({
  events: measure.events.map(cloneEvent),
});

export const copyMeasure = (
  data: TabDataV2,
  measureIndex: number
): TabMeasureV2 => {
  const source = data.measures.at(measureIndex) ?? { events: [] };
  return cloneMeasure(source);
};

export const duplicateMeasure = (
  data: TabDataV2,
  measureIndex: number
): TabDataV2 => {
  const safeIndex = clampInt(measureIndex, 0, Math.max(0, data.measures.length - 1));
  const duplicate = copyMeasure(data, safeIndex);
  const measures = [...data.measures];
  measures.splice(safeIndex + 1, 0, duplicate);
  return sanitizeTabDataV2({ ...data, measures });
};

export const pasteMeasure = (
  data: TabDataV2,
  measureIndex: number,
  source: TabMeasureV2
): TabDataV2 => {
  const safeIndex = clampInt(measureIndex, 0, Math.max(0, data.measures.length - 1));
  const measures = [...data.measures];
  measures[safeIndex] = cloneMeasure(source);
  return sanitizeTabDataV2({ ...data, measures });
};

export const insertMeasure = (
  data: TabDataV2,
  measureIndex: number
): TabDataV2 => {
  const safeIndex = clampInt(measureIndex, 0, data.measures.length);
  const measures = [...data.measures];
  measures.splice(safeIndex, 0, { events: [] });
  return sanitizeTabDataV2({ ...data, measures });
};

export const deleteMeasure = (
  data: TabDataV2,
  measureIndex: number
): TabDataV2 => {
  if (data.measures.length <= 1) {
    return sanitizeTabDataV2(data);
  }

  const safeIndex = clampInt(measureIndex, 0, data.measures.length - 1);
  const measures = [...data.measures];
  measures.splice(safeIndex, 1);
  return sanitizeTabDataV2({ ...data, measures });
};

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.trunc(value)));

export const clampFret = (value: number): number => clampInt(value, 0, MAX_FRET);

export const clampTempo = (value: number): number => clampInt(value, 30, 300);

const clampStep = (value: number): number =>
  clampInt(value, 0, STEPS_PER_MEASURE - 1);

const clampLen = (len: number, step: number): number => {
  const maxLen = STEPS_PER_MEASURE - step;
  return clampInt(len, 1, Math.max(1, maxLen));
};

const clampStepByMeasure = (value: number, stepsPerMeasure: number): number =>
  clampInt(value, 0, stepsPerMeasure - 1);

const clampLenByMeasure = (len: number, step: number, stepsPerMeasure: number): number => {
  const maxLen = stepsPerMeasure - step;
  return clampInt(len, 1, Math.max(1, maxLen));
};

const sortAndDedupeNotes = (notes: TabNoteEventNote[]): TabNoteEventNote[] => {
  const map = new Map<number, number>();
  notes.forEach((note) => {
    if (note.string < 1 || note.string > STRINGS_COUNT) {
      return;
    }
    map.set(note.string, clampFret(note.fret));
  });

  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([string, fret]) => ({ string, fret }));
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

const sanitizeEvent = (event: TabEvent, stepsPerMeasure: number): TabEvent | null => {
  const step = clampStepByMeasure(event.step, stepsPerMeasure);
  const len = clampLenByMeasure(event.len, step, stepsPerMeasure);

  if ("rest" in event && event.rest) {
    return { step, len, rest: true };
  }

  const notes = sortAndDedupeNotes(event.notes ?? []);
  if (notes.length === 0) {
    return null;
  }

  return { step, len, notes };
};

export const sanitizeEvents = (
  events: TabEvent[],
  stepsPerMeasure = STEPS_PER_MEASURE
): TabEvent[] => {
  const sorted = events
    .map((event) => sanitizeEvent(event, stepsPerMeasure))
    .filter((event): event is TabEvent => event !== null)
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

export const canPlaceEvent = (
  events: TabEvent[],
  stepIndex: number,
  len: number,
  options: PlacementOptions = {},
  stepsPerMeasure = STEPS_PER_MEASURE
): boolean => {
  const safeStep = clampStepByMeasure(stepIndex, stepsPerMeasure);
  const safeLen = clampLenByMeasure(len, safeStep, stepsPerMeasure);

  return sanitizeEvents(events, stepsPerMeasure)
    .filter((event) => event.step !== options.ignoreStep)
    .every((event) => !rangesOverlap(event.step, event.len, safeStep, safeLen));
};

export const isStepBlockedForNewStart = (
  events: TabEvent[],
  stepIndex: number,
  stepsPerMeasure = STEPS_PER_MEASURE
): boolean => {
  const safeStep = clampStepByMeasure(stepIndex, stepsPerMeasure);
  return sanitizeEvents(events, stepsPerMeasure).some(
    (event) => safeStep > event.step && safeStep < event.step + event.len
  );
};

export const eventsToGrid = (events: TabEvent[]): GridCell[][] => {
  const grid: GridCell[][] = Array.from({ length: STRINGS_COUNT }, () =>
    Array.from({ length: STEPS_PER_MEASURE }, () => ({
      fret: null,
      isRestStart: false,
    }))
  );

  sanitizeEvents(events, STEPS_PER_MEASURE).forEach((event) => {
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
  return sanitizeEvents(events, STEPS_PER_MEASURE).find((event) => event.step === stepIndex) ?? null;
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
  len: number
): TabEvent[] => {
  const stepIndex = clampStep(cell.stepIndex);
  const stringNumber = clampInt(cell.rowIndex + 1, 1, STRINGS_COUNT);
  const safeLen = clampLen(len, stepIndex);
  const safeFret = clampFret(fret);

  if (!canPlaceEvent(events, stepIndex, safeLen, { ignoreStep: stepIndex })) {
    return sanitizeEvents(events, STEPS_PER_MEASURE);
  }

  const next = sanitizeEvents(events, STEPS_PER_MEASURE).filter((event) => event.step !== stepIndex);
  const existing = findEventAtStep(events, stepIndex);

  let notes: TabNoteEventNote[] = [];
  if (existing && !("rest" in existing && existing.rest)) {
    notes = [...existing.notes];
  }

  const withoutTarget = notes.filter((note) => note.string !== stringNumber);
  const merged = sortAndDedupeNotes([...withoutTarget, { string: stringNumber, fret: safeFret }]);

  next.push({ step: stepIndex, len: safeLen, notes: merged });
  return sanitizeEvents(next, STEPS_PER_MEASURE);
};

export const upsertRestAtStep = (
  events: TabEvent[],
  stepIndex: number,
  len: number
): TabEvent[] => {
  const safeStep = clampStep(stepIndex);
  const safeLen = clampLen(len, safeStep);
  if (!canPlaceEvent(events, safeStep, safeLen, { ignoreStep: safeStep })) {
    return sanitizeEvents(events, STEPS_PER_MEASURE);
  }
  const next = sanitizeEvents(events, STEPS_PER_MEASURE).filter((event) => event.step !== safeStep);
  next.push({ step: safeStep, len: safeLen, rest: true });
  return sanitizeEvents(next, STEPS_PER_MEASURE);
};

export const updateEventLengthAtStep = (
  events: TabEvent[],
  stepIndex: number,
  len: number
): TabEvent[] => {
  const safeStep = clampStep(stepIndex);
  const existing = findEventAtStep(events, safeStep);
  if (!existing) {
    return sanitizeEvents(events);
  }

  const safeLen = clampLen(len, safeStep);
  if (!canPlaceEvent(events, safeStep, safeLen, { ignoreStep: safeStep })) {
    return sanitizeEvents(events, STEPS_PER_MEASURE);
  }
  const next = sanitizeEvents(events, STEPS_PER_MEASURE).filter((event) => event.step !== safeStep);

  if ("rest" in existing && existing.rest) {
    next.push({ step: existing.step, len: safeLen, rest: true });
    return sanitizeEvents(next, STEPS_PER_MEASURE);
  }

  next.push({ step: existing.step, len: safeLen, notes: existing.notes });
  return sanitizeEvents(next, STEPS_PER_MEASURE);
};

export const deleteCellOrRestAtStep = (
  events: TabEvent[],
  cell: CellPosition
): TabEvent[] => {
  const safeStep = clampStep(cell.stepIndex);
  const stringNumber = clampInt(cell.rowIndex + 1, 1, STRINGS_COUNT);
  const existing = findEventAtStep(events, safeStep);

  if (!existing) {
    return sanitizeEvents(events, STEPS_PER_MEASURE);
  }

  const next = sanitizeEvents(events, STEPS_PER_MEASURE).filter((event) => event.step !== safeStep);

  if ("rest" in existing && existing.rest) {
    return next;
  }

  const remaining = existing.notes.filter((note) => note.string !== stringNumber);
  if (remaining.length === 0) {
    return next;
  }

  next.push({ step: existing.step, len: existing.len, notes: remaining });
  return sanitizeEvents(next, STEPS_PER_MEASURE);
};

export const moveStepByLen = (stepIndex: number, len: number): number => {
  return clampStep(stepIndex + Math.max(1, Math.trunc(len)));
};

export const toFrequency = (midiNote: number): number =>
  440 * Math.pow(2, (midiNote - 69) / 12);

type RawTabData = {
  version?: unknown;
  tempo?: unknown;
  tuning?: unknown;
  measures?: unknown;
};

export const normalizeToTabDataV2 = (raw: unknown): TabDataV2 | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as RawTabData;

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
        return { events: sanitizeEvents(typed.events as TabEvent[], STEPS_PER_MEASURE) };
      })
      .filter((measure): measure is TabMeasureV2 => measure !== null);

    if (normalizedMeasures.length === 0) {
      return null;
    }

    return {
      version: 2,
      tempo: clampTempo(typeof candidate.tempo === "number" ? candidate.tempo : 120),
      timeSig: "4/4",
      stepsPerMeasure: STEPS_PER_MEASURE,
      tuning:
        Array.isArray(candidate.tuning) && candidate.tuning.length === STRINGS_COUNT
          ? (candidate.tuning as string[]).slice(0, STRINGS_COUNT)
          : [...TUNING],
      measures: normalizedMeasures,
    };
  }

  if (candidate.version === 1) {
    const tempo = clampTempo(typeof candidate.tempo === "number" ? candidate.tempo : 120);
    const measures = Array.isArray(candidate.measures) ? candidate.measures : [];
    const firstMeasure = measures.at(0) as { steps?: unknown } | undefined;
    const steps = Array.isArray(firstMeasure?.steps) ? firstMeasure.steps : [];

    const events: TabEvent[] = [];

    steps.slice(0, STEPS_PER_MEASURE).forEach((stepItem, stepIndex) => {
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
        events.push({ step: stepIndex, len: 1, notes });
      }
    });

    return {
      version: 2,
      tempo,
      timeSig: "4/4",
      stepsPerMeasure: STEPS_PER_MEASURE,
      tuning:
        Array.isArray(candidate.tuning) && candidate.tuning.length === STRINGS_COUNT
          ? (candidate.tuning as string[]).slice(0, STRINGS_COUNT)
          : [...TUNING],
      measures: [{ events: sanitizeEvents(events, STEPS_PER_MEASURE) }],
    };
  }

  return null;
};
