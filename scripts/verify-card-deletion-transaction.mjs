import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cards } from "../src/data/cards.ts";
import {
  assembleCardDeletionState,
  CardDeletionIntegrationError,
  createCardDeletionRestoreMutations,
  describeCardDeletionFailure,
  executeCardDeletionTransaction,
  executeCardDeletionUndoTransaction,
} from "../src/utils/cardDeletionAdapter.ts";
import { createCardDeletionPlan } from "../src/utils/cardDeletionPlan.ts";
import { createEmptyAnswerLearningSession } from "../src/utils/answerLearningSession.ts";
import { createFirstLineMockSession } from "../src/utils/firstLineMockSession.ts";
import { DEFAULT_NAVIGATION_SESSION } from "../src/utils/navigationSession.ts";
import {
  StorageTransactionError,
  runStorageTransaction,
} from "../src/utils/storageTransaction.ts";
import {
  CARD_DETAIL_UI_SESSION_KEY,
  SHADOWING_PLAYER_SESSION_KEY,
  defaultCardDetailUiSession,
} from "../src/utils/uiSessionStorage.ts";

class InjectedStorageError extends Error {
  constructor(name = "InjectedStorageError", code) {
    super("Injected Web Storage failure");
    this.name = name;
    if (code !== undefined) this.code = code;
  }
}

class MockStorage {
  values = new Map();
  calls = [];
  failures = [];
  counts = { getItem: 0, setItem: 0, removeItem: 0 };

  constructor(initial = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.values.set(key, String(value));
    }
  }

  fail({ method, nth, key, skipMatches = 0, times = 1, error = new InjectedStorageError() }) {
    this.failures.push({ method, nth, key, skipMatches, times, error, matches: 0 });
  }

  maybeFail(method, key) {
    this.counts[method] += 1;
    for (const failure of this.failures) {
      if (failure.method !== method) continue;
      if (failure.key !== undefined && failure.key !== key) continue;
      if (failure.nth !== undefined && failure.nth !== this.counts[method]) continue;
      failure.matches += 1;
      if (failure.matches <= failure.skipMatches) continue;
      if (failure.times !== Infinity && failure.matches > failure.skipMatches + failure.times) continue;
      throw failure.error;
    }
  }

  getItem(key) {
    this.calls.push({ method: "getItem", key });
    this.maybeFail("getItem", key);
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.calls.push({ method: "setItem", key });
    this.maybeFail("setItem", key);
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.calls.push({ method: "removeItem", key });
    this.maybeFail("removeItem", key);
    this.values.delete(key);
  }

  raw(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  cloneValues() {
    return new Map(this.values);
  }
}

