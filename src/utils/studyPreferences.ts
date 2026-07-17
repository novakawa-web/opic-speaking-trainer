export type StudyCardScope = "all" | "new";
export type StudyOrder = "default" | "random" | "least-practiced";

export const AUTO_ADVANCE_STORAGE_KEY =
  "opic-auto-advance-after-rating";
export const STUDY_CARD_SCOPE_STORAGE_KEY = "opic-study-card-scope";
export const STUDY_ORDER_STORAGE_KEY = "opic-study-order";

const validScopes = new Set<StudyCardScope>(["all", "new"]);
const validOrders = new Set<StudyOrder>([
  "default",
  "random",
  "least-practiced",
]);

function readBoolean(key: string, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function saveValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The in-memory setting still works when storage is unavailable.
  }
}

export function readAutoAdvanceAfterRating() {
  return readBoolean(AUTO_ADVANCE_STORAGE_KEY);
}

export function saveAutoAdvanceAfterRating(enabled: boolean) {
  saveValue(AUTO_ADVANCE_STORAGE_KEY, String(enabled));
}

export function readStudyCardScope(): StudyCardScope {
  try {
    const value = localStorage.getItem(STUDY_CARD_SCOPE_STORAGE_KEY);
    return validScopes.has(value as StudyCardScope)
      ? (value as StudyCardScope)
      : "all";
  } catch {
    return "all";
  }
}

export function saveStudyCardScope(scope: StudyCardScope) {
  saveValue(STUDY_CARD_SCOPE_STORAGE_KEY, scope);
}

export function readStudyOrder(): StudyOrder {
  try {
    const value = localStorage.getItem(STUDY_ORDER_STORAGE_KEY);
    return validOrders.has(value as StudyOrder)
      ? (value as StudyOrder)
      : "default";
  } catch {
    return "default";
  }
}

export function saveStudyOrder(order: StudyOrder) {
  saveValue(STUDY_ORDER_STORAGE_KEY, order);
}

export function isStudyCardScope(value: unknown): value is StudyCardScope {
  return validScopes.has(value as StudyCardScope);
}

export function isStudyOrder(value: unknown): value is StudyOrder {
  return validOrders.has(value as StudyOrder);
}
