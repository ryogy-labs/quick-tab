"use client";

import { useMemo } from "react";
import styles from "./StaffPreview.module.css";
import { KEY_ACCIDENTAL_COUNTS, KeySignature, OPEN_STRING_MIDI_BY_STRING, STEPS_PER_MEASURE, TabEvent, sanitizeEvents } from "../tabModel";

type StaffPreviewProps = {
  measuresEvents: TabEvent[][];
  currentCursor: { measureIndex: number; stepIndex: number } | null;
  stepWidth: number;
  stepUnit: number;
  measureDisplaySlots: number[];
  measureStartXs: number[];
  timelineWidth: number;
  overflowingMeasures?: Set<number>;
  showClef?: boolean;
  showBarLines?: boolean;
  keySignature?: KeySignature;
};

type PitchToken = {
  midi: number;
  letter: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  accidental: "#" | "";
  octave: number;
};

type NoteRender = {
  x: number;
  y: number;
  accidental: "#" | "";
};

type EventRender = {
  measureIndex: number;
  step: number;
  len: number;
  isRest: boolean;
  notes: NoteRender[];
  dot?: boolean;
  triplet?: boolean;
};

type DurationToken = "w" | "h" | "q" | "8" | "16";
type SupportedLen = 6 | 12 | 24 | 48 | 96;

const STAFF_LINE_GAP = 12;
export const STAFF_TOP = 76;
const STAFF_LINES = 5;
const NOTE_RADIUS_X = 6;
const NOTE_RADIUS_Y = 4.4;
const STEM_HEIGHT = 30;
// Key signature: Y positions for each accidental in treble clef.
// Computed from STAFF_BOTTOM - stepsFromE4 * (STAFF_LINE_GAP / 2).
// Sharp order: F C G D A E B  (FCGDAEB)
const SHARP_YS = [76, 94, 70, 88, 106, 82, 100] as const;
// Flat order: B E A D G C F  (BEADGCF)
const FLAT_YS  = [100, 82, 106, 88, 112, 94, 118] as const;
const KEY_SIG_X_START_RATIO = 0.68; // fraction of labelWidth
const KEY_SIG_SPACING = 8;
const KEY_SIG_FONT_SIZE = 15;

const BEAM_THICKNESS = 4;
const BEAM_GAP = 6;
const BEAT_STEPS = 24;

export const STAFF_BOTTOM = STAFF_TOP + STAFF_LINE_GAP * (STAFF_LINES - 1);
const STAFF_CENTER_Y = (STAFF_TOP + STAFF_BOTTOM) / 2;
export const STAFF_VIEWBOX_HEIGHT = 175;

// E4 is the bottom line on treble clef.
const E4_DIATONIC_INDEX = 2 + 7 * 4;

const toDiatonicIndex = (letter: PitchToken["letter"], octave: number): number => {
  const map: Record<PitchToken["letter"], number> = {
    C: 0,
    D: 1,
    E: 2,
    F: 3,
    G: 4,
    A: 5,
    B: 6,
  };
  return map[letter] + octave * 7;
};

const midiToPitchToken = (midi: number): PitchToken => {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;

  switch (pitchClass) {
    case 0:
      return { midi, letter: "C", accidental: "", octave };
    case 1:
      return { midi, letter: "C", accidental: "#", octave };
    case 2:
      return { midi, letter: "D", accidental: "", octave };
    case 3:
      return { midi, letter: "D", accidental: "#", octave };
    case 4:
      return { midi, letter: "E", accidental: "", octave };
    case 5:
      return { midi, letter: "F", accidental: "", octave };
    case 6:
      return { midi, letter: "F", accidental: "#", octave };
    case 7:
      return { midi, letter: "G", accidental: "", octave };
    case 8:
      return { midi, letter: "G", accidental: "#", octave };
    case 9:
      return { midi, letter: "A", accidental: "", octave };
    case 10:
      return { midi, letter: "A", accidental: "#", octave };
    case 11:
    default:
      return { midi, letter: "B", accidental: "", octave };
  }
};

