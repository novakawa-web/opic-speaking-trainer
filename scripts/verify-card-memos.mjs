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
  CARD_MEMOS_STORAGE_KEY,
  createCardMemo,
  deleteCardMemo,
  formatMemoDate,
  getMemoCount,
  parseCardMemos,
  readCardMemos,
  restoreCardMemo,
  searchCardMemos,
  sortCardMemos,
  toggleCardMemoPinned,
  updateCardMemo,
} from "../src/utils/cardMemoStorage.ts";

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

const cardId = defaultCards[0].id;
const createdAt = new Date("2026-07-17T10:00:00.000Z");
function createOne(content = "cozy 발음 주의", id = "memo-001") {
  return createCardMemo({}, cardId, content, { id, now: createdAt });
}

test("빈 저장소", () => {
  resetStorage();
  assert.deepEqual(readCardMemos(), {});
});

test("메모 생성", () => {
  resetStorage();
  const result = createOne();
  assert.equal(result.memo.content, "cozy 발음 주의");
  assert.equal(readCardMemos()[cardId].length, 1);
});

test("수정", () => {
  resetStorage();
  const created = createOne();
  const updated = updateCardMemo(created.cardMemos, cardId, "memo-001", "수정된 메모", new Date("2026-07-17T11:00:00Z"));
  assert.equal(updated[cardId][0].content, "수정된 메모");
  assert.equal(updated[cardId][0].updatedAt, "2026-07-17T11:00:00.000Z");
});

test("삭제", () => {
  resetStorage();
  const created = createOne();
  const deleted = deleteCardMemo(created.cardMemos, cardId, "memo-001");
  assert.equal(deleted.deletedMemo.id, "memo-001");
  assert.deepEqual(deleted.cardMemos, {});
});

test("삭제 되돌리기용 데이터 보존", () => {
  resetStorage();
  const created = createOne();
  const deleted = deleteCardMemo(created.cardMemos, cardId, "memo-001");
  const restored = restoreCardMemo(deleted.cardMemos, deleted.deletedMemo, deleted.index);
  assert.deepEqual(restored[cardId][0], created.memo);
});

test("공백 거부", () => {
  assert.equal(createCardMemo({}, cardId, " \n ").memo, null);
});

test("줄바꿈 보존", () => {
  const result = createCardMemo({}, cardId, "one\r\n\r\ntwo", { id: "memo-lines", now: createdAt });
  assert.equal(result.memo.content, "one\n\ntwo");
});

test("3000자 제한", () => {
  assert.ok(createCardMemo({}, cardId, "a".repeat(3000), { id: "memo-max", now: createdAt }).memo);
  assert.equal(createCardMemo({}, cardId, "a".repeat(3001)).memo, null);
});

test("잘못된 localStorage fallback", () => {
  resetStorage();
  localStorage.setItem(CARD_MEMOS_STORAGE_KEY, "{broken");
  assert.deepEqual(readCardMemos(), {});
  assert.deepEqual(parseCardMemos('{"x":"not-array"}'), {});
});

test("pinned toggle은 updatedAt 유지", () => {
  const created = createOne();
  const toggled = toggleCardMemoPinned(created.cardMemos, cardId, "memo-001");
  assert.equal(toggled[cardId][0].pinned, true);
  assert.equal(toggled[cardId][0].updatedAt, created.memo.updatedAt);
});

test("pinned 우선 정렬", () => {
  const a = { ...createOne("a", "a").memo, updatedAt: "2026-07-17T12:00:00Z" };
  const b = { ...createOne("b", "b").memo, pinned: true, updatedAt: "2026-07-17T09:00:00Z" };
  assert.equal(sortCardMemos([a, b])[0].id, "b");
});

test("updatedAt 최신순", () => {
  const a = { ...createOne("a", "a").memo, updatedAt: "2026-07-17T09:00:00Z" };
  const b = { ...createOne("b", "b").memo, updatedAt: "2026-07-17T12:00:00Z" };
  assert.equal(sortCardMemos([a, b])[0].id, "b");
});

