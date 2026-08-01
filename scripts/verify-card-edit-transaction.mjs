import assert from "node:assert/strict";
import { cards } from "../src/data/cards.ts";
import {
  CardEditError,
  createCardEditPlan,
  describeCardEditFailure,
  executeCardEditTransaction,
  isMyAnswerDeletion,
  resolveAnswerSourceAfterCardEdit,
} from "../src/utils/cardEditTransaction.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  parseCardDataset,
} from "../src/utils/cardStorage.ts";
import {
  MY_ANSWERS_STORAGE_KEY,
  parseMyAnswers,
} from "../src/utils/myAnswerStorage.ts";
import { StorageTransactionError } from "../src/utils/storageTransaction.ts";

class InjectedStorageError extends Error {
  constructor(name = "InjectedStorageError", code) {
    super("Injected storage failure");
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
}

const NOW = new Date("2026-08-01T03:04:05.678Z");
const baseCards = structuredClone(cards.slice(0, 3));
const cardId = baseCards[1].id;
const originalAnswers = {
  [baseCards[0].id]: "An answer for the first card.",
  [cardId]: "My old answer.\nSecond line.",
};

function rawDataset(values = baseCards) {
  return JSON.stringify({
    version: 1,
    updatedAt: "2026-07-31T00:00:00.000Z",
    cards: values,
  });
}

function createFixture(overrides = {}) {
  const currentCards = structuredClone(overrides.currentCards ?? baseCards);
  const currentMyAnswers = structuredClone(overrides.currentMyAnswers ?? originalAnswers);
  const originalDatasetRaw = rawDataset(currentCards);
  const originalAnswersRaw = Object.keys(currentMyAnswers).length > 0
    ? JSON.stringify(currentMyAnswers)
    : null;
  const storage = overrides.storage ?? new MockStorage({
    [CARD_DATASET_STORAGE_KEY]: originalDatasetRaw,
    ...(originalAnswersRaw ? { [MY_ANSWERS_STORAGE_KEY]: originalAnswersRaw } : {}),
  });
  const card = structuredClone(
    overrides.card ?? {
      ...currentCards.find((candidate) => candidate.id === cardId),
      front: "Updated synthetic question for transaction verification.",
    },
  );
  const planOptions = {
    cardId: overrides.cardId ?? cardId,
    card,
    myAnswer: overrides.myAnswer ?? "My updated answer.\r\n\r\nSecond paragraph.",
    currentCards,
    currentMyAnswers,
    localStorage: storage,
    now: overrides.now ?? NOW,
  };
  return {
    storage,
    planOptions,
    originalDatasetRaw,
    originalAnswersRaw,
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test("카드와 나만의 답변을 함께 계획한다", () => {
  const { planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  assert.equal(plan.card.front, planOptions.card.front);
  assert.equal(plan.myAnswers[cardId], "My updated answer.\n\nSecond paragraph.");
});

test("카드만 바꿔도 기존 나만의 답변을 보존한다", () => {
  const { planOptions } = createFixture({ myAnswer: originalAnswers[cardId] });
  const plan = createCardEditPlan(planOptions);
  assert.equal(plan.myAnswers[cardId], originalAnswers[cardId]);
});

test("나만의 답변만 바꿔도 카드 순서를 보존한다", () => {
  const unchangedCard = structuredClone(baseCards[1]);
  const { planOptions } = createFixture({ card: unchangedCard });
  const plan = createCardEditPlan(planOptions);
  assert.deepEqual(plan.cards.map((card) => card.id), baseCards.map((card) => card.id));
});

test("새 나만의 답변을 추가한다", () => {
  const currentMyAnswers = { [baseCards[0].id]: originalAnswers[baseCards[0].id] };
  const { planOptions } = createFixture({ currentMyAnswers });
  assert.equal(createCardEditPlan(planOptions).myAnswers[cardId], "My updated answer.\n\nSecond paragraph.");
});

test("기존 나만의 답변을 갱신한다", () => {
  const { planOptions } = createFixture({ myAnswer: "A replacement answer." });
  assert.equal(createCardEditPlan(planOptions).myAnswers[cardId], "A replacement answer.");
});

test("빈 나만의 답변은 해당 카드 값만 삭제한다", () => {
  const { planOptions } = createFixture({ myAnswer: "  \r\n " });
  const plan = createCardEditPlan(planOptions);
  assert.equal(plan.myAnswers[cardId], undefined);
  assert.equal(plan.myAnswers[baseCards[0].id], originalAnswers[baseCards[0].id]);
});

test("기존 나만의 답변을 비울 때만 삭제 확인 대상이다", () => {
  assert.equal(isMyAnswerDeletion("Existing answer.", " \r\n "), true);
  assert.equal(isMyAnswerDeletion("", ""), false);
  assert.equal(isMyAnswerDeletion("Existing answer.", "Updated answer."), false);
});

test("나만의 답변 추가와 수정은 현재 답변 출처를 유지한다", () => {
  assert.equal(resolveAnswerSourceAfterCardEdit("default", "New answer."), "default");
  assert.equal(resolveAnswerSourceAfterCardEdit("my-answer", "Updated answer."), "my-answer");
});

test("선택 중인 나만의 답변 삭제만 기본 출처로 되돌린다", () => {
  assert.equal(resolveAnswerSourceAfterCardEdit("my-answer", ""), "default");
  assert.equal(resolveAnswerSourceAfterCardEdit("default", ""), "default");
});

test("마지막 나만의 답변 삭제는 storage remove mutation이다", () => {
  const currentMyAnswers = { [cardId]: originalAnswers[cardId] };
  const { planOptions } = createFixture({ currentMyAnswers, myAnswer: "" });
  const plan = createCardEditPlan(planOptions);
  assert.equal(plan.mutations[0].value, null);
});

test("편집 대상 외 카드 내용은 그대로다", () => {
  const { planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  assert.deepEqual(plan.cards[0], baseCards[0]);
  assert.deepEqual(plan.cards[2], baseCards[2]);
});

test("입력 semantic 상태를 변경하지 않는다", () => {
  const { planOptions } = createFixture();
  const before = structuredClone({
    cards: planOptions.currentCards,
    myAnswers: planOptions.currentMyAnswers,
    card: planOptions.card,
  });
  createCardEditPlan(planOptions);
  assert.deepEqual({
    cards: planOptions.currentCards,
    myAnswers: planOptions.currentMyAnswers,
    card: planOptions.card,
  }, before);
});

test("카드 ID 변경을 거부한다", () => {
  const { planOptions } = createFixture();
  planOptions.card.id = "changed-card-id";
  assert.throws(
    () => createCardEditPlan(planOptions),
    (error) => error instanceof CardEditError && error.code === "changed-card-id",
  );
});

test("없는 카드 편집을 거부한다", () => {
  const { planOptions } = createFixture({ cardId: "missing-card" });
  assert.throws(
    () => createCardEditPlan(planOptions),
    (error) => error instanceof CardEditError && error.code === "missing-card",
  );
});

test("유효하지 않은 카드를 거부한다", () => {
  const { planOptions } = createFixture();
  planOptions.card.front = "";
  assert.throws(
    () => createCardEditPlan(planOptions),
    (error) => error instanceof CardEditError && error.code === "invalid-card",
  );
});

test("dataset raw는 기존 parser를 통과한다", () => {
  const { planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  assert.deepEqual(parseCardDataset(plan.mutations[1].value)?.cards, plan.cards);
});

test("dataset updatedAt은 주입 시각을 사용한다", () => {
  const { planOptions } = createFixture();
  assert.equal(createCardEditPlan(planOptions).dataset.updatedAt, NOW.toISOString());
});

test("나만의 답변 raw는 기존 parser를 통과한다", () => {
  const { planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  assert.deepEqual(parseMyAnswers(plan.mutations[0].value), plan.myAnswers);
});

test("위험한 나만의 답변 key를 다음 상태에서 제외한다", () => {
  const dangerous = Object.create(null);
  dangerous[cardId] = originalAnswers[cardId];
  dangerous.constructor = "private value";
  const { planOptions } = createFixture({ currentMyAnswers: dangerous });
  const plan = createCardEditPlan(planOptions);
  assert.equal(Object.hasOwn(plan.myAnswers, "constructor"), false);
});

test("mutation 순서는 나만의 답변 다음 dataset이다", () => {
  const { planOptions } = createFixture();
  assert.deepEqual(
    createCardEditPlan(planOptions).mutations.map((mutation) => mutation.key),
    [MY_ANSWERS_STORAGE_KEY, CARD_DATASET_STORAGE_KEY],
  );
});

test("두 mutation 모두 기존 localStorage 인스턴스를 사용한다", () => {
  const { storage, planOptions } = createFixture();
  assert.ok(createCardEditPlan(planOptions).mutations.every((mutation) => mutation.storage === storage));
});

test("transaction 성공 후 두 raw 값이 함께 반영된다", () => {
  const { storage, planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  executeCardEditTransaction({ plan, commit: () => {} });
  assert.deepEqual(parseCardDataset(storage.raw(CARD_DATASET_STORAGE_KEY))?.cards, plan.cards);
  assert.deepEqual(parseMyAnswers(storage.raw(MY_ANSWERS_STORAGE_KEY)), plan.myAnswers);
});

test("transaction 성공 후 semantic commit은 정확히 한 번이다", () => {
  const { planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  const commits = [];
  executeCardEditTransaction({ plan, commit: (state) => commits.push(state) });
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0], { cards: plan.cards, myAnswers: plan.myAnswers });
});

test("transaction runner가 끝나기 전에는 commit하지 않는다", () => {
  const { planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  const events = [];
  executeCardEditTransaction({
    plan,
    transactionRunner: () => {
      events.push("transaction");
      return { snapshot: [], appliedMutationCount: 2 };
    },
    commit: () => events.push("commit"),
  });
  assert.deepEqual(events, ["transaction", "commit"]);
});

test("transaction runner 실패 시 commit하지 않는다", () => {
  const { planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  let commits = 0;
  assert.throws(() => executeCardEditTransaction({
    plan,
    transactionRunner: () => {
      throw new StorageTransactionError({
        phase: "apply",
        rollbackSucceeded: true,
        rollbackFailureCount: 0,
        quotaExceeded: false,
      });
    },
    commit: () => { commits += 1; },
  }), StorageTransactionError);
  assert.equal(commits, 0);
});

test("snapshot 실패 시 raw와 React commit이 변하지 않는다", () => {
  const { storage, planOptions, originalDatasetRaw, originalAnswersRaw } = createFixture();
  const plan = createCardEditPlan(planOptions);
  storage.fail({ method: "getItem", nth: 1 });
  let commits = 0;
  assert.throws(
    () => executeCardEditTransaction({ plan, commit: () => { commits += 1; } }),
    StorageTransactionError,
  );
  assert.equal(commits, 0);
  assert.equal(storage.raw(CARD_DATASET_STORAGE_KEY), originalDatasetRaw);
  assert.equal(storage.raw(MY_ANSWERS_STORAGE_KEY), originalAnswersRaw);
});

test("두 번째 apply 실패 시 두 raw 값을 모두 rollback한다", () => {
  const { storage, planOptions, originalDatasetRaw, originalAnswersRaw } = createFixture();
  const plan = createCardEditPlan(planOptions);
  storage.fail({ method: "setItem", key: CARD_DATASET_STORAGE_KEY, times: 1 });
  let commits = 0;
  assert.throws(
    () => executeCardEditTransaction({ plan, commit: () => { commits += 1; } }),
    (error) => error instanceof StorageTransactionError && error.rollbackSucceeded,
  );
  assert.equal(commits, 0);
  assert.equal(storage.raw(CARD_DATASET_STORAGE_KEY), originalDatasetRaw);
  assert.equal(storage.raw(MY_ANSWERS_STORAGE_KEY), originalAnswersRaw);
});

test("첫 번째 apply 실패 시 dataset을 적용하지 않는다", () => {
  const { storage, planOptions, originalDatasetRaw, originalAnswersRaw } = createFixture();
  const plan = createCardEditPlan(planOptions);
  storage.fail({ method: "setItem", key: MY_ANSWERS_STORAGE_KEY, times: 1 });
  assert.throws(() => executeCardEditTransaction({ plan, commit: () => {} }), StorageTransactionError);
  assert.equal(storage.raw(CARD_DATASET_STORAGE_KEY), originalDatasetRaw);
  assert.equal(storage.raw(MY_ANSWERS_STORAGE_KEY), originalAnswersRaw);
});

test("rollback 일부 실패는 고위험·추가 변경 차단으로 분류한다", () => {
  const { storage, planOptions } = createFixture();
  const plan = createCardEditPlan(planOptions);
  storage.fail({ method: "setItem", key: CARD_DATASET_STORAGE_KEY, times: 1 });
  storage.fail({ method: "setItem", key: MY_ANSWERS_STORAGE_KEY, skipMatches: 1, times: 1 });
  let caught;
  try { executeCardEditTransaction({ plan, commit: () => {} }); } catch (error) { caught = error; }
  const notice = describeCardEditFailure(caught);
  assert.equal(notice.highRisk, true);
  assert.equal(notice.blockDestructiveActions, true);
});

test("quota 실패는 draft 유지 안내로 분류한다", () => {
  const error = new StorageTransactionError({
    phase: "apply",
    rollbackSucceeded: true,
    rollbackFailureCount: 0,
    quotaExceeded: true,
  });
  assert.match(describeCardEditFailure(error).message, /입력 내용은 그대로 유지/);
});

test("snapshot 실패는 저장 미시작 안내로 분류한다", () => {
  const error = new StorageTransactionError({
    phase: "snapshot",
    rollbackSucceeded: true,
    rollbackFailureCount: 0,
    quotaExceeded: false,
  });
  assert.match(describeCardEditFailure(error).message, /저장하지 않았습니다/);
});

test("검증 실패는 입력 확인 안내로 분류한다", () => {
  assert.match(describeCardEditFailure(new CardEditError("invalid-card")).message, /입력 내용을 확인/);
});

test("오류와 안내에 private 답변 원문을 포함하지 않는다", () => {
  const privateAnswer = "PRIVATE-ANSWER-CONTENT-DO-NOT-LEAK";
  const { planOptions } = createFixture({ myAnswer: privateAnswer });
  const plan = createCardEditPlan(planOptions);
  const error = new StorageTransactionError({
    phase: "apply",
    rollbackSucceeded: true,
    rollbackFailureCount: 0,
    quotaExceeded: false,
  });
  assert.equal(`${error.message}\n${JSON.stringify(error)}\n${describeCardEditFailure(error).message}`.includes(privateAnswer), false);
  assert.equal(plan.myAnswers[cardId], privateAnswer);
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed += 1;
  } catch (error) {
    console.error(`FAILED: ${name}`);
    throw error;
  }
}

console.log(`Card edit transaction verification passed: ${passed} tests`);
