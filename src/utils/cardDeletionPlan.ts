import type {
  AnswerLearningAttemptsByDate,
  AnswerLearningStatuses,
  FirstLineResult,
  FirstLineStatusMap,
  OpicCard,
  StudyAttemptsByDate,
} from "../types.ts";
import {
  ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY,
  ANSWER_LEARNING_STATUSES_STORAGE_KEY,
  normalizeAnswerLearningAttempts,
  normalizeAnswerLearningStatuses,
} from "./answerLearningStorage.ts";
import {
  ANSWER_LEARNING_SESSION_KEY,
  normalizeAnswerLearningSession,
  type AnswerLearningSession,
} from "./answerLearningSession.ts";
import {
  ARCHIVED_CARD_IDS_STORAGE_KEY,
  normalizeArchivedCardIds,
  parseArchivedCardIds,
} from "./cardArchiveStorage.ts";
import {
  removeCardFromAnswerLearningSession,
  removeCardFromAttempts,
  removeCardFromMockSession,
  removeCardFromRecord,
} from "./cardDeletion.ts";
import {
  CARD_MEMOS_STORAGE_KEY,
  normalizeCardMemos,
  parseCardMemos,
  type CardMemos,
} from "./cardMemoStorage.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  CARD_DATASET_VERSION,
  isOpicCard,
  parseCardDataset,
} from "./cardStorage.ts";
import {
  FIRST_LINE_MOCK_SESSION_KEY,
  parseFirstLineMockSession,
  type FirstLineMockSession,
} from "./firstLineMockSession.ts";
import {
  MY_ANSWERS_STORAGE_KEY,
  normalizeMyAnswers,
  parseMyAnswers,
  type MyAnswers,
} from "./myAnswerStorage.ts";
import {
  NAVIGATION_SESSION_STORAGE_KEY,
  type NavigationSession,
} from "./navigationSession.ts";
import {
  FIRST_LINE_STATUSES_STORAGE_KEY,
  normalizeStatuses,
} from "./statusStorage.ts";
import type {
  StorageLike,
  StorageMutation,
  StorageTarget,
} from "./storageTransaction.ts";
import { STUDY_ATTEMPTS_STORAGE_KEY } from "./studyStats.ts";
import {
  CARD_DETAIL_UI_SESSION_KEY,
  SHADOWING_PLAYER_SESSION_KEY,
  parseCardDetailUiSession,
  parseShadowingPlayerSession,
  type CardDetailUiSession,
  type ShadowingPlayerSession,
} from "./uiSessionStorage.ts";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FIRST_LINE_RESULTS = new Set<FirstLineResult>(["success", "again", "hard"]);

export type CardDeletionState = {
  cards: OpicCard[];
  firstLineStatuses: FirstLineStatusMap;
  firstLineAttemptsByDate: StudyAttemptsByDate;
  answerLearningStatuses: AnswerLearningStatuses;
  answerLearningAttemptsByDate: AnswerLearningAttemptsByDate;
  myAnswers: MyAnswers;
  cardMemos: CardMemos;
  archivedCardIds: string[];
  firstLineMockSession: FirstLineMockSession | null;
  answerLearningSession: AnswerLearningSession;
  cardDetailSession: CardDetailUiSession | null;
  shadowingSession: ShadowingPlayerSession | null;
  navigationSession: NavigationSession;
};

export type RemovedCardReferences = {
  firstLineStatusCount: number;
  firstLineAttemptCount: number;
  answerLearningStatusCount: number;
  answerLearningAttemptCount: number;
  myAnswerCount: number;
  memoCount: number;
  archivedReferenceCount: number;
  sessionReferenceCount: number;
};

export type CardDeletionPlan = {
  cardId: string;
  deletedCard: OpicCard;
  updatedAt: string;
  previousState: CardDeletionState;
  nextState: CardDeletionState;
  mutations: StorageMutation[];
  affectedTargets: StorageTarget[];
  removedReferences: RemovedCardReferences;
};

