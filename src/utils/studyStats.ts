import type {
  DailyStudyStats,
  FirstLineResult,
  StudyAttempt,
  StudyAttemptsByDate,
} from "../types.ts";
import {
  DEFAULT_STUDY_DAY_START_TIME,
  getStudyDateKey,
} from "./studyDay.ts";

export const STUDY_ATTEMPTS_STORAGE_KEY =
  "opic-first-line-attempts-by-date";
const VALID_STATUSES = new Set<FirstLineResult>(["success", "again", "hard"]);

function isStudyAttempt(value: unknown, dateKey: string): value is StudyAttempt {
  if (!value || typeof value !== "object") return false;

  const attempt = value as Partial<StudyAttempt>;
  return (
    (attempt.id === undefined || typeof attempt.id === "string") &&
    attempt.date === dateKey &&
    typeof attempt.cardId === "string" &&
    typeof attempt.timestamp === "string" &&
    VALID_STATUSES.has(attempt.status as FirstLineResult)
  );
}

function createAttemptId(now: Date) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
}

export function saveStudyAttempts(attemptsByDate: StudyAttemptsByDate) {
  localStorage.setItem(
    STUDY_ATTEMPTS_STORAGE_KEY,
    JSON.stringify(attemptsByDate),
  );
}

export function readStudyAttempts(): StudyAttemptsByDate {
  try {
    const rawValue = localStorage.getItem(STUDY_ATTEMPTS_STORAGE_KEY);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([dateKey, attempts]) => {
        if (!Array.isArray(attempts)) return [];
        return [[dateKey, attempts.filter((attempt) => isStudyAttempt(attempt, dateKey))]];
      }),
    );
  } catch {
    return {};
  }
}

export function recordStudyAttempt(
  cardId: string,
  status: FirstLineResult,
  startTime = DEFAULT_STUDY_DAY_START_TIME,
  now = new Date(),
): {
  attempt: StudyAttempt & { id: string };
  attemptsByDate: StudyAttemptsByDate;
} {
  const dateKey = getStudyDateKey(now, startTime);
  const attemptsByDate = readStudyAttempts();
  const attempt: StudyAttempt & { id: string } = {
    id: createAttemptId(now),
    date: dateKey,
    cardId,
    status,
    timestamp: now.toISOString(),
  };
  const nextAttempts = {
    ...attemptsByDate,
    [dateKey]: [...(attemptsByDate[dateKey] ?? []), attempt],
  };

  try {
    saveStudyAttempts(nextAttempts);
  } catch {
    // Storage may be unavailable; current session state still updates.
  }
  return { attempt, attemptsByDate: nextAttempts };
}

export function removeStudyAttempt(
  attemptsByDate: StudyAttemptsByDate,
  attemptDate: string,
  attemptId: string,
): StudyAttemptsByDate {
  const attempts = attemptsByDate[attemptDate] ?? [];
  const attemptIndex = attempts.findIndex((attempt) => attempt.id === attemptId);
  if (attemptIndex < 0) return attemptsByDate;

  const nextAttempts = {
    ...attemptsByDate,
    [attemptDate]: attempts.filter((_, index) => index !== attemptIndex),
  };

  try {
    saveStudyAttempts(nextAttempts);
  } catch {
    // Storage may be unavailable; current session state still updates.
  }
  return nextAttempts;
}

export function calculateDailyStats(
  attemptsByDate: StudyAttemptsByDate,
  startTime = DEFAULT_STUDY_DAY_START_TIME,
  date = new Date(),
): DailyStudyStats {
  const dateKey = getStudyDateKey(date, startTime);
  const attempts = attemptsByDate[dateKey] ?? [];
  const successCount = attempts.filter(
    (attempt) => attempt.status === "success",
  ).length;

  return {
    date: dateKey,
    practicedCardCount: new Set(attempts.map((attempt) => attempt.cardId)).size,
    attemptCount: attempts.length,
    successCount,
    successRate:
      attempts.length === 0 ? 0 : Math.round((successCount / attempts.length) * 100),
  };
}

export function calculateAttemptCounts(
  attemptsByDate: StudyAttemptsByDate,
): Record<string, number> {
  const counts: Record<string, number> = {};

  Object.values(attemptsByDate).forEach((attempts) => {
    attempts.forEach((attempt) => {
      counts[attempt.cardId] = (counts[attempt.cardId] ?? 0) + 1;
    });
  });

  return counts;
}
