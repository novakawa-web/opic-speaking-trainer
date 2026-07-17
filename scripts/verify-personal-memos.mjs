import assert from "node:assert/strict";
import { cards } from "../src/data/cards.ts";
import {
  applyBackupWithSafety,
  createAppBackup,
  parseAndValidateBackup,
  restoreFullRestoreBackup,
  serializeAppBackup,
  validateBackup,
} from "../src/utils/appBackup.ts";
import { CARD_MEMOS_STORAGE_KEY } from "../src/utils/cardMemoStorage.ts";
import { CARD_DATASET_STORAGE_KEY } from "../src/utils/cardStorage.ts";
import {
  PERSONAL_MEMOS_STORAGE_KEY,
  PERSONAL_MEMO_CONTENT_MAX_LENGTH,
  PERSONAL_MEMO_EDITOR_SESSION_KEY,
  PERSONAL_MEMO_TITLE_MAX_LENGTH,
  clearPersonalMemoEditorSession,
  createEmptyPersonalMemoEditorSession,
  createPersonalMemo,
  deletePersonalMemo,
  normalizePersonalMemoDataset,
  readPersonalMemoDataset,
  readPersonalMemoEditorSession,
  restorePersonalMemo,
  savePersonalMemoEditorSession,
  searchPersonalMemos,
  sortPersonalMemos,
  togglePersonalMemoPinned,
  updatePersonalMemo,
} from "../src/utils/personalMemoStorage.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }
function baseDataset() { return { version: 1, memos: [] }; }
function seedDataset() {
  let dataset = createPersonalMemo(baseDataset(), "시험 전략", "첫 문장은 3초 안에 말하기", {
    id: "personal-001",
    now: new Date("2026-07-17T10:00:00.000Z"),
  }).dataset;
  dataset = createPersonalMemo(dataset, "Useful English", "To be honest, 로 시작하기", {
    id: "personal-002",
    now: new Date("2026-07-17T11:00:00.000Z"),
  }).dataset;
  return dataset;
}

test("빈 저장소", () => {
  assert.deepEqual(readPersonalMemoDataset(new MemoryStorage()), baseDataset());
});

test("생성", () => {
  const result = createPersonalMemo(baseDataset(), "  공부법  ", "  한 줄씩\r\n말하기  ", {
    id: "memo-create",
    now: new Date("2026-07-17T12:00:00.000Z"),
  });
  assert.equal(result.memo.title, "공부법");
  assert.equal(result.memo.content, "한 줄씩\n말하기");
  assert.equal(result.memo.createdAt, result.memo.updatedAt);
});

test("수정", () => {
  const dataset = seedDataset();
  const createdAt = dataset.memos.find((memo) => memo.id === "personal-001").createdAt;
  const result = updatePersonalMemo(dataset, "personal-001", "새 제목", "새 본문", new Date("2026-07-18T12:00:00Z"));
  assert.equal(result.memo.createdAt, createdAt);
  assert.equal(result.memo.updatedAt, "2026-07-18T12:00:00.000Z");
});

test("삭제", () => {
  const result = deletePersonalMemo(seedDataset(), "personal-001");
  assert.equal(result.deletedMemo.id, "personal-001");
  assert.equal(result.dataset.memos.length, 1);
});

test("삭제 복원 데이터", () => {
  const deleted = deletePersonalMemo(seedDataset(), "personal-001");
  const restored = restorePersonalMemo(deleted.dataset, deleted.deletedMemo, deleted.index);
  assert.equal(restored.memos.length, 2);
  assert.equal(restored.memos[deleted.index].id, "personal-001");
});

test("제목 공백 거부", () => {
  assert.throws(() => createPersonalMemo(baseDataset(), "   ", "본문"));
});

test("본문 공백 거부", () => {
  assert.throws(() => createPersonalMemo(baseDataset(), "제목", "\n  "));
});

test("제목 120자 제한", () => {
  assert.doesNotThrow(() => createPersonalMemo(baseDataset(), "가".repeat(PERSONAL_MEMO_TITLE_MAX_LENGTH), "본문"));
  assert.throws(() => createPersonalMemo(baseDataset(), "가".repeat(PERSONAL_MEMO_TITLE_MAX_LENGTH + 1), "본문"));
});

test("본문 10000자 제한", () => {
  assert.doesNotThrow(() => createPersonalMemo(baseDataset(), "제목", "a".repeat(PERSONAL_MEMO_CONTENT_MAX_LENGTH)));
  assert.throws(() => createPersonalMemo(baseDataset(), "제목", "a".repeat(PERSONAL_MEMO_CONTENT_MAX_LENGTH + 1)));
});

test("줄바꿈 보존", () => {
  const memo = createPersonalMemo(baseDataset(), "제목", "첫 줄\n\n둘째 문단", { id: "linebreak" }).memo;
  assert.equal(memo.content, "첫 줄\n\n둘째 문단");
});

test("잘못된 localStorage fallback", () => {
  const storage = new MemoryStorage();
  storage.setItem(PERSONAL_MEMOS_STORAGE_KEY, "{broken");
  assert.deepEqual(readPersonalMemoDataset(storage), baseDataset());
});

test("유효 항목만 복구", () => {
  const valid = seedDataset().memos[0];
  const normalized = normalizePersonalMemoDataset({ version: 1, memos: [valid, { id: "bad" }] });
  assert.deepEqual(normalized.memos.map((memo) => memo.id), [valid.id]);
});

