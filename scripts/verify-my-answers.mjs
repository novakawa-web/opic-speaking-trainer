import assert from "node:assert/strict";
import { cards as defaultCards } from "../src/data/cards.ts";
import {
  createAppBackup,
  parseAndValidateBackup,
  serializeAppBackup,
  validateBackup,
} from "../src/utils/appBackup.ts";
import { applyCardImport } from "../src/utils/cardStorage.ts";
import {
  MY_ANSWERS_STORAGE_KEY,
  deleteMyAnswer,
  extractMyFirstLine,
  parseMyAnswers,
  readMyAnswers,
  saveMyAnswers,
  selectHasMyAnswer,
  setMyAnswer,
} from "../src/utils/myAnswerStorage.ts";
import {
  AnswerDraftError,
  combineAnswerDraft,
  createAnswerDraftPlan,
  executeAnswerDraftTransaction,
} from "../src/utils/answerDraft.ts";
import { StorageTransactionError } from "../src/utils/storageTransaction.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();

const tests = [];
function test(name, run) { tests.push({ name, run }); }
function resetStorage() { globalThis.localStorage = new MemoryStorage(); }

test("빈 저장소", () => {
  resetStorage();
  assert.deepEqual(readMyAnswers(), {});
});

test("답변 저장", () => {
  resetStorage();
  const saved = setMyAnswer({}, "home-001", "  My home is cozy.  ");
  assert.equal(saved["home-001"], "My home is cozy.");
  assert.equal(readMyAnswers()["home-001"], "My home is cozy.");
});

test("답변 수정", () => {
  resetStorage();
  const first = setMyAnswer({}, "home-001", "First answer.");
  const second = setMyAnswer(first, "home-001", "Second answer.");
  assert.equal(second["home-001"], "Second answer.");
});

test("답변 삭제", () => {
  resetStorage();
  const saved = setMyAnswer({}, "home-001", "Answer.");
  const removed = deleteMyAnswer(saved, "home-001");
  assert.deepEqual(removed, {});
  assert.equal(localStorage.getItem(MY_ANSWERS_STORAGE_KEY), null);
});

test("공백 답변 거부", () => {
  resetStorage();
  const original = { "home-001": "Saved." };
  assert.equal(setMyAnswer(original, "home-001", "   \n  "), original);
});

test("줄바꿈 보존", () => {
  resetStorage();
  const saved = setMyAnswer({}, "home-001", "Line one.\r\n\r\nLine two.");
  assert.equal(saved["home-001"], "Line one.\n\nLine two.");
});

test("잘못된 localStorage fallback", () => {
  resetStorage();
  localStorage.setItem(MY_ANSWERS_STORAGE_KEY, "{broken");
  assert.deepEqual(readMyAnswers(), {});
  assert.deepEqual(parseMyAnswers('["not", "object"]'), {});
});

test("기본 카드 변경 없음", () => {
  const before = structuredClone(defaultCards);
  setMyAnswer({}, defaultCards[0].id, "My own answer.");
  assert.deepEqual(defaultCards, before);
});

test("동일 ID TSV 덮어쓰기 후 유지", () => {
  const answers = { [defaultCards[0].id]: "My own answer." };
  const changedCard = { ...structuredClone(defaultCards[0]), front: "Q: Changed?" };
  const result = applyCardImport(defaultCards, [changedCard], "overwrite");
  assert.equal(result.cards[0].front, "Q: Changed?");
  assert.equal(answers[defaultCards[0].id], "My own answer.");
});

test("카드 삭제 후 orphan 보존", () => {
  const answers = { [defaultCards[0].id]: "Orphan answer." };
  const remainingCards = defaultCards.slice(1);
  assert.equal(remainingCards.some((card) => card.id === defaultCards[0].id), false);
  assert.equal(answers[defaultCards[0].id], "Orphan answer.");
});

test("나의 첫 문장 추출: 첫 줄", () => {
  assert.equal(extractMyFirstLine("First line without punctuation\nSecond line."), "First line without punctuation");
});

test("빈 줄로 시작하는 답변", () => {
  assert.equal(extractMyFirstLine("\n\n  First real line.\nNext."), "First real line.");
});

test("한 줄 문장부호 추출", () => {
  assert.equal(extractMyFirstLine("First sentence! Second sentence."), "First sentence!");
});