test("카드 삭제 후 orphan 보존", () => {
  const memos = createOne().cardMemos;
  assert.equal(defaultCards.slice(1).some((card) => card.id === cardId), false);
  assert.equal(memos[cardId][0].id, "memo-001");
});

test("TSV 덮어쓰기 후 유지", () => {
  const memos = createOne().cardMemos;
  const changed = { ...structuredClone(defaultCards[0]), front: "Q: Changed?" };
  const imported = applyCardImport(defaultCards, [changed], "overwrite");
  assert.equal(imported.cards[0].front, "Q: Changed?");
  assert.equal(memos[cardId][0].id, "memo-001");
});

test("검색: 내용", () => {
  const memos = createOne("pronunciation cozy").cardMemos;
  assert.equal(searchCardMemos(memos, defaultCards, "cozy").length, 1);
});

test("검색: front/frontKo", () => {
  const memos = createOne().cardMemos;
  assert.equal(searchCardMemos(memos, defaultCards, "Tell me about your home").length, 1);
  assert.equal(searchCardMemos(memos, defaultCards, "당신의 집").length, 1);
});

test("검색: deck/tag", () => {
  const memos = createOne().cardMemos;
  assert.equal(searchCardMemos(memos, defaultCards, "주제별답변").length, 1);
  assert.equal(searchCardMemos(memos, defaultCards, "FINAL_REP").length, 1);
});

test("한글 검색", () => {
  assert.equal(searchCardMemos(createOne("발음 주의").cardMemos, defaultCards, "발음").length, 1);
});

test("대소문자 무시", () => {
  assert.equal(searchCardMemos(createOne("CoZy").cardMemos, defaultCards, "cOzY").length, 1);
});

test("JSON backup round trip", () => {
  const memos = createOne().cardMemos;
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, memos);
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.cardMemos, memos);
  assert.equal(parsed.backup.summary.memoCount, 1);
  assert.equal(parsed.backup.summary.memoCardCount, 1);
});

test("구버전 JSON 필드 누락", () => {
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, {});
  delete backup.data.cardMemos;
  delete backup.summary.memoCount;
  delete backup.summary.memoCardCount;
  delete backup.summary.pinnedMemoCount;
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.cardMemos, {});
});

test("중복 memo id", () => {
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, createOne().cardMemos);
  backup.data.cardMemos[defaultCards[1].id] = [{ ...backup.data.cardMemos[cardId][0], cardId: defaultCards[1].id }];
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.message.includes("중복")));
});

test("잘못된 날짜 메모는 경고 후 제외", () => {
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, createOne().cardMemos);
  backup.data.cardMemos[cardId][0].updatedAt = "bad-date";
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(getMemoCount(parsed.backup.data.cardMemos), 0);
  assert.ok(parsed.warningCount > 0);
});

test("key/cardId 불일치", () => {
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, createOne().cardMemos);
  backup.data.cardMemos[cardId][0].cardId = defaultCards[1].id;
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path.endsWith(".cardId")));
});

test("잘못된 cardMemos 타입", () => {
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, {});
  backup.data.cardMemos = ["wrong"];
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.cardMemos, {});
});

test("orphan 메모", () => {
  const orphan = createCardMemo({}, "removed-card", "orphan", { id: "orphan", now: createdAt }).cardMemos;
  const backup = createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, orphan);
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.data.cardMemos["removed-card"][0].content, "orphan");
});

test("prototype pollution 방어", () => {
  const text = serializeAppBackup(createAppBackup(defaultCards, {}, {}, undefined, undefined, {}, {}))
    .replace('"cardMemos": {}', '"cardMemos": {"__proto__": []}');
  const parsed = parseAndValidateBackup(text);
  assert.equal(parsed.canRestore, false);
  assert.equal({}.polluted, undefined);
});

test("날짜 표시", () => {
  const memoDate = new Date(2026, 6, 17, 12, 30);
  const sameLocalDay = new Date(2026, 6, 17, 15, 0);
  assert.match(formatMemoDate(memoDate.toISOString(), sameLocalDay), /^오늘/);
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
console.log(`\n카드 메모 검증 ${passed}/${tests.length} 통과`);
