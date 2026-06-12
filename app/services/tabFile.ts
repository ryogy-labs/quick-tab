import { TabData, normalizeToTabData } from "../tabModel";

/** Download the current tab data as a formatted JSON file. */
export const downloadTabDataAsJson = (tabData: TabData): void => {
  const blob = new Blob([JSON.stringify(tabData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quick-tab-v3.json";
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Parse and normalize an imported JSON file into TabData.
 * Returns null when the file is not valid tab data.
 * Throws when the file cannot be read or parsed at all.
 */
export const readTabDataFile = async (file: File): Promise<TabData | null> => {
  const text = await file.text();
  const parsed = JSON.parse(text);
  return normalizeToTabData(parsed, true);
};