export type CardDeletionPlanErrorCode =
  | "invalid-card-id"
  | "card-not-found"
  | "invalid-state"
  | "invalid-timestamp"
  | "serialization-failed"
  | "validation-failed"
  | "duplicate-mutation"
  | "session-normalization-failed";

export class CardDeletionPlanError extends Error {
  readonly code: CardDeletionPlanErrorCode;
  readonly cardId?: string;
  readonly dataKind?: string;

  constructor(
    code: CardDeletionPlanErrorCode,
    options: { cardId?: string; dataKind?: string } = {},
  ) {
    super(`Card deletion plan failed: ${code}.`);
    this.name = "CardDeletionPlanError";
    this.code = code;
    this.cardId = options.cardId;
    this.dataKind = options.dataKind;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CreateCardDeletionPlanInput = {
  cardId: string;
  currentState: CardDeletionState;
  now: Date;
  localStorage: StorageLike;
  sessionStorage: StorageLike;
};

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !DANGEROUS_KEYS.has(value)
  );
}

function stringifyForComparison(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    throw new CardDeletionPlanError("invalid-state");
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return stringifyForComparison(left) === stringifyForComparison(right);
}

function serialize(dataKind: string, value: unknown): string {
  try {
    const raw = JSON.stringify(value);
    if (typeof raw !== "string") {
      throw new CardDeletionPlanError("serialization-failed", { dataKind });
    }
    JSON.parse(raw);
    return raw;
  } catch (error) {
    if (error instanceof CardDeletionPlanError) throw error;
    throw new CardDeletionPlanError("serialization-failed", { dataKind });
  }
}

function cloneJson<T>(dataKind: string, value: T): T {
  return JSON.parse(serialize(dataKind, value)) as T;
}

function assertSafeObjectGraph(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CardDeletionPlanError("invalid-state");
    return;
  }
  if (typeof value !== "object") throw new CardDeletionPlanError("invalid-state");
  if (seen.has(value)) throw new CardDeletionPlanError("invalid-state");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) throw new CardDeletionPlanError("invalid-state", { dataKind: key });
    assertSafeObjectGraph(child, seen);
  }
  seen.delete(value);
}

function assertCanonical<T>(
  dataKind: string,
  value: T,
  normalize: (candidate: unknown) => T,
): void {
  if (!sameJson(value, normalize(value))) {
    throw new CardDeletionPlanError("invalid-state", { dataKind });
  }
}

function isStudyAttempts(value: StudyAttemptsByDate): boolean {
  return Object.entries(value).every(([date, attempts]) =>
    isSafeId(date) &&
    Array.isArray(attempts) &&
    attempts.every((attempt) =>
      Boolean(attempt) &&
      (attempt.id === undefined || typeof attempt.id === "string") &&
      attempt.date === date &&
      isSafeId(attempt.cardId) &&
      FIRST_LINE_RESULTS.has(attempt.status) &&
      typeof attempt.timestamp === "string",
    ),
  );
}

function assertNavigationSession(session: NavigationSession): void {
  const views = new Set(["home", "library", "detail", "drill"]);
  const drillSources = new Set(["list", "detail"]);
  const detailSources = new Set(["home", "library"]);
  if (
    !views.has(session.currentView) ||
    (session.selectedCardId !== null && !isSafeId(session.selectedCardId)) ||
    !drillSources.has(session.drillSource) ||
    !detailSources.has(session.detailSource) ||
    !Array.isArray(session.drillCardIds) ||
    !session.drillCardIds.every(isSafeId) ||
    !session.filters ||
    typeof session.filters !== "object" ||
    typeof session.filters.selectedDeck !== "string" ||
    typeof session.filters.selectedTag !== "string" ||
    typeof session.filters.finalOnly !== "boolean" ||
    typeof session.filters.hardOnly !== "boolean" ||
    !["all", "new"].includes(session.filters.cardScope) ||
    !["default", "random", "least-practiced"].includes(
      session.filters.studyOrder,
    )
  ) {
    throw new CardDeletionPlanError("invalid-state", { dataKind: "navigation-session" });
  }
}

