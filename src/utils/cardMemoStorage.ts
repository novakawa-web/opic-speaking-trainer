import type { OpicCard } from "../types.ts";

export const CARD_MEMOS_STORAGE_KEY = "opic-card-memos";
export const CARD_MEMO_MAX_LENGTH = 3000;

export type CardMemo = {
  id: string;
  cardId: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CardMemos = Record<string, CardMemo[]>;
export type MemoPresence = "all" | "with" | "without" | "pinned";
export type MemoSearchResult = {
  memo: CardMemo;
  card: OpicCard | null;
};

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function normalizeMemoContent(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function isCardMemo(value: unknown): value is CardMemo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const memo = value as Record<string, unknown>;
  const content = typeof memo.content === "string" ? normalizeMemoContent(memo.content) : "";
  return (
    typeof memo.id === "string" &&
    memo.id.trim().length > 0 &&
    !DANGEROUS_KEYS.has(memo.id) &&
    typeof memo.cardId === "string" &&
    memo.cardId.trim().length > 0 &&
    !DANGEROUS_KEYS.has(memo.cardId) &&
    content.length > 0 &&
    content.length <= CARD_MEMO_MAX_LENGTH &&
    typeof memo.pinned === "boolean" &&
    typeof memo.createdAt === "string" &&
    Number.isFinite(Date.parse(memo.createdAt)) &&
    typeof memo.updatedAt === "string" &&
    Number.isFinite(Date.parse(memo.updatedAt))
  );
}

export function cloneCardMemo(memo: CardMemo): CardMemo {
  return {
    id: memo.id,
    cardId: memo.cardId,
    content: normalizeMemoContent(memo.content),
    pinned: memo.pinned,
    createdAt: memo.createdAt,
    updatedAt: memo.updatedAt,
  };
}

export function normalizeCardMemos(value: unknown): CardMemos {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: CardMemos = {};
  const seenIds = new Set<string>();

  for (const [cardId, candidateMemos] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(cardId) || !cardId.trim() || !Array.isArray(candidateMemos)) {
      return {};
    }
    const cardMemos: CardMemo[] = [];
    for (const candidate of candidateMemos) {
      if (!isCardMemo(candidate) || candidate.cardId !== cardId || seenIds.has(candidate.id)) {
        return {};
      }
      seenIds.add(candidate.id);
      cardMemos.push(cloneCardMemo(candidate));
    }
    if (cardMemos.length > 0) normalized[cardId] = cardMemos;
  }
  return normalized;
}

export function parseCardMemos(rawValue: string | null): CardMemos {
  if (!rawValue) return {};
  try {
    return normalizeCardMemos(JSON.parse(rawValue));
  } catch {
    return {};
  }
}

