import type { OpicCard } from "../types.ts";

export type CardTagDimension = "week" | "topic" | "type";

export type CardTagDimensionFilters = {
  selectedWeeks: string[];
  selectedTopics: string[];
  selectedTypes: string[];
};

export type CardTagFilterOptions = {
  weeks: string[];
  topics: string[];
  types: string[];
  otherTags: string[];
};

export const EMPTY_CARD_TAG_DIMENSION_FILTERS: CardTagDimensionFilters = {
  selectedWeeks: [],
  selectedTopics: [],
  selectedTypes: [],
};

const WEEK_TAG_PATTERN = /^week(\d+)$/i;
const TOPIC_TAG_PATTERN = /^topic_(.+)$/i;
const TYPE_TAG_PATTERN = /^type_(.+)$/i;

function compareTags(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function getCardTagDimension(tag: string): CardTagDimension | null {
  if (WEEK_TAG_PATTERN.test(tag)) return "week";
  if (TOPIC_TAG_PATTERN.test(tag)) return "topic";
  if (TYPE_TAG_PATTERN.test(tag)) return "type";
  return null;
}

export function isDedicatedCardTag(tag: string) {
  return tag === "final_rep" || getCardTagDimension(tag) !== null;
}

export function normalizeCardTagSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter(
      (tag): tag is string =>
        typeof tag === "string" && tag.length > 0 && tag.length <= 200,
    ),
  )].sort(compareTags);
}

export function normalizeCardTagDimensionFilters(
  value: Partial<Record<keyof CardTagDimensionFilters, unknown>> | null | undefined,
): CardTagDimensionFilters {
  return {
    selectedWeeks: normalizeCardTagSelection(value?.selectedWeeks).filter(
      (tag) => getCardTagDimension(tag) === "week",
    ),
    selectedTopics: normalizeCardTagSelection(value?.selectedTopics).filter(
      (tag) => getCardTagDimension(tag) === "topic",
    ),
    selectedTypes: normalizeCardTagSelection(value?.selectedTypes).filter(
      (tag) => getCardTagDimension(tag) === "type",
    ),
  };
}

export function migrateLegacyCardTagFilter(
  selectedTag: unknown,
  dimensions: CardTagDimensionFilters,
  finalOnly: boolean,
) {
  const legacyTag = typeof selectedTag === "string" && selectedTag.length > 0
    ? selectedTag
    : "all";
  if (legacyTag === "all") {
    return { selectedTag: "all", dimensions, finalOnly };
  }

  if (legacyTag === "final_rep") {
    return { selectedTag: "all", dimensions, finalOnly: true };
  }

  const dimension = getCardTagDimension(legacyTag);
  if (!dimension) return { selectedTag: legacyTag, dimensions, finalOnly };

  const key = dimension === "week"
    ? "selectedWeeks"
    : dimension === "topic"
      ? "selectedTopics"
      : "selectedTypes";
  return {
    selectedTag: "all",
    dimensions: {
      ...dimensions,
      [key]: normalizeCardTagSelection([...dimensions[key], legacyTag]),
    },
    finalOnly,
  };
}

export function getCardTagFilterOptions(tags: readonly string[]): CardTagFilterOptions {
  const weeks: string[] = [];
  const topics: string[] = [];
  const types: string[] = [];
  const otherTags: string[] = [];

  normalizeCardTagSelection(tags).forEach((tag) => {
    const dimension = getCardTagDimension(tag);
    if (dimension === "week") weeks.push(tag);
    else if (dimension === "topic") topics.push(tag);
    else if (dimension === "type") types.push(tag);
    else if (tag !== "final_rep") otherTags.push(tag);
  });

  return { weeks, topics, types, otherTags };
}

export function resolveCardTagDimensionFilters(
  filters: CardTagDimensionFilters,
  availableTags: readonly string[],
): CardTagDimensionFilters {
  const available = new Set(availableTags);
  return {
    selectedWeeks: filters.selectedWeeks.filter((tag) => available.has(tag)),
    selectedTopics: filters.selectedTopics.filter((tag) => available.has(tag)),
    selectedTypes: filters.selectedTypes.filter((tag) => available.has(tag)),
  };
}

function matchesDimension(cardTags: readonly string[], selectedTags?: readonly string[]) {
  return !selectedTags || selectedTags.length === 0 || selectedTags.some((tag) => cardTags.includes(tag));
}

export function matchesCardTagDimensionFilters(
  card: Pick<OpicCard, "tags">,
  filters: Partial<CardTagDimensionFilters>,
) {
  return (
    matchesDimension(card.tags, filters.selectedWeeks) &&
    matchesDimension(card.tags, filters.selectedTopics) &&
    matchesDimension(card.tags, filters.selectedTypes)
  );
}

export function formatCardTagOption(tag: string) {
  const week = tag.match(WEEK_TAG_PATTERN);
  if (week) return `Week ${Number(week[1])}`;
  const topic = tag.match(TOPIC_TAG_PATTERN);
  if (topic) return topic[1].replaceAll("_", " ");
  const type = tag.match(TYPE_TAG_PATTERN);
  if (type) return type[1].replaceAll("_", " ");
  return tag;
}

export function formatCardTagSelectionSummary(
  selectedTags: readonly string[],
  emptyLabel: string,
) {
  if (selectedTags.length === 0) return emptyLabel;
  const first = formatCardTagOption(selectedTags[0]);
  return selectedTags.length === 1 ? first : `${first} 외 ${selectedTags.length - 1}개`;
}
