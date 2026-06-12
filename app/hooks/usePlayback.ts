"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  OPEN_STRING_MIDI_BY_STRING,
  TICKS_PER_QUARTER,
  TabData,
  TabEvent,
  findEventAtStep,
  getDataMeasureTicks,
  getTrackMeasures,
  getEventOccupiedSteps,
  getPlaybackDuration,
  toFrequency,
} from "../tabModel";

export type PlayCursor = {
  measureIndex: number;
  stepIndex: number;
};

type UsePlaybackOptions = {
  tabData: TabData;
  selectedMeasureIndex: number;
  overflowingMeasureSet: Set<number>;
  onPlaybackEnd: () => void;
};

const noteKey = (note: { string: number; fret: number }) => `${note.string}:${note.fret}`;

const toLinearStep = (measureIndex: number, stepIndex: number, measureTicks: number) =>
  measureIndex * measureTicks + stepIndex;

const getSortedEventsWithPosition = (measures: { events: TabEvent[] }[]) =>
  measures.flatMap((measure, measureIndex) =>
    measure.events.map((event) => ({ event, measureIndex }))
  ).sort((a, b) => {
    const measureDelta = a.measureIndex - b.measureIndex;
    return measureDelta !== 0 ? measureDelta : a.event.step - b.event.step;
  });

