import type { FirstLineResult } from "../types";

export const FIRST_LINE_MOCK_SESSION_KEY = "opic-first-line-mock-session";
export const FIRST_LINE_MOCK_SESSION_VERSION = 1;

export type FirstLineMode = "practice" | "mock";
export type MockQuestionCount = 10 | 15 | 20 | "all";

export type FirstLineMockSession = {
  version: 1;
  sourceCardIds: string[];
  cardOrder: string[];
  questionCount: MockQuestionCount;
  answers: Record<string, FirstLineResult>;
  screen: "exam" | "complete";
};

function shuffle(ids: string[], random: () => number) {
  const copy = [...ids];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

export function createFirstLineMockSession(
  sourceCardIds: string[],
  questionCount: MockQuestionCount,
  random: () => number = Math.random,
): FirstLineMockSession {
  const uniqueIds = [...new Set(sourceCardIds.filter(Boolean))];
  const limit = questionCount === "all" ? uniqueIds.length : questionCount;
  return {
    version: FIRST_LINE_MOCK_SESSION_VERSION,
    sourceCardIds: uniqueIds,
    cardOrder: shuffle(uniqueIds, random).slice(0, limit),
    questionCount,
    answers: {},
    screen: "exam",
  };
}

export function parseFirstLineMockSession(
  raw: string | null,
  validCardIds: string[],
): FirstLineMockSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FirstLineMockSession>;
    const valid = new Set(validCardIds);
    if (
      value.version !== FIRST_LINE_MOCK_SESSION_VERSION ||
      !Array.isArray(value.sourceCardIds) ||
      !Array.isArray(value.cardOrder) ||
      ![10, 15, 20, "all"].includes(value.questionCount as MockQuestionCount) ||
      (value.screen !== "exam" && value.screen !== "complete") ||
      !value.answers ||
      typeof value.answers !== "object"
    ) return null;
    const sourceCardIds = [...new Set(value.sourceCardIds.filter((id): id is string => typeof id === "string" && valid.has(id)))];
    const cardOrder = [...new Set(value.cardOrder.filter((id): id is string => typeof id === "string" && valid.has(id)))];
    if (cardOrder.length === 0) return null;
    const answers = Object.create(null) as Record<string, FirstLineResult>;
    for (const [id, status] of Object.entries(value.answers)) {
      if (
        id !== "__proto__" &&
        id !== "constructor" &&
        id !== "prototype" &&
        cardOrder.includes(id) &&
        ["success", "again", "hard"].includes(status)
      ) {
        answers[id] = status as FirstLineResult;
      }
    }
    return { version: 1, sourceCardIds, cardOrder, questionCount: value.questionCount!, answers, screen: value.screen };
  } catch {
    return null;
  }
}

export function readFirstLineMockSession(validCardIds: string[]) {
  try {
    return parseFirstLineMockSession(sessionStorage.getItem(FIRST_LINE_MOCK_SESSION_KEY), validCardIds);
  } catch {
    return null;
  }
}

export function saveFirstLineMockSession(session: FirstLineMockSession) {
  try {
    sessionStorage.setItem(FIRST_LINE_MOCK_SESSION_KEY, JSON.stringify(session));
  } catch {
    // The exam still works in memory when session storage is unavailable.
  }
}

export function clearFirstLineMockSession() {
  try { sessionStorage.removeItem(FIRST_LINE_MOCK_SESSION_KEY); } catch { /* noop */ }
}

export function summarizeFirstLineMock(session: FirstLineMockSession) {
  const values = Object.values(session.answers);
  const success = values.filter((value) => value === "success").length;
  const again = values.filter((value) => value === "again").length;
  const hard = values.filter((value) => value === "hard").length;
  return {
    total: session.cardOrder.length,
    success,
    again,
    hard,
    successRate: session.cardOrder.length === 0 ? 0 : Math.round((success / session.cardOrder.length) * 100),
  };
}
