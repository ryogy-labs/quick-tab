import {
  KEY_ACCIDENTAL_COUNTS,
  KeySignature,
  OPEN_STRING_MIDI_BY_STRING,
  STRINGS_COUNT,
  TICKS_PER_QUARTER,
  TabData,
  TabEvent,
  TabNoteEventNote,
  getDataMeasureTicks,
  getEventOccupiedSteps,
  sanitizeEvents,
} from "../tabModel";

// MusicXML format adapter (export only). Keeps the canonical model <->
// format adapter boundary: nothing here is referenced by editing logic.

const NOTE_TYPE_BY_LEN: Record<number, string> = {
  96: "whole",
  48: "half",
  24: "quarter",
  12: "eighth",
  6: "16th",
  3: "32nd",
};

// Rest gap decomposition chunks. 4 and 2 are triplet eighth/16th durations
// (emitted with a 3:2 time-modification) so triplet remainders fill cleanly.
const REST_CHUNKS = [96, 48, 24, 12, 6, 4, 3, 2] as const;

const SHARP_PITCHES: ReadonlyArray<{ step: string; alter: number }> = [
  { step: "C", alter: 0 }, { step: "C", alter: 1 }, { step: "D", alter: 0 },
  { step: "D", alter: 1 }, { step: "E", alter: 0 }, { step: "F", alter: 0 },
  { step: "F", alter: 1 }, { step: "G", alter: 0 }, { step: "G", alter: 1 },
  { step: "A", alter: 0 }, { step: "A", alter: 1 }, { step: "B", alter: 0 },
];

const FLAT_PITCHES: ReadonlyArray<{ step: string; alter: number }> = [
  { step: "C", alter: 0 }, { step: "D", alter: -1 }, { step: "D", alter: 0 },
  { step: "E", alter: -1 }, { step: "E", alter: 0 }, { step: "F", alter: 0 },
  { step: "G", alter: -1 }, { step: "G", alter: 0 }, { step: "A", alter: -1 },
  { step: "A", alter: 0 }, { step: "B", alter: -1 }, { step: "B", alter: 0 },
];

const keyFifths = (key: KeySignature): number => {
  const { sharps, flats } = KEY_ACCIDENTAL_COUNTS[key];
  return sharps - flats;
};