function assertValidCurrentState(state: CardDeletionState): void {
  assertSafeObjectGraph(state);
  if (!Array.isArray(state.cards) || !state.cards.every(isOpicCard)) {
    throw new CardDeletionPlanError("invalid-state", { dataKind: "cards" });
  }
  const cardIds = state.cards.map((card) => card.id);
  if (cardIds.some((id) => !isSafeId(id)) || new Set(cardIds).size !== cardIds.length) {
    throw new CardDeletionPlanError("invalid-state", { dataKind: "cards" });
  }
  assertCanonical("first-line-statuses", state.firstLineStatuses, normalizeStatuses);
  if (!isStudyAttempts(state.firstLineAttemptsByDate)) {
    throw new CardDeletionPlanError("invalid-state", { dataKind: "first-line-attempts" });
  }
  assertCanonical(
    "answer-learning-statuses",
    state.answerLearningStatuses,
    normalizeAnswerLearningStatuses,
  );
  assertCanonical(
    "answer-learning-attempts",
    state.answerLearningAttemptsByDate,
    normalizeAnswerLearningAttempts,
  );
  assertCanonical("my-answers", state.myAnswers, normalizeMyAnswers);
  assertCanonical("card-memos", state.cardMemos, normalizeCardMemos);
  assertCanonical("archived-card-ids", state.archivedCardIds, normalizeArchivedCardIds);

  if (state.firstLineMockSession) {
    const parsed = parseFirstLineMockSession(
      serialize("first-line-mock-session", state.firstLineMockSession),
      cardIds,
    );
    if (!parsed || !sameJson(parsed, state.firstLineMockSession)) {
      throw new CardDeletionPlanError("session-normalization-failed", {
        dataKind: "first-line-mock-session",
      });
    }
  }

  const normalizedAnswerSession = normalizeAnswerLearningSession(
    state.answerLearningSession,
    cardIds,
  );
  if (!sameJson(normalizedAnswerSession, state.answerLearningSession)) {
    throw new CardDeletionPlanError("session-normalization-failed", {
      dataKind: "answer-learning-session",
    });
  }

  if (state.cardDetailSession) {
    if (!cardIds.includes(state.cardDetailSession.cardId)) {
      throw new CardDeletionPlanError("session-normalization-failed", {
        dataKind: "card-detail-session",
      });
    }
    const parsed = parseCardDetailUiSession(
      serialize("card-detail-session", state.cardDetailSession),
      state.cardDetailSession.cardId,
      Boolean(state.myAnswers[state.cardDetailSession.cardId]),
    );
    if (!sameJson(parsed, state.cardDetailSession)) {
      throw new CardDeletionPlanError("session-normalization-failed", {
        dataKind: "card-detail-session",
      });
    }
  }

  if (state.shadowingSession) {
    if (
      state.shadowingSession.sourceType !== "savedPassage" &&
      !cardIds.includes(state.shadowingSession.cardId)
    ) {
      throw new CardDeletionPlanError("session-normalization-failed", {
        dataKind: "shadowing-session",
      });
    }
    const parsed = parseShadowingPlayerSession(
      serialize("shadowing-session", state.shadowingSession),
    );
    if (!parsed || !sameJson(parsed, state.shadowingSession)) {
      throw new CardDeletionPlanError("session-normalization-failed", {
        dataKind: "shadowing-session",
      });
    }
  }
  assertNavigationSession(state.navigationSession);
  if (
    (state.navigationSession.selectedCardId !== null &&
      !cardIds.includes(state.navigationSession.selectedCardId)) ||
    state.navigationSession.drillCardIds.some((id) => !cardIds.includes(id)) ||
    new Set(state.navigationSession.drillCardIds).size !==
      state.navigationSession.drillCardIds.length
  ) {
    throw new CardDeletionPlanError("session-normalization-failed", {
      dataKind: "navigation-session",
    });
  }
}

function countAttemptReferences(
  attemptsByDate: Record<string, Array<{ cardId: string }>>,
  cardId: string,
): number {
  return Object.values(attemptsByDate).reduce(
    (count, attempts) =>
      count + attempts.filter((attempt) => attempt.cardId === cardId).length,
    0,
  );
}