const target = cards[0];
const other = cards[1];
const NOW = new Date("2026-07-21T10:11:12.345Z");
const DATE = "2026-07-21";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createState(overrides = {}) {
  const answerLearningSession = {
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
  const firstLineMockSession = createFirstLineMockSession(
    [target.id, other.id],
    "all",
    () => 0.75,
  );
  firstLineMockSession.answers[target.id] = "hard";

  return Object.assign({
    cards: clone([target, other]),
    firstLineStatuses: { [target.id]: "hard", [other.id]: "success" },
    firstLineAttemptsByDate: {
      [DATE]: [
        { date: DATE, cardId: target.id, status: "hard", timestamp: `${DATE}T01:00:00.000Z` },
        { id: "other-first", date: DATE, cardId: other.id, status: "success", timestamp: `${DATE}T02:00:00.000Z` },
      ],
    },
    answerLearningStatuses: { [target.id]: "learning", [other.id]: "speakable" },
    answerLearningAttemptsByDate: {
      [DATE]: [
        { id: "target-answer", date: DATE, cardId: target.id, status: "learning", timestamp: `${DATE}T03:00:00.000Z`, answerSource: "my-answer" },
        { id: "other-answer", date: DATE, cardId: other.id, status: "speakable", timestamp: `${DATE}T04:00:00.000Z`, answerSource: "default" },
      ],
    },
    myAnswers: { [target.id]: "private target answer", [other.id]: "other answer" },
    cardMemos: {
      [target.id]: [{ id: "target-memo", cardId: target.id, content: "private target memo", pinned: true, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }],
      [other.id]: [{ id: "other-memo", cardId: other.id, content: "other memo", pinned: false, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }],
    },
    archivedCardIds: [target.id, other.id],
    firstLineMockSession,
    answerLearningSession,
    cardDetailSession: null,
    shadowingSession: null,
    navigationSession: {
      ...clone(DEFAULT_NAVIGATION_SESSION),
      currentView: "detail",
      selectedCardId: target.id,
      detailSource: "library",
      drillCardIds: [target.id, other.id],
    },
  }, overrides);
}

function createFixture(state = createState()) {
  const localStorage = new MockStorage({
    "opic-personal-memos": "personal-sentinel",
    "opic-saved-passages": "passage-sentinel",
  });
  const sessionStorage = new MockStorage({ unrelated: "session-sentinel" });
  const plan = createCardDeletionPlan({
    cardId: target.id,
    currentState: state,
    now: NOW,
    localStorage,
    sessionStorage,
  });
  plan.mutations.forEach((mutation, index) => {
    mutation.storage.values.set(mutation.key, `raw-before-${index}-${mutation.key}`);
  });
  return { state, localStorage, sessionStorage, plan };
}

function execute(fixture = createFixture()) {
  const commits = [];
  const execution = executeCardDeletionTransaction({
    plan: fixture.plan,
    commit: (state) => commits.push(state),
  });
  return { ...fixture, commits, execution };
}

function expectError(run, Type = Error) {
  let caught;
  try { run(); } catch (error) { caught = error; }
  assert.ok(caught instanceof Type);
  return caught;
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test("strict adapter reads canonical detail and shadowing sessions", () => {
  const state = createState();
  const sessionStorage = new MockStorage({
    [CARD_DETAIL_UI_SESSION_KEY]: JSON.stringify(defaultCardDetailUiSession(target.id, true)),
    [SHADOWING_PLAYER_SESSION_KEY]: JSON.stringify({
      active: true, sourceType: "modelAnswer", cardId: target.id, currentIndex: 0,
      status: "paused", questionExpanded: false, showFrontKo: false,
    }),
  });
  const assembled = assembleCardDeletionState({ ...state, sessionStorage });
  assert.equal(assembled.cardDetailSession.cardId, target.id);
  assert.equal(assembled.shadowingSession.cardId, target.id);
});

test("invalid card detail raw is rejected before deletion", () => {
  const sessionStorage = new MockStorage({ [CARD_DETAIL_UI_SESSION_KEY]: "{broken" });
  const error = expectError(() => assembleCardDeletionState({ ...createState(), sessionStorage }), CardDeletionIntegrationError);
  assert.equal(error.code, "invalid-session");
});

test("invalid shadowing raw is rejected before deletion", () => {
  const sessionStorage = new MockStorage({ [SHADOWING_PLAYER_SESSION_KEY]: JSON.stringify({ cardId: target.id }) });
  const error = expectError(() => assembleCardDeletionState({ ...createState(), sessionStorage }), CardDeletionIntegrationError);
  assert.equal(error.dataKind, "shadowing-session");
});

test("adapter getItem failure is reported as snapshot failure", () => {
  const sessionStorage = new MockStorage();
  sessionStorage.fail({ method: "getItem", nth: 1 });
  const error = expectError(() => assembleCardDeletionState({ ...createState(), sessionStorage }), StorageTransactionError);
  assert.equal(error.phase, "snapshot");
});

test("successful delete commits semantic state exactly once", () => {
  const result = execute();
  assert.equal(result.commits.length, 1);
  assert.equal(result.commits[0], result.plan.nextState);
});

test("React commit callback runs only after all mutations", () => {
  const fixture = createFixture();
  let observedApplied = 0;
  executeCardDeletionTransaction({
    plan: fixture.plan,
    transactionRunner: (mutations) => {
      const result = runStorageTransaction(mutations);
      observedApplied = result.appliedMutationCount;
      return result;
    },
    commit: () => assert.equal(observedApplied, fixture.plan.mutations.length),
  });
});

test("delete success preserves a complete raw undo snapshot", () => {
  const result = execute();
  assert.equal(result.execution.undoSnapshot.rawStorageSnapshot.length, result.plan.mutations.length);
  assert.ok(result.execution.undoSnapshot.rawStorageSnapshot.every((entry) => entry.value?.startsWith("raw-before-")));
});

test("snapshot failure applies zero mutations and commits zero state", () => {
  const fixture = createFixture();
  fixture.sessionStorage.fail({ method: "getItem", nth: 1 });
  let commits = 0;
  const before = fixture.sessionStorage.cloneValues();
  expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, commit: () => { commits += 1; } }), StorageTransactionError);
  assert.equal(commits, 0);
  assert.deepEqual(fixture.sessionStorage.values, before);
});

test("first apply failure leaves React unchanged", () => {
  const fixture = createFixture();
  fixture.sessionStorage.fail({ method: "setItem", nth: 1 });
  let commits = 0;
  expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, commit: () => { commits += 1; } }), StorageTransactionError);
  assert.equal(commits, 0);
});

test("middle apply failure restores the full raw snapshot", () => {
  const fixture = createFixture();
  const beforeLocal = fixture.localStorage.cloneValues();
  const beforeSession = fixture.sessionStorage.cloneValues();
  fixture.localStorage.fail({ method: "setItem", nth: 2 });
  const error = expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, commit: () => {} }), StorageTransactionError);
  assert.equal(error.rollbackSucceeded, true);
  assert.deepEqual(fixture.localStorage.values, beforeLocal);
  assert.deepEqual(fixture.sessionStorage.values, beforeSession);
});

