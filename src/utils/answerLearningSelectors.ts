import type { AnswerLearningStatuses, OpicCard } from "../types.ts";
import { isAnswerLearningStatus } from "./answerLearningStorage.ts";
import type { MyAnswers } from "./myAnswerStorage.ts";
import type {
  AnswerLearningFilters,
  AnswerLearningStatusFilter,
} from "./answerLearningSession.ts";
import { matchesCardTagDimensionFilters } from "./cardTagFilters.ts";
import { matchesFavoriteFilter } from "./cardFavoriteStorage.ts";

const dangerousCardIds = new Set(["__proto__", "constructor", "prototype"]);

export function hasAnswerLearningStatus(
  statuses: AnswerLearningStatuses,
  cardId: string,
) {
  return (
    cardId.trim().length > 0 &&
    !dangerousCardIds.has(cardId) &&
    Object.hasOwn(statuses, cardId) &&
    isAnswerLearningStatus(statuses[cardId])
  );
}

export function filterCardsByAnswerLearningStatusPresence(
  cards: OpicCard[],
  statuses: AnswerLearningStatuses,
  required: boolean,
) {
  return required
    ? cards.filter((card) => hasAnswerLearningStatus(statuses, card.id))
    : cards;
}

export function matchesAnswerLearningStatusFilter(
  statuses: AnswerLearningStatuses,
  cardId: string,
  filter: AnswerLearningStatusFilter,
) {
  if (filter === "all") return true;

  const hasStatus = hasAnswerLearningStatus(statuses, cardId);
  if (filter === "unlearned") return !hasStatus;
  if (filter === "with-status") return hasStatus;

  return hasStatus && statuses[cardId] === filter;
}

export function filterAnswerLearningCards(
  cards: OpicCard[],
  filters: AnswerLearningFilters,
  statuses: AnswerLearningStatuses,
  myAnswers: MyAnswers,
  favoriteCardIds: readonly string[] = [],
) {
  return cards.filter((card) => {
    const hasMyAnswer = Boolean(myAnswers[card.id]);
    const selectedTags = filters.selectedTags ?? (filters.tag === "all" ? [] : [filters.tag]);
    return (
      (filters.deck === "all" || card.deck === filters.deck) &&
      (selectedTags.length === 0 || selectedTags.some((tag) => card.tags.includes(tag))) &&
      matchesCardTagDimensionFilters(card, filters) &&
      matchesFavoriteFilter(card, favoriteCardIds, filters.favoriteOnly) &&
      (!filters.finalOnly || card.tags.includes("final_rep")) &&
      (filters.answerPresence === "all" ||
        (filters.answerPresence === "with" ? hasMyAnswer : !hasMyAnswer)) &&
      matchesAnswerLearningStatusFilter(statuses, card.id, filters.status)
    );
  });
}

export function orderAnswerLearningCards(
  cards: OpicCard[],
  order: AnswerLearningFilters["order"],
  attemptCounts: Record<string, number>,
) {
  if (order !== "least-practiced") return cards;
  return cards
    .map((card, originalIndex) => ({ card, originalIndex }))
    .sort(
      (left, right) =>
        (attemptCounts[left.card.id] ?? 0) -
          (attemptCounts[right.card.id] ?? 0) ||
        left.originalIndex - right.originalIndex,
    )
    .map(({ card }) => card);
}