function countSessionReferences(state: CardDeletionState, cardId: string): number {
  let count = 0;
  const mock = state.firstLineMockSession;
  if (mock) {
    count += mock.sourceCardIds.filter((id) => id === cardId).length;
    count += mock.cardOrder.filter((id) => id === cardId).length;
    count += Number(Object.hasOwn(mock.answers, cardId));
  }
  const answer = state.answerLearningSession;
  count += answer.selectedCardIds.filter((id) => id === cardId).length;
  count += answer.cardOrder.filter((id) => id === cardId).length;
  count += Number(Object.hasOwn(answer.answerSources, cardId));
  count += Number(Object.hasOwn(answer.reveals, cardId));
  count += Number(state.cardDetailSession?.cardId === cardId);
  count += Number(
    state.shadowingSession?.sourceType !== "savedPassage" &&
      state.shadowingSession?.cardId === cardId,
  );
  count += state.navigationSession.drillCardIds.filter((id) => id === cardId).length;
  count += Number(state.navigationSession.selectedCardId === cardId);
  return count;
}

function normalizeNavigationAfterDeletion(
  session: NavigationSession,
  cardId: string,
): NavigationSession {
  const selectedWasDeleted = session.selectedCardId === cardId;
  return {
    ...session,
    currentView: selectedWasDeleted ? "library" : session.currentView,
    selectedCardId: selectedWasDeleted ? null : session.selectedCardId,
    detailSource: selectedWasDeleted ? "library" : session.detailSource,
    drillCardIds: session.drillCardIds.filter((id) => id !== cardId),
    filters: { ...session.filters },
  };
}

function createNextState(
  current: CardDeletionState,
  cardId: string,
): CardDeletionState {
  const nextMock = removeCardFromMockSession(current.firstLineMockSession, cardId);
  return {
    cards: current.cards.filter((card) => card.id !== cardId),
    firstLineStatuses: removeCardFromRecord(current.firstLineStatuses, cardId),
    firstLineAttemptsByDate: removeCardFromAttempts(
      current.firstLineAttemptsByDate,
      cardId,
    ),
    answerLearningStatuses: removeCardFromRecord(
      current.answerLearningStatuses,
      cardId,
    ),
    answerLearningAttemptsByDate: removeCardFromAttempts(
      current.answerLearningAttemptsByDate,
      cardId,
    ),
    myAnswers: removeCardFromRecord(current.myAnswers, cardId),
    cardMemos: removeCardFromRecord(current.cardMemos, cardId),
    archivedCardIds: current.archivedCardIds.filter((id) => id !== cardId),
    firstLineMockSession: nextMock,
    answerLearningSession: removeCardFromAnswerLearningSession(
      current.answerLearningSession,
      cardId,
    ),
    cardDetailSession:
      current.cardDetailSession?.cardId === cardId
        ? null
        : current.cardDetailSession,
    shadowingSession:
      current.shadowingSession?.sourceType !== "savedPassage" &&
      current.shadowingSession?.cardId === cardId
        ? null
        : current.shadowingSession,
    navigationSession: normalizeNavigationAfterDeletion(
      current.navigationSession,
      cardId,
    ),
  };
}

function emptyRecordAsNull(value: Record<string, unknown>): string | null {
  return Object.keys(value).length === 0 ? null : serialize("record", value);
}