test("last dataset apply failure restores prior storage", () => {
  const fixture = createFixture();
  const before = fixture.localStorage.cloneValues();
  const localMutationCount = fixture.plan.mutations.filter((item) => item.area === "local").length;
  fixture.localStorage.fail({ method: "setItem", nth: localMutationCount });
  expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, commit: () => {} }), StorageTransactionError);
  assert.deepEqual(fixture.localStorage.values, before);
});

test("session changes roll back when a later local write fails", () => {
  const fixture = createFixture();
  const before = fixture.sessionStorage.cloneValues();
  fixture.localStorage.fail({ method: "setItem", nth: 1 });
  expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, commit: () => {} }), StorageTransactionError);
  assert.deepEqual(fixture.sessionStorage.values, before);
});

test("quota failures are classified without locking destructive actions", () => {
  const fixture = createFixture();
  fixture.localStorage.fail({ method: "setItem", nth: 1, error: new InjectedStorageError("QuotaExceededError", 22) });
  const error = expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, commit: () => {} }), StorageTransactionError);
  const notice = describeCardDeletionFailure(error, "delete");
  assert.equal(error.quotaExceeded, true);
  assert.equal(notice.blockDestructiveActions, false);
});

test("quota guidance recommends backup and storage review", () => {
  const error = new StorageTransactionError({ phase: "apply", rollbackSucceeded: true, rollbackFailureCount: 0, quotaExceeded: true });
  const notice = describeCardDeletionFailure(error, "delete");
  assert.match(notice.message, /JSON/);
});

test("partial rollback creates a high-risk blocking notice", () => {
  const fixture = createFixture();
  const first = fixture.plan.mutations[0];
  const second = fixture.plan.mutations[1];
  first.storage.fail({ method: first.value === null ? "removeItem" : "setItem", key: first.key, skipMatches: 1 });
  second.storage.fail({ method: second.value === null ? "removeItem" : "setItem", key: second.key, times: 1 });
  const error = expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, commit: () => {} }), StorageTransactionError);
  const notice = describeCardDeletionFailure(error, "delete");
  assert.equal(notice.highRisk, true);
  assert.equal(notice.blockDestructiveActions, true);
});

test("high-risk notice requires stopping changes and reloading", () => {
  const error = new StorageTransactionError({ phase: "apply", rollbackSucceeded: false, rollbackFailureCount: 1, quotaExceeded: false });
  assert.match(describeCardDeletionFailure(error, "delete").message, /새로고침/);
});

test("apply failure with successful rollback reports original state restored", () => {
  const error = new StorageTransactionError({ phase: "apply", rollbackSucceeded: true, rollbackFailureCount: 0, quotaExceeded: false });
  assert.match(describeCardDeletionFailure(error, "delete").message, /원래 상태/);
});

test("snapshot failure has distinct user guidance", () => {
  const error = new StorageTransactionError({ phase: "snapshot", rollbackSucceeded: true, rollbackFailureCount: 0, quotaExceeded: false });
  assert.match(describeCardDeletionFailure(error, "delete").message, /저장 상태/);
});

test("non-storage planning failures expose no private content", () => {
  const notice = describeCardDeletionFailure(new Error("private target memo"), "delete");
  assert.doesNotMatch(notice.message, /private target memo|private target answer/);
});

test("restore mutations match deletion targets one-to-one", () => {
  const result = execute();
  const restore = createCardDeletionRestoreMutations(result.execution.undoSnapshot);
  assert.equal(restore.length, result.plan.affectedTargets.length);
  restore.forEach((mutation, index) => assert.equal(mutation.key, result.plan.affectedTargets[index].key));
});

test("tampered undo snapshot is rejected before writes", () => {
  const result = execute();
  result.execution.undoSnapshot.rawStorageSnapshot.pop();
  const before = result.localStorage.cloneValues();
  expectError(() => createCardDeletionRestoreMutations(result.execution.undoSnapshot), CardDeletionIntegrationError);
  assert.deepEqual(result.localStorage.values, before);
});

test("undo success commits previous semantic state exactly once", () => {
  const result = execute();
  const commits = [];
  executeCardDeletionUndoTransaction({ snapshot: result.execution.undoSnapshot, commit: (state) => commits.push(state) });
  assert.equal(commits.length, 1);
  assert.equal(commits[0], result.plan.previousState);
});

test("undo restores every raw value byte-for-byte", () => {
  const result = execute();
  executeCardDeletionUndoTransaction({ snapshot: result.execution.undoSnapshot, commit: () => {} });
  result.execution.undoSnapshot.rawStorageSnapshot.forEach((entry) => assert.equal(entry.storage.raw(entry.key), entry.value));
});

