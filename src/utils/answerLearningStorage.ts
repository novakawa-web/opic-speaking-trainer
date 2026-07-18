import type {
  AnswerLearningAnswerSource,
  AnswerLearningAttempt,
  AnswerLearningAttemptsByDate,
  AnswerLearningDailyStats,
  AnswerLearningStatus,
  AnswerLearningStatuses,
} from "../types.ts";
import {
  DEFAULT_STUDY_DAY_START_TIME,
  getStudyDateKey,
} from "./studyDay.ts";

export const ANSWER_LEARNING_STATUSES_STORAGE_KEY =
  "opic-answer-learning-statuses";
export const ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY =
  "opic-answer-learning-attempts-by-date";

export const ANSWER_LEARNING_STATUSES = [
  "hard",
  "learning",
  "speakable",
] as const;

const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function isAnswerLearningStatus(
  value: unknown,
): value is AnswerLearningStatus {
  return ANSWER_LEARNING_STATUSES.includes(value as AnswerLearningStatus);
}

export function isAnswerLearningAnswerSource(
  value: unknown,
): value is AnswerLearningAnswerSource {
  return value === "default" || value === "my-answer";
}

export function normalizeAnswerLearningStatuses(
  value: unknown,
): AnswerLearningStatuses {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: AnswerLearningStatuses = {};
  Object.entries(value).forEach(([cardId, status]) => {
    if (
      cardId.trim() &&
      !dangerousKeys.has(cardId) &&
      isAnswerLearningStatus(status)
    ) {
      normalized[cardId] = status;
    }
  });
  return normalized;
}

export function saveAnswerLearningStatuses(
  statuses: AnswerLearningStatuses,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(
    ANSWER_LEARNING_STATUSES_STORAGE_KEY,
    JSON.stringify(normalizeAnswerLearningStatuses(statuses)),
  );
}

export function readAnswerLearningStatuses(
  storage: Pick<Storage, "getItem"> = localStorage,
) {
  try {
    const raw = storage.getItem(ANSWER_LEARNING_STATUSES_STORAGE_KEY);
    return raw ? normalizeAnswerLearningStatuses(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function isAnswerLearningAttempt(
  value: unknown,
  expectedDate?: string,
): value is AnswerLearningAttempt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const attempt = value as Partial<AnswerLearningAttempt>;
  return (
    typeof attempt.id === "string" &&
    attempt.id.length > 0 &&
    typeof attempt.date === "string" &&
    dateKeyPattern.test(attempt.date) &&
    (!expectedDate || attempt.date === expectedDate) &&
    typeof attempt.cardId === "string" &&
    attempt.cardId.trim().length > 0 &&
    !dangerousKeys.has(attempt.cardId) &&
    isAnswerLearningStatus(attempt.status) &&
    typeof attempt.timestamp === "string" &&
    !Number.isNaN(Date.parse(attempt.timestamp)) &&
    isAnswerLearningAnswerSource(attempt.answerSource)
  );
}

export function normalizeAnswerLearningAttempts(
  value: unknown,
): AnswerLearningAttemptsByDate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const seenIds = new Set<string>();
  const normalized: AnswerLearningAttemptsByDate = {};
  Object.entries(value).forEach(([dateKey, candidates]) => {
    if (!dateKeyPattern.test(dateKey) || !Array.isArray(candidates)) return;
    const attempts = candidates.filter((candidate) => {
      if (!isAnswerLearningAttempt(candidate, dateKey)) return false;
      if (seenIds.has(candidate.id)) return false;
      seenIds.add(candidate.id);
      return true;
    });
    if (attempts.length > 0) normalized[dateKey] = attempts.map((item) => ({ ...item }));
  });
  return normalized;
}

export function saveAnswerLearningAttempts(
  attempts: AnswerLearningAttemptsByDate,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(
    ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY,
    JSON.stringify(normalizeAnswerLearningAttempts(attempts)),
  );
}

export function readAnswerLearningAttempts(
  storage: Pick<Storage, "getItem"> = localStorage,
) {
  try {
    const raw = storage.getItem(ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY);
    return raw ? normalizeAnswerLearningAttempts(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function createId(now: Date) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
}

export function recordAnswerLearningAttempt(
  attempts: AnswerLearningAttemptsByDate,
  cardId: string,
  status: AnswerLearningStatus,
  answerSource: AnswerLearningAnswerSource,
  startTime = DEFAULT_STUDY_DAY_START_TIME,
  now = new Date(),
) {
  const date = getStudyDateKey(now, startTime);
  const attempt: AnswerLearningAttempt = {
    id: createId(now),
    date,
    cardId,
    status,
    timestamp: now.toISOString(),
    answerSource,
  };
  const next = {
    ...attempts,
    [date]: [...(attempts[date] ?? []), attempt],
  };
  try {
    saveAnswerLearningAttempts(next);
  } catch {
    // Keep the current session usable when storage is unavailable.
  }
  return { attempt, attemptsByDate: next };
}

export function removeAnswerLearningAttempt(
  attempts: AnswerLearningAttemptsByDate,
  date: string,
  attemptId: string,
) {
  const list = attempts[date] ?? [];
  const nextList = list.filter((attempt) => attempt.id !== attemptId);
  if (nextList.length === list.length) return attempts;
  const next = { ...attempts, [date]: nextList };
  try {
    saveAnswerLearningAttempts(next);
  } catch {
    // Keep the current session usable when storage is unavailable.
  }
  return next;
}

export function calculateAnswerLearningDailyStats(
  attempts: AnswerLearningAttemptsByDate,
  startTime = DEFAULT_STUDY_DAY_START_TIME,
  now = new Date(),
): AnswerLearningDailyStats {
  const date = getStudyDateKey(now, startTime);
  const today = attempts[date] ?? [];
  return {
    date,
    attemptCount: today.length,
    speakableCardCount: new Set(
      today.filter((attempt) => attempt.status === "speakable").map((attempt) => attempt.cardId),
    ).size,
  };
}

export function calculateAnswerLearningAttemptCounts(
  attempts: AnswerLearningAttemptsByDate,
) {
  const counts: Record<string, number> = {};
  Object.values(attempts).forEach((list) => {
    list.forEach((attempt) => {
      counts[attempt.cardId] = (counts[attempt.cardId] ?? 0) + 1;
    });
  });
  return counts;
}

export function flattenAnswerLearningAttempts(
  attempts: AnswerLearningAttemptsByDate,
) {
  return Object.keys(attempts)
    .sort()
    .flatMap((date) => (attempts[date] ?? []).map((attempt) => ({ ...attempt })));
}

export function groupAnswerLearningAttempts(
  attempts: AnswerLearningAttempt[],
) {
  const grouped: AnswerLearningAttemptsByDate = {};
  attempts.forEach((attempt) => {
    grouped[attempt.date] = [...(grouped[attempt.date] ?? []), { ...attempt }];
  });
  return grouped;
}
