import {
  KEY_ACCIDENTAL_COUNTS,
  KeySignature,
  OPEN_STRING_MIDI_BY_STRING,
  STRINGS_COUNT,
  TICKS_PER_QUARTER,
  TIME_SIGNATURES,
  TUNING,
  TabData,
  TabEvent,
  TabNoteEventNote,
  getDataMeasureTicks,
  getEventOccupiedSteps,
  sanitizeEvents,
  sanitizeTabData,
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

const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

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

  const buildPartMeasuresXml = (exportMeasures: { events: TabEvent[] }[], isFirstPart: boolean) =>
    exportMeasures
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
            ...(exportMeasures
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
              ...(isFirstPart
                ? [
                    `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${data.tempo}</per-minute></metronome></direction-type><sound tempo="${data.tempo}"/></direction>`,
                  ]
                : []),
            ].join("")
          : "";

      return `<measure number="${measureIndex + 1}">${attributes}${body.join("")}</measure>`;
    })
    .join("");

  const partListXml = data.tracks
    .map(
      (track, index) =>
        `<score-part id="P${index + 1}"><part-name>${xmlEscape(track.name)}</part-name></score-part>`
    )
    .join("");
  const partsXml = data.tracks
    .map(
      (track, index) =>
        `<part id="P${index + 1}">${buildPartMeasuresXml(track.measures, index === 0)}</part>`
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    "<part-list>",
    partListXml,
    "</part-list>",
    partsXml,
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

// --- Import (MusicXML -> canonical model) ---

const STEP_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

const FIFTHS_TO_KEY: Record<number, KeySignature> = {
  7: "C#", 6: "F#", 5: "B", 4: "E", 3: "A", 2: "D", 1: "G", 0: "C",
  [-1]: "F", [-2]: "Bb", [-3]: "Eb", [-4]: "Ab", [-5]: "Db", [-6]: "Gb", [-7]: "Cb",
};

const text = (parent: Element, selector: string): string | null =>
  parent.querySelector(selector)?.textContent ?? null;

const intText = (parent: Element, selector: string): number | null => {
  const raw = text(parent, selector);
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const pitchToMidi = (note: Element): number | null => {
  const pitch = note.querySelector("pitch");
  if (!pitch) {
    return null;
  }
  const step = text(pitch, "step");
  const octave = intText(pitch, "octave");
  if (!step || octave === null || !(step in STEP_SEMITONES)) {
    return null;
  }
  const alter = intText(pitch, "alter") ?? 0;
  return (octave + 1) * 12 + STEP_SEMITONES[step] + alter;
};

/** Pick a playable string/fret for a midi note (highest string, lowest fret). */
const midiToStringFret = (midi: number): { string: number; fret: number } | null => {
  for (let stringNumber = 1; stringNumber <= STRINGS_COUNT; stringNumber += 1) {
    const open = OPEN_STRING_MIDI_BY_STRING[stringNumber - 1];
    const fret = midi - open;
    if (fret >= 0 && fret <= 24) {
      return { string: stringNumber, fret };
    }
  }
  return null;
};

/**
 * Parse MusicXML (score-partwise) into the canonical model. Reads the first
 * part's voice-1 line: notes, chords, rests, dots, triplets, ties, and
 * string/fret technical notations (falling back to a pitch-based string
 * assignment). Returns null when no part or measures are found.
 */
/** Parse one <part> body into measures, using that part's own divisions. */
const parsePartMeasures = (part: Element) => {
  const measureEls = [...part.querySelectorAll(":scope > measure")];
  if (measureEls.length === 0) {
    return null;
  }

  const divisions =
    intText(part.querySelector("attributes") ?? part, "divisions") ?? TICKS_PER_QUARTER;

  const toTicks = (value: number): number =>
    Math.round((value * TICKS_PER_QUARTER) / Math.max(1, divisions));

  return measureEls.map((measureEl) => {
    type PendingEvent = {
      step: number;
      duration: number;
      rest: boolean;
      dot: boolean;
      triplet: boolean;
      notes: { string: number; fret: number; tie?: boolean }[];
    };
    const eventsByStep = new Map<number, PendingEvent>();
    let cursor = 0;
    let lastNoteStart = 0;

    [...measureEl.children].forEach((child) => {
      if (child.tagName === "backup") {
        cursor -= toTicks(intText(child, "duration") ?? 0);
        return;
      }
      if (child.tagName === "forward") {
        cursor += toTicks(intText(child, "duration") ?? 0);
        return;
      }
      if (child.tagName !== "note") {
        return;
      }

      const note = child;
      const isChord = note.querySelector("chord") !== null;
      const duration = toTicks(intText(note, "duration") ?? 0);
      const voice = text(note, "voice") ?? "1";
      const start = isChord ? lastNoteStart : cursor;
      if (!isChord) {
        lastNoteStart = cursor;
        cursor += duration;
      }
      if (voice !== "1" || duration <= 0 || start < 0) {
        return;
      }

      const isRest = note.querySelector("rest") !== null;
      const dot = note.querySelector("dot") !== null;
      const timeMod = note.querySelector("time-modification");
      const triplet =
        timeMod !== null &&
        intText(timeMod, "actual-notes") === 3 &&
        intText(timeMod, "normal-notes") === 2;

      let pending = eventsByStep.get(start);
      if (!pending) {
        pending = { step: start, duration, rest: isRest, dot, triplet, notes: [] };
        eventsByStep.set(start, pending);
      }
      if (isRest) {
        return;
      }
      pending.rest = false;

      const technical = note.querySelector("notations > technical");
      let stringNumber = technical ? intText(technical, "string") : null;
      let fret = technical ? intText(technical, "fret") : null;
      if (stringNumber === null || fret === null) {
        const midi = pitchToMidi(note);
        const mapped = midi !== null ? midiToStringFret(midi) : null;
        if (!mapped) {
          return;
        }
        stringNumber = mapped.string;
        fret = mapped.fret;
      }

      const tieStop = note.querySelector('tie[type="stop"]') !== null;
      pending.notes.push({
        string: stringNumber,
        fret,
        ...(tieStop ? { tie: true } : {}),
      });
    });

    const events: TabEvent[] = [...eventsByStep.values()]
      .filter((pending) => pending.rest || pending.notes.length > 0)
      .map((pending) => {
        // Stored len is the unmodified base duration; dot/triplet metadata
        // restores the effective occupied ticks.
        const len = pending.dot
          ? Math.round(pending.duration / 1.5)
          : pending.triplet
            ? Math.round(pending.duration * 1.5)
            : pending.duration;
        const base = {
          step: pending.step,
          len: Math.max(1, len),
          ...(pending.dot ? { dot: true as const } : {}),
          ...(pending.triplet ? { triplet: true as const } : {}),
        };
        return pending.rest
          ? { ...base, rest: true as const }
          : { ...base, notes: pending.notes };
      });

    return { events };
  });
};

/**
 * Parse MusicXML (score-partwise) into the canonical model. Every part
 * becomes a track (voice 1 of each part): notes, chords, rests, dots,
 * triplets, ties, and string/fret technical notations (falling back to a
 * pitch-based string assignment). Returns null when no parts parse.
 */
export const musicXmlToTabData = (xml: string): TabData | null => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return null;
  }
  const parts = [...doc.querySelectorAll("score-partwise > part")];
  if (parts.length === 0) {
    return null;
  }

  // Part names come from the part-list, keyed by id.
  const nameById = new Map<string, string>();
  doc.querySelectorAll("part-list score-part").forEach((scorePart) => {
    const id = scorePart.getAttribute("id");
    const name = scorePart.querySelector("part-name")?.textContent;
    if (id && name) {
      nameById.set(id, name);
    }
  });

  // Document meta (key/time/tempo) comes from the first part.
  let timeSig: TabData["timeSig"] = "4/4";
  let key: KeySignature = "C";
  let tempo = 120;
  const firstAttributes = parts[0].querySelector("attributes");
  if (firstAttributes) {
    const fifths = intText(firstAttributes, "key > fifths");
    if (fifths !== null && fifths in FIFTHS_TO_KEY) {
      key = FIFTHS_TO_KEY[fifths];
    }
    const beats = intText(firstAttributes, "time > beats");
    const beatType = intText(firstAttributes, "time > beat-type");
    if (beats !== null && beatType !== null) {
      const candidate = `${beats}/${beatType}`;
      if ((TIME_SIGNATURES as string[]).includes(candidate)) {
        timeSig = candidate as TabData["timeSig"];
      }
    }
  }
  const soundTempo = doc.querySelector("part sound[tempo]")?.getAttribute("tempo");
  if (soundTempo !== null && soundTempo !== undefined) {
    const parsed = Number(soundTempo);
    if (Number.isFinite(parsed)) {
      tempo = Math.round(parsed);
    }
  }

  const tracks = parts
    .map((part, index) => {
      const measures = parsePartMeasures(part);
      if (!measures) {
        return null;
      }
      const id = part.getAttribute("id") ?? "";
      return {
        name: nameById.get(id) ?? `Track ${index + 1}`,
        tuning: [...TUNING],
        measures,
      };
    })
    .filter((track): track is NonNullable<typeof track> => track !== null);

  if (tracks.length === 0) {
    return null;
  }

  return sanitizeTabData(
    {
      version: "v5",
      tempo: Math.min(300, Math.max(30, tempo)),
      timeSig,
      key,
      ticksPerQuarter: TICKS_PER_QUARTER,
      tracks,
    },
    true
  );
};

/** Read and parse an imported MusicXML file. Returns null when unparseable. */
export const readTabDataMusicXmlFile = async (file: File): Promise<TabData | null> => {
  const xml = await file.text();
  return musicXmlToTabData(xml);
};