export function readCardMemos(): CardMemos {
  try {
    return parseCardMemos(localStorage.getItem(CARD_MEMOS_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveCardMemos(cardMemos: CardMemos) {
  const normalized = normalizeCardMemos(cardMemos);
  try {
    if (Object.keys(normalized).length === 0) localStorage.removeItem(CARD_MEMOS_STORAGE_KEY);
    else localStorage.setItem(CARD_MEMOS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Keep the in-memory data usable when storage is unavailable.
  }
  return normalized;
}

export function createMemoId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Use the local fallback below.
  }
  return `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCardMemo(
  cardMemos: CardMemos,
  cardId: string,
  content: string,
  options: { id?: string; now?: Date } = {},
) {
  const normalizedContent = normalizeMemoContent(content);
  if (
    !cardId.trim() ||
    DANGEROUS_KEYS.has(cardId) ||
    !normalizedContent ||
    normalizedContent.length > CARD_MEMO_MAX_LENGTH
  ) {
    return { cardMemos, memo: null as CardMemo | null };
  }
  const timestamp = (options.now ?? new Date()).toISOString();
  const memo: CardMemo = {
    id: options.id ?? createMemoId(),
    cardId,
    content: normalizedContent,
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const next = saveCardMemos({
    ...cardMemos,
    [cardId]: [...(cardMemos[cardId] ?? []), memo],
  });
  return { cardMemos: next, memo };
}

export function updateCardMemo(
  cardMemos: CardMemos,
  cardId: string,
  memoId: string,
  content: string,
  now = new Date(),
) {
  const normalizedContent = normalizeMemoContent(content);
  if (!normalizedContent || normalizedContent.length > CARD_MEMO_MAX_LENGTH) return cardMemos;
  let changed = false;
  const nextCardMemos = (cardMemos[cardId] ?? []).map((memo) => {
    if (memo.id !== memoId) return memo;
    changed = true;
    return { ...memo, content: normalizedContent, updatedAt: now.toISOString() };
  });
  return changed ? saveCardMemos({ ...cardMemos, [cardId]: nextCardMemos }) : cardMemos;
}

export function toggleCardMemoPinned(
  cardMemos: CardMemos,
  cardId: string,
  memoId: string,
) {
  let changed = false;
  const nextCardMemos = (cardMemos[cardId] ?? []).map((memo) => {
    if (memo.id !== memoId) return memo;
    changed = true;
    return { ...memo, pinned: !memo.pinned };
  });
  return changed ? saveCardMemos({ ...cardMemos, [cardId]: nextCardMemos }) : cardMemos;
}

export function deleteCardMemo(cardMemos: CardMemos, cardId: string, memoId: string) {
  const existing = cardMemos[cardId] ?? [];
  const index = existing.findIndex((memo) => memo.id === memoId);
  if (index < 0) return { cardMemos, deletedMemo: null as CardMemo | null, index: -1 };
  const deletedMemo = cloneCardMemo(existing[index]);
  const remaining = existing.filter((memo) => memo.id !== memoId);
  const next = { ...cardMemos };
  if (remaining.length > 0) next[cardId] = remaining;
  else delete next[cardId];
  return { cardMemos: saveCardMemos(next), deletedMemo, index };
}

export function restoreCardMemo(cardMemos: CardMemos, memo: CardMemo, index = 0) {
  if (!isCardMemo(memo)) return cardMemos;
  const existing = (cardMemos[memo.cardId] ?? []).filter((item) => item.id !== memo.id);
  const insertIndex = Math.max(0, Math.min(index, existing.length));
  const restored = [...existing];
  restored.splice(insertIndex, 0, cloneCardMemo(memo));
  return saveCardMemos({ ...cardMemos, [memo.cardId]: restored });
}

export function sortCardMemos(memos: CardMemo[]) {
  return [...memos].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

export function getMemoCount(cardMemos: CardMemos, cardId?: string) {
  if (cardId) return cardMemos[cardId]?.length ?? 0;
  return Object.values(cardMemos).reduce((count, memos) => count + memos.length, 0);
}

export function getMemoCardCount(cardMemos: CardMemos) {
  return Object.values(cardMemos).filter((memos) => memos.length > 0).length;
}

export function getPinnedMemoCount(cardMemos: CardMemos, cardId?: string) {
  const source = cardId ? [cardMemos[cardId] ?? []] : Object.values(cardMemos);
  return source.flat().filter((memo) => memo.pinned).length;
}

export function filterCardsByMemoPresence<T extends { id: string }>(
  cards: T[],
  cardMemos: CardMemos,
  presence: MemoPresence,
) {
  if (presence === "all") return cards;
  return cards.filter((card) => {
    const memos = cardMemos[card.id] ?? [];
    if (presence === "with") return memos.length > 0;
    if (presence === "pinned") return memos.some((memo) => memo.pinned);
    return memos.length === 0;
  });
}

export function searchCardMemos(
  cardMemos: CardMemos,
  cards: OpicCard[],
  query: string,
): MemoSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return Object.values(cardMemos)
    .flat()
    .flatMap((memo) => {
      const card = cardsById.get(memo.cardId) ?? null;
      const searchable = [
        memo.content,
        memo.cardId,
        card?.front ?? "",
        card?.frontKo ?? "",
        card?.deck ?? "",
        ...(card?.tags ?? []),
      ]
        .join("\n")
        .toLocaleLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery)
        ? [{ memo, card }]
        : [];
    })
    .sort(
      (left, right) =>
        Number(right.memo.pinned) - Number(left.memo.pinned) ||
        Date.parse(right.memo.updatedAt) - Date.parse(left.memo.updatedAt),
    );
}

export function formatMemoDate(isoValue: string, now = new Date()) {
  const date = new Date(isoValue);
  if (!Number.isFinite(date.getTime())) return "날짜 없음";
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `오늘 ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