const getPlaybackNoteContext = (
  measures: { events: TabEvent[] }[],
  measureIndex: number,
  event: TabEvent,
  measureTicks: number
) => {
  if ("rest" in event && event.rest) {
    return { mutedNotes: new Set<string>(), durationByNote: new Map<string, number>() };
  }

  const positioned = getSortedEventsWithPosition(measures);
  const eventIndex = positioned.findIndex(
    (item) => item.measureIndex === measureIndex && item.event.step === event.step
  );
  const mutedNotes = new Set<string>();
  const durationByNote = new Map<string, number>();

  event.notes.forEach((note) => {
    const key = noteKey(note);
    const previous = positioned
      .slice(0, eventIndex)
      .reverse()
      .find(
        (item) =>
          !("rest" in item.event && item.event.rest) &&
          item.event.notes.some(
            (candidate) => candidate.string === note.string && candidate.fret === note.fret
          )
      );
    if (
      note.tie &&
      previous &&
      !("rest" in previous.event && previous.event.rest)
    ) {
      mutedNotes.add(key);
    }

    if (note.tie) {
      return;
    }

    let lastMeasureIndex = measureIndex;
    let lastEvent = event;
    let nextSearchIndex = eventIndex + 1;
    while (nextSearchIndex < positioned.length) {
      const next = positioned[nextSearchIndex];
      if (!next || ("rest" in next.event && next.event.rest)) {
        nextSearchIndex += 1;
        continue;
      }
      const nextNote = next.event.notes.find(
        (candidate) => candidate.string === note.string && candidate.fret === note.fret
      );
      if (!nextNote) {
        nextSearchIndex += 1;
        continue;
      }
      if (!nextNote.tie) {
        break;
      }
      lastMeasureIndex = next.measureIndex;
      lastEvent = next.event;
      nextSearchIndex += 1;
    }

    const start = toLinearStep(measureIndex, event.step, measureTicks);
    const end =
      toLinearStep(lastMeasureIndex, lastEvent.step, measureTicks) +
      getPlaybackDuration(lastEvent);
    durationByNote.set(key, Math.max(getPlaybackDuration(event), end - start));
  });

  return { mutedNotes, durationByNote };
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

  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
  }, [onPlaybackEnd]);

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

  const playEvent = useCallback(async (
    event: TabEvent,
    tempo: number,
    options: {
      mutedNotes?: Set<string>;
      durationByNote?: Map<string, number>;
    } = {}
  ) => {
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

    const stepSec = 60 / tempo / TICKS_PER_QUARTER;
    const now = context.currentTime;

    event.notes.forEach((note) => {
      const key = noteKey(note);
      if (options.mutedNotes?.has(key)) {
        return;
      }

      const rowIndex = note.string - 1;
      const openMidi = OPEN_STRING_MIDI_BY_STRING[rowIndex];
      if (!openMidi) {
        return;
      }

      const midi = openMidi + note.fret;
      const frequency = toFrequency(midi);

      const osc = context.createOscillator();
      const gain = context.createGain();
      const durationSteps = options.durationByNote?.get(key) ?? getPlaybackDuration(event);
      const durationSec = stepSec * durationSteps;

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
    (data: TabData, previewTrackIndex: number, measureIndex: number, stepIndex: number) => {
      const trackMeasures = getTrackMeasures(data, previewTrackIndex);
      const evts = trackMeasures.at(measureIndex)?.events ?? [];
      const evt = findEventAtStep(evts, stepIndex);
      if (evt) {
        const context = getPlaybackNoteContext(
          trackMeasures,
          measureIndex,
          evt,
          getDataMeasureTicks(data)
        );
        void playEvent(evt, data.tempo, context);
      }
    },
    [playEvent]
  );

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const measureTicks = getDataMeasureTicks(tabData);
    const measureCount = getTrackMeasures(tabData, 0).length;
    const isAtEnd = selectedMeasureIndex >= measureCount - 1;
    const startMeasureIndex = isAtEnd ? 0 : selectedMeasureIndex;
    let linearIndex = startMeasureIndex * measureTicks;
    const endLinearExclusive = measureCount * measureTicks;
    const tempo = tabData.tempo;
    const stepDurationMs = 60_000 / tempo / TICKS_PER_QUARTER;
    // All tracks play together (mixed); the cursor itself is track-agnostic.
    const playbackTracks = tabData.tracks.map((track) => ({
      measures: track.measures,
      events: track.measures.map((measure) => measure.events),
    }));
    const overflowingMeasuresForPlayback = new Set(overflowingMeasureSet);

    setIsPlaying(true);
    const initialCursor = {
      measureIndex: Math.floor(linearIndex / measureTicks),
      stepIndex: linearIndex % measureTicks,
    };
    setPlayCursor(initialCursor);

    playbackTracks.forEach((track) => {
      const firstEvents = track.events[initialCursor.measureIndex] ?? [];
      const firstEvent = findEventAtStep(firstEvents, initialCursor.stepIndex);
      if (firstEvent) {
        const context = getPlaybackNoteContext(
          track.measures,
          initialCursor.measureIndex,
          firstEvent,
          measureTicks
        );
        void playEvent(firstEvent, tempo, context);
      }
    });

    intervalRef.current = window.setInterval(() => {
      linearIndex += 1;
      if (linearIndex >= endLinearExclusive) {
        stopPlayback();
        onPlaybackEndRef.current();
        return;
      }

      let cursorMeasureIndex = Math.floor(linearIndex / measureTicks);
      let cursorStepIndex = linearIndex % measureTicks;

      if (overflowingMeasuresForPlayback.has(cursorMeasureIndex)) {
        // Skip the overflow remainder only once every track's content has
        // finished within this measure.
        const occupied = Math.max(
          ...playbackTracks.map((track) =>
            (track.events[cursorMeasureIndex] ?? [])
              .filter((event) => event.step <= cursorStepIndex)
              .reduce((sum, event) => sum + getEventOccupiedSteps(event), 0)
          )
        );

        if (occupied >= measureTicks) {
          linearIndex = (cursorMeasureIndex + 1) * measureTicks;
          if (linearIndex >= endLinearExclusive) {
            stopPlayback();
            onPlaybackEndRef.current();
            return;
          }
          cursorMeasureIndex = Math.floor(linearIndex / measureTicks);
          cursorStepIndex = linearIndex % measureTicks;
        }
      }

      const cursor = { measureIndex: cursorMeasureIndex, stepIndex: cursorStepIndex };
      setPlayCursor(cursor);

      playbackTracks.forEach((track) => {
        const eventsForMeasure = track.events[cursor.measureIndex] ?? [];
        const current = findEventAtStep(eventsForMeasure, cursor.stepIndex);
        if (current) {
          const context = getPlaybackNoteContext(
            track.measures,
            cursor.measureIndex,
            current,
            measureTicks
          );
          void playEvent(current, tempo, context);
        }
      });
    }, stepDurationMs);
  }, [isPlaying, stopPlayback, tabData, selectedMeasureIndex, overflowingMeasureSet, playEvent]);

  return { isPlaying, playCursor, handlePlay, stopPlayback, playNotePreview };
}