test("문장부호 없는 답변", () => {
  assert.equal(extractMyFirstLine("This is my whole first line"), "This is my whole first line");
});

test("JSON 백업 round trip", () => {
  const answers = { [defaultCards[0].id]: "My home answer.\nIt is cozy." };
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, answers);
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.myAnswers, answers);
  assert.equal(parsed.backup.summary.myAnswerCount, 1);
});

test("구버전 JSON 필드 누락", () => {
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {});
  delete backup.data.myAnswers;
  delete backup.summary.myAnswerCount;
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.myAnswers, {});
});

test("잘못된 JSON myAnswers", () => {
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {});
  backup.data.myAnswers = ["wrong"];
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.myAnswers, {});
  assert.ok(parsed.issues.some((issue) => issue.path === "data.myAnswers"));
});

test("prototype pollution key 방어", () => {
  const text = serializeAppBackup(
    createAppBackup(defaultCards, {}, {}, undefined, undefined, {}),
  ).replace('"myAnswers": {}', '"myAnswers": {"__proto__": "bad"}');
  const parsed = parseAndValidateBackup(text);
  assert.equal(parsed.canRestore, false);
  assert.equal({}.polluted, undefined);
});

test("답변 있음 selector", () => {
  const answers = saveMyAnswers({ [defaultCards[0].id]: "Answer." });
  assert.equal(selectHasMyAnswer(answers, defaultCards[0].id), true);
  assert.equal(selectHasMyAnswer(answers, defaultCards[1].id), false);
});

test("음성 초안으로 기존 답변 바꾸기", () => {
  assert.equal(
    combineAnswerDraft("Old answer.", "  New answer.  ", "replace"),
    "New answer.",
  );
});

test("음성 초안을 기존 답변 뒤에 문단으로 추가", () => {
  assert.equal(
    combineAnswerDraft("Old answer.", "New answer.", "append"),
    "Old answer.\n\nNew answer.",
  );
});

test("음성 초안 저장은 저장소 성공 후에만 화면 상태 반영", () => {
  resetStorage();
  const plan = createAnswerDraftPlan({
    cardId: "home-001",
    draft: "Spoken answer.",
    mode: "replace",
    currentMyAnswers: {},
    localStorage,
  });
  let committed = null;
  executeAnswerDraftTransaction({ plan, commit: (answers) => { committed = answers; } });
  assert.equal(readMyAnswers()["home-001"], "Spoken answer.");
  assert.equal(committed["home-001"], "Spoken answer.");
});

test("음성 초안 저장 실패 시 화면 상태와 기존 저장값 유지", () => {
  const storage = new MemoryStorage();
  storage.values.set(MY_ANSWERS_STORAGE_KEY, JSON.stringify({ "home-001": "Old." }));
  const originalSetItem = storage.setItem.bind(storage);
  let failNextWrite = true;
  storage.setItem = (key, value) => {
    if (failNextWrite) {
      failNextWrite = false;
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    originalSetItem(key, value);
  };
  const plan = createAnswerDraftPlan({
    cardId: "home-001",
    draft: "New.",
    mode: "replace",
    currentMyAnswers: { "home-001": "Old." },
    localStorage: storage,
  });
  let committed = false;
  assert.throws(
    () => executeAnswerDraftTransaction({ plan, commit: () => { committed = true; } }),
    (error) => error instanceof StorageTransactionError && error.rollbackSucceeded,
  );
  assert.equal(committed, false);
  assert.equal(JSON.parse(storage.getItem(MY_ANSWERS_STORAGE_KEY))["home-001"], "Old.");
});

test("빈 음성 초안과 위험한 카드 ID 거부", () => {
  resetStorage();
  assert.throws(
    () => createAnswerDraftPlan({
      cardId: "home-001",
      draft: "   ",
      mode: "replace",
      currentMyAnswers: {},
      localStorage,
    }),
    AnswerDraftError,
  );
  assert.throws(
    () => createAnswerDraftPlan({
      cardId: "__proto__",
      draft: "Answer.",
      mode: "replace",
      currentMyAnswers: {},
      localStorage,
    }),
    AnswerDraftError,
  );
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log(`\n나만의 답변 검증 ${passed}/${tests.length} 통과`);
