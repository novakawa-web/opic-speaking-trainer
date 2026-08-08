import type { OpicCard } from "../types.ts";
import {
  runStorageTransaction,
  type StorageLike,
} from "./storageTransaction.ts";

export const FAVORITE_CARD_IDS_STORAGE_KEY = "opic-favorite-card-ids";

const DANGEROUS_CARD_IDS = new Set(["__proto__", "constructor", "prototype"]);

export function normalizeFavoriteCardIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (cardId): cardId is string =>
          typeof cardId === "string" &&
          cardId.trim().length > 0 &&
          !DANGEROUS_CARD_IDS.has(cardId),
      ),
    ),
  ];
}

export function parseFavoriteCardIds(rawValue: string | null): string[] {
  if (!rawValue) return [];
  try {
    return normalizeFavoriteCardIds(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function readFavoriteCardIds(
  storage: Pick<Storage, "getItem"> | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
): string[] {
  try {
    return parseFavoriteCardIds(
      storage?.getItem(FAVORITE_CARD_IDS_STORAGE_KEY) ?? null,
    );
  } catch {
    return [];
  }
}

export function createNextFavoriteCardIds(
  cardIds: readonly string[],
  cardId: string,
  favorite: boolean,
): string[] {
  if (normalizeFavoriteCardIds([cardId]).length !== 1) {
    throw new Error("Invalid favorite card ID.");
  }
  const next = new Set(normalizeFavoriteCardIds(cardIds));
  if (favorite) next.add(cardId);
  else next.delete(cardId);
  return [...next];
}

export function persistFavoriteCardIds(
  cardIds: readonly string[],
  storage: StorageLike,
): string[] {
  const normalized = normalizeFavoriteCardIds(cardIds);
  runStorageTransaction([
    {
      area: "local",
      storage,
      key: FAVORITE_CARD_IDS_STORAGE_KEY,
      value: normalized.length === 0 ? null : JSON.stringify(normalized),
    },
  ]);
  return normalized;
}

export function setCardFavorite(
  cardIds: readonly string[],
  cardId: string,
  favorite: boolean,
  storage: StorageLike,
): string[] {
  return persistFavoriteCardIds(
    createNextFavoriteCardIds(cardIds, cardId, favorite),
    storage,
  );
}

export function matchesFavoriteFilter(
  card: Pick<OpicCard, "id">,
  favoriteCardIds: readonly string[],
  favoriteOnly: boolean,
) {
  return !favoriteOnly || favoriteCardIds.includes(card.id);
}