function buildMutations(
  current: CardDeletionState,
  next: CardDeletionState,
  updatedAt: string,
  localStorage: StorageLike,
  sessionStorage: StorageLike,
): StorageMutation[] {
  const mutations: StorageMutation[] = [];

  if (current.firstLineMockSession !== null || next.firstLineMockSession !== null) {
    mutations.push({
      area: "session",
      storage: sessionStorage,
      key: FIRST_LINE_MOCK_SESSION_KEY,
      value: next.firstLineMockSession
        ? serialize("first-line-mock-session", next.firstLineMockSession)
        : null,
    });
  }
  mutations.push({
    area: "session",
    storage: sessionStorage,
    key: ANSWER_LEARNING_SESSION_KEY,
    value: serialize("answer-learning-session", next.answerLearningSession),
  });
  if (current.cardDetailSession?.cardId !== next.cardDetailSession?.cardId) {
    mutations.push({
      area: "session",
      storage: sessionStorage,
      key: CARD_DETAIL_UI_SESSION_KEY,
      value: next.cardDetailSession
        ? serialize("card-detail-session", next.cardDetailSession)
        : null,
    });
  }
  if (!sameJson(current.shadowingSession, next.shadowingSession)) {
    mutations.push({
      area: "session",
      storage: sessionStorage,
      key: SHADOWING_PLAYER_SESSION_KEY,
      value: next.shadowingSession
        ? serialize("shadowing-session", next.shadowingSession)
        : null,
    });
  }
  mutations.push({
    area: "session",
    storage: sessionStorage,
    key: NAVIGATION_SESSION_STORAGE_KEY,
    value: serialize("navigation-session", next.navigationSession),
  });

  mutations.push(
    {
      area: "local",
      storage: localStorage,
      key: FIRST_LINE_STATUSES_STORAGE_KEY,
      value: serialize("first-line-statuses", normalizeStatuses(next.firstLineStatuses)),
    },
    {
      area: "local",
      storage: localStorage,
      key: STUDY_ATTEMPTS_STORAGE_KEY,
      value: serialize("first-line-attempts", next.firstLineAttemptsByDate),
    },
    {
      area: "local",
      storage: localStorage,
      key: ANSWER_LEARNING_STATUSES_STORAGE_KEY,
      value: serialize(
        "answer-learning-statuses",
        normalizeAnswerLearningStatuses(next.answerLearningStatuses),
      ),
    },
    {
      area: "local",
      storage: localStorage,
      key: ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY,
      value: serialize(
        "answer-learning-attempts",
        normalizeAnswerLearningAttempts(next.answerLearningAttemptsByDate),
      ),
    },
    {
      area: "local",
      storage: localStorage,
      key: MY_ANSWERS_STORAGE_KEY,
      value: emptyRecordAsNull(normalizeMyAnswers(next.myAnswers)),
    },
    {
      area: "local",
      storage: localStorage,
      key: CARD_MEMOS_STORAGE_KEY,
      value: emptyRecordAsNull(normalizeCardMemos(next.cardMemos)),
    },
    {
      area: "local",
      storage: localStorage,
      key: ARCHIVED_CARD_IDS_STORAGE_KEY,
      value:
        next.archivedCardIds.length === 0
          ? null
          : serialize(
              "archived-card-ids",
              normalizeArchivedCardIds(next.archivedCardIds),
            ),
    },
  );

  // The dataset is ordered last so readers do not observe a removed card while
  // its dependent records are still pending. It is not an ACID commit marker;
  // the later integration must still use an app-level compensating rollback.
  mutations.push({
    area: "local",
    storage: localStorage,
    key: CARD_DATASET_STORAGE_KEY,
    value: serialize("card-dataset", {
      version: CARD_DATASET_VERSION,
      updatedAt,
      cards: next.cards,
    }),
  });
  return mutations;
}

function assertNoCardReferences(state: CardDeletionState, cardId: string): void {
  if (
    state.cards.some((card) => card.id === cardId) ||
    Object.hasOwn(state.firstLineStatuses, cardId) ||
    Object.hasOwn(state.answerLearningStatuses, cardId) ||
    Object.hasOwn(state.myAnswers, cardId) ||
    Object.hasOwn(state.cardMemos, cardId) ||
    state.archivedCardIds.includes(cardId) ||
    countAttemptReferences(state.firstLineAttemptsByDate, cardId) > 0 ||
    countAttemptReferences(state.answerLearningAttemptsByDate, cardId) > 0 ||
    countSessionReferences(state, cardId) > 0
  ) {
    throw new CardDeletionPlanError("validation-failed", { cardId });
  }
}

