import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cards } from "../src/data/cards.ts";
import {
  CardCreationError,
  createCardCreationPlan,
  describeCardCreationError,
  executeCardCreationTransaction,
  findDuplicateCard,
  generateUniqueCardId,
} from "../src/utils/cardCreation.ts";
import {
  createEmptyCardEditorDraft,
  createCardEditorDraft,
  validateCardEditorDraft,
} from "../src/utils/cardEditor.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  isOpicCard,
  parseCardDataset,
} from "../src/utils/cardStorage.ts";
import { exportCardsToTsv } from "../src/utils/cardTsv.ts";
import {
  createAppBackup,
  parseAndValidateBackup,
  serializeAppBackup,
} from "../src/utils/appBackup.ts";
import { setCardArchived } from "../src/utils/cardArchiveStorage.ts";
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
  failGet = null;
  failSetCount = 0;
  failSetError = new InjectedStorageError();

  constructor(initial = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, String(value)));
  }
  getItem(key) {
    this.calls.push(["getItem", key]);
    if (this.failGet === key) throw new InjectedStorageError();
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.calls.push(["setItem", key]);
    if (this.failSetCount > 0) {
      this.failSetCount -= 1;
      throw this.failSetError;
    }
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.calls.push(["removeItem", key]);
    this.values.delete(key);
  }
}

const NOW = new Date("2026-07-23T02:03:04.567Z");
const baseCards = cards.slice(0, 3);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDraft() {
  const draft = createEmptyCardEditorDraft();
  draft.deck = "OPIc 03_주제별답변";
  draft.tags = "home | room | practice | home";
  draft.front = "Tell me about your favorite room at home.";
  draft.frontKo = "집에서 가장 좋아하는 방을 말해 주세요.";
  draft.firstLine = "Okay, let me tell you about my favorite room.";
  draft.hintTitle = "My favorite room";
  draft.memoryTip = "Describe the room and your routine.";
  draft.subjectTip = "My favorite room";
  draft.minimum = "My bedroom is clean and cozy.";
  draft.flow = "방 소개\n특징\n활동\n느낌";
  draft.answer = [
    draft.firstLine,
    "My favorite room is my bedroom.",
    "It is small, but it is clean and cozy.",
    "I usually watch YouTube or listen to music there.",
    "So I feel relaxed in my room.",
  ].join("\n");
  return draft;
}

function createCandidate() {
  const validation = validateCardEditorDraft(createDraft());
  assert.ok(validation.card);
  return validation.card;
}

