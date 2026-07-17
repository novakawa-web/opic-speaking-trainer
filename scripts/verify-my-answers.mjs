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
