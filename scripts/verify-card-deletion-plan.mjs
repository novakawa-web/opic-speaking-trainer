import assert from "node:assert/strict";
import { cards } from "../src/data/cards.ts";
import {
  CardDeletionPlanError,
  createCardDeletionPlan,
  validateCardDeletionPlan,
} from "../src/utils/cardDeletionPlan.ts";
import {
  ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY,
  ANSWER_LEARNING_STATUSES_STORAGE_KEY,
  normalizeAnswerLearningAttempts,
  normalizeAnswerLearningStatuses,
  saveAnswerLearningAttempts,
  saveAnswerLearningStatuses,
} from "../src/utils/answerLearningStorage.ts";
import {
  ANSWER_LEARNING_SESSION_KEY,
  createEmptyAnswerLearningSession,
  normalizeAnswerLearningSession,
  saveAnswerLearningSession,
} from "../src/utils/answerLearningSession.ts";
import {
  ARCHIVED_CARD_IDS_STORAGE_KEY,
  saveArchivedCardIds,
} from "../src/utils/cardArchiveStorage.ts";
import {
  CARD_MEMOS_STORAGE_KEY,
  normalizeCardMemos,
  saveCardMemos,
} from "../src/utils/cardMemoStorage.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  parseCardDataset,
} from "../src/utils/cardStorage.ts";
import {
  FIRST_LINE_MOCK_SESSION_KEY,
  createFirstLineMockSession,
  parseFirstLineMockSession,
  saveFirstLineMockSession,
} from "../src/utils/firstLineMockSession.ts";
import {
  MY_ANSWERS_STORAGE_KEY,
  normalizeMyAnswers,
  saveMyAnswers,
} from "../src/utils/myAnswerStorage.ts";
import {
  DEFAULT_NAVIGATION_SESSION,
  NAVIGATION_SESSION_STORAGE_KEY,
  saveNavigationSession,
} from "../src/utils/navigationSession.ts";
import {
  FIRST_LINE_STATUSES_STORAGE_KEY,
  normalizeStatuses,
  saveStatuses,
} from "../src/utils/statusStorage.ts";
import { applyStorageMutations } from "../src/utils/storageTransaction.ts";
import {
  STUDY_ATTEMPTS_STORAGE_KEY,
  saveStudyAttempts,
} from "../src/utils/studyStats.ts";
import {
  CARD_DETAIL_UI_SESSION_KEY,
  SHADOWING_PLAYER_SESSION_KEY,
  defaultCardDetailUiSession,
  saveCardDetailUiSession,
  saveShadowingPlayerSession,
} from "../src/utils/uiSessionStorage.ts";

class MemoryStorage {
  values = new Map();
  calls = [];
  getItem(key) {
    this.calls.push(["getItem", key]);
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.calls.push(["setItem", key]);
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.calls.push(["removeItem", key]);
    this.values.delete(key);
  }
  peek(key) { return this.values.get(key) ?? null; }
}