test("중복 ID 제외", () => {
  const valid = seedDataset().memos[0];
  const normalized = normalizePersonalMemoDataset({ version: 1, memos: [valid, structuredClone(valid)] });
  assert.equal(normalized.memos.length, 1);
});

test("pinned toggle은 updatedAt 유지", () => {
  const dataset = seedDataset();
  const before = dataset.memos[0].updatedAt;
  const toggled = togglePersonalMemoPinned(dataset, dataset.memos[0].id);
  assert.equal(toggled.memos[0].pinned, true);
  assert.equal(toggled.memos[0].updatedAt, before);
});

test("pinned 우선 정렬", () => {
  let dataset = seedDataset();
  dataset = togglePersonalMemoPinned(dataset, "personal-001");
  assert.equal(sortPersonalMemos(dataset.memos)[0].id, "personal-001");
});

test("updatedAt 최신순", () => {
  assert.equal(sortPersonalMemos(seedDataset().memos)[0].id, "personal-002");
});

test("제목 검색", () => {
  assert.deepEqual(searchPersonalMemos(seedDataset().memos, "시험").map((memo) => memo.id), ["personal-001"]);
});

test("본문 검색", () => {
  assert.deepEqual(searchPersonalMemos(seedDataset().memos, "3초").map((memo) => memo.id), ["personal-001"]);
});

test("한글 검색", () => {
  assert.equal(searchPersonalMemos(seedDataset().memos, "말하기").length, 1);
});

test("대소문자 무시", () => {
  assert.equal(searchPersonalMemos(seedDataset().memos, "USEFUL ENGLISH").length, 1);
});

test("편집 초안 serialize/restore", () => {
  const storage = new MemoryStorage();
  const session = { mode: "edit", memoId: "personal-001", titleDraft: "초안", contentDraft: "내용\n보존", dirty: true };
  savePersonalMemoEditorSession(session, storage);
  assert.deepEqual(readPersonalMemoEditorSession(storage), session);
});

test("새 초안 기본값", () => {
  assert.deepEqual(createEmptyPersonalMemoEditorSession(), {
    mode: "new", memoId: null, titleDraft: "", contentDraft: "", dirty: false,
  });
});

test("저장·취소 후 초안 삭제", () => {
  const storage = new MemoryStorage();
  savePersonalMemoEditorSession(createEmptyPersonalMemoEditorSession(), storage);
  clearPersonalMemoEditorSession(storage);
  assert.equal(storage.getItem(PERSONAL_MEMO_EDITOR_SESSION_KEY), null);
});

test("prototype pollution 방어", () => {
  const unsafe = JSON.parse('{"version":1,"memos":[{"id":"__proto__","title":"x","content":"y","pinned":false,"createdAt":"2026-07-17T00:00:00Z","updatedAt":"2026-07-17T00:00:00Z"}]}');
  assert.equal(normalizePersonalMemoDataset(unsafe).memos.length, 0);
  assert.equal({}.polluted, undefined);
});

test("JSON 백업 round trip", () => {
  const personalMemos = seedDataset();
  const backup = createAppBackup(cards, {}, {}, undefined, new Date("2026-07-17T12:00:00Z"), {}, {}, undefined, personalMemos);
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.personalMemos, personalMemos);
  assert.equal(parsed.backup.summary.personalMemoCount, 2);
});

test("기존 JSON 필드 누락", () => {
  const backup = createAppBackup(cards, {}, {});
  delete backup.data.personalMemos;
  delete backup.summary.personalMemoCount;
  delete backup.summary.pinnedPersonalMemoCount;
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.personalMemos, baseDataset());
});

test("잘못된 personalMemos", () => {
  const backup = createAppBackup(cards, {}, {});
  backup.data.personalMemos = { version: 1, memos: [{ id: "bad" }] };
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.data.personalMemos.memos.length, 0);
  assert.ok(parsed.warningCount > 0);
});

test("백업 중복 memo id 오류", () => {
  const backup = createAppBackup(cards, {}, {});
  const memo = seedDataset().memos[0];
  backup.data.personalMemos = { version: 1, memos: [memo, structuredClone(memo)] };
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
});

test("전체 복구와 되돌리기", () => {
  const storage = new MemoryStorage();
  const oldBackup = createAppBackup(cards, {}, {});
  const newBackup = createAppBackup(cards, {}, {}, undefined, new Date(), {}, {}, undefined, seedDataset());
  applyBackupWithSafety(newBackup, oldBackup, storage);
  assert.equal(JSON.parse(storage.getItem(PERSONAL_MEMOS_STORAGE_KEY)).memos.length, 2);
  assert.equal(restoreFullRestoreBackup(storage), true);
  assert.equal(JSON.parse(storage.getItem(PERSONAL_MEMOS_STORAGE_KEY)).memos.length, 0);
});

test("TSV 및 카드별 메모 저장소와 분리", () => {
  const storage = new MemoryStorage();
  storage.setItem(CARD_DATASET_STORAGE_KEY, "cards-stay");
  storage.setItem(CARD_MEMOS_STORAGE_KEY, "card-memos-stay");
  storage.setItem(PERSONAL_MEMOS_STORAGE_KEY, JSON.stringify(seedDataset()));
  assert.equal(storage.getItem(CARD_DATASET_STORAGE_KEY), "cards-stay");
  assert.equal(storage.getItem(CARD_MEMOS_STORAGE_KEY), "card-memos-stay");
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

console.log(`\n개인 학습 메모 검증 ${passed}/${tests.length} 통과`);
