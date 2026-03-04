"use client";

import { useMemo } from "react";
import styles from "./StaffPreview.module.css";
import { OPEN_STRING_MIDI_BY_STRING, STEPS_PER_MEASURE, TabEvent } from "../tabModel";

type StaffPreviewProps = {
  events: TabEvent[];
  currentStep: number | null;
  labelWidth: number;
  stepWidth: number;
  stepUnit: number;
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
  step: number;
  len: number;
  isRest: boolean;
  notes: NoteRender[];
};

type DurationToken = "w" | "h" | "q" | "8" | "16";

const STAFF_LINE_GAP = 12;
const STAFF_TOP = 26;
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

const normalizeDuration = (len: number): DurationToken => {
  if (len >= 12) {
    return "w";
  }
  if (len >= 6) {
    return "h";
  }
  if (len >= 3) {
    return "q";
  }
  if (len >= 2) {
    return "8";
  }
  return "16";
};

const restLabel = (duration: DurationToken): string => {
  switch (duration) {
    case "w":
      return "Rw";
    case "h":
      return "Rh";
    case "q":
      return "Rq";
    case "8":
      return "R8";
    case "16":
    default:
      return "R16";
  }
};

const buildRenderEvents = (
  events: TabEvent[],
  labelWidth: number,
  stepWidth: number,
  stepUnit: number
): EventRender[] => {
  return [...events]
    .filter((event) => event.step >= 0 && event.step < STEPS_PER_MEASURE)
    .sort((a, b) => a.step - b.step)
    .map((event) => {
      const x = labelWidth + stepWidth * (event.step / stepUnit + 0.5);

      if ("rest" in event && event.rest) {
        return {
          step: event.step,
          len: event.len,
          isRest: true,
          notes: [{ x, y: STAFF_CENTER_Y, accidental: "" }],
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
        step: event.step,
        len: event.len,
        isRest: false,
        notes,
      };
    });
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
  events,
  currentStep,
  labelWidth,
  stepWidth,
  stepUnit,
}: StaffPreviewProps) {
  const displaySlots = STEPS_PER_MEASURE / stepUnit;
  const width = labelWidth + stepWidth * displaySlots;
  const height = 140;

  const renderEvents = useMemo(
    () => buildRenderEvents(events, labelWidth, stepWidth, stepUnit),
    [events, labelWidth, stepWidth, stepUnit]
  );

  const activeSlot = currentStep === null ? -1 : Math.floor(currentStep / stepUnit);

  return (
    <section className={styles.staffBlock}>
      <svg className={styles.canvas} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <rect x={0} y={0} width={width} height={height} fill="transparent" />

        {activeSlot >= 0 && activeSlot < displaySlots && (
          <rect
            x={labelWidth + stepWidth * activeSlot}
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

        {[0, 16].map((step) => {
          const x = labelWidth + stepWidth * (step / stepUnit);
          return (
            <line
              key={`bar-line-${step}`}
              x1={x}
              x2={x}
              y1={STAFF_TOP}
              y2={STAFF_BOTTOM}
              stroke="#1c2f42"
              strokeWidth={2}
            />
          );
        })}

        <text x={labelWidth * 0.45} y={STAFF_TOP + 28} fontSize={44} textAnchor="middle" fill="#111">
          𝄞
        </text>

        {renderEvents.map((event) => {
          const duration = normalizeDuration(event.len);
          if (event.isRest) {
            const rest = event.notes[0];
            if (!rest) {
              return null;
            }
            const isActive = event.step === currentStep;
            return (
              <text
                key={`rest-${event.step}`}
                x={rest.x}
                y={rest.y + 6}
                fontSize={14}
                textAnchor="middle"
                fill={isActive ? "#b34700" : "#111"}
              >
                {restLabel(duration)}
              </text>
            );
          }

          if (event.notes.length === 0) {
            return null;
          }

          const isActive = event.step === currentStep;
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
            </g>
          );
        })}
      </svg>
    </section>
  );
}