const midiToPitchXml = (midi: number, useFlats: boolean): string => {
  const table = useFlats ? FLAT_PITCHES : SHARP_PITCHES;
  const { step, alter } = table[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return [
    "<pitch>",
    `<step>${step}</step>`,
    ...(alter !== 0 ? [`<alter>${alter}</alter>`] : []),
    `<octave>${octave}</octave>`,
    "</pitch>",
  ].join("");
};

type DurationParts = {
  duration: number;
  type: string;
  dot: boolean;
  triplet: boolean;
};

const eventDurationParts = (event: TabEvent): DurationParts => ({
  duration: Math.max(1, getEventOccupiedSteps(event)),
  type: NOTE_TYPE_BY_LEN[event.len] ?? "quarter",
  dot: event.dot === true,
  triplet: event.triplet === true,
});

const durationXml = ({ duration, type, dot, triplet }: DurationParts): string =>
  [
    `<duration>${duration}</duration>`,
    ...(triplet
      ? [
          "<time-modification>",
          "<actual-notes>3</actual-notes>",
          "<normal-notes>2</normal-notes>",
          "</time-modification>",
        ]
      : []),
    `<type>${type}</type>`,
    ...(dot ? ["<dot/>"] : []),
  ].join("");

const restXml = (duration: number, type: string, triplet: boolean): string =>
  [
    "<note>",
    "<rest/>",
    durationXml({ duration, type, dot: false, triplet }),
    "<voice>1</voice>",
    "</note>",
  ].join("");

/** Decompose an arbitrary tick gap into representable rest notes. */
const gapToRestsXml = (gap: number): string => {
  const parts: string[] = [];
  let remaining = gap;
  for (const chunk of REST_CHUNKS) {
    while (remaining >= chunk) {
      const triplet = chunk === 4 || chunk === 2;
      const baseLen = triplet ? chunk * 1.5 : chunk;
      const type = NOTE_TYPE_BY_LEN[baseLen] ?? "16th";
      parts.push(restXml(chunk, type, triplet));
      remaining -= chunk;
    }
  }
  if (remaining > 0) {
    // 1-tick remainder cannot be expressed at TPQ 24; emit it as a 32nd so
    // the measure duration still sums correctly.
    parts.push(restXml(remaining, "32nd", false));
  }
  return parts.join("");
};

type NoteTieInfo = {
  tieStart: boolean;
  tieStop: boolean;
};

const noteXml = (
  note: TabNoteEventNote,
  parts: DurationParts,
  isChordNote: boolean,
  useFlats: boolean,
  tie: NoteTieInfo
): string => {
  const midi = (OPEN_STRING_MIDI_BY_STRING[note.string - 1] ?? 40) + note.fret;
  const ties = [
    ...(tie.tieStop ? ['<tie type="stop"/>'] : []),
    ...(tie.tieStart ? ['<tie type="start"/>'] : []),
  ].join("");
  const tieds = [
    ...(tie.tieStop ? ['<tied type="stop"/>'] : []),
    ...(tie.tieStart ? ['<tied type="start"/>'] : []),
  ].join("");
  return [
    "<note>",
    ...(isChordNote ? ["<chord/>"] : []),
    midiToPitchXml(midi, useFlats),
    durationXml(parts),
    ties,
    "<voice>1</voice>",
    "<notations>",
    tieds,
    "<technical>",
    `<string>${note.string}</string>`,
    `<fret>${note.fret}</fret>`,
    "</technical>",
    "</notations>",
    "</note>",
  ].join("");
};

const tuningXml = (tuningMidi: number[]): string =>
  tuningMidi
    .map((midi, index) => {
      // staff-tuning lines are numbered bottom-up: line 1 = lowest string
      const line = index + 1;
      const stringMidi = tuningMidi[tuningMidi.length - 1 - index] ?? midi;
      const pc = ((stringMidi % 12) + 12) % 12;
      const { step, alter } = SHARP_PITCHES[pc];
      const octave = Math.floor(stringMidi / 12) - 1;
      return [
        `<staff-tuning line="${line}">`,
        `<tuning-step>${step}</tuning-step>`,
        ...(alter !== 0 ? [`<tuning-alter>${alter}</tuning-alter>`] : []),
        `<tuning-octave>${octave}</tuning-octave>`,
        "</staff-tuning>",
      ].join("");
    })
    .join("");

/**
 * Serialize the canonical model into MusicXML (score-partwise) with a
 * 6-line TAB staff, suitable for import into Guitar Pro / MuseScore.
 * Overflow beyond the measure capacity is truncated.
 */
export const tabDataToMusicXml = (data: TabData): string => {
  const measureTicks = getDataMeasureTicks(data);
  const [beats, beatType] = data.timeSig.split("/").map(Number);
  const key = data.key ?? "C";
  const useFlats = KEY_ACCIDENTAL_COUNTS[key].flats > 0;

  const measuresXml = data.measures
    .map((measure, measureIndex) => {
      const events = sanitizeEvents(measure.events, measureTicks, true)
        .filter((event) => event.step < measureTicks)
        .sort((a, b) => a.step - b.step);

      const body: string[] = [];
      let cursor = 0;

      events.forEach((event, eventIndex) => {
        if (event.step > cursor) {
          body.push(gapToRestsXml(event.step - cursor));
          cursor = event.step;
        } else if (event.step < cursor) {
          // Overlap after sanitize should not happen; skip defensively.
          return;
        }

        const occupied = Math.min(
          getEventOccupiedSteps(event),
          measureTicks - event.step
        );
        const parts = { ...eventDurationParts(event), duration: occupied };

        if ("rest" in event && event.rest) {
          body.push(restXml(parts.duration, parts.type, parts.triplet));
        } else {
          // A note ties forward when the next note on the same string/fret
          // (in this or a later measure) carries the tie flag.
          const nextEvents = [
            ...events.slice(eventIndex + 1),
            ...(data.measures
              .at(measureIndex + 1)
              ?.events.slice()
              .sort((a, b) => a.step - b.step) ?? []),
          ];
          event.notes.forEach((note, noteIndex) => {
            const nextNoteEvent = nextEvents.find(
              (candidate) =>
                !("rest" in candidate && candidate.rest) &&
                candidate.notes.some((n) => n.string === note.string)
            );
            const nextNote =
              nextNoteEvent && !("rest" in nextNoteEvent && nextNoteEvent.rest)
                ? nextNoteEvent.notes.find((n) => n.string === note.string)
                : undefined;
            const tieStart =
              nextNote?.tie === true && nextNote.fret === note.fret;
            body.push(
              noteXml(note, parts, noteIndex > 0, useFlats, {
                tieStart,
                tieStop: note.tie === true,
              })
            );
          });
        }
        cursor = event.step + occupied;
      });

      if (cursor < measureTicks) {
        body.push(gapToRestsXml(measureTicks - cursor));
      }

      const attributes =
        measureIndex === 0
          ? [
              "<attributes>",
              `<divisions>${TICKS_PER_QUARTER}</divisions>`,
              `<key><fifths>${keyFifths(key)}</fifths></key>`,
              `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`,
              '<clef><sign>TAB</sign><line>5</line></clef>',
              `<staff-details><staff-lines>${STRINGS_COUNT}</staff-lines>${tuningXml(
                [...OPEN_STRING_MIDI_BY_STRING]
              )}</staff-details>`,
              "</attributes>",
              `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${data.tempo}</per-minute></metronome></direction-type><sound tempo="${data.tempo}"/></direction>`,
            ].join("")
          : "";

      return `<measure number="${measureIndex + 1}">${attributes}${body.join("")}</measure>`;
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    "<part-list>",
    '<score-part id="P1"><part-name>Guitar</part-name></score-part>',
    "</part-list>",
    '<part id="P1">',
    measuresXml,
    "</part>",
    "</score-partwise>",
  ].join("\n");
};

/** Download the current tab data as a .musicxml file. */
export const downloadTabDataAsMusicXml = (data: TabData): void => {
  const xml = tabDataToMusicXml(data);
  const blob = new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quick-tab.musicxml";
  a.click();
  URL.revokeObjectURL(url);
};
