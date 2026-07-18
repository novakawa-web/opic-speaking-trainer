import type { AnswerLearningStatuses, OpicCard } from "../types.ts";
import type { MyAnswers } from "./myAnswerStorage.ts";
import type { AnswerLearningFilters } from "./answerLearningSession.ts";

export function filterAnswerLearningCards(
  cards: OpicCard[],
  filters: AnswerLearningFilters,
  statuses: AnswerLearningStatuses,
  myAnswers: MyAnswers,
) {
  return cards.filter((card) => {
    const status = statuses[card.id];
    const hasMyAnswer = Boolean(myAnswers[card.id]);
    return (
      (filters.deck === "all" || card.deck === filters.deck) &&
      (filters.tag === "all" || card.tags.includes(filters.tag)) &&
      (!filters.finalOnly || card.tags.includes("final_rep")) &&
      (filters.answerPresence === "all" ||
        (filters.answerPresence === "with" ? hasMyAnswer : !hasMyAnswer)) &&
      (filters.status === "all" ||
        (filters.status === "unlearned" ? !status : status === filters.status))
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
