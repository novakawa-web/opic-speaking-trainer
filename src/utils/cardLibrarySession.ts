export const CARD_LIBRARY_SESSION_KEY = "opic-card-library-session";
export const CARD_LIBRARY_PAGE_SIZE = 20;

export type CardLibrarySession = {
  filterSignature: string;
  visibleCount: number;
  scrollY: number;
};

type SessionStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const DEFAULT_CARD_LIBRARY_SESSION: CardLibrarySession = {
  filterSignature: "",
  visibleCount: CARD_LIBRARY_PAGE_SIZE,
  scrollY: 0,
};

export function resolveCardLibraryVisibleCount(
  session: CardLibrarySession,
  filterSignature: string,
) {
  return session.filterSignature === filterSignature
    ? session.visibleCount
    : CARD_LIBRARY_PAGE_SIZE;
}

export function getNextCardLibraryVisibleCount(current: number) {
  return Math.max(CARD_LIBRARY_PAGE_SIZE, current) + CARD_LIBRARY_PAGE_SIZE;
}

export function normalizeCardLibrarySession(
  value: unknown,
): CardLibrarySession {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_CARD_LIBRARY_SESSION };
  }
  const candidate = value as Record<string, unknown>;
  return {
    filterSignature:
      typeof candidate.filterSignature === "string" &&
      candidate.filterSignature.length <= 2_000
        ? candidate.filterSignature
        : "",
    visibleCount:
      typeof candidate.visibleCount === "number" &&
      Number.isInteger(candidate.visibleCount) &&
      candidate.visibleCount >= CARD_LIBRARY_PAGE_SIZE
        ? candidate.visibleCount
        : CARD_LIBRARY_PAGE_SIZE,
    scrollY:
      typeof candidate.scrollY === "number" &&
      Number.isFinite(candidate.scrollY) &&
      candidate.scrollY >= 0
        ? candidate.scrollY
        : 0,
  };
}

export function readCardLibrarySession(
  storage: SessionStorageLike | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  try {
    return normalizeCardLibrarySession(
      JSON.parse(storage?.getItem(CARD_LIBRARY_SESSION_KEY) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_CARD_LIBRARY_SESSION };
  }
}

export function saveCardLibrarySession(
  session: CardLibrarySession,
  storage: SessionStorageLike | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  const normalized = normalizeCardLibrarySession(session);
  try {
    storage?.setItem(CARD_LIBRARY_SESSION_KEY, JSON.stringify(normalized));
  } catch {
    // The library remains usable in memory when sessionStorage is unavailable.
  }
  return normalized;
}
