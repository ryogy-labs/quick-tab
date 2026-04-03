"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  OPEN_STRING_MIDI_BY_STRING,
  STEPS_PER_MEASURE,
  TabDataV3,
  TabEvent,
  findEventAtStep,
  getEventOccupiedSteps,
  getPlaybackDuration,
  toFrequency,
} from "../tabModel";

export type PlayCursor = {
  measureIndex: number;
  stepIndex: number;
};

type UsePlaybackOptions = {
  tabData: TabDataV3;
  selectedMeasureIndex: number;
  overflowingMeasureSet: Set<number>;
  onPlaybackEnd: () => void;
};

export function usePlayback({
  tabData,
  selectedMeasureIndex,
  overflowingMeasureSet,
  onPlaybackEnd,
}: UsePlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCursor, setPlayCursor] = useState<PlayCursor | null>(null);

  const intervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Use a ref so the interval closure always reads the latest callback
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  onPlaybackEndRef.current = onPlaybackEnd;

  const stopPlayback = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
    setPlayCursor(null);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const playEvent = useCallback(async (event: TabEvent, tempo: number) => {
    if ("rest" in event && event.rest) {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const context = audioContextRef.current;
    if (context.state === "suspended") {
      await context.resume();
    }

    const stepSec = (60 / tempo) / (STEPS_PER_MEASURE / 4);
    const durationSec = stepSec * getPlaybackDuration(event);
    const now = context.currentTime;

    event.notes.forEach((note) => {
      const rowIndex = note.string - 1;
      const openMidi = OPEN_STRING_MIDI_BY_STRING[rowIndex];
      if (!openMidi) {
        return;
      }

      const midi = openMidi + note.fret;
      const frequency = toFrequency(midi);

      const osc = context.createOscillator();
      const gain = context.createGain();

      osc.type = "triangle";
      osc.frequency.value = frequency;

      const attackEnd = now + 0.005;
      const sustainEnd = now + durationSec * 0.95;
      const releaseEnd = now + durationSec;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, attackEnd);
      gain.gain.linearRampToValueAtTime(0.15, sustainEnd);
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(releaseEnd + 0.01);
    });
  }, []);

  const playNotePreview = useCallback(
    (data: TabDataV3, measureIndex: number, stepIndex: number) => {
      const evts = data.measures.at(measureIndex)?.events ?? [];
      const evt = findEventAtStep(evts, stepIndex);
      if (evt) {
        void playEvent(evt, data.tempo);
      }
    },
    [playEvent]
  );

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const isAtEnd = selectedMeasureIndex >= tabData.measures.length - 1;
    const startMeasureIndex = isAtEnd ? 0 : selectedMeasureIndex;
    let linearIndex = startMeasureIndex * STEPS_PER_MEASURE;
    const endLinearExclusive = tabData.measures.length * STEPS_PER_MEASURE;
    const tempo = tabData.tempo;
    const stepDurationMs = (60_000 / tempo) / (STEPS_PER_MEASURE / 4);
    const measuresForPlayback = tabData.measures.map((measure) => measure.events);
    const overflowingMeasuresForPlayback = new Set(overflowingMeasureSet);

    setIsPlaying(true);
    const initialCursor = {
      measureIndex: Math.floor(linearIndex / STEPS_PER_MEASURE),
      stepIndex: linearIndex % STEPS_PER_MEASURE,
    };
    setPlayCursor(initialCursor);

    const firstEvents = measuresForPlayback[initialCursor.measureIndex] ?? [];
    const firstEvent = findEventAtStep(firstEvents, initialCursor.stepIndex);
    if (firstEvent) {
      void playEvent(firstEvent, tempo);
    }

    intervalRef.current = window.setInterval(() => {
      linearIndex += 1;
      if (linearIndex >= endLinearExclusive) {
        stopPlayback();
        onPlaybackEndRef.current();
        return;
      }

      let cursorMeasureIndex = Math.floor(linearIndex / STEPS_PER_MEASURE);
      let cursorStepIndex = linearIndex % STEPS_PER_MEASURE;

      if (overflowingMeasuresForPlayback.has(cursorMeasureIndex)) {
        const eventsForMeasure = measuresForPlayback[cursorMeasureIndex] ?? [];
        const occupied = eventsForMeasure
          .filter((event) => event.step <= cursorStepIndex)
          .reduce((sum, event) => sum + getEventOccupiedSteps(event), 0);

        if (occupied >= STEPS_PER_MEASURE) {
          linearIndex = (cursorMeasureIndex + 1) * STEPS_PER_MEASURE;
          if (linearIndex >= endLinearExclusive) {
            stopPlayback();
            onPlaybackEndRef.current();
            return;
          }
          cursorMeasureIndex = Math.floor(linearIndex / STEPS_PER_MEASURE);
          cursorStepIndex = linearIndex % STEPS_PER_MEASURE;
        }
      }

      const cursor = { measureIndex: cursorMeasureIndex, stepIndex: cursorStepIndex };
      setPlayCursor(cursor);

      const eventsForMeasure = measuresForPlayback[cursor.measureIndex] ?? [];
      const current = findEventAtStep(eventsForMeasure, cursor.stepIndex);
      if (current) {
        void playEvent(current, tempo);
      }
    }, stepDurationMs);
  }, [isPlaying, stopPlayback, tabData, selectedMeasureIndex, overflowingMeasureSet, playEvent]);

  return { isPlaying, playCursor, handlePlay, stopPlayback, playNotePreview };
}
