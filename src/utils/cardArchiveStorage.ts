import type { OpicCard } from "../types.ts";

export const ARCHIVED_CARD_IDS_STORAGE_KEY = "opic-archived-card-ids";

export type ArchiveFilter = "active" | "archived" | "all";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function normalizeArchivedCardIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (cardId): cardId is string =>
          typeof cardId === "string" &&
          cardId.trim().length > 0 &&
          !DANGEROUS_KEYS.has(cardId),
      ),
    ),
  ];
}

export function parseArchivedCardIds(rawValue: string | null): string[] {
  if (!rawValue) return [];
  try {
    return normalizeArchivedCardIds(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function readArchivedCardIds(
  storage: Pick<Storage, "getItem"> | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
): string[] {
  try {
    return parseArchivedCardIds(storage?.getItem(ARCHIVED_CARD_IDS_STORAGE_KEY) ?? null);
  } catch {
    return [];
  }
}

export function saveArchivedCardIds(
  cardIds: string[],
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
): string[] {
  const normalized = normalizeArchivedCardIds(cardIds);
  try {
    if (normalized.length === 0) storage?.removeItem(ARCHIVED_CARD_IDS_STORAGE_KEY);
    else storage?.setItem(ARCHIVED_CARD_IDS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // The current in-memory archive state remains usable when storage is unavailable.
  }
  return normalized;
}

export function setCardArchived(
  cardIds: string[],
  cardId: string,
  archived: boolean,
) {
  const current = new Set(normalizeArchivedCardIds(cardIds));
  if (archived) current.add(cardId);
  else current.delete(cardId);
  return saveArchivedCardIds([...current]);
}

export function matchesArchiveFilter(
  card: Pick<OpicCard, "id">,
  archivedCardIds: readonly string[],
  filter: ArchiveFilter,
) {
  if (filter === "all") return true;
  const isArchived = archivedCardIds.includes(card.id);
  return filter === "archived" ? isArchived : !isArchived;
}
