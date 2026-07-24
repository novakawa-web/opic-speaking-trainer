import type { OpicCard } from "../types";
import type { CardMemos } from "./cardMemoStorage";
import type { MyAnswers } from "./myAnswerStorage";

export type CardSearchSources = {
  cardMemos: CardMemos;
  myAnswers: MyAnswers;
};

function normalizeSearchText(value: string) {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

export function normalizeCardSearchQuery(query: string) {
  return normalizeSearchText(query);
}

export function createCardSearchText(
  card: OpicCard,
  { cardMemos, myAnswers }: CardSearchSources,
) {
  const hint = card.hint;
  const fields = [
    card.front,
    card.frontKo,
    card.firstLine,
    ...(Array.isArray(card.back) ? card.back : []),
    hint?.title,
    hint?.memoryTip,
    hint?.subjectTip,
    hint?.minimum,
    ...(Array.isArray(hint?.flow) ? hint.flow : []),
    ...(Array.isArray(card.tags) ? card.tags : []),
    ...(Array.isArray(cardMemos[card.id])
      ? cardMemos[card.id].map((memo) => memo?.content)
      : []),
    myAnswers[card.id],
  ].filter((value): value is string => typeof value === "string");

  return normalizeSearchText(fields.join(" "));
}

export function matchesCardSearch(
  card: OpicCard,
  query: string,
  sources: CardSearchSources,
) {
  const normalizedQuery = normalizeCardSearchQuery(query);
  return !normalizedQuery || createCardSearchText(card, sources).includes(normalizedQuery);
}

export function filterCardsBySearch(
  cards: OpicCard[],
  query: string,
  sources: CardSearchSources,
) {
  const normalizedQuery = normalizeCardSearchQuery(query);
  if (!normalizedQuery) return cards;
  return cards.filter((card) =>
    createCardSearchText(card, sources).includes(normalizedQuery),
  );
}