function assertUniqueMutations(mutations: readonly StorageMutation[]): void {
  const keysByStorage = new Map<StorageLike, Set<string>>();
  for (const mutation of mutations) {
    const keys = keysByStorage.get(mutation.storage) ?? new Set<string>();
    if (keys.has(mutation.key)) {
      throw new CardDeletionPlanError("duplicate-mutation", {
        dataKind: mutation.key,
      });
    }
    keys.add(mutation.key);
    keysByStorage.set(mutation.storage, keys);
  }
}

function mutationFor(plan: CardDeletionPlan, key: string): StorageMutation | undefined {
  return plan.mutations.find((mutation) => mutation.key === key);
}

function parseRaw(mutation: StorageMutation | undefined, dataKind: string): unknown {
  if (!mutation || mutation.value === null) return null;
  try {
    return JSON.parse(mutation.value);
  } catch {
    throw new CardDeletionPlanError("validation-failed", { dataKind });
  }
}

export function validateCardDeletionPlan(plan: CardDeletionPlan): void {
  const expectedDeletedCard = plan.previousState.cards.find(
    (card) => card.id === plan.cardId,
  );
  if (
    !expectedDeletedCard ||
    !sameJson(expectedDeletedCard, plan.deletedCard) ||
    !sameJson(createNextState(plan.previousState, plan.cardId), plan.nextState)
  ) {
    throw new CardDeletionPlanError("validation-failed", {
      dataKind: "semantic-state",
    });
  }
  assertNoCardReferences(plan.nextState, plan.cardId);
  const expectedOtherCards = plan.previousState.cards.filter(
    (card) => card.id !== plan.cardId,
  );
  if (!sameJson(expectedOtherCards, plan.nextState.cards)) {
    throw new CardDeletionPlanError("validation-failed", { dataKind: "cards" });
  }
  assertUniqueMutations(plan.mutations);
  if (
    plan.affectedTargets.length !== plan.mutations.length ||
    plan.affectedTargets.some((target, index) => {
      const mutation = plan.mutations[index];
      return (
        target.area !== mutation.area ||
        target.storage !== mutation.storage ||
        target.key !== mutation.key
      );
    })
  ) {
    throw new CardDeletionPlanError("validation-failed", {
      dataKind: "affected-targets",
    });
  }
  if (plan.mutations.at(-1)?.key !== CARD_DATASET_STORAGE_KEY) {
    throw new CardDeletionPlanError("validation-failed", { dataKind: "mutation-order" });
  }
  for (const mutation of plan.mutations) {
    if (mutation.value !== null) parseRaw(mutation, mutation.key);
  }

  const datasetMutation = mutationFor(plan, CARD_DATASET_STORAGE_KEY);
  const dataset = parseCardDataset(datasetMutation?.value ?? null);
  if (
    !dataset ||
    dataset.updatedAt !== plan.updatedAt ||
    !sameJson(dataset.cards, plan.nextState.cards)
  ) {
    throw new CardDeletionPlanError("validation-failed", { dataKind: "card-dataset" });
  }
  if (
    !sameJson(
      normalizeStatuses(parseRaw(mutationFor(plan, FIRST_LINE_STATUSES_STORAGE_KEY), "statuses")),
      plan.nextState.firstLineStatuses,
    ) ||
    !sameJson(
      parseRaw(mutationFor(plan, STUDY_ATTEMPTS_STORAGE_KEY), "attempts"),
      plan.nextState.firstLineAttemptsByDate,
    ) ||
    !sameJson(
      normalizeAnswerLearningStatuses(
        parseRaw(mutationFor(plan, ANSWER_LEARNING_STATUSES_STORAGE_KEY), "answer-statuses"),
      ),
      plan.nextState.answerLearningStatuses,
    ) ||
    !sameJson(
      normalizeAnswerLearningAttempts(
        parseRaw(mutationFor(plan, ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY), "answer-attempts"),
      ),
      plan.nextState.answerLearningAttemptsByDate,
    )
  ) {
    throw new CardDeletionPlanError("validation-failed", { dataKind: "local-records" });
  }
  const answersMutation = mutationFor(plan, MY_ANSWERS_STORAGE_KEY);
  const memosMutation = mutationFor(plan, CARD_MEMOS_STORAGE_KEY);
  const archivedMutation = mutationFor(plan, ARCHIVED_CARD_IDS_STORAGE_KEY);
  if (
    !sameJson(parseMyAnswers(answersMutation?.value ?? null), plan.nextState.myAnswers) ||
    !sameJson(parseCardMemos(memosMutation?.value ?? null), plan.nextState.cardMemos) ||
    !sameJson(
      parseArchivedCardIds(archivedMutation?.value ?? null),
      plan.nextState.archivedCardIds,
    )
  ) {
    throw new CardDeletionPlanError("validation-failed", { dataKind: "optional-records" });
  }

  const validCardIds = plan.nextState.cards.map((card) => card.id);
  const mockMutation = mutationFor(plan, FIRST_LINE_MOCK_SESSION_KEY);
  if (mockMutation) {
    const parsed = parseFirstLineMockSession(mockMutation.value, validCardIds);
    if (!sameJson(parsed, plan.nextState.firstLineMockSession)) {
      throw new CardDeletionPlanError("validation-failed", { dataKind: "first-line-mock-session" });
    }
  }
  const answerSession = normalizeAnswerLearningSession(
    parseRaw(mutationFor(plan, ANSWER_LEARNING_SESSION_KEY), "answer-session"),
    validCardIds,
  );
  if (!sameJson(answerSession, plan.nextState.answerLearningSession)) {
    throw new CardDeletionPlanError("validation-failed", { dataKind: "answer-learning-session" });
  }
  const navigation = parseRaw(
    mutationFor(plan, NAVIGATION_SESSION_STORAGE_KEY),
    "navigation-session",
  );
  if (!sameJson(navigation, plan.nextState.navigationSession)) {
    throw new CardDeletionPlanError("validation-failed", { dataKind: "navigation-session" });
  }
}

