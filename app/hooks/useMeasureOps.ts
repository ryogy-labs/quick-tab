"use client";

import { Dispatch, SetStateAction, useState } from "react";
import {
  CellPosition,
  STEPS_PER_MEASURE,
  STRINGS_COUNT,
  StepRangeClipboard,
  StepRangeSelection,
  TabDataV3,
  TabMeasureV3,
  copyMeasure,
  deleteMeasure,
  duplicateMeasure,
  extractRangeClipboardFromMeasure,
  getMeasureEvents,
  insertMeasure,
  pasteMeasure,
  pasteRangeClipboardIntoMeasure,
  updateMeasureEvents,
} from "../tabModel";

type UseMeasureOpsParams = {
  tabData: TabDataV3;
  commitTabData: (data: TabDataV3) => void;
  isPlaying: boolean;
  selected: CellPosition;
  setSelected: Dispatch<SetStateAction<CellPosition>>;
  selectedMeasureIndex: number;
  totalMeasures: number;
  selectedRange: StepRangeSelection | null;
  measureDisplayStepsByMeasure: number[];
  getClampedDisplayStep: (stepIndex: number, measureIndex: number) => number;
};

/**
 * Measure navigation, add/insert/delete/duplicate, and measure/range
 * clipboard operations. Clipboards are in-memory only and do not survive
 * a reload.
 */
export function useMeasureOps({
  tabData,
  commitTabData,
  isPlaying,
  selected,
  setSelected,
  selectedMeasureIndex,
  totalMeasures,
  selectedRange,
  measureDisplayStepsByMeasure,
  getClampedDisplayStep,
}: UseMeasureOpsParams) {
  const [measureClipboard, setMeasureClipboard] = useState<TabMeasureV3 | null>(null);
  const [rangeClipboard, setRangeClipboard] = useState<StepRangeClipboard | null>(null);

  const handlePrevMeasure = () => {
    if (isPlaying || selectedMeasureIndex <= 0) {
      return;
    }
    setSelected((prev) => {
      const nextMeasureIndex = Math.max(0, prev.measureIndex - 1);
      return {
        ...prev,
        measureIndex: nextMeasureIndex,
        rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
        stepIndex: getClampedDisplayStep(prev.stepIndex, nextMeasureIndex),
      };
    });
  };

  const handleNextMeasure = () => {
    if (isPlaying) {
      return;
    }

    if (selectedMeasureIndex >= totalMeasures - 1) {
      commitTabData({
        ...tabData,
        measures: [...tabData.measures, { events: [] }],
      });
      setSelected((prev) => ({
        ...prev,
        measureIndex: totalMeasures,
        rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
        stepIndex: 0,
      }));
      return;
    }

    setSelected((prev) => {
      const nextMeasureIndex = Math.min(totalMeasures - 1, prev.measureIndex + 1);
      return {
        ...prev,
        measureIndex: nextMeasureIndex,
        rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
        stepIndex: getClampedDisplayStep(prev.stepIndex, nextMeasureIndex),
      };
    });
  };

  const handleAddMeasure = () => {
    if (isPlaying) {
      return;
    }
    const nextMeasureIndex = totalMeasures;
    commitTabData({
      ...tabData,
      measures: [...tabData.measures, { events: [] }],
    });
    setSelected({
      measureIndex: nextMeasureIndex,
      rowIndex: 0,
      stepIndex: 0,
    });
  };

  const handleInsertMeasure = () => {
    if (isPlaying) {
      return;
    }

    commitTabData(insertMeasure(tabData, selectedMeasureIndex));
    setSelected({
      measureIndex: selectedMeasureIndex,
      rowIndex: 0,
      stepIndex: 0,
    });
  };

  const handleDuplicateMeasure = () => {
    if (isPlaying) {
      return;
    }

    commitTabData(duplicateMeasure(tabData, selectedMeasureIndex));
    setSelected((prev) => ({
      ...prev,
      measureIndex: Math.min(totalMeasures, selectedMeasureIndex + 1),
    }));
  };

  const handleDeleteMeasure = () => {
    if (isPlaying || totalMeasures <= 1) {
      return;
    }

    commitTabData(deleteMeasure(tabData, selectedMeasureIndex));
    setSelected((prev) => ({
      ...prev,
      measureIndex: Math.min(selectedMeasureIndex, totalMeasures - 2),
      rowIndex: Math.max(0, Math.min(STRINGS_COUNT - 1, prev.rowIndex)),
      stepIndex: getClampedDisplayStep(
        prev.stepIndex,
        Math.min(selectedMeasureIndex, totalMeasures - 2)
      ),
    }));
  };

  const handleCopyMeasure = () => {
    setMeasureClipboard(copyMeasure(tabData, selectedMeasureIndex));
  };

  const handlePasteMeasure = () => {
    if (!measureClipboard || isPlaying) {
      return;
    }

    commitTabData(pasteMeasure(tabData, selectedMeasureIndex, measureClipboard));
  };

  const handleCopyRange = () => {
    if (!selectedRange) {
      return;
    }
    const sourceEvents = getMeasureEvents(tabData, selectedRange.startMeasureIndex);
    setRangeClipboard(extractRangeClipboardFromMeasure(sourceEvents, selectedRange));
  };

  const handlePasteRange = () => {
    if (!rangeClipboard || isPlaying) {
      return;
    }

    const targetDisplaySteps =
      measureDisplayStepsByMeasure[selectedMeasureIndex] ?? STEPS_PER_MEASURE;
    const measureEvents = getMeasureEvents(tabData, selectedMeasureIndex);
    const nextEvents = pasteRangeClipboardIntoMeasure(
      measureEvents,
      selected.stepIndex,
      rangeClipboard,
      targetDisplaySteps
    );
    commitTabData(updateMeasureEvents(tabData, selectedMeasureIndex, nextEvents));
  };

  return {
    measureClipboard,
    rangeClipboard,
    handlePrevMeasure,
    handleNextMeasure,
    handleAddMeasure,
    handleInsertMeasure,
    handleDuplicateMeasure,
    handleDeleteMeasure,
    handleCopyMeasure,
    handlePasteMeasure,
    handleCopyRange,
    handlePasteRange,
  };
}
