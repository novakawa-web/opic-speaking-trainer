import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cards as defaultCards } from "../src/data/cards.ts";
import {
  APP_BACKUP_FORMAT,
  DEFAULT_BACKUP_SETTINGS,
  FULL_RESTORE_BACKUP_STORAGE_KEY,
  MAX_BACKUP_FILE_BYTES,
  applyBackupWithSafety,
  createAppBackup,
  groupAttemptsByDate,
  parseAndValidateBackup,
  readFullRestoreBackup,
  restoreFullRestoreBackup,
  serializeAppBackup,
  validateBackup,
} from "../src/utils/appBackup.ts";
import { CARD_DATASET_STORAGE_KEY } from "../src/utils/cardStorage.ts";
import { createSampleCards } from "../src/utils/cardTsv.ts";
import { NAVIGATION_SESSION_STORAGE_KEY } from "../src/utils/navigationSession.ts";
import { STUDY_ATTEMPTS_STORAGE_KEY, calculateDailyStats } from "../src/utils/studyStats.ts";
import { FIRST_LINE_STATUSES_STORAGE_KEY } from "../src/utils/statusStorage.ts";
import { THEME_STORAGE_KEY } from "../src/utils/themeStorage.ts";
import {
  SHADOWING_REPEAT_COUNT_KEY,
  SHADOWING_REPEAT_MODE_KEY,
  SHADOWING_REST_LEVEL_KEY,
} from "../src/utils/shadowingSettings.ts";
import { SAVED_PASSAGES_STORAGE_KEY } from "../src/utils/savedPassageStorage.ts";

class MemoryStorage {
  values = new Map();
  writes = 0;
  failOnWrite = null;
  failed = false;

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.writes += 1;
    if (!this.failed && this.failOnWrite === this.writes) {
      this.failed = true;
      throw new Error("QuotaExceededError");
    }
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const attempt = {
  id: "attempt-001",
  date: "2026-07-17",
  cardId: defaultCards[0].id,
  status: "success",
  timestamp: "2026-07-17T10:00:00.000Z",
};
const statuses = {
  [defaultCards[0].id]: "success",
  [defaultCards[1].id]: "again",
};
const attemptsByDate = { "2026-07-17": [attempt] };
const settings = {
  ...DEFAULT_BACKUP_SETTINGS,
  theme: "dark",
  studyDayStartTime: "05:30",
  ttsRate: 0.85,
  questionAutoplay: true,
  autoAdvance: true,
  cardScope: "new",
  studyOrder: "least-practiced",
  shadowingRepeatMode: "sentence",
  shadowingRepeatCount: 5,
  shadowingRestLevel: "medium",
};
const savedPassages = {
  version: 1,
  passages: [
    {
      id: "passage-backup-001",
      title: "Hotel role-play",
      text: "I need a room.\n\nCan I check in early?",
      createdAt: "2026-07-17T09:00:00.000Z",
      updatedAt: "2026-07-17T10:00:00.000Z",
    },
  ],
};

function makeBackup(cards = defaultCards) {
  return createAppBackup(
    cards,
    statuses,
    attemptsByDate,
    settings,
    new Date("2026-07-17T12:34:00.000Z"),
  );
}

function clone(value) {
  return structuredClone(value);
}

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("정상 백업 생성", () => {
  const backup = makeBackup();
  assert.equal(backup.format, APP_BACKUP_FORMAT);
  assert.equal(backup.version, 1);
  assert.equal(backup.summary.cardCount, 12);
  assert.equal(backup.summary.statusCount, 2);
  assert.equal(backup.summary.attemptCount, 1);
});

test("export 후 import round trip", () => {
  const backup = makeBackup();
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup, backup);
});

test("잘못된 JSON", () => {
  const parsed = parseAndValidateBackup("{broken");
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path === "$"));
});

test("format 불일치", () => {
  const backup = clone(makeBackup());
  backup.format = "other-format";
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path === "format"));
});

