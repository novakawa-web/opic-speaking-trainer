import type { DeckName, OpicCard } from "../types.ts";

export const CARD_DATASET_STORAGE_KEY = "opic-card-dataset";
export const CARD_IMPORT_BACKUP_KEY = "opic-cards-import-backup";
export const CARD_DATASET_VERSION = 1;

export const DECK_NAMES: readonly DeckName[] = [
  "OPIc 03_주제별답변",
  "OPIc 04_롤플레이",
  "OPIc 05_문제해결",
  "OPIc 06_변화질문",
];

export type CardDataset = {
  version: 1;
  updatedAt: string;
  cards: OpicCard[];
};

export type CardConflictPolicy = "new-only" | "overwrite" | "replace";

export type CardImportApplyResult = {
  cards: OpicCard[];
  added: number;
  updated: number;
  skipped: number;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeComparable(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

export function isOpicCard(value: unknown): value is OpicCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  const hint =
    card.hint && typeof card.hint === "object"
      ? (card.hint as Record<string, unknown>)
      : null;

  return (
    typeof card.id === "string" &&
    card.id.trim().length > 0 &&
    DECK_NAMES.includes(card.deck as DeckName) &&
    typeof card.front === "string" &&
    card.front.trim().length > 0 &&
    (card.frontKo === undefined || typeof card.frontKo === "string") &&
    typeof card.firstLine === "string" &&
    card.firstLine.trim().length > 0 &&
    Boolean(hint) &&
    typeof hint?.title === "string" &&
    typeof hint?.memoryTip === "string" &&
    (hint?.subjectTip === undefined || typeof hint.subjectTip === "string") &&
    typeof hint?.minimum === "string" &&
    isStringArray(hint?.flow) &&
    isStringArray(card.back) &&
    card.back.length > 0 &&
    normalizeComparable(card.firstLine as string) ===
      normalizeComparable((card.back as string[])[0]) &&
    isStringArray(card.tags)
  );
}

export function createCardDataset(cards: OpicCard[]): CardDataset {
  return {
    version: CARD_DATASET_VERSION,
    updatedAt: new Date().toISOString(),
    cards,
  };
}

export function parseCardDataset(rawValue: string | null): CardDataset | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (parsed.version !== CARD_DATASET_VERSION) return null;
    if (typeof parsed.updatedAt !== "string") return null;
    if (!Array.isArray(parsed.cards) || !parsed.cards.every(isOpicCard)) return null;

    const ids = parsed.cards.map((card) => card.id);
    if (new Set(ids).size !== ids.length) return null;

    return parsed as CardDataset;
  } catch {
    return null;
  }
}

export function resolveStoredCards(
  rawValue: string | null,
  defaultCards: OpicCard[],
): { cards: OpicCard[]; source: "default" | "stored"; invalidStoredData: boolean } {
  if (!rawValue) {
    return { cards: defaultCards, source: "default", invalidStoredData: false };
  }

  const dataset = parseCardDataset(rawValue);
  if (!dataset) {
    return { cards: defaultCards, source: "default", invalidStoredData: true };
  }

  return { cards: dataset.cards, source: "stored", invalidStoredData: false };
}

export function readActiveCards(defaultCards: OpicCard[]) {
  try {
    return resolveStoredCards(localStorage.getItem(CARD_DATASET_STORAGE_KEY), defaultCards);
  } catch {
    return { cards: defaultCards, source: "default" as const, invalidStoredData: false };
  }
}

export function saveActiveCards(cards: OpicCard[]) {
  localStorage.setItem(
    CARD_DATASET_STORAGE_KEY,
    JSON.stringify(createCardDataset(cards)),
  );
}

export function saveImportBackup(cards: OpicCard[]) {
  localStorage.setItem(
    CARD_IMPORT_BACKUP_KEY,
    JSON.stringify(createCardDataset(cards)),
  );
}

export function readImportBackup(): CardDataset | null {
  try {
    return parseCardDataset(localStorage.getItem(CARD_IMPORT_BACKUP_KEY));
  } catch {
    return null;
  }
}

export function clearImportBackup() {
  try {
    localStorage.removeItem(CARD_IMPORT_BACKUP_KEY);
  } catch {
    // A restored in-memory dataset still remains usable when storage is unavailable.
  }
}

export function applyCardImport(
  currentCards: OpicCard[],
  importedCards: OpicCard[],
  policy: CardConflictPolicy,
): CardImportApplyResult {
  const currentIds = new Set(currentCards.map((card) => card.id));

  if (policy === "replace") {
    return {
      cards: importedCards,
      added: importedCards.filter((card) => !currentIds.has(card.id)).length,
      updated: importedCards.filter((card) => currentIds.has(card.id)).length,
      skipped: 0,
    };
  }

  if (policy === "new-only") {
    const additions = importedCards.filter((card) => !currentIds.has(card.id));
    return {
      cards: [...currentCards, ...additions],
      added: additions.length,
      updated: 0,
      skipped: importedCards.length - additions.length,
    };
  }

  const importedById = new Map(importedCards.map((card) => [card.id, card]));
  const replacedCards = currentCards.map(
    (card) => importedById.get(card.id) ?? card,
  );
  const additions = importedCards.filter((card) => !currentIds.has(card.id));

  return {
    cards: [...replacedCards, ...additions],
    added: additions.length,
    updated: importedCards.length - additions.length,
    skipped: 0,
  };
}
