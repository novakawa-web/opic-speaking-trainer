import type { AnswerLearningAnswerSource } from "../types.ts";
import type { StudyOrder } from "./studyPreferences.ts";

export const ANSWER_LEARNING_SESSION_KEY = "opic-answer-learning-session";

export type AnswerLearningStatusFilter =
  | "all"
  | "unlearned"
  | "hard"
  | "learning"
  | "speakable";
export type AnswerPresenceFilter = "all" | "with" | "without";
export type AnswerLearningRevealState = {
  hint: boolean;
  firstLine: boolean;
  answer: boolean;
  frontKo: boolean;
};
export type AnswerLearningFilters = {
  deck: string;
  tag: string;
  finalOnly: boolean;
  answerPresence: AnswerPresenceFilter;
  status: AnswerLearningStatusFilter;
  order: StudyOrder;
};
export type AnswerLearningSession = {
  version: 1;
  screen: "setup" | "learning";
  selectedCardIds: string[];
  cardOrder: string[];
  currentIndex: number;
  filters: AnswerLearningFilters;
  answerSources: Record<string, AnswerLearningAnswerSource>;
  reveals: Record<string, AnswerLearningRevealState>;
};

const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);
const validOrders = new Set<StudyOrder>(["default", "random", "least-practiced"]);
const validStatuses = new Set<AnswerLearningStatusFilter>([
  "all",
  "unlearned",
  "hard",
  "learning",
  "speakable",
]);
const validPresence = new Set<AnswerPresenceFilter>(["all", "with", "without"]);

export const DEFAULT_ANSWER_LEARNING_FILTERS: AnswerLearningFilters = {
  deck: "all",
  tag: "all",
  finalOnly: false,
  answerPresence: "all",
  status: "all",
  order: "default",
};

export function createEmptyAnswerLearningSession(): AnswerLearningSession {
  return {
    version: 1,
    screen: "setup",
    selectedCardIds: [],
    cardOrder: [],
    currentIndex: 0,
    filters: { ...DEFAULT_ANSWER_LEARNING_FILTERS },
    answerSources: {},
    reveals: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeIds(value: unknown, validIds: Set<string>) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && validIds.has(id)))];
}

export function normalizeAnswerLearningSession(
  value: unknown,
  availableCardIds: string[],
): AnswerLearningSession {
  const fallback = createEmptyAnswerLearningSession();
  if (!isRecord(value) || value.version !== 1) return fallback;
  const validIds = new Set(availableCardIds);
  const selectedCardIds = safeIds(value.selectedCardIds, validIds);
  const cardOrder = safeIds(value.cardOrder, validIds).filter((id) => selectedCardIds.includes(id));
  const filtersValue = isRecord(value.filters) ? value.filters : {};
  const filters: AnswerLearningFilters = {
    deck: typeof filtersValue.deck === "string" ? filtersValue.deck : "all",
    tag: typeof filtersValue.tag === "string" ? filtersValue.tag : "all",
    finalOnly: filtersValue.finalOnly === true,
    answerPresence: validPresence.has(filtersValue.answerPresence as AnswerPresenceFilter)
      ? (filtersValue.answerPresence as AnswerPresenceFilter)
      : "all",
    status: validStatuses.has(filtersValue.status as AnswerLearningStatusFilter)
      ? (filtersValue.status as AnswerLearningStatusFilter)
      : "all",
    order: validOrders.has(filtersValue.order as StudyOrder)
      ? (filtersValue.order as StudyOrder)
      : "default",
  };
  const answerSources: Record<string, AnswerLearningAnswerSource> = {};
  if (isRecord(value.answerSources)) {
    Object.entries(value.answerSources).forEach(([cardId, source]) => {
      if (validIds.has(cardId) && !dangerousKeys.has(cardId) && (source === "default" || source === "my-answer")) {
        answerSources[cardId] = source;
      }
    });
  }
  const reveals: Record<string, AnswerLearningRevealState> = {};
  if (isRecord(value.reveals)) {
    Object.entries(value.reveals).forEach(([cardId, candidate]) => {
      if (!validIds.has(cardId) || dangerousKeys.has(cardId) || !isRecord(candidate)) return;
      reveals[cardId] = {
        hint: candidate.hint === true,
        firstLine: candidate.firstLine === true,
        answer: candidate.answer === true,
        frontKo: candidate.frontKo === true,
      };
    });
  }
  const ordered = cardOrder.length > 0 ? cardOrder : selectedCardIds;
  const currentIndex = Math.min(
    Math.max(Number.isInteger(value.currentIndex) ? Number(value.currentIndex) : 0, 0),
    Math.max(ordered.length - 1, 0),
  );
  return {
    version: 1,
    screen: value.screen === "learning" && ordered.length > 0 ? "learning" : "setup",
    selectedCardIds,
    cardOrder: ordered,
    currentIndex,
    filters,
    answerSources,
    reveals,
  };
}

export function readAnswerLearningSession(availableCardIds: string[]) {
  try {
    const raw = sessionStorage.getItem(ANSWER_LEARNING_SESSION_KEY);
    return normalizeAnswerLearningSession(raw ? JSON.parse(raw) : null, availableCardIds);
  } catch {
    return createEmptyAnswerLearningSession();
  }
}

export function saveAnswerLearningSession(session: AnswerLearningSession) {
  try {
    sessionStorage.setItem(ANSWER_LEARNING_SESSION_KEY, JSON.stringify(session));
  } catch {
    // The in-memory session can continue when storage is unavailable.
  }
}

export function clearAnswerLearningSession() {
  try {
    sessionStorage.removeItem(ANSWER_LEARNING_SESSION_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}

export function shuffleAnswerLearningIds(ids: string[], random = Math.random) {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}
