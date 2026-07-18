import type {
  AnswerLearningAttemptsByDate,
  AnswerLearningStatuses,
  FirstLineStatusMap,
  StudyAttemptsByDate,
} from "../types.ts";
import type { AnswerLearningSession } from "./answerLearningSession.ts";
import type { CardMemos } from "./cardMemoStorage.ts";
import type { FirstLineMockSession } from "./firstLineMockSession.ts";
import type { MyAnswers } from "./myAnswerStorage.ts";

export function removeCardFromRecord<T>(record: Record<string, T>, cardId: string) {
  const next = { ...record };
  delete next[cardId];
  return next;
}

export function removeCardFromAttempts<T extends { cardId: string }>(
  attemptsByDate: Record<string, T[]>,
  cardId: string,
) {
  return Object.fromEntries(
    Object.entries(attemptsByDate).flatMap(([date, attempts]) => {
      const remaining = attempts.filter((attempt) => attempt.cardId !== cardId);
      return remaining.length > 0 ? [[date, remaining]] : [];
    }),
  ) as Record<string, T[]>;
}

export function removeCardFromAnswerLearningSession(
  session: AnswerLearningSession,
  cardId: string,
): AnswerLearningSession {
  const selectedCardIds = session.selectedCardIds.filter((id) => id !== cardId);
  const cardOrder = session.cardOrder.filter((id) => id !== cardId);
  return {
    ...session,
    selectedCardIds,
    cardOrder,
    currentIndex: Math.min(session.currentIndex, Math.max(cardOrder.length - 1, 0)),
    screen: cardOrder.length === 0 ? "setup" : session.screen,
    answerSources: removeCardFromRecord(session.answerSources, cardId),
    reveals: removeCardFromRecord(session.reveals, cardId),
  };
}

export function removeCardFromMockSession(
  session: FirstLineMockSession | null,
  cardId: string,
): FirstLineMockSession | null {
  if (!session) return null;
  const sourceCardIds = session.sourceCardIds.filter((id) => id !== cardId);
  const cardOrder = session.cardOrder.filter((id) => id !== cardId);
  if (cardOrder.length === 0) return null;
  const answers = removeCardFromRecord(session.answers, cardId);
  return {
    ...session,
    sourceCardIds,
    cardOrder,
    answers,
    screen: cardOrder.every((id) => Boolean(answers[id])) ? "complete" : "exam",
  };
}

export function hasCardRelatedData(
  cardId: string,
  data: {
    statuses: FirstLineStatusMap;
    attempts: StudyAttemptsByDate;
    answerLearningStatuses: AnswerLearningStatuses;
    answerLearningAttempts: AnswerLearningAttemptsByDate;
    myAnswers: MyAnswers;
    cardMemos: CardMemos;
  },
) {
  return Boolean(
    data.statuses[cardId] ||
      data.answerLearningStatuses[cardId] ||
      data.myAnswers[cardId] ||
      data.cardMemos[cardId]?.length ||
      Object.values(data.attempts).some((attempts) =>
        attempts.some((attempt) => attempt.cardId === cardId),
      ) ||
      Object.values(data.answerLearningAttempts).some((attempts) =>
        attempts.some((attempt) => attempt.cardId === cardId),
      ),
  );
}
