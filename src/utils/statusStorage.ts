import type {
  FirstLineResult,
  FirstLineStatusMap,
} from "../types.ts";

export const FIRST_LINE_STATUSES_STORAGE_KEY = "opic-first-line-statuses";

const VALID_STATUSES = new Set<FirstLineResult>([
  "success",
  "again",
  "hard",
]);

export function normalizeStatuses(value: unknown): FirstLineStatusMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([cardId, status]) =>
        cardId.trim().length > 0 && VALID_STATUSES.has(status as FirstLineResult),
    ),
  ) as FirstLineStatusMap;
}

export function saveStatuses(statuses: FirstLineStatusMap) {
  try {
    localStorage.setItem(
      FIRST_LINE_STATUSES_STORAGE_KEY,
      JSON.stringify(normalizeStatuses(statuses)),
    );
  } catch {
    // Current in-memory status remains usable when storage is unavailable.
  }
}

export function readStoredStatuses(): FirstLineStatusMap {
  try {
    const rawValue = localStorage.getItem(FIRST_LINE_STATUSES_STORAGE_KEY);
    return rawValue ? normalizeStatuses(JSON.parse(rawValue)) : {};
  } catch {
    return {};
  }
}