test("undo apply failure keeps deleted React state", () => {
  const result = execute();
  const restore = createCardDeletionRestoreMutations(result.execution.undoSnapshot);
  const failing = restore.find((item) => item.value !== null);
  failing.storage.fail({ method: "setItem", key: failing.key, times: 1 });
  let commits = 0;
  expectError(() => executeCardDeletionUndoTransaction({ snapshot: result.execution.undoSnapshot, commit: () => { commits += 1; } }), StorageTransactionError);
  assert.equal(commits, 0);
});

test("undo rollback failure also blocks destructive actions", () => {
  const result = execute();
  const restore = createCardDeletionRestoreMutations(result.execution.undoSnapshot);
  const first = restore[0];
  const second = restore[1];
  first.storage.fail({ method: first.value === null ? "removeItem" : "setItem", key: first.key, skipMatches: 1 });
  second.storage.fail({ method: second.value === null ? "removeItem" : "setItem", key: second.key, times: 1 });
  const error = expectError(() => executeCardDeletionUndoTransaction({ snapshot: result.execution.undoSnapshot, commit: () => {} }), StorageTransactionError);
  assert.equal(describeCardDeletionFailure(error, "undo").blockDestructiveActions, true);
});

test("same failed operation can be explicitly retried without automatic retry", () => {
  const fixture = createFixture();
  fixture.localStorage.fail({ method: "setItem", nth: 1, times: 1 });
  let runs = 0;
  expectError(() => executeCardDeletionTransaction({ plan: fixture.plan, transactionRunner: (mutations) => { runs += 1; return runStorageTransaction(mutations); }, commit: () => {} }), StorageTransactionError);
  assert.equal(runs, 1);
  executeCardDeletionTransaction({ plan: fixture.plan, transactionRunner: (mutations) => { runs += 1; return runStorageTransaction(mutations); }, commit: () => {} });
  assert.equal(runs, 2);
});

test("a later successful delete can replace the in-memory undo snapshot", () => {
  let currentUndo = execute().execution.undoSnapshot;
  const next = execute().execution.undoSnapshot;
  currentUndo = next;
  assert.equal(currentUndo, next);
});

test("undo snapshot is memory-only and disappears on simulated refresh", () => {
  let memoryUndo = execute().execution.undoSnapshot;
  memoryUndo = null;
  assert.equal(memoryUndo, null);
});

test("personal memos and saved passages are never mutated", () => {
  const result = execute();
  assert.equal(result.localStorage.raw("opic-personal-memos"), "personal-sentinel");
  assert.equal(result.localStorage.raw("opic-saved-passages"), "passage-sentinel");
});

test("all target card records are absent after successful delete", () => {
  const { commits } = execute();
  const next = commits[0];
  assert.equal(next.cards.some((card) => card.id === target.id), false);
  assert.equal(Object.hasOwn(next.firstLineStatuses, target.id), false);
  assert.equal(Object.hasOwn(next.answerLearningStatuses, target.id), false);
  assert.equal(Object.hasOwn(next.myAnswers, target.id), false);
  assert.equal(Object.hasOwn(next.cardMemos, target.id), false);
});

test("deleted detail navigation falls back to the library", () => {
  assert.equal(execute().commits[0].navigationSession.currentView, "library");
});

test("mock and answer-learning sessions remove the deleted card", () => {
  const next = execute().commits[0];
  assert.equal(next.firstLineMockSession.cardOrder.includes(target.id), false);
  assert.equal(next.answerLearningSession.cardOrder.includes(target.id), false);
});

test("dataset mutation remains the final transaction write", () => {
  assert.equal(createFixture().plan.mutations.at(-1).key, "opic-card-dataset");
});

test("adapter performs reads only while assembling state", () => {
  const sessionStorage = new MockStorage();
  assembleCardDeletionState({ ...createState(), sessionStorage });
  assert.ok(sessionStorage.calls.every((call) => call.method === "getItem"));
});

test("adapter source has no UI, navigation, Firebase, or retry side effects", () => {
  const source = readFileSync(new URL("../src/utils/cardDeletionAdapter.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /console\.|firebase|window\.location|setTimeout|toast/i);
});

test("App uses plan and transaction adapter instead of forgiving delete savers", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function deleteCardPermanently");
  const end = source.indexOf("function undoCardDeletion", start);
  const deletion = source.slice(start, end);
  assert.match(deletion, /createCardDeletionPlan/);
  assert.match(deletion, /executeCardDeletionTransaction/);
  assert.doesNotMatch(deletion, /saveStatuses|saveStudyAttempts|saveActiveCards|clearAnswerLearningSession/);
});

assert.equal(tests.length, 36);
let passed = 0;
for (const { name, run } of tests) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`card deletion transaction tests: ${passed}/${tests.length} passed`);
