import type { OpicCard } from "../types.ts";

export type LibraryStudyTarget = "firstLine" | "answerLearning";

export type LibraryStudyHandoff = {
  target: LibraryStudyTarget;
  cardIds: string[];
};

export function createLibraryStudyHandoff(
  target: LibraryStudyTarget,
  cardIds: readonly string[],
): LibraryStudyHandoff {
  return {
    target,
    cardIds: [...new Set(cardIds.filter((cardId) => cardId.trim().length > 0))],
  };
}

export function resolveLibraryStudyCards(
  cards: readonly OpicCard[],
  handoff: LibraryStudyHandoff | null,
  target: LibraryStudyTarget,
) {
  if (!handoff || handoff.target !== target) return [...cards];

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return handoff.cardIds.flatMap((cardId) => {
    const card = cardsById.get(cardId);
    return card ? [card] : [];
  });
}

export function mergeLibraryStudySelection(
  selectedCardIds: readonly string[],
  handoffCardIds: readonly string[],
) {
  return [...new Set([...selectedCardIds, ...handoffCardIds])];
}