const target = cards[0];
const other = cards[1];
const NOW = new Date("2026-07-21T08:09:10.111Z");
const DATE_A = "2026-07-20";
const DATE_B = "2026-07-21";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createState(overrides = {}) {
  const answerSession = {
    ...createEmptyAnswerLearningSession(),
    screen: "learning",
    selectedCardIds: [target.id, other.id],
    cardOrder: [target.id, other.id],
    currentIndex: 1,
    answerSources: { [target.id]: "my-answer", [other.id]: "default" },
    reveals: {
      [target.id]: { hint: true, firstLine: true, answer: true, frontKo: true },
      [other.id]: { hint: false, firstLine: false, answer: false, frontKo: false },
    },
  };
  const mockSession = createFirstLineMockSession(
    [target.id, other.id],
    "all",
    () => 0.75,
  );
  mockSession.answers[target.id] = "hard";
  const detailSession = {
    ...defaultCardDetailUiSession(target.id, true),
    showHint: true,
    showAnswer: true,
  };
  const state = {
    cards: clone([target, other]),
    firstLineStatuses: { [target.id]: "hard", [other.id]: "success" },
    firstLineAttemptsByDate: {
      [DATE_A]: [
        { date: DATE_A, cardId: target.id, status: "hard", timestamp: `${DATE_A}T01:00:00.000Z` },
        { id: "other-first-a", date: DATE_A, cardId: other.id, status: "success", timestamp: `${DATE_A}T02:00:00.000Z` },
      ],
      [DATE_B]: [
        { id: "target-first-b", date: DATE_B, cardId: target.id, status: "again", timestamp: `${DATE_B}T01:00:00.000Z` },
        { id: "other-first-b", date: DATE_B, cardId: other.id, status: "hard", timestamp: `${DATE_B}T02:00:00.000Z` },
      ],
    },
    answerLearningStatuses: { [target.id]: "learning", [other.id]: "speakable" },
    answerLearningAttemptsByDate: {
      [DATE_A]: [
        { id: "target-answer-a", date: DATE_A, cardId: target.id, status: "learning", timestamp: `${DATE_A}T03:00:00.000Z`, answerSource: "my-answer" },
        { id: "other-answer-a", date: DATE_A, cardId: other.id, status: "speakable", timestamp: `${DATE_A}T04:00:00.000Z`, answerSource: "default" },
      ],
      [DATE_B]: [
        { id: "target-answer-b", date: DATE_B, cardId: target.id, status: "hard", timestamp: `${DATE_B}T03:00:00.000Z`, answerSource: "default" },
      ],
    },
    myAnswers: { [target.id]: "My target answer.", [other.id]: "My other answer." },
    cardMemos: {
      [target.id]: [
        { id: "memo-target-a", cardId: target.id, content: "Target memo A", pinned: true, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
        { id: "memo-target-b", cardId: target.id, content: "Target memo B", pinned: false, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
      ],
      [other.id]: [
        { id: "memo-other", cardId: other.id, content: "Other memo", pinned: true, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
      ],
    },
    archivedCardIds: [target.id, other.id],
    firstLineMockSession: mockSession,
    answerLearningSession: answerSession,
    cardDetailSession: detailSession,
    shadowingSession: {
      active: true,
      sourceType: "modelAnswer",
      cardId: target.id,
      currentIndex: 1,
      status: "paused",
      questionExpanded: true,
      showFrontKo: false,
    },
    navigationSession: {
      ...clone(DEFAULT_NAVIGATION_SESSION),
      currentView: "detail",
      selectedCardId: target.id,
      detailSource: "library",
      drillCardIds: [target.id, other.id],
    },
  };
  return Object.assign(state, overrides);
}

function makePlan(state = createState(), now = NOW) {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  return {
    plan: createCardDeletionPlan({
      cardId: target.id,
      currentState: state,
      now,
      localStorage,
      sessionStorage,
    }),
    localStorage,
    sessionStorage,
  };
}

function mutation(plan, key) {
  return plan.mutations.find((candidate) => candidate.key === key);
}

function assertPlanError(run, code) {
  assert.throws(run, (error) =>
    error instanceof CardDeletionPlanError && error.code === code,
  );
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("1. general card deletion plan", () => {
  const { plan } = makePlan();
  assert.equal(plan.deletedCard.id, target.id);
  assert.deepEqual(plan.nextState.cards.map((card) => card.id), [other.id]);
});

test("2. first-line-only card deletion", () => {
  const firstLineOnly = {
    ...clone(target),
    firstLine: "Hello.",
    back: ["Hello."],
    hint: { title: "", memoryTip: "", subjectTip: "", minimum: "", flow: [] },
    tags: ["firstline_only"],
  };
  const state = createState({ cards: [firstLineOnly, clone(other)] });
  const { plan } = makePlan(state);
  assert.equal(plan.deletedCard.firstLine, "Hello.");
});

test("3. archived card deletion", () => {
  const { plan } = makePlan();
  assert.deepEqual(plan.nextState.archivedCardIds, [other.id]);
  assert.equal(plan.removedReferences.archivedReferenceCount, 1);
});

test("4. first-line status removed", () => {
  const { plan } = makePlan();
  assert.equal(plan.nextState.firstLineStatuses[target.id], undefined);
  assert.equal(plan.nextState.firstLineStatuses[other.id], "success");
});

test("5. answer-learning status removed", () => {
  const { plan } = makePlan();
  assert.equal(plan.nextState.answerLearningStatuses[target.id], undefined);
  assert.equal(plan.nextState.answerLearningStatuses[other.id], "speakable");
});

test("6. my answer removed", () => {
  const { plan } = makePlan();
  assert.equal(plan.nextState.myAnswers[target.id], undefined);
  assert.equal(plan.nextState.myAnswers[other.id], "My other answer.");
});

test("7. multiple card memos removed", () => {
  const { plan } = makePlan();
  assert.equal(plan.nextState.cardMemos[target.id], undefined);
  assert.equal(plan.removedReferences.memoCount, 2);
});

test("8. first-line attempts removed from every date", () => {
  const { plan } = makePlan();
  assert.equal(plan.removedReferences.firstLineAttemptCount, 2);
  assert.ok(Object.values(plan.nextState.firstLineAttemptsByDate).flat().every((attempt) => attempt.cardId !== target.id));
});

test("9. answer attempts removed from every date", () => {
  const { plan } = makePlan();
  assert.equal(plan.removedReferences.answerLearningAttemptCount, 2);
  assert.ok(Object.values(plan.nextState.answerLearningAttemptsByDate).flat().every((attempt) => attempt.cardId !== target.id));
});

test("10. other card records remain semantically identical", () => {
  const state = createState();
  const before = JSON.stringify({
    card: state.cards[1],
    status: state.firstLineStatuses[other.id],
    answerStatus: state.answerLearningStatuses[other.id],
    answer: state.myAnswers[other.id],
    memos: state.cardMemos[other.id],
  });
  const { plan } = makePlan(state);
  const after = JSON.stringify({
    card: plan.nextState.cards[0],
    status: plan.nextState.firstLineStatuses[other.id],
    answerStatus: plan.nextState.answerLearningStatuses[other.id],
    answer: plan.nextState.myAnswers[other.id],
    memos: plan.nextState.cardMemos[other.id],
  });
  assert.equal(after, before);
});

test("11. archived ID order remains stable", () => {
  const third = "third-card";
  const { plan } = makePlan(createState({ archivedCardIds: [other.id, target.id, third] }));
  assert.deepEqual(plan.nextState.archivedCardIds, [other.id, third]);
});

test("12. target removed from first-line mock session", () => {
  const { plan } = makePlan();
  assert.deepEqual(plan.nextState.firstLineMockSession.cardOrder, [other.id]);
  assert.equal(plan.nextState.firstLineMockSession.answers[target.id], undefined);
});

test("13. mock current position is normalized through navigation", () => {
  const { plan } = makePlan();
  assert.equal(plan.nextState.navigationSession.selectedCardId, null);
  assert.equal(plan.nextState.navigationSession.currentView, "library");
  assert.deepEqual(plan.nextState.navigationSession.drillCardIds, [other.id]);
});

test("14. last mock card removes session key", () => {
  const onlyTarget = createFirstLineMockSession([target.id], "all", () => 0.5);
  const state = createState({ firstLineMockSession: onlyTarget });
  const { plan } = makePlan(state);
  assert.equal(plan.nextState.firstLineMockSession, null);
  assert.equal(mutation(plan, FIRST_LINE_MOCK_SESSION_KEY).value, null);
});

test("15. answer-learning session removes target", () => {
  const { plan } = makePlan();
  assert.deepEqual(plan.nextState.answerLearningSession.cardOrder, [other.id]);
  assert.equal(plan.nextState.answerLearningSession.answerSources[target.id], undefined);
});

test("16. answer-learning current index is clamped", () => {
  const state = createState();
  state.answerLearningSession.currentIndex = 1;
  const { plan } = makePlan(state);
  assert.equal(plan.nextState.answerLearningSession.currentIndex, 0);
});

test("17. target card-detail session is removed", () => {
  const { plan } = makePlan();
  assert.equal(plan.nextState.cardDetailSession, null);
  assert.equal(mutation(plan, CARD_DETAIL_UI_SESSION_KEY).value, null);
});

test("18. target shadowing session is removed", () => {
  const { plan } = makePlan();
  assert.equal(plan.nextState.shadowingSession, null);
  assert.equal(mutation(plan, SHADOWING_PLAYER_SESSION_KEY).value, null);
});

test("19. navigation session removes target references", () => {
  const { plan } = makePlan();
  const raw = JSON.parse(mutation(plan, NAVIGATION_SESSION_STORAGE_KEY).value);
  assert.equal(raw.selectedCardId, null);
  assert.ok(!raw.drillCardIds.includes(target.id));
});

test("20. unrelated detail and saved-passage sessions remain unchanged", () => {
  const unrelatedDetail = defaultCardDetailUiSession(other.id, true);
  const passageSession = {
    active: true,
    sourceType: "savedPassage",
    savedPassageId: "passage-1",
    currentIndex: 0,
    status: "paused",
    questionExpanded: false,
    showFrontKo: false,
  };
  const { plan } = makePlan(createState({ cardDetailSession: unrelatedDetail, shadowingSession: passageSession }));
  assert.deepEqual(plan.nextState.cardDetailSession, unrelatedDetail);
  assert.deepEqual(plan.nextState.shadowingSession, passageSession);
  assert.equal(mutation(plan, CARD_DETAIL_UI_SESSION_KEY), undefined);
  assert.equal(mutation(plan, SHADOWING_PLAYER_SESSION_KEY), undefined);
});

test("21. dataset updatedAt equals injected now", () => {
  const { plan } = makePlan();
  assert.equal(plan.updatedAt, NOW.toISOString());
  assert.equal(JSON.parse(mutation(plan, CARD_DATASET_STORAGE_KEY).value).updatedAt, NOW.toISOString());
});

test("22. timestamp is generated once", () => {
  let calls = 0;
  class CountingDate extends Date {
    toISOString() { calls += 1; return super.toISOString(); }
  }
  makePlan(createState(), new CountingDate(NOW));
  assert.equal(calls, 1);
});

test("23. missing target is an explicit error", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  assertPlanError(() => createCardDeletionPlan({ cardId: "missing", currentState: createState(), now: NOW, localStorage, sessionStorage }), "card-not-found");
});

test("24. damaged state is rejected", () => {
  const state = createState();
  state.firstLineStatuses[target.id] = "invalid";
  assertPlanError(() => makePlan(state), "invalid-state");
  const damagedSession = createState();
  damagedSession.navigationSession.drillCardIds.push("missing-card");
  assertPlanError(() => makePlan(damagedSession), "session-normalization-failed");
});

test("25. every non-null mutation is parseable JSON", () => {
  const { plan } = makePlan();
  for (const item of plan.mutations) if (item.value !== null) assert.doesNotThrow(() => JSON.parse(item.value));
});

test("26. raw values pass existing parsers and validators", () => {
  const { plan } = makePlan();
  assert.ok(parseCardDataset(mutation(plan, CARD_DATASET_STORAGE_KEY).value));
  assert.deepEqual(normalizeStatuses(JSON.parse(mutation(plan, FIRST_LINE_STATUSES_STORAGE_KEY).value)), plan.nextState.firstLineStatuses);
  assert.deepEqual(normalizeAnswerLearningStatuses(JSON.parse(mutation(plan, ANSWER_LEARNING_STATUSES_STORAGE_KEY).value)), plan.nextState.answerLearningStatuses);
  assert.deepEqual(normalizeAnswerLearningAttempts(JSON.parse(mutation(plan, ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY).value)), plan.nextState.answerLearningAttemptsByDate);
  assert.deepEqual(normalizeAnswerLearningSession(JSON.parse(mutation(plan, ANSWER_LEARNING_SESSION_KEY).value), [other.id]), plan.nextState.answerLearningSession);
  assert.equal(
    JSON.stringify(parseFirstLineMockSession(mutation(plan, FIRST_LINE_MOCK_SESSION_KEY).value, [other.id])),
    JSON.stringify(plan.nextState.firstLineMockSession),
  );
});

test("27. raw format matches existing savers", () => {
  const { plan } = makePlan();
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  saveStatuses(plan.nextState.firstLineStatuses);
  saveStudyAttempts(plan.nextState.firstLineAttemptsByDate);
  saveAnswerLearningStatuses(plan.nextState.answerLearningStatuses, local);
  saveAnswerLearningAttempts(plan.nextState.answerLearningAttemptsByDate, local);
  saveMyAnswers(plan.nextState.myAnswers);
  saveCardMemos(plan.nextState.cardMemos);
  saveArchivedCardIds(plan.nextState.archivedCardIds, local);
  if (plan.nextState.firstLineMockSession) saveFirstLineMockSession(plan.nextState.firstLineMockSession);
  saveAnswerLearningSession(plan.nextState.answerLearningSession);
  saveNavigationSession(plan.nextState.navigationSession);
  for (const key of [FIRST_LINE_STATUSES_STORAGE_KEY, STUDY_ATTEMPTS_STORAGE_KEY, ANSWER_LEARNING_STATUSES_STORAGE_KEY, ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY, MY_ANSWERS_STORAGE_KEY, CARD_MEMOS_STORAGE_KEY, ARCHIVED_CARD_IDS_STORAGE_KEY]) {
    assert.equal(mutation(plan, key).value, local.peek(key));
  }
  for (const key of [FIRST_LINE_MOCK_SESSION_KEY, ANSWER_LEARNING_SESSION_KEY, NAVIGATION_SESSION_STORAGE_KEY]) {
    assert.equal(mutation(plan, key).value, session.peek(key));
  }
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});

test("28. mutation targets are unique", () => {
  const { plan } = makePlan();
  const seen = new Map();
  for (const item of plan.mutations) {
    const keys = seen.get(item.storage) ?? new Set();
    assert.equal(keys.has(item.key), false);
    keys.add(item.key); seen.set(item.storage, keys);
  }
});

test("29. dataset mutation is last", () => {
  const { plan } = makePlan();
  assert.equal(plan.mutations.at(-1).key, CARD_DATASET_STORAGE_KEY);
});

test("30. personal memos and saved passages are untouched", () => {
  const { plan, localStorage } = makePlan();
  localStorage.values.set("opic-personal-memos", "personal-sentinel");
  localStorage.values.set("opic-saved-passages", "passage-sentinel");
  applyStorageMutations(plan.mutations);
  assert.equal(localStorage.peek("opic-personal-memos"), "personal-sentinel");
  assert.equal(localStorage.peek("opic-saved-passages"), "passage-sentinel");
});

test("31. remaining card order is preserved", () => {
  const third = { ...clone(other), id: "third-card" };
  const state = createState({ cards: [clone(other), clone(target), third] });
  const { plan } = makePlan(state);
  assert.deepEqual(plan.nextState.cards.map((card) => card.id), [other.id, third.id]);
});

test("32. empty-object and remove-key policies match savers", () => {
  const state = createState({
    firstLineStatuses: { [target.id]: "hard" },
    myAnswers: { [target.id]: "Only target" },
    cardMemos: { [target.id]: createState().cardMemos[target.id] },
    archivedCardIds: [target.id],
  });
  const { plan } = makePlan(state);
  assert.equal(mutation(plan, FIRST_LINE_STATUSES_STORAGE_KEY).value, "{}");
  assert.equal(mutation(plan, MY_ANSWERS_STORAGE_KEY).value, null);
  assert.equal(mutation(plan, CARD_MEMOS_STORAGE_KEY).value, null);
  assert.equal(mutation(plan, ARCHIVED_CARD_IDS_STORAGE_KEY).value, null);
});

test("33. Unicode and long private text can be deleted safely", () => {
  const state = createState();
  state.myAnswers[target.id] = ("한글 표현 🚀\n" + "long answer ".repeat(500)).trim();
  state.cardMemos[target.id][0].content = "기억할 표현 `code`";
  const { plan } = makePlan(state);
  assert.equal(plan.nextState.myAnswers[target.id], undefined);
});

test("34. legacy first-line attempt without id is removed", () => {
  const state = createState();
  assert.equal(state.firstLineAttemptsByDate[DATE_A][0].id, undefined);
  const { plan } = makePlan(state);
  assert.equal(plan.nextState.firstLineAttemptsByDate[DATE_A].some((item) => item.cardId === target.id), false);
});

test("35. prototype pollution keys are rejected", () => {
  const state = createState();
  Object.defineProperty(state.firstLineStatuses, "__proto__", { enumerable: true, value: "hard" });
  assertPlanError(() => makePlan(state), "invalid-state");
});

test("36. plan creation performs zero storage calls", () => {
  const { localStorage, sessionStorage } = makePlan();
  assert.deepEqual(localStorage.calls, []);
  assert.deepEqual(sessionStorage.calls, []);
});

test("37. plan has no React, navigation action, toast, or callback effects", () => {
  const { plan } = makePlan();
  assert.equal("toast" in plan, false);
  assert.equal("callback" in plan, false);
  assert.equal("navigate" in plan, false);
});

test("38. mutations can be applied by storageTransaction primitives", () => {
  const { plan, localStorage, sessionStorage } = makePlan();
  const result = applyStorageMutations(plan.mutations);
  assert.equal(result.appliedMutationCount, plan.mutations.length);
  assert.ok(parseCardDataset(localStorage.peek(CARD_DATASET_STORAGE_KEY)));
  assert.equal(sessionStorage.peek(CARD_DETAIL_UI_SESSION_KEY), null);
});

test("39. validation failures do not expose stored text", () => {
  const { plan } = makePlan();
  plan.nextState.cards.push(clone(target));
  assert.throws(() => validateCardDeletionPlan(plan), (error) => {
    assert.ok(error instanceof CardDeletionPlanError);
    assert.equal(error.message.includes(target.front), false);
    assert.equal(error.message.includes("My target answer"), false);
    assert.equal(error.message.includes("Target memo"), false);
    return true;
  });
});

test("40. identical input and now produce an identical semantic plan", () => {
  const first = makePlan(createState()).plan;
  const second = makePlan(createState()).plan;
  assert.deepEqual(first.nextState, second.nextState);
  assert.deepEqual(
    first.mutations.map(({ area, key, value }) => ({ area, key, value })),
    second.mutations.map(({ area, key, value }) => ({ area, key, value })),
  );
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
console.log(`Card deletion plan verification passed: ${passed}/${tests.length}`);
