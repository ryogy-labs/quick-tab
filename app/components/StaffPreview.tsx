"use client";

import { useMemo } from "react";
import styles from "./StaffPreview.module.css";
import { OPEN_STRING_MIDI_BY_STRING, STEPS_PER_MEASURE, TabEvent, sanitizeEvents } from "../tabModel";

type StaffPreviewProps = {
  measuresEvents: TabEvent[][];
  currentCursor: { measureIndex: number; stepIndex: number } | null;
  labelWidth: number;
  stepWidth: number;
  stepUnit: number;
  showClef?: boolean;
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
type SupportedLen = 1 | 2 | 4 | 8 | 16;

const STAFF_LINE_GAP = 12;
const STAFF_TOP = 76;
const STAFF_LINES = 5;
const NOTE_RADIUS_X = 6;
const NOTE_RADIUS_Y = 4.4;
const STEM_HEIGHT = 30;

const STAFF_BOTTOM = STAFF_TOP + STAFF_LINE_GAP * (STAFF_LINES - 1);
const STAFF_CENTER_Y = (STAFF_TOP + STAFF_BOTTOM) / 2;

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
  1: "16",
  2: "8",
  4: "q",
  8: "h",
  16: "w",
};

const SUPPORTED_LENS: SupportedLen[] = [1, 2, 4, 8, 16];

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

const buildRenderEvents = (
  measuresEvents: TabEvent[][],
  labelWidth: number,
  stepWidth: number,
  stepUnit: number,
  measureWidth: number
): EventRender[] => {
  return measuresEvents.flatMap((events, measureIndex) =>
    sanitizeEvents(events, STEPS_PER_MEASURE)
      .map((event) => {
        const x =
          labelWidth + measureWidth * measureIndex + stepWidth * (event.step / stepUnit + 0.5);

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
  labelWidth,
  stepWidth,
  stepUnit,
  showClef = true,
}: StaffPreviewProps) {
  const displaySlots = STEPS_PER_MEASURE / stepUnit;
  const measureCount = Math.max(1, measuresEvents.length);
  const measureWidth = stepWidth * displaySlots;
  const width = labelWidth + measureWidth * measureCount;
  const height = 175;

  const renderEvents = useMemo(
    () => buildRenderEvents(measuresEvents, labelWidth, stepWidth, stepUnit, measureWidth),
    [measuresEvents, labelWidth, stepWidth, stepUnit, measureWidth]
  );

  const activeSlot =
    currentCursor === null
      ? null
      : {
          measureIndex: currentCursor.measureIndex,
          slotIndex: Math.floor(currentCursor.stepIndex / stepUnit),
        };

  return (
    <section className={styles.staffBlock}>
      <svg className={styles.canvas} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin slice" overflow="hidden">
        <rect x={0} y={0} width={width} height={height} fill="transparent" />

        {activeSlot !== null &&
          activeSlot.slotIndex >= 0 &&
          activeSlot.slotIndex < displaySlots && (
          <rect
            x={labelWidth + measureWidth * activeSlot.measureIndex + stepWidth * activeSlot.slotIndex}
            y={10}
            width={stepWidth}
            height={height - 20}
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

        {Array.from({ length: measureCount + 1 }, (_, measureIndex) => {
          const x = labelWidth + measureWidth * measureIndex;
          return (
            <line
              key={`bar-line-${measureIndex}`}
              x1={x}
              x2={x}
              y1={STAFF_TOP}
              y2={STAFF_BOTTOM}
              stroke="#1c2f42"
              strokeWidth={2}
            />
          );
        })}

        {showClef && (
          <text x={labelWidth * 0.45} y={STAFF_BOTTOM + 10} fontSize={120} textAnchor="middle" fill="#111">
            𝄞
          </text>
        )}

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
          const stemUp = event.notes[0].y > STAFF_CENTER_Y;
          const stemX = stemUp ? event.notes[event.notes.length - 1].x + NOTE_RADIUS_X : event.notes[0].x - NOTE_RADIUS_X;
          const stemBaseY = stemUp ? event.notes[event.notes.length - 1].y : event.notes[0].y;
          const stemTipY = stemUp ? stemBaseY - STEM_HEIGHT : stemBaseY + STEM_HEIGHT;
          const noteFill = duration === "w" || duration === "h" ? "#ffffff" : isActive ? "#d35400" : "#111";
          const noteStroke = isActive ? "#d35400" : "#111";
          const needStem = duration !== "w";
          const flagCount = duration === "16" ? 2 : duration === "8" ? 1 : 0;

          return (
            <g key={`note-${event.step}`}>
              {event.notes.map((note, idx) => (
                <g key={`head-${event.step}-${idx}`}>
                  {ledgerLineYs(note.y).map((lineY) => (
                    <line
                      key={`ledger-${event.step}-${idx}-${lineY}`}
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
                      key={`flag-${event.step}-${i}`}
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
                  key={`dot-${event.step}-${idx}`}
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
      </svg>
    </section>
  );
}