const midiToStaffY = (midi: number): { y: number; accidental: "#" | "" } => {
  const token = midiToPitchToken(midi);
  const diatonic = toDiatonicIndex(token.letter, token.octave);
  const stepsFromE4 = diatonic - E4_DIATONIC_INDEX;
  const y = STAFF_BOTTOM - stepsFromE4 * (STAFF_LINE_GAP / 2);
  return { y, accidental: token.accidental };
};

const DURATIONS_BY_LEN: Record<SupportedLen, DurationToken> = {
  6: "16",
  12: "8",
  24: "q",
  48: "h",
  96: "w",
};

const SUPPORTED_LENS: SupportedLen[] = [6, 12, 24, 48, 96];

export const lenToDuration = (len: number): DurationToken | null => {
  if (len in DURATIONS_BY_LEN) {
    return DURATIONS_BY_LEN[len as SupportedLen];
  }
  return null;
};

// Safety behavior for imported/legacy invalid len:
// warn and snap to the nearest supported duration length.
const normalizeLenForDuration = (len: number): SupportedLen => {
  if (lenToDuration(len) !== null) {
    return len as SupportedLen;
  }

  const snapped = SUPPORTED_LENS.reduce((best, candidate) =>
    Math.abs(candidate - len) < Math.abs(best - len) ? candidate : best
  );
  console.warn(`[StaffPreview] unsupported len=${len}; snapped to ${snapped}`);
  return snapped;
};

// SVG rest symbol renderers (draw directly in SVG since Unicode musical symbols lack font support)
const RestWhole = ({ x, y, fill }: { x: number; y: number; fill: string }) => {
  // Filled rectangle hanging below line 4
  const lineY = STAFF_TOP + STAFF_LINE_GAP; // 2nd line from top
  return <rect x={x - 6} y={lineY} width={12} height={STAFF_LINE_GAP / 2} fill={fill} />;
};

const RestHalf = ({ x, y, fill }: { x: number; y: number; fill: string }) => {
  // Filled rectangle sitting on line 3
  const lineY = STAFF_TOP + STAFF_LINE_GAP * 2; // middle line
  return <rect x={x - 6} y={lineY - STAFF_LINE_GAP / 2} width={12} height={STAFF_LINE_GAP / 2} fill={fill} />;
};