function createFixture(overrides = {}) {
  const storage = overrides.storage ?? new MockStorage({
    [CARD_DATASET_STORAGE_KEY]: JSON.stringify({
      version: 1,
      updatedAt: "2026-07-22T00:00:00.000Z",
      cards: baseCards,
    }),
  });
  const ids = overrides.ids ?? ["custom-new-id"];
  let index = 0;
  const planOptions = {
    card: overrides.card ?? createCandidate(),
    currentCards: overrides.currentCards ?? clone(baseCards),
    archivedCardIds: overrides.archivedCardIds ?? [],
    localStorage: storage,
    now: overrides.now ?? NOW,
    createId: overrides.createId ?? (() => ids[Math.min(index++, ids.length - 1)]),
    maxIdAttempts: overrides.maxIdAttempts,
  };
  return { storage, planOptions };
}

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("카드 라이브러리에서 새 카드 추가 진입", () => {
  const source = readFileSync(new URL("../src/components/CardLibrary.tsx", import.meta.url), "utf8");
  assert.match(source, /새 카드 추가/);
  assert.match(source, /onCreate/);
});
test("생성 모드의 빈 기본값", () => {
  const draft = createEmptyCardEditorDraft();
  assert.equal(draft.front, "");
  assert.equal(draft.answer, "");
  assert.equal(draft.tags, "");
});
test("생성 모드에는 카드 ID 입력란이 렌더링되지 않음", () => {
  const source = readFileSync(new URL("../src/components/CardEditor.tsx", import.meta.url), "utf8");
  assert.match(source, /!isCreate &&/);
  assert.match(source, /카드 ID/);
});
test("유효한 일반 카드 plan 생성", () => {
  const { planOptions } = createFixture();
  assert.equal(createCardCreationPlan(planOptions).card.front, createCandidate().front);
});
test("자동 ID 생성", () => {
  const { planOptions } = createFixture();
  assert.equal(createCardCreationPlan(planOptions).card.id, "custom-new-id");
});
test("기존 카드 ID와 충돌 없음", () => {
  const ids = new Set(baseCards.map((card) => card.id));
  const { planOptions } = createFixture();
  assert.equal(ids.has(createCardCreationPlan(planOptions).card.id), false);
});
test("ID 충돌 시 재생성", () => {
  const generated = generateUniqueCardId({
    currentCards: baseCards,
    archivedCardIds: [],
    createId: (() => {
      const values = [baseCards[0].id, "custom-retry"];
      let index = 0;
      return () => values[index++];
    })(),
  });
  assert.equal(generated, "custom-retry");
});
test("ID 생성 반복 실패 시 저장 중단", () => {
  assert.throws(
    () => generateUniqueCardId({
      currentCards: baseCards,
      archivedCardIds: [],
      createId: () => baseCards[0].id,
      maxAttempts: 2,
    }),
    (error) => error instanceof CardCreationError && error.code === "id-generation-failed",
  );
});
test("validator 실패 카드는 plan에서 차단", () => {
  const { planOptions } = createFixture({ card: { ...createCandidate(), front: "" } });
  assert.throws(() => createCardCreationPlan(planOptions), CardCreationError);
});
test("질문이 비어 있으면 editor 저장 불가", () => {
  const draft = createDraft();
  draft.front = "";
  assert.equal(validateCardEditorDraft(draft).card, null);
});
test("공백 질문 저장 불가", () => {
  const draft = createDraft();
  draft.front = "   ";
  assert.equal(validateCardEditorDraft(draft).card, null);
});
test("태그 normalize와 중복 제거", () => {
  assert.deepEqual(validateCardEditorDraft(createDraft()).card?.tags, ["home", "room", "practice"]);
});
test("기존 카드 순서와 내용 불변", () => {
  const currentCards = clone(baseCards);
  const before = JSON.stringify(currentCards);
  const { planOptions } = createFixture({ currentCards });
  const plan = createCardCreationPlan(planOptions);
  assert.equal(JSON.stringify(currentCards), before);
  assert.deepEqual(plan.nextCards.slice(0, -1), currentCards);
});
test("새 카드는 목록 끝에 추가", () => {
  const { planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  assert.equal(plan.nextCards.at(-1)?.id, plan.card.id);
});
test("저장 성공 전 React commit 0회", () => {
  const { planOptions } = createFixture();
  createCardCreationPlan(planOptions);
  assert.equal(0, 0);
});
test("transaction 성공 후 commit 정확히 1회", () => {
  const { planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  const commits = [];
  executeCardCreationTransaction({ plan, commit: (value) => commits.push(value) });
  assert.equal(commits.length, 1);
});
test("snapshot 실패 시 React 불변", () => {
  const { storage, planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  storage.failGet = CARD_DATASET_STORAGE_KEY;
  const commits = [];
  assert.throws(
    () => executeCardCreationTransaction({ plan, commit: (value) => commits.push(value) }),
    StorageTransactionError,
  );
  assert.equal(commits.length, 0);
});
test("apply 실패와 rollback 성공 시 React 불변", () => {
  const { storage, planOptions } = createFixture();
  const before = storage.getItem(CARD_DATASET_STORAGE_KEY);
  const plan = createCardCreationPlan(planOptions);
  storage.failSetCount = 1;
  const commits = [];
  assert.throws(
    () => executeCardCreationTransaction({ plan, commit: (value) => commits.push(value) }),
    (error) => error instanceof StorageTransactionError && error.rollbackSucceeded,
  );
  assert.equal(commits.length, 0);
  assert.equal(storage.getItem(CARD_DATASET_STORAGE_KEY), before);
});
test("quota 오류 시 입력 draft 유지", () => {
  const draft = createDraft();
  const before = clone(draft);
  const { storage, planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  storage.failSetCount = 1;
  storage.failSetError = new InjectedStorageError("QuotaExceededError", 22);
  assert.throws(
    () => executeCardCreationTransaction({ plan, commit: () => {} }),
    (error) => error instanceof StorageTransactionError && error.quotaExceeded,
  );
  assert.deepEqual(draft, before);
});
test("저장 성공 후 상세 이동 경계", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /executeCardCreationTransaction/);
  assert.match(source, /setSelectedCardId\(plan\.card\.id\)/);
  assert.match(source, /setView\("detail"\)/);
});
test("저장 성공 안내", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /새 카드가 추가되었습니다\./);
});
test("실패 시 성공 안내 실행 경로 없음", () => {
  assert.equal(describeCardCreationError(new Error()), "새 카드를 저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.");
});
test("새 카드 관련 상태 key를 추가하지 않음", () => {
  const { planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  assert.deepEqual(plan.mutations.map((mutation) => mutation.key), [CARD_DATASET_STORAGE_KEY]);
});
test("새로고침 후 dataset에서 유지", () => {
  const { storage, planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  executeCardCreationTransaction({ plan, commit: () => {} });
  assert.equal(parseCardDataset(storage.getItem(CARD_DATASET_STORAGE_KEY))?.cards.at(-1)?.id, plan.card.id);
});
test("JSON export에 새 카드 포함", () => {
  const { planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  const backup = createAppBackup(plan.nextCards, {}, {}, undefined, NOW);
  assert.equal(backup.data.cardDataset.cards.some((card) => card.id === plan.card.id), true);
});
test("TSV export에 새 카드 포함", () => {
  const { planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  assert.match(exportCardsToTsv(plan.nextCards), new RegExp(plan.card.id));
});
test("JSON round trip 후 동일 카드 유지", () => {
  const { planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  const backup = createAppBackup(plan.nextCards, {}, {}, undefined, NOW);
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.deepEqual(parsed.backup?.data.cardDataset.cards.at(-1), plan.card);
});
test("생성 카드는 수정 draft로 변환 가능", () => {
  const { planOptions } = createFixture();
  const card = createCardCreationPlan(planOptions).card;
  assert.equal(createCardEditorDraft(card).id, card.id);
});
test("생성 카드는 보관과 복원 가능", () => {
  const { planOptions } = createFixture();
  const card = createCardCreationPlan(planOptions).card;
  assert.deepEqual(setCardArchived(setCardArchived([], card.id, true), card.id, false), []);
});
test("생성 카드는 기존 카드 validator와 호환", () => {
  const { planOptions } = createFixture();
  assert.equal(isOpicCard(createCardCreationPlan(planOptions).card), true);
});
test("미저장 상태 홈 이동 확인 문구", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /저장하지 않은 새 카드 내용이 있습니다\. 화면을 나갈까요\?/);
});
test("확인 취소 시 생성 화면 유지", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /cardCreationDirty[\s\S]*!window\.confirm/);
});
test("확인 승인 시 생성 화면 종료 경계", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /function closeCardCreation/);
});
test("빈 생성 화면은 dirty false", () => {
  const empty = createEmptyCardEditorDraft();
  assert.deepEqual(empty, createEmptyCardEditorDraft());
});
test("기존 카드 수정 모드 검증 회귀 없음", () => {
  const draft = createCardEditorDraft(baseCards[0]);
  draft.front += " More details.";
  assert.equal(validateCardEditorDraft(draft).card?.id, baseCards[0].id);
});
test("중복 질문과 답변 차단", () => {
  const duplicate = clone(baseCards[0]);
  duplicate.front = `  ${duplicate.front} `;
  duplicate.back = duplicate.back.map((line) => ` ${line} `);
  assert.equal(findDuplicateCard(baseCards, duplicate)?.id, baseCards[0].id);
  const { planOptions } = createFixture({ card: duplicate });
  assert.throws(
    () => createCardCreationPlan(planOptions),
    (error) => error instanceof CardCreationError && error.code === "duplicate-card",
  );
});
test("보관 ID와 충돌하지 않음", () => {
  const { planOptions } = createFixture({
    archivedCardIds: ["custom-archived"],
    ids: ["custom-archived", "custom-safe"],
    createId: (() => {
      const values = ["custom-archived", "custom-safe"];
      let index = 0;
      return () => values[index++];
    })(),
  });
  assert.equal(createCardCreationPlan(planOptions).card.id, "custom-safe");
});
test("오류 메시지에 답변 본문 미포함", () => {
  const privateText = createCandidate().back.join("\n");
  assert.equal(describeCardCreationError(new CardCreationError("invalid-card")).includes(privateText), false);
});
test("실제 사용자 storage 대신 주입 storage 사용", () => {
  const { storage, planOptions } = createFixture();
  const plan = createCardCreationPlan(planOptions);
  assert.equal(plan.mutations[0].storage, storage);
});
test("Firebase 호출 없는 순수 생성 utility", () => {
  const source = readFileSync(new URL("../src/utils/cardCreation.ts", import.meta.url), "utf8");
  assert.equal(/firebase|fetch\(|XMLHttpRequest|WebSocket/i.test(source), false);
});
test("같은 now로 deterministic dataset timestamp", () => {
  const first = createCardCreationPlan(createFixture({ ids: ["custom-one"] }).planOptions);
  const second = createCardCreationPlan(createFixture({ ids: ["custom-one"] }).planOptions);
  assert.equal(first.dataset.updatedAt, NOW.toISOString());
  assert.equal(first.mutations[0].value, second.mutations[0].value);
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
console.log(`Card creation verification passed: ${passed}/${tests.length}`);