export function createCardDeletionPlan({
  cardId,
  currentState,
  now,
  localStorage,
  sessionStorage,
}: CreateCardDeletionPlanInput): CardDeletionPlan {
  if (!isSafeId(cardId)) {
    throw new CardDeletionPlanError("invalid-card-id");
  }
  if (!Number.isFinite(now.getTime())) {
    throw new CardDeletionPlanError("invalid-timestamp", { cardId });
  }
  const updatedAt = now.toISOString();
  assertValidCurrentState(currentState);
  const deletedCard = currentState.cards.find((card) => card.id === cardId);
  if (!deletedCard) {
    throw new CardDeletionPlanError("card-not-found", { cardId });
  }

  const previousState = cloneJson("previous-state", currentState);
  const nextState = cloneJson(
    "next-state",
    createNextState(currentState, cardId),
  );
  const mutations = buildMutations(
    currentState,
    nextState,
    updatedAt,
    localStorage,
    sessionStorage,
  );
  const plan: CardDeletionPlan = {
    cardId,
    deletedCard: cloneJson("deleted-card", deletedCard),
    updatedAt,
    previousState,
    nextState,
    mutations,
    affectedTargets: mutations.map(({ area, storage, key }) => ({
      area,
      storage,
      key,
    })),
    removedReferences: {
      firstLineStatusCount: Number(Object.hasOwn(currentState.firstLineStatuses, cardId)),
      firstLineAttemptCount: countAttemptReferences(
        currentState.firstLineAttemptsByDate,
        cardId,
      ),
      answerLearningStatusCount: Number(
        Object.hasOwn(currentState.answerLearningStatuses, cardId),
      ),
      answerLearningAttemptCount: countAttemptReferences(
        currentState.answerLearningAttemptsByDate,
        cardId,
      ),
      myAnswerCount: Number(Object.hasOwn(currentState.myAnswers, cardId)),
      memoCount: currentState.cardMemos[cardId]?.length ?? 0,
      archivedReferenceCount: currentState.archivedCardIds.filter(
        (id) => id === cardId,
      ).length,
      sessionReferenceCount: countSessionReferences(currentState, cardId),
    },
  };
  validateCardDeletionPlan(plan);
  return plan;
}