const RestQuarter = ({ x, y, fill }: { x: number; y: number; fill: string }) => {
  // Classic quarter rest zig-zag shape
  const top = STAFF_TOP + STAFF_LINE_GAP * 0.5;
  return (
    <path
      d={`M ${x + 3} ${top} L ${x - 4} ${top + 8} L ${x + 4} ${top + 16} Q ${x - 5} ${top + 22} ${x - 3} ${top + 28} Q ${x + 1} ${top + 24} ${x + 4} ${top + 26} Q ${x - 2} ${top + 32} ${x - 3} ${top + 36}`}
      fill="none"
      stroke={fill}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

const RestEighth = ({ x, y, fill }: { x: number; y: number; fill: string }) => {
  // Eighth rest: dot + diagonal line
  const centerY = STAFF_CENTER_Y;
  return (
    <g>
      <circle cx={x + 2} cy={centerY - 6} r={2.5} fill={fill} />
      <line x1={x + 2} y1={centerY - 4} x2={x - 3} y2={centerY + 12} stroke={fill} strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
};

const RestSixteenth = ({ x, y, fill }: { x: number; y: number; fill: string }) => {
  // Sixteenth rest: two dots + diagonal line
  const centerY = STAFF_CENTER_Y;
  return (
    <g>
      <circle cx={x + 2} cy={centerY - 10} r={2.5} fill={fill} />
      <circle cx={x + 4} cy={centerY - 2} r={2.5} fill={fill} />
      <line x1={x + 4} y1={centerY} x2={x - 3} y2={centerY + 14} stroke={fill} strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
};

type BeamGroupData = {
  events: EventRender[];
  stemUp: boolean;
  primaryBeamY: number;
};

const computeBeamGroups = (renderEvents: EventRender[]): BeamGroupData[] => {
  const byMeasure = new Map<number, EventRender[]>();
  for (const e of renderEvents) {
    if (!byMeasure.has(e.measureIndex)) byMeasure.set(e.measureIndex, []);
    byMeasure.get(e.measureIndex)!.push(e);
  }

  const allGroups: BeamGroupData[] = [];

  for (const events of byMeasure.values()) {
    const sorted = [...events].sort((a, b) => a.step - b.step);
    let pending: EventRender[] = [];
    let nextStep = -1;
    let beat = -1;
    let pendingDur: DurationToken | null = null;

    const flush = () => {
      if (pending.length >= 2) {
        const avgY = pending.reduce((s, e) => s + (e.notes[0]?.y ?? STAFF_CENTER_Y), 0) / pending.length;
        const stemUp = avgY > STAFF_CENTER_Y;
        const baseYs = pending.map(e =>
          stemUp ? e.notes[e.notes.length - 1].y : e.notes[0].y
        );
        const primaryBeamY = stemUp
          ? Math.min(...baseYs.map(y => y - STEM_HEIGHT))
          : Math.max(...baseYs.map(y => y + STEM_HEIGHT));
        allGroups.push({ events: [...pending], stemUp, primaryBeamY });
      }
      pending = [];
      nextStep = -1;
      beat = -1;
      pendingDur = null;
    };

    for (const e of sorted) {
      if (e.isRest) { flush(); continue; }
      const safeLen = normalizeLenForDuration(e.len);
      const dur = lenToDuration(safeLen);
      if (dur !== "8" && dur !== "16") { flush(); continue; }
      const eBeat = Math.floor(e.step / BEAT_STEPS);
      if (e.step === nextStep && eBeat === beat && dur === pendingDur && pending.length > 0) {
        pending.push(e);
      } else {
        flush();
        pending = [e];
        beat = eBeat;
        pendingDur = dur;
      }
      nextStep = e.step + safeLen;
    }
    flush();
  }

  return allGroups;
};

const buildRenderEvents = (
  measuresEvents: TabEvent[][],
  measureStartXs: number[],
  stepWidth: number,
  stepUnit: number
): EventRender[] => {
  return measuresEvents.flatMap((events, measureIndex) =>
    sanitizeEvents(events, STEPS_PER_MEASURE, true)
      .map((event) => {
        const measureStartX = measureStartXs[measureIndex] ?? measureStartXs[0] ?? 0;
        const x = measureStartX + stepWidth * (event.step / stepUnit + 0.5);

        if ("rest" in event && event.rest) {
          return {
            measureIndex,
            step: event.step,
            len: event.len,
            isRest: true,
            notes: [{ x, y: STAFF_CENTER_Y, accidental: "" }],
            dot: event.dot,
            triplet: event.triplet,
          };
        }

        const notes = event.notes
          .map((note) => {
            // string number mapping: 1 = high E (E4), 6 = low E (E2)
            // UI row index mapping: rowIndex 0 => string 1, rowIndex 5 => string 6
            const rowIndex = note.string - 1;
            const openMidi = OPEN_STRING_MIDI_BY_STRING[rowIndex];
            if (rowIndex < 0 || rowIndex > 5 || openMidi === undefined) {
              return null;
            }
            // Guitar notation is written one octave above sounding pitch.
            const writtenMidi = openMidi + note.fret + 12;
            const pos = midiToStaffY(writtenMidi);
            return { x, y: pos.y, accidental: pos.accidental };
          })
          .filter((item): item is NoteRender => item !== null)
          .sort((a, b) => a.y - b.y);

        return {
          measureIndex,
          step: event.step,
          len: event.len,
          isRest: false,
          notes,
          dot: event.dot,
          triplet: event.triplet,
        };
      })
  );
};

const ledgerLineYs = (y: number): number[] => {
  const ys: number[] = [];

  if (y < STAFF_TOP - 1) {
    for (let lineY = STAFF_TOP; lineY >= y; lineY -= STAFF_LINE_GAP) {
      ys.push(lineY);
    }
  }

  if (y > STAFF_BOTTOM + 1) {
    for (let lineY = STAFF_BOTTOM; lineY <= y; lineY += STAFF_LINE_GAP) {
      ys.push(lineY);
    }
  }

  return ys;
};

export default function StaffPreview({
  measuresEvents,
  currentCursor,
  stepWidth,
  stepUnit,
  measureDisplaySlots,
  measureStartXs,
  timelineWidth,
  overflowingMeasures = new Set<number>(),
  showClef = true,
  showBarLines = true,
  keySignature = "C",
}: StaffPreviewProps) {
  const measureCount = Math.max(1, measuresEvents.length);
  const width = timelineWidth;
  const viewBoxHeight = STAFF_VIEWBOX_HEIGHT;
  const labelWidth = measureStartXs[0] ?? 0;

  const renderEvents = useMemo(
    () => buildRenderEvents(measuresEvents, measureStartXs, stepWidth, stepUnit),
    [measuresEvents, measureStartXs, stepWidth, stepUnit]
  );

  const beamGroups = useMemo(() => computeBeamGroups(renderEvents), [renderEvents]);

  const beamMembership = useMemo(() => {
    const map = new Map<string, { stemUp: boolean; stemTipY: number }>();
    for (const group of beamGroups) {
      for (const e of group.events) {
        map.set(`${e.measureIndex}-${e.step}`, { stemUp: group.stemUp, stemTipY: group.primaryBeamY });
      }
    }
    return map;
  }, [beamGroups]);

  const activeSlot =
    currentCursor === null
      ? null
      : {
          measureIndex: currentCursor.measureIndex,
          slotIndex: Math.floor(currentCursor.stepIndex / stepUnit),
        };

  return (
    <section className={styles.staffBlock}>
      <svg className={styles.canvas} width="100%" viewBox={`0 0 ${width} ${viewBoxHeight}`} preserveAspectRatio="xMinYMin meet">
        <rect x={0} y={0} width={width} height={viewBoxHeight} fill="transparent" />

        {activeSlot !== null &&
          activeSlot.slotIndex >= 0 &&
          activeSlot.slotIndex <
            (measureDisplaySlots[activeSlot.measureIndex] ??
              Math.ceil(STEPS_PER_MEASURE / stepUnit)) && (
          <rect
            x={(measureStartXs[activeSlot.measureIndex] ?? labelWidth) + stepWidth * activeSlot.slotIndex}
            y={10}
            width={stepWidth}
            height={viewBoxHeight - 20}
            fill="#fff0c688"
          />
        )}

        {Array.from({ length: STAFF_LINES }, (_, i) => {
          const y = STAFF_TOP + STAFF_LINE_GAP * i;
          return (
            <line
              key={`staff-line-${i}`}
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              stroke="#5e6a77"
              strokeWidth={1}
            />
          );
        })}

        {showBarLines &&
          Array.from({ length: measureCount + 1 }, (_, measureIndex) => {
            const x = measureStartXs[measureIndex] ?? width;
            const boundaryMeasureIndex =
              measureIndex === measureCount ? measureCount - 1 : measureIndex;
            return (
              <line
                key={`bar-line-${measureIndex}`}
                x1={x}
                x2={x}
                y1={STAFF_TOP}
                y2={STAFF_BOTTOM}
                stroke={
                  overflowingMeasures.has(boundaryMeasureIndex) ? "#d0021b" : "#1c2f42"
                }
                strokeWidth={2}
              />
            );
          })}

        {showClef && (
          <text x={labelWidth * 0.45} y={STAFF_BOTTOM + 10} fontSize={120} textAnchor="middle" fill="#111">
            𝄞
          </text>
        )}

        {showClef && (() => {
          const counts = KEY_ACCIDENTAL_COUNTS[keySignature];
          if (!counts) return null;
          const { sharps, flats } = counts;
          if (sharps === 0 && flats === 0) return null;
          const isSharp = sharps > 0;
          const count = isSharp ? sharps : flats;
          const ys = isSharp ? SHARP_YS : FLAT_YS;
          const symbol = isSharp ? "♯" : "♭";
          const xStart = labelWidth * KEY_SIG_X_START_RATIO;
          return (
            <g>
              {Array.from({ length: count }, (_, i) => (
                <text
                  key={`keysig-${i}`}
                  x={xStart + i * KEY_SIG_SPACING}
                  y={ys[i]! + KEY_SIG_FONT_SIZE * 0.35}
                  fontSize={KEY_SIG_FONT_SIZE}
                  textAnchor="middle"
                  fill="#111"
                  fontWeight={700}
                >
                  {symbol}
                </text>
              ))}
            </g>
          );
        })()}

        {renderEvents.map((event) => {
          const safeLen = normalizeLenForDuration(event.len);
          const duration = lenToDuration(safeLen) ?? "16";
          if (event.isRest) {
            const rest = event.notes[0];
            if (!rest) {
              return null;
            }
            const isActive =
              currentCursor !== null &&
              currentCursor.measureIndex === event.measureIndex &&
              currentCursor.stepIndex === event.step;
            const fill = isActive ? "#b34700" : "#111";
            const RestComponent =
              duration === "w" ? RestWhole
              : duration === "h" ? RestHalf
              : duration === "q" ? RestQuarter
              : duration === "8" ? RestEighth
              : RestSixteenth;
            return (
              <g key={`rest-${event.measureIndex}-${event.step}`}>
                <RestComponent x={rest.x} y={rest.y} fill={fill} />
                {event.dot && (
                  <circle cx={rest.x + 10} cy={STAFF_CENTER_Y} r={2} fill={fill} />
                )}
                {event.triplet && (
                  <text x={rest.x} y={STAFF_TOP - 6} fontSize={10} fontWeight={700} textAnchor="middle" fill={fill}>
                    3
                  </text>
                )}
              </g>
            );
          }

          if (event.notes.length === 0) {
            return null;
          }

          const isActive =
            currentCursor !== null &&
            currentCursor.measureIndex === event.measureIndex &&
            currentCursor.stepIndex === event.step;
          const beamInfo = beamMembership.get(`${event.measureIndex}-${event.step}`);
          const stemUp = beamInfo ? beamInfo.stemUp : event.notes[0].y > STAFF_CENTER_Y;
          const stemX = stemUp ? event.notes[event.notes.length - 1].x + NOTE_RADIUS_X : event.notes[0].x - NOTE_RADIUS_X;
          const stemBaseY = stemUp ? event.notes[event.notes.length - 1].y : event.notes[0].y;
          const stemTipY = beamInfo ? beamInfo.stemTipY : (stemUp ? stemBaseY - STEM_HEIGHT : stemBaseY + STEM_HEIGHT);
          const noteFill = duration === "w" || duration === "h" ? "#ffffff" : isActive ? "#d35400" : "#111";
          const noteStroke = isActive ? "#d35400" : "#111";
          const needStem = duration !== "w";
          const flagCount = beamInfo ? 0 : (duration === "16" ? 2 : duration === "8" ? 1 : 0);

          return (
            <g key={`note-${event.measureIndex}-${event.step}`}>
              {event.notes.map((note, idx) => (
                <g key={`head-${event.measureIndex}-${event.step}-${idx}`}>
                  {ledgerLineYs(note.y).map((lineY) => (
                    <line
                      key={`ledger-${event.measureIndex}-${event.step}-${idx}-${lineY}`}
                      x1={note.x - 9}
                      x2={note.x + 9}
                      y1={lineY}
                      y2={lineY}
                      stroke="#111"
                      strokeWidth={1.2}
                    />
                  ))}
                  {note.accidental && (
                    <text
                      x={note.x - 12}
                      y={note.y + 4}
                      fontSize={16}
                      textAnchor="middle"
                      fill={isActive ? "#b34700" : "#111"}
                    >
                      {note.accidental}
                    </text>
                  )}
                  <ellipse
                    cx={note.x}
                    cy={note.y}
                    rx={NOTE_RADIUS_X}
                    ry={NOTE_RADIUS_Y}
                    fill={noteFill}
                    stroke={noteStroke}
                    strokeWidth={1.3}
                    transform={`rotate(-20 ${note.x} ${note.y})`}
                  />
                </g>
              ))}
              {needStem && (
                <line
                  x1={stemX}
                  x2={stemX}
                  y1={stemBaseY}
                  y2={stemTipY}
                  stroke={noteStroke}
                  strokeWidth={1.5}
                />
              )}
              {needStem &&
                flagCount > 0 &&
                Array.from({ length: flagCount }, (_, i) => {
                  const offset = i * 7;
                  const startY = stemUp ? stemTipY + offset : stemTipY - offset;
                  const c1Y = stemUp ? startY + 4 : startY - 4;
                  const endY = stemUp ? startY + 8 : startY - 8;
                  const endX = stemUp ? stemX + 9 : stemX - 9;
                  return (
                    <path
                      key={`flag-${event.measureIndex}-${event.step}-${i}`}
                      d={`M ${stemX} ${startY} Q ${stemX} ${c1Y} ${endX} ${endY}`}
                      fill="none"
                      stroke={noteStroke}
                      strokeWidth={1.4}
                      strokeLinecap="round"
                    />
                  );
                })}
              {/* Dotted note indicator */}
              {event.dot && event.notes.map((note, idx) => (
                <circle
                  key={`dot-${event.measureIndex}-${event.step}-${idx}`}
                  cx={note.x + NOTE_RADIUS_X + 5}
                  cy={note.y}
                  r={2}
                  fill={noteStroke}
                />
              ))}
              {/* Triplet indicator */}
              {event.triplet && (
                <text
                  x={event.notes[0].x}
                  y={stemUp ? stemTipY - 4 : stemTipY + 12}
                  fontSize={10}
                  fontWeight={700}
                  textAnchor="middle"
                  fill={noteStroke}
                >
                  3
                </text>
              )}
            </g>
          );
        })}

        {beamGroups.map((group) => {
          const first = group.events[0];
          const last = group.events[group.events.length - 1];
          if (!first || !last) return null;
          const noteX = (e: EventRender) => e.notes[0]?.x ?? 0;
          const stemXOf = (e: EventRender) =>
            group.stemUp ? noteX(e) + NOTE_RADIUS_X : noteX(e) - NOTE_RADIUS_X;
          const x1 = stemXOf(first);
          const x2 = stemXOf(last);
          const safeLen = normalizeLenForDuration(first.len);
          const has2Beams = lenToDuration(safeLen) === "16";
          const secondaryY = group.stemUp
            ? group.primaryBeamY + BEAM_GAP
            : group.primaryBeamY - BEAM_GAP;
          return (
            <g key={`beam-group-${first.measureIndex}-${first.step}`}>
              <line x1={x1} x2={x2} y1={group.primaryBeamY} y2={group.primaryBeamY} stroke="#111" strokeWidth={BEAM_THICKNESS} strokeLinecap="butt" />
              {has2Beams && (
                <line x1={x1} x2={x2} y1={secondaryY} y2={secondaryY} stroke="#111" strokeWidth={BEAM_THICKNESS} strokeLinecap="butt" />
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