test("지원하지 않는 version", () => {
  const backup = clone(makeBackup());
  backup.version = 2;
  const parsed = parseAndValidateBackup(JSON.stringify(backup));
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path === "version"));
});

test("필수 data 누락", () => {
  const backup = clone(makeBackup());
  delete backup.data;
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path === "data"));
});

test("카드 중복 ID", () => {
  const backup = clone(makeBackup());
  backup.data.cardDataset.cards.push(clone(backup.data.cardDataset.cards[0]));
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.message.includes("중복")));
});

test("잘못된 status", () => {
  const backup = clone(makeBackup());
  backup.data.cardStatuses[defaultCards[0].id] = "maybe";
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path.includes("cardStatuses")));
});

test("잘못된 attempts", () => {
  const backup = clone(makeBackup());
  backup.data.attempts[0].date = "2026-99-99";
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path === "data.attempts[0]"));
});

test("중복 attempt ID", () => {
  const backup = clone(makeBackup());
  backup.data.attempts.push(clone(backup.data.attempts[0]));
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path.endsWith(".id")));
});

test("잘못된 설정값 기본값 대체", () => {
  const backup = clone(makeBackup());
  backup.data.settings.ttsRate = 9;
  backup.data.settings.theme = "system";
  backup.data.settings.studyDayStartTime = "29:99";
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.data.settings.ttsRate, 1);
  assert.equal(parsed.backup.data.settings.theme, "light");
  assert.equal(parsed.backup.data.settings.studyDayStartTime, "04:00");
  assert.equal(parsed.warningCount, 3);
});

test("알 수 없는 필드 경고 후 무시", () => {
  const backup = clone(makeBackup());
  backup.futureField = "ignored";
  backup.data.settings.futureSetting = true;
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.ok(parsed.warningCount >= 2);
  assert.equal(parsed.backup.futureField, undefined);
  assert.equal(parsed.backup.data.settings.futureSetting, undefined);
});

test("prototype pollution key 차단", () => {
  const unsafeText = serializeAppBackup(makeBackup()).replace(
    '"theme": "dark"',
    '"__proto__": {"polluted": true},\n      "theme": "dark"',
  );
  const parsed = parseAndValidateBackup(unsafeText);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path.includes("__proto__")));
  assert.equal({}.polluted, undefined);
});

test("10MB 초과", () => {
  const parsed = parseAndValidateBackup("{}", MAX_BACKUP_FILE_BYTES + 1);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.message.includes("10MB")));
});

test("localStorage quota 오류와 자동 롤백", () => {
  const storage = new MemoryStorage();
  storage.setItem(THEME_STORAGE_KEY, "light");
  const before = new Map(storage.values);
  storage.failOnWrite = storage.writes + 3;
  assert.throws(
    () => applyBackupWithSafety(makeBackup(), makeBackup(), storage),
    /QuotaExceededError/,
  );
  assert.deepEqual(storage.values, before);
});

test("복구 전 안전 백업 생성", () => {
  const storage = new MemoryStorage();
  const session = new MemoryStorage();
  session.setItem(NAVIGATION_SESSION_STORAGE_KEY, "stale");
  const current = makeBackup();
  const target = clone(makeBackup());
  target.data.settings.theme = "light";
  applyBackupWithSafety(target, current, storage, session);
  assert.ok(storage.getItem(FULL_RESTORE_BACKUP_STORAGE_KEY));
  assert.equal(readFullRestoreBackup(storage).backup.data.settings.theme, "dark");
  assert.equal(storage.getItem(THEME_STORAGE_KEY), "light");
  assert.equal(session.getItem(NAVIGATION_SESSION_STORAGE_KEY), null);
});

