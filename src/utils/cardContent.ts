import type { OpicCard } from "../types";

function normalize(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

/**
 * First-line-only is derived from card content so the persisted OpicCard
 * schema stays backward compatible. Tags are descriptive, not authoritative.
 */
export function isFirstLineOnlyCard(card: OpicCard) {
  return (
    card.back.length === 1 &&
    normalize(card.back[0]) === normalize(card.firstLine) &&
    card.hint.title.trim() === "" &&
    card.hint.memoryTip.trim() === "" &&
    (card.hint.subjectTip?.trim() ?? "") === "" &&
    card.hint.minimum.trim() === "" &&
    card.hint.flow.every((step) => step.trim() === "")
  );
}

export type AnswerContentFilter = "all" | "first-line-only" | "full-answer";

export function matchesAnswerContentFilter(
  card: OpicCard,
  filter: AnswerContentFilter,
) {
  if (filter === "all") return true;
  const firstLineOnly = isFirstLineOnlyCard(card);
  return filter === "first-line-only" ? firstLineOnly : !firstLineOnly;
}
