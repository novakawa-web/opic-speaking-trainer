import type { DeckName, OpicCard } from "../types.ts";
import type { AnswerContentFilter } from "./cardContent.ts";
import type { ArchiveFilter } from "./cardArchiveStorage.ts";
import {
  createEmptyAnswerLearningSession,
  normalizeAnswerLearningSession,
  type AnswerLearningFilters,
} from "./answerLearningSession.ts";
import {
  migrateLegacyCardTagFilter,
  normalizeCardTagDimensionFilters,
  resolveCardTagDimensionFilters,
  resolveOtherCardTags,
} from "./cardTagFilters.ts";
import {
  isStudyCardScope,
  isStudyOrder,
  type StudyCardScope,
  type StudyOrder,
} from "./studyPreferences.ts";

export const FIRST_LINE_FILTER_PREFERENCES_STORAGE_KEY =
  "opic-first-line-filter-preferences";
export const ANSWER_LEARNING_FILTER_PREFERENCES_STORAGE_KEY =
  "opic-answer-learning-filter-preferences";

export type FirstLineFilterState = {
  selectedDeck: DeckName | "all";
  selectedTag: string;
  selectedWeeks: string[];
  selectedTopics: string[];
  selectedTypes: string[];
  finalOnly: boolean;
  hardOnly: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  answerContentFilter: AnswerContentFilter;
  answerStatusOnly: boolean;
  archiveFilter: ArchiveFilter;
};

export type FirstLineFilterPreferences = {
  version: 1;
  filters: FirstLineFilterState;
};

export type AnswerLearningFilterPreferences = {
  version: 1;
  filters: AnswerLearningFilters;
};

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

const validAnswerContentFilters = new Set<AnswerContentFilter>([
  "all",
  "first-line-only",
  "full-answer",
]);
const validArchiveFilters = new Set<ArchiveFilter>([
  "active",
  "archived",
  "all",
]);

export const DEFAULT_FIRST_LINE_FILTER_STATE: FirstLineFilterState = {
  selectedDeck: "all",
  selectedTag: "all",
  selectedWeeks: [],
  selectedTopics: [],
  selectedTypes: [],
  finalOnly: false,
  hardOnly: false,
  cardScope: "all",
  studyOrder: "default",
  answerContentFilter: "all",
  answerStatusOnly: false,
  archiveFilter: "active",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function availableTags(cards: readonly OpicCard[]) {
  return cards.flatMap((card) => card.tags);
}

function resolveDeck(value: unknown, cards: readonly OpicCard[]) {
  if (value === "all") return "all";
  return typeof value === "string" && cards.some((card) => card.deck === value)
    ? (value as DeckName)
    : "all";
}

export function normalizeFirstLineFilterPreferences(
  value: unknown,
  cards: readonly OpicCard[],
): FirstLineFilterPreferences {
  const filters =
    isRecord(value) && value.version === 1 && isRecord(value.filters)
      ? value.filters
      : {};
  const tags = availableTags(cards);
  const dimensions = normalizeCardTagDimensionFilters(filters);
  const legacy = migrateLegacyCardTagFilter(
    filters.selectedTag,
    dimensions,
    filters.finalOnly === true,
  );
  const resolvedDimensions = resolveCardTagDimensionFilters(
    legacy.dimensions,
    tags,
  );
  const selectedOtherTags = resolveOtherCardTags(
    legacy.selectedTag === "all" ? [] : [legacy.selectedTag],
    tags,
  );

  return {
    version: 1,
    filters: {
      selectedDeck: resolveDeck(filters.selectedDeck, cards),
      selectedTag: selectedOtherTags[0] ?? "all",
      ...resolvedDimensions,
      finalOnly: legacy.finalOnly,
      hardOnly: filters.hardOnly === true,
      cardScope: isStudyCardScope(filters.cardScope)
        ? filters.cardScope
        : "all",
      studyOrder: isStudyOrder(filters.studyOrder)
        ? filters.studyOrder
        : "default",
      answerContentFilter: validAnswerContentFilters.has(
        filters.answerContentFilter as AnswerContentFilter,
      )
        ? (filters.answerContentFilter as AnswerContentFilter)
        : "all",
      answerStatusOnly: filters.answerStatusOnly === true,
      archiveFilter: validArchiveFilters.has(
        filters.archiveFilter as ArchiveFilter,
      )
        ? (filters.archiveFilter as ArchiveFilter)
        : "active",
    },
  };
}

export function readFirstLineFilterPreferences(
  cards: readonly OpicCard[],
  storage: ReadStorage | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
  fallbackFilters: FirstLineFilterState = DEFAULT_FIRST_LINE_FILTER_STATE,
) {
  try {
    const raw = storage?.getItem(FIRST_LINE_FILTER_PREFERENCES_STORAGE_KEY);
    return normalizeFirstLineFilterPreferences(
      raw ? JSON.parse(raw) : { version: 1, filters: fallbackFilters },
      cards,
    );
  } catch {
    return normalizeFirstLineFilterPreferences(
      { version: 1, filters: fallbackFilters },
      cards,
    );
  }
}

export function saveFirstLineFilterPreferences(
  filters: FirstLineFilterState,
  cards: readonly OpicCard[],
  storage: WriteStorage | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
) {
  const normalized = normalizeFirstLineFilterPreferences(
    { version: 1, filters },
    cards,
  );
  try {
    storage?.setItem(
      FIRST_LINE_FILTER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // The current in-memory filters remain usable when local storage is unavailable.
  }
  return normalized;
}

export function normalizeAnswerLearningFilterPreferences(
  value: unknown,
  cards: readonly OpicCard[],
): AnswerLearningFilterPreferences {
  const candidate =
    isRecord(value) && value.version === 1 && isRecord(value.filters)
      ? value.filters
      : {};
  const base = createEmptyAnswerLearningSession();
  const session = normalizeAnswerLearningSession(
    { ...base, filters: candidate },
    cards.map((card) => card.id),
    availableTags(cards),
  );
  return {
    version: 1,
    filters: {
      ...session.filters,
      deck: resolveDeck(session.filters.deck, cards),
    },
  };
}

export function readAnswerLearningFilterPreferences(
  cards: readonly OpicCard[],
  storage: ReadStorage | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
  fallbackFilters: AnswerLearningFilters =
    createEmptyAnswerLearningSession().filters,
) {
  try {
    const raw = storage?.getItem(
      ANSWER_LEARNING_FILTER_PREFERENCES_STORAGE_KEY,
    );
    return normalizeAnswerLearningFilterPreferences(
      raw ? JSON.parse(raw) : { version: 1, filters: fallbackFilters },
      cards,
    );
  } catch {
    return normalizeAnswerLearningFilterPreferences(
      { version: 1, filters: fallbackFilters },
      cards,
    );
  }
}

export function saveAnswerLearningFilterPreferences(
  filters: AnswerLearningFilters,
  cards: readonly OpicCard[],
  storage: WriteStorage | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
) {
  const normalized = normalizeAnswerLearningFilterPreferences(
    { version: 1, filters },
    cards,
  );
  try {
    storage?.setItem(
      ANSWER_LEARNING_FILTER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // The current in-memory filters remain usable when local storage is unavailable.
  }
  return normalized;
}