test("직전 복구 되돌리기", () => {
  const storage = new MemoryStorage();
  const current = makeBackup();
  const target = clone(makeBackup());
  target.data.cardDataset.cards = [target.data.cardDataset.cards[0]];
  target.summary.cardCount = 1;
  applyBackupWithSafety(target, current, storage);
  assert.equal(JSON.parse(storage.getItem(CARD_DATASET_STORAGE_KEY)).cards.length, 1);
  assert.equal(restoreFullRestoreBackup(storage), true);
  assert.equal(JSON.parse(storage.getItem(CARD_DATASET_STORAGE_KEY)).cards.length, 12);
  assert.equal(storage.getItem(FULL_RESTORE_BACKUP_STORAGE_KEY), null);
  assert.equal(restoreFullRestoreBackup(storage), false);
});

test("기본 카드만 있는 상태", () => {
  const backup = createAppBackup(defaultCards, {}, {}, DEFAULT_BACKUP_SETTINGS);
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.summary.cardCount, 12);
  assert.equal(parsed.backup.summary.statusCount, 0);
  assert.equal(parsed.backup.summary.attemptCount, 0);
});

test("사용자 TSV 카드가 있는 상태", () => {
  const cards = [...defaultCards, createSampleCards()[0]];
  const parsed = parseAndValidateBackup(serializeAppBackup(makeBackup(cards)));
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.summary.cardCount, 13);
  assert.equal(parsed.backup.data.cardDataset.cards.at(-1).id, "sample-home-001");
});

test("orphan 학습 기록 보존", () => {
  const backup = clone(makeBackup());
  backup.data.cardStatuses["removed-card"] = "hard";
  backup.data.attempts.push({
    id: "orphan-attempt",
    date: "2026-07-17",
    cardId: "removed-card",
    status: "hard",
    timestamp: "2026-07-17T11:00:00.000Z",
  });
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.data.cardStatuses["removed-card"], "hard");
  assert.ok(parsed.backup.data.attempts.some((item) => item.cardId === "removed-card"));
});

test("JSON round trip 후 날짜별 통계 동일", () => {
  const before = calculateDailyStats(attemptsByDate, "00:00", new Date("2026-07-17T12:00:00"));
  const parsed = parseAndValidateBackup(serializeAppBackup(makeBackup()));
  const restoredAttempts = groupAttemptsByDate(parsed.backup.data.attempts);
  const after = calculateDailyStats(restoredAttempts, "00:00", new Date("2026-07-17T12:00:00"));
  assert.deepEqual(after, before);
});

test("저장 지문 JSON round trip", () => {
  const backup = createAppBackup(
    defaultCards,
    statuses,
    attemptsByDate,
    settings,
    new Date("2026-07-17T12:34:00.000Z"),
    {},
    {},
    savedPassages,
  );
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.savedPassages, savedPassages);
  assert.equal(parsed.backup.summary.savedPassageCount, 1);
});

test("구버전 v1 저장 지문 필드 누락은 빈 목록", () => {
  const backup = clone(makeBackup());
  delete backup.data.savedPassages;
  delete backup.summary.savedPassageCount;
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup.data.savedPassages, { version: 1, passages: [] });
});

test("잘못된 저장 지문은 경고 후 제외", () => {
  const backup = clone(makeBackup());
  backup.data.savedPassages = {
    version: 1,
    passages: [{ id: "broken", title: "", text: "", createdAt: "bad", updatedAt: "bad" }],
  };
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.data.savedPassages.passages.length, 0);
  assert.ok(parsed.issues.some((issue) => issue.path.includes("savedPassages")));
});

test("중복 저장 지문 id는 복구 오류", () => {
  const backup = clone(makeBackup());
  backup.data.savedPassages = {
    version: 1,
    passages: [savedPassages.passages[0], clone(savedPassages.passages[0])],
  };
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, false);
  assert.ok(parsed.issues.some((issue) => issue.path.includes("savedPassages") && issue.message.includes("중복")));
});

test("createdAt 이후 updatedAt 정책 위반은 경고 후 정규화", () => {
  const backup = clone(makeBackup());
  backup.data.savedPassages = {
    version: 1,
    passages: [{
      ...savedPassages.passages[0],
      createdAt: "2026-07-18T10:00:00.000Z",
      updatedAt: "2026-07-17T10:00:00.000Z",
    }],
  };
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(
    parsed.backup.data.savedPassages.passages[0].updatedAt,
    parsed.backup.data.savedPassages.passages[0].createdAt,
  );
});

test("paragraph repeat mode 백업 허용", () => {
  const backup = clone(makeBackup());
  backup.data.settings.shadowingRepeatMode = "paragraph";
  const parsed = validateBackup(backup);
  assert.equal(parsed.canRestore, true);
  assert.equal(parsed.backup.data.settings.shadowingRepeatMode, "paragraph");
});

test("복구 저장 키 매핑", () => {
  const storage = new MemoryStorage();
  applyBackupWithSafety(makeBackup(), makeBackup(), storage);
  assert.ok(storage.getItem(CARD_DATASET_STORAGE_KEY));
  assert.ok(storage.getItem(FIRST_LINE_STATUSES_STORAGE_KEY));
  assert.ok(storage.getItem(STUDY_ATTEMPTS_STORAGE_KEY));
  assert.equal(storage.getItem(THEME_STORAGE_KEY), "dark");
  assert.equal(storage.getItem(SHADOWING_REPEAT_MODE_KEY), "sentence");
  assert.equal(storage.getItem(SHADOWING_REPEAT_COUNT_KEY), "5");
  assert.equal(storage.getItem(SHADOWING_REST_LEVEL_KEY), "medium");
});

test("저장 지문 복구 저장 키 매핑", () => {
  const storage = new MemoryStorage();
  const backup = createAppBackup(
    defaultCards,
    statuses,
    attemptsByDate,
    settings,
    new Date("2026-07-17T12:34:00.000Z"),
    {},
    {},
    savedPassages,
  );
  applyBackupWithSafety(backup, makeBackup(), storage);
  assert.deepEqual(JSON.parse(storage.getItem(SAVED_PASSAGES_STORAGE_KEY)), savedPassages);
});

test("JSON 복구 UI는 선택·미리보기·실행 단계를 표시", () => {
  const source = readFileSync(
    new URL("../src/components/BackupManager.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("JSON 백업 복구"));
  assert.ok(source.includes("파일 선택 완료"));
  assert.ok(source.includes("복구 미리보기"));
  assert.ok(source.includes("전체 복구 실행"));
  assert.ok(source.includes("전체 백업 파일을 선택한 뒤 내용을 확인하고 복구합니다."));
});

test("JSON 복구 UI는 파일 상태와 재선택을 안내", () => {
  const source = readFileSync(
    new URL("../src/components/BackupManager.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("선택한 백업 파일이 없어요."));
  assert.ok(source.includes("파일을 확인하고 있어요."));
  assert.ok(source.includes("복구 준비됨"));
  assert.ok(source.includes("전체 복구 완료:"));
  assert.ok(source.includes("다른 파일 선택"));
  assert.ok(source.includes('aria-live="polite"'));
});

test("JSON 복구 오류와 확인 절차가 실행을 차단", () => {
  const source = readFileSync(
    new URL("../src/components/BackupManager.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("restoreDisabled"));
  assert.ok(source.includes("오류가 있는 백업은 복구할 수 없습니다."));
  assert.ok(source.includes("전체 복구 확인에 체크해 주세요."));
});

test("JSON 되돌리기는 복구 영역에만 조건부 표시", () => {
  const source = readFileSync(
    new URL("../src/components/BackupManager.tsx", import.meta.url),
    "utf8",
  );
  const exportIndex = source.indexOf('className="data-transfer-section is-export"');
  const restoreIndex = source.indexOf('className="data-transfer-section is-restore"');
  const undoIndex = source.lastIndexOf("직전 전체 복구 되돌리기");
  assert.ok(exportIndex >= 0 && restoreIndex > exportIndex);
  assert.ok(undoIndex > restoreIndex);
  assert.ok(source.includes("{safetyBackupAvailable ? ("));
  assert.ok(source.includes("되돌릴 전체 복구가 없어요."));
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

console.log(`\nJSON 백업 검증 ${passed}/${tests.length} 통과`);
