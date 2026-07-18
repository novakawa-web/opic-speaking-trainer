import type {
  FirstLineResult,
  FirstLineStatusMap,
  OpicCard,
  StudyAttempt,
  StudyAttemptsByDate,
  ThemeMode,
  AnswerLearningAttempt,
  AnswerLearningAttemptsByDate,
  AnswerLearningStatuses,
} from "../types.ts";
import {
  ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY,
  ANSWER_LEARNING_STATUSES_STORAGE_KEY,
  flattenAnswerLearningAttempts,
  groupAnswerLearningAttempts,
  isAnswerLearningAttempt,
  isAnswerLearningStatus,
  normalizeAnswerLearningStatuses,
} from "./answerLearningStorage.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  CARD_DATASET_VERSION,
  CARD_IMPORT_BACKUP_KEY,
  createCardDataset,
  isOpicCard,
  type CardDataset,
} from "./cardStorage.ts";
import {
  AUTO_ADVANCE_STORAGE_KEY,
  STUDY_CARD_SCOPE_STORAGE_KEY,
  STUDY_ORDER_STORAGE_KEY,
  isStudyCardScope,
  isStudyOrder,
  readAutoAdvanceAfterRating,
  readStudyCardScope,
  readStudyOrder,
  type StudyCardScope,
  type StudyOrder,
} from "./studyPreferences.ts";
import {
  DEFAULT_STUDY_DAY_START_TIME,
  STUDY_DAY_START_STORAGE_KEY,
  isValidStudyDayStartTime,
  readStudyDayStartTime,
} from "./studyDay.ts";
import {
  STUDY_ATTEMPTS_STORAGE_KEY,
} from "./studyStats.ts";
import {
  FIRST_LINE_STATUSES_STORAGE_KEY,
  normalizeStatuses,
} from "./statusStorage.ts";
import {
  QUESTION_TTS_AUTOPLAY_STORAGE_KEY,
  TTS_RATE_STORAGE_KEY,
  isTtsRate,
  readQuestionTtsAutoplay,
  readTtsRate,
  type TtsRate,
} from "./ttsSettings.ts";
import {
  THEME_STORAGE_KEY,
  readStoredTheme,
} from "./themeStorage.ts";
import { NAVIGATION_SESSION_STORAGE_KEY } from "./navigationSession.ts";
import {
  MY_ANSWERS_STORAGE_KEY,
  normalizeMyAnswers,
  readMyAnswers,
  type MyAnswers,
} from "./myAnswerStorage.ts";
import {
  CARD_MEMOS_STORAGE_KEY,
  cloneCardMemo,
  getMemoCardCount,
  getMemoCount,
  getPinnedMemoCount,
  isCardMemo,
  normalizeCardMemos,
  readCardMemos,
  type CardMemo,
  type CardMemos,
} from "./cardMemoStorage.ts";
import {
  SHADOWING_REPEAT_COUNT_KEY,
  SHADOWING_REPEAT_MODE_KEY,
  SHADOWING_REST_LEVEL_KEY,
  isRepeatCount,
  isRepeatMode,
  isRestLevel,
  readShadowingPlaybackSettings,
  type RepeatCount,
  type RepeatMode,
  type RestLevel,
} from "./shadowingSettings.ts";
import {
  SAVED_PASSAGES_STORAGE_KEY,
  SAVED_PASSAGE_DATASET_VERSION,
  isSavedPassage,
  normalizeSavedPassage,
  normalizeSavedPassageDataset,
  readSavedPassageDataset,
  type SavedPassage,
  type SavedPassageDataset,
} from "./savedPassageStorage.ts";
import {
  PERSONAL_MEMOS_STORAGE_KEY,
  PERSONAL_MEMO_DATASET_VERSION,
  getPinnedPersonalMemoCount,
  isPersonalMemo,
  normalizePersonalMemo,
  normalizePersonalMemoDataset,
  readPersonalMemoDataset,
  type PersonalMemo,
  type PersonalMemoDataset,
} from "./personalMemoStorage.ts";
import {
  ARCHIVED_CARD_IDS_STORAGE_KEY,
  normalizeArchivedCardIds,
  readArchivedCardIds,
} from "./cardArchiveStorage.ts";

export const APP_BACKUP_FORMAT = "opic-trainer-backup";
export const APP_BACKUP_VERSION = 1;
export const APP_SCHEMA_VERSION = 1;
export const APP_BACKUP_NAME = "OPIc Speaking Trainer";
export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024;
export const FULL_RESTORE_BACKUP_STORAGE_KEY =
  "opic-full-restore-backup";

const VALID_RESULTS = new Set<FirstLineResult>([
  "success",
  "again",
  "hard",
]);
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SWIPE_HINT_SESSION_KEY = "opic-swipe-navigation-hint-seen";

export type BackupSettings = {
  theme: ThemeMode;
  studyDayStartTime: string;
  ttsRate: TtsRate;
  questionAutoplay: boolean;
  autoAdvance: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  shadowingRepeatMode: RepeatMode;
  shadowingRepeatCount: RepeatCount;
  shadowingRestLevel: RestLevel;
};

export type BackupSummary = {
  cardCount: number;
  statusCount: number;
  attemptCount: number;
  myAnswerCount: number;
  memoCount: number;
  memoCardCount: number;
  pinnedMemoCount: number;
  savedPassageCount: number;
  personalMemoCount: number;
  pinnedPersonalMemoCount: number;
  answerLearningStatusCount: number;
  answerLearningAttemptCount: number;
  archivedCardCount: number;
  settingsCount: number;
};

export type AppBackupV1 = {
  format: typeof APP_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  app: {
    name: typeof APP_BACKUP_NAME;
    schemaVersion: 1;
  };
  summary: BackupSummary;
  data: {
    cardDataset: CardDataset;
    cardStatuses: Record<string, FirstLineResult>;
    attempts: StudyAttempt[];
    myAnswers: MyAnswers;
    cardMemos: CardMemos;
    savedPassages: SavedPassageDataset;
    personalMemos: PersonalMemoDataset;
    answerLearningStatuses: AnswerLearningStatuses;
    answerLearningAttempts: AnswerLearningAttempt[];
    archivedCardIds: string[];
    settings: BackupSettings;
  };
};

export type BackupIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type BackupValidationResult = {
  backup: AppBackupV1 | null;
  issues: BackupIssue[];
  errorCount: number;
  warningCount: number;
  canRestore: boolean;
};

export type FullRestoreSafetyBackup = {
  version: 1;
  createdAt: string;
  backup: AppBackupV1;
};

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export class BackupApplyError extends Error {
  rollbackSucceeded: boolean;

  constructor(message: string, rollbackSucceeded: boolean) {
    super(message);
    this.name = "BackupApplyError";
    this.rollbackSucceeded = rollbackSucceeded;
  }
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  theme: "light",
  studyDayStartTime: DEFAULT_STUDY_DAY_START_TIME,
  ttsRate: 1,
  questionAutoplay: false,
  autoAdvance: false,
  cardScope: "all",
  studyOrder: "default",
  shadowingRepeatMode: "full",
  shadowingRepeatCount: 1,
  shadowingRestLevel: "none",
};

/**
 * Explicit storage policy. Session navigation, swipe hints, the TSV import
 * safety copy and runtime speech/timer state are deliberately excluded.
 */
export const BACKUP_STORAGE_POLICY = [
  { key: CARD_DATASET_STORAGE_KEY, schemaPath: "data.cardDataset", included: true },
  { key: FIRST_LINE_STATUSES_STORAGE_KEY, schemaPath: "data.cardStatuses", included: true },
  { key: STUDY_ATTEMPTS_STORAGE_KEY, schemaPath: "data.attempts", included: true },
  { key: MY_ANSWERS_STORAGE_KEY, schemaPath: "data.myAnswers", included: true },
  { key: CARD_MEMOS_STORAGE_KEY, schemaPath: "data.cardMemos", included: true },
  { key: SAVED_PASSAGES_STORAGE_KEY, schemaPath: "data.savedPassages", included: true },
  { key: PERSONAL_MEMOS_STORAGE_KEY, schemaPath: "data.personalMemos", included: true },
  { key: ANSWER_LEARNING_STATUSES_STORAGE_KEY, schemaPath: "data.answerLearningStatuses", included: true },
  { key: ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY, schemaPath: "data.answerLearningAttempts", included: true },
  { key: ARCHIVED_CARD_IDS_STORAGE_KEY, schemaPath: "data.archivedCardIds", included: true },
  { key: THEME_STORAGE_KEY, schemaPath: "data.settings.theme", included: true },
  { key: STUDY_DAY_START_STORAGE_KEY, schemaPath: "data.settings.studyDayStartTime", included: true },
  { key: TTS_RATE_STORAGE_KEY, schemaPath: "data.settings.ttsRate", included: true },
  { key: QUESTION_TTS_AUTOPLAY_STORAGE_KEY, schemaPath: "data.settings.questionAutoplay", included: true },
  { key: AUTO_ADVANCE_STORAGE_KEY, schemaPath: "data.settings.autoAdvance", included: true },
  { key: STUDY_CARD_SCOPE_STORAGE_KEY, schemaPath: "data.settings.cardScope", included: true },
  { key: STUDY_ORDER_STORAGE_KEY, schemaPath: "data.settings.studyOrder", included: true },
  { key: SHADOWING_REPEAT_MODE_KEY, schemaPath: "data.settings.shadowingRepeatMode", included: true },
  { key: SHADOWING_REPEAT_COUNT_KEY, schemaPath: "data.settings.shadowingRepeatCount", included: true },
  { key: SHADOWING_REST_LEVEL_KEY, schemaPath: "data.settings.shadowingRestLevel", included: true },
  { key: NAVIGATION_SESSION_STORAGE_KEY, schemaPath: "session navigation", included: false },
  { key: SWIPE_HINT_SESSION_KEY, schemaPath: "session swipe hint", included: false },
  { key: CARD_IMPORT_BACKUP_KEY, schemaPath: "TSV temporary backup", included: false },
  { key: FULL_RESTORE_BACKUP_STORAGE_KEY, schemaPath: "full restore safety backup", included: false },
] as const;

const MANAGED_LOCAL_STORAGE_KEYS = BACKUP_STORAGE_POLICY
  .filter((entry) => entry.included)
  .map((entry) => entry.key);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function createIssue(
  severity: BackupIssue["severity"],
  path: string,
  message: string,
): BackupIssue {
  return { severity, path, message };
}

function warnUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: BackupIssue[],
) {
  const allowedSet = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!allowedSet.has(key)) {
      issues.push(
        createIssue("warning", `${path}.${key}`, "알 수 없는 필드는 무시됩니다."),
      );
    }
  });
}

function scanDangerousKeys(
  value: unknown,
  path: string,
  issues: BackupIssue[],
) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanDangerousKeys(item, `${path}[${index}]`, issues),
    );
    return;
  }

  Object.keys(value as Record<string, unknown>).forEach((key) => {
    if (DANGEROUS_KEYS.has(key)) {
      issues.push(
        createIssue(
          "error",
          `${path}.${key}`,
          "안전하지 않은 객체 키가 포함되어 있습니다.",
        ),
      );
      return;
    }
    scanDangerousKeys(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
      issues,
    );
  });
}

function cloneCard(card: OpicCard): OpicCard {
  return {
    id: card.id,
    deck: card.deck,
    front: card.front,
    ...(card.frontKo ? { frontKo: card.frontKo } : {}),
    firstLine: card.firstLine,
    hint: {
      title: card.hint.title,
      memoryTip: card.hint.memoryTip,
      ...(card.hint.subjectTip ? { subjectTip: card.hint.subjectTip } : {}),
      minimum: card.hint.minimum,
      flow: [...card.hint.flow],
    },
    back: [...card.back],
    tags: [...card.tags],
  };
}

function normalizeSettings(
  value: unknown,
  issues: BackupIssue[],
): BackupSettings {
  const settings = isRecord(value) ? value : {};
  if (!isRecord(value)) {
    issues.push(
      createIssue(
        "warning",
        "data.settings",
        "설정이 없거나 올바르지 않아 기본값을 사용합니다.",
      ),
    );
  }

  warnUnknownKeys(
    settings,
    [
      "theme",
      "studyDayStartTime",
      "ttsRate",
      "questionAutoplay",
      "autoAdvance",
      "cardScope",
      "studyOrder",
      "shadowingRepeatMode",
      "shadowingRepeatCount",
      "shadowingRestLevel",
    ],
    "data.settings",
    issues,
  );
  const pick = <T>(
    key: keyof BackupSettings,
    isValid: (candidate: unknown) => candidate is T,
    fallback: T,
  ) => {
    const candidate = settings[key];
    if (isValid(candidate)) return candidate;
    if (candidate !== undefined) {
      issues.push(
        createIssue(
          "warning",
          `data.settings.${key}`,
          `잘못된 설정값을 기본값 '${String(fallback)}'(으)로 대체했습니다.`,
        ),
      );
    }
    return fallback;
  };

  return {
    theme: pick<ThemeMode>(
      "theme",
      (candidate): candidate is ThemeMode =>
        candidate === "light" || candidate === "dark",
      DEFAULT_BACKUP_SETTINGS.theme,
    ),
    studyDayStartTime: pick<string>(
      "studyDayStartTime",
      isValidStudyDayStartTime,
      DEFAULT_BACKUP_SETTINGS.studyDayStartTime,
    ),
    ttsRate: pick<TtsRate>(
      "ttsRate",
      (candidate): candidate is TtsRate =>
        typeof candidate === "number" && isTtsRate(candidate),
      DEFAULT_BACKUP_SETTINGS.ttsRate,
    ),
    questionAutoplay: pick<boolean>(
      "questionAutoplay",
      (candidate): candidate is boolean => typeof candidate === "boolean",
      DEFAULT_BACKUP_SETTINGS.questionAutoplay,
    ),
    autoAdvance: pick<boolean>(
      "autoAdvance",
      (candidate): candidate is boolean => typeof candidate === "boolean",
      DEFAULT_BACKUP_SETTINGS.autoAdvance,
    ),
    cardScope: pick<StudyCardScope>(
      "cardScope",
      isStudyCardScope,
      DEFAULT_BACKUP_SETTINGS.cardScope,
    ),
    studyOrder: pick<StudyOrder>(
      "studyOrder",
      isStudyOrder,
      DEFAULT_BACKUP_SETTINGS.studyOrder,
    ),
    shadowingRepeatMode: pick<RepeatMode>(
      "shadowingRepeatMode",
      isRepeatMode,
      DEFAULT_BACKUP_SETTINGS.shadowingRepeatMode,
    ),
    shadowingRepeatCount: pick<RepeatCount>(
      "shadowingRepeatCount",
      isRepeatCount,
      DEFAULT_BACKUP_SETTINGS.shadowingRepeatCount,
    ),
    shadowingRestLevel: pick<RestLevel>(
      "shadowingRestLevel",
      isRestLevel,
      DEFAULT_BACKUP_SETTINGS.shadowingRestLevel,
    ),
  };
}

function normalizeBackupMyAnswers(
  value: unknown,
  issues: BackupIssue[],
): MyAnswers {
  // myAnswers was added as an optional field to backup v1, so older v1 files
  // restore safely with an empty personal-answer collection.
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(
      createIssue(
        "warning",
        "data.myAnswers",
        "나만의 답변 형식이 올바르지 않아 빈 답변 목록으로 복구합니다.",
      ),
    );
    return {};
  }

  const invalidEntries = Object.entries(value).filter(
    ([cardId, answer]) => !cardId.trim() || typeof answer !== "string" || !answer.trim(),
  );
  invalidEntries.forEach(([cardId]) => {
    issues.push(
      createIssue(
        "warning",
        `data.myAnswers.${cardId || "(empty)"}`,
        "빈 카드 ID 또는 빈 답변을 제외했습니다.",
      ),
    );
  });
  return normalizeMyAnswers(value);
}

function normalizeBackupCardMemos(
  value: unknown,
  issues: BackupIssue[],
): CardMemos {
  // cardMemos is optional in v1 so backups created before memo support remain valid.
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(
      createIssue(
        "warning",
        "data.cardMemos",
        "메모 형식이 올바르지 않아 빈 메모 목록으로 복구합니다.",
      ),
    );
    return {};
  }

  const normalized: CardMemos = {};
  const seenMemoIds = new Set<string>();
  Object.entries(value).forEach(([cardId, candidateMemos]) => {
    const path = `data.cardMemos.${cardId || "(empty)"}`;
    if (!cardId.trim() || !Array.isArray(candidateMemos)) {
      issues.push(createIssue("warning", path, "카드별 메모 배열이 아니어서 제외했습니다."));
      return;
    }
    const validMemos: CardMemo[] = [];
    candidateMemos.forEach((candidate, index) => {
      const memoPath = `${path}[${index}]`;
      if (!isRecord(candidate) || !isCardMemo(candidate)) {
        issues.push(createIssue("warning", memoPath, "메모 필드 또는 날짜가 올바르지 않아 제외했습니다."));
        return;
      }
      warnUnknownKeys(
        candidate,
        ["id", "cardId", "content", "pinned", "createdAt", "updatedAt"],
        memoPath,
        issues,
      );
      if (candidate.cardId !== cardId) {
        issues.push(
          createIssue(
            "error",
            `${memoPath}.cardId`,
            `메모 cardId '${candidate.cardId}'가 객체 key '${cardId}'와 일치하지 않습니다.`,
          ),
        );
        return;
      }
      if (seenMemoIds.has(candidate.id)) {
        issues.push(
          createIssue("error", `${memoPath}.id`, `메모 ID '${candidate.id}'가 중복되었습니다.`),
        );
        return;
      }
      seenMemoIds.add(candidate.id);
      validMemos.push(cloneCardMemo(candidate));
    });
    if (validMemos.length > 0) normalized[cardId] = validMemos;
  });
  return normalized;
}

function normalizeBackupSavedPassages(
  value: unknown,
  issues: BackupIssue[],
): SavedPassageDataset {
  if (value === undefined) {
    return { version: SAVED_PASSAGE_DATASET_VERSION, passages: [] };
  }
  if (!isRecord(value)) {
    issues.push(
      createIssue(
        "warning",
        "data.savedPassages",
        "저장 지문 형식이 올바르지 않아 빈 목록으로 복구합니다.",
      ),
    );
    return { version: SAVED_PASSAGE_DATASET_VERSION, passages: [] };
  }
  warnUnknownKeys(value, ["version", "passages"], "data.savedPassages", issues);
  if (value.version !== SAVED_PASSAGE_DATASET_VERSION) {
    issues.push(
      createIssue(
        "error",
        "data.savedPassages.version",
        `저장 지문 version은 ${SAVED_PASSAGE_DATASET_VERSION}이어야 합니다.`,
      ),
    );
  }
  if (!Array.isArray(value.passages)) {
    issues.push(
      createIssue(
        "error",
        "data.savedPassages.passages",
        "저장 지문 passages 배열이 필요합니다.",
      ),
    );
    return { version: SAVED_PASSAGE_DATASET_VERSION, passages: [] };
  }

  const seenIds = new Set<string>();
  const passages: SavedPassage[] = [];
  value.passages.forEach((candidate, index) => {
    const path = `data.savedPassages.passages[${index}]`;
    if (!isRecord(candidate) || !isSavedPassage(candidate)) {
      issues.push(
        createIssue(
          "warning",
          path,
          "제목·본문·날짜가 올바르지 않은 저장 지문을 제외했습니다.",
        ),
      );
      return;
    }
    warnUnknownKeys(
      candidate,
      ["id", "title", "text", "createdAt", "updatedAt"],
      path,
      issues,
    );
    if (seenIds.has(candidate.id)) {
      issues.push(
        createIssue(
          "error",
          `${path}.id`,
          `저장 지문 ID '${candidate.id}'가 중복되었습니다.`,
        ),
      );
      return;
    }
    seenIds.add(candidate.id);
    const normalized = normalizeSavedPassage(candidate);
    if (Date.parse(normalized.createdAt) > Date.parse(normalized.updatedAt)) {
      issues.push(
        createIssue(
          "warning",
          `${path}.updatedAt`,
          "수정일이 생성일보다 빨라 생성일과 같게 정규화했습니다.",
        ),
      );
      normalized.updatedAt = normalized.createdAt;
    }
    passages.push(normalized);
  });
  return normalizeSavedPassageDataset({
    version: SAVED_PASSAGE_DATASET_VERSION,
    passages,
  });
}

function normalizeBackupPersonalMemos(
  value: unknown,
  issues: BackupIssue[],
): PersonalMemoDataset {
  if (value === undefined) {
    return { version: PERSONAL_MEMO_DATASET_VERSION, memos: [] };
  }
  if (!isRecord(value)) {
    issues.push(
      createIssue(
        "warning",
        "data.personalMemos",
        "개인 학습 메모 형식이 올바르지 않아 빈 목록으로 복구합니다.",
      ),
    );
    return { version: PERSONAL_MEMO_DATASET_VERSION, memos: [] };
  }
  warnUnknownKeys(value, ["version", "memos"], "data.personalMemos", issues);
  if (value.version !== PERSONAL_MEMO_DATASET_VERSION) {
    issues.push(
      createIssue(
        "error",
        "data.personalMemos.version",
        `개인 학습 메모 version은 ${PERSONAL_MEMO_DATASET_VERSION}이어야 합니다.`,
      ),
    );
  }
  if (!Array.isArray(value.memos)) {
    issues.push(
      createIssue(
        "error",
        "data.personalMemos.memos",
        "개인 학습 메모 memos 배열이 필요합니다.",
      ),
    );
    return { version: PERSONAL_MEMO_DATASET_VERSION, memos: [] };
  }

  const seenIds = new Set<string>();
  const memos: PersonalMemo[] = [];
  value.memos.forEach((candidate, index) => {
    const path = `data.personalMemos.memos[${index}]`;
    if (!isRecord(candidate) || !isPersonalMemo(candidate)) {
      issues.push(
        createIssue(
          "warning",
          path,
          "제목·본문·날짜가 올바르지 않은 개인 메모를 제외했습니다.",
        ),
      );
      return;
    }
    warnUnknownKeys(
      candidate,
      ["id", "title", "content", "pinned", "createdAt", "updatedAt"],
      path,
      issues,
    );
    if (seenIds.has(candidate.id)) {
      issues.push(
        createIssue(
          "error",
          `${path}.id`,
          `개인 메모 ID '${candidate.id}'가 중복되었습니다.`,
        ),
      );
      return;
    }
    seenIds.add(candidate.id);
    memos.push(normalizePersonalMemo(candidate));
  });
  return normalizePersonalMemoDataset({
    version: PERSONAL_MEMO_DATASET_VERSION,
    memos,
  });
}

function normalizeBackupAnswerLearningStatuses(
  value: unknown,
  issues: BackupIssue[],
) {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(
      createIssue(
        "warning",
        "data.answerLearningStatuses",
        "답변 익히기 상태 형식이 올바르지 않아 빈 상태로 복구합니다.",
      ),
    );
    return {};
  }
  Object.entries(value).forEach(([cardId, status]) => {
    if (!cardId.trim() || !isAnswerLearningStatus(status)) {
      issues.push(
        createIssue(
          "warning",
          `data.answerLearningStatuses.${cardId || "(empty)"}`,
          "답변 익히기 상태는 hard, learning, speakable 중 하나여야 합니다.",
        ),
      );
    }
  });
  return normalizeAnswerLearningStatuses(value);
}

function normalizeBackupAnswerLearningAttempts(
  value: unknown,
  issues: BackupIssue[],
) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(
      createIssue(
        "warning",
        "data.answerLearningAttempts",
        "답변 익히기 시도 형식이 올바르지 않아 빈 기록으로 복구합니다.",
      ),
    );
    return [];
  }
  const seenIds = new Set<string>();
  const attempts: AnswerLearningAttempt[] = [];
  value.forEach((candidate, index) => {
    const path = `data.answerLearningAttempts[${index}]`;
    if (!isAnswerLearningAttempt(candidate)) {
      issues.push(createIssue("error", path, "답변 익히기 시도의 필수 값이 올바르지 않습니다."));
      return;
    }
    if (!isValidDateKey(candidate.date)) {
      issues.push(createIssue("error", `${path}.date`, "유효한 로컬 학습일이 필요합니다."));
      return;
    }
    if (seenIds.has(candidate.id)) {
      issues.push(createIssue("error", `${path}.id`, `답변 익히기 시도 ID '${candidate.id}'가 중복되었습니다.`));
      return;
    }
    seenIds.add(candidate.id);
    attempts.push({ ...candidate });
  });
  return attempts;
}

function summarizeBackupData(
  cards: OpicCard[],
  statuses: Record<string, FirstLineResult>,
  attempts: StudyAttempt[],
  myAnswers: MyAnswers,
  cardMemos: CardMemos,
  savedPassages: SavedPassageDataset,
  personalMemos: PersonalMemoDataset,
  answerLearningStatuses: AnswerLearningStatuses,
  answerLearningAttempts: AnswerLearningAttempt[],
  archivedCardIds: string[],
  settings: BackupSettings,
): BackupSummary {
  return {
    cardCount: cards.length,
    statusCount: Object.keys(statuses).length,
    attemptCount: attempts.length,
    myAnswerCount: Object.keys(myAnswers).length,
    memoCount: getMemoCount(cardMemos),
    memoCardCount: getMemoCardCount(cardMemos),
    pinnedMemoCount: getPinnedMemoCount(cardMemos),
    savedPassageCount: savedPassages.passages.length,
    personalMemoCount: personalMemos.memos.length,
    pinnedPersonalMemoCount: getPinnedPersonalMemoCount(personalMemos),
    answerLearningStatusCount: Object.keys(answerLearningStatuses).length,
    answerLearningAttemptCount: answerLearningAttempts.length,
    archivedCardCount: archivedCardIds.length,
    settingsCount: Object.keys(settings).length,
  };
}

export function readBackupSettings(): BackupSettings {
  const shadowingSettings = readShadowingPlaybackSettings();
  return {
    theme: readStoredTheme(),
    studyDayStartTime: readStudyDayStartTime(),
    ttsRate: readTtsRate(),
    questionAutoplay: readQuestionTtsAutoplay(),
    autoAdvance: readAutoAdvanceAfterRating(),
    cardScope: readStudyCardScope(),
    studyOrder: readStudyOrder(),
    shadowingRepeatMode: shadowingSettings.repeatMode,
    shadowingRepeatCount: shadowingSettings.repeatCount,
    shadowingRestLevel: shadowingSettings.restLevel,
  };
}

export function flattenAttempts(
  attemptsByDate: StudyAttemptsByDate,
): StudyAttempt[] {
  return Object.keys(attemptsByDate)
    .sort()
    .flatMap((dateKey) =>
      (attemptsByDate[dateKey] ?? []).map((attempt) => ({ ...attempt })),
    );
}

export function groupAttemptsByDate(
  attempts: StudyAttempt[],
): StudyAttemptsByDate {
  const grouped: StudyAttemptsByDate = {};
  attempts.forEach((attempt) => {
    grouped[attempt.date] = [...(grouped[attempt.date] ?? []), { ...attempt }];
  });
  return grouped;
}

export function createAppBackup(
  cards: OpicCard[],
  statuses: FirstLineStatusMap,
  attemptsByDate: StudyAttemptsByDate,
  settings = readBackupSettings(),
  now = new Date(),
  myAnswers = readMyAnswers(),
  cardMemos = readCardMemos(),
  savedPassages = readSavedPassageDataset(),
  personalMemos = readPersonalMemoDataset(),
  answerLearningStatuses: AnswerLearningStatuses = {},
  answerLearningAttemptsByDate: AnswerLearningAttemptsByDate = {},
  archivedCardIds = readArchivedCardIds(),
): AppBackupV1 {
  const exportedAt = now.toISOString();
  const normalizedStatuses = normalizeStatuses(statuses) as Record<
    string,
    FirstLineResult
  >;
  const attempts = flattenAttempts(attemptsByDate);
  const clonedCards = cards.map(cloneCard);
  const normalizedMyAnswers = normalizeMyAnswers(myAnswers);
  const normalizedCardMemos = normalizeCardMemos(cardMemos);
  const normalizedSavedPassages = normalizeSavedPassageDataset(savedPassages);
  const normalizedPersonalMemos = normalizePersonalMemoDataset(personalMemos);
  const normalizedAnswerLearningStatuses = normalizeAnswerLearningStatuses(
    answerLearningStatuses,
  );
  const answerLearningAttempts = flattenAnswerLearningAttempts(
    answerLearningAttemptsByDate,
  );
  const normalizedArchivedCardIds = normalizeArchivedCardIds(archivedCardIds);

  return {
    format: APP_BACKUP_FORMAT,
    version: APP_BACKUP_VERSION,
    exportedAt,
    app: {
      name: APP_BACKUP_NAME,
      schemaVersion: APP_SCHEMA_VERSION,
    },
    summary: summarizeBackupData(
      clonedCards,
      normalizedStatuses,
      attempts,
      normalizedMyAnswers,
      normalizedCardMemos,
      normalizedSavedPassages,
      normalizedPersonalMemos,
      normalizedAnswerLearningStatuses,
      answerLearningAttempts,
      normalizedArchivedCardIds,
      settings,
    ),
    data: {
      cardDataset: {
        ...createCardDataset(clonedCards),
        updatedAt: exportedAt,
      },
      cardStatuses: normalizedStatuses,
      attempts,
      myAnswers: normalizedMyAnswers,
      cardMemos: normalizedCardMemos,
      savedPassages: normalizedSavedPassages,
      personalMemos: normalizedPersonalMemos,
      answerLearningStatuses: normalizedAnswerLearningStatuses,
      answerLearningAttempts,
      archivedCardIds: normalizedArchivedCardIds,
      settings: { ...settings },
    },
  };
}

export function serializeAppBackup(backup: AppBackupV1) {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(text: string, byteLength?: number) {
  const issues: BackupIssue[] = [];
  const measuredBytes =
    byteLength ?? new TextEncoder().encode(text).byteLength;

  if (measuredBytes > MAX_BACKUP_FILE_BYTES) {
    issues.push(
      createIssue(
        "error",
        "$",
        `파일 크기는 ${MAX_BACKUP_FILE_BYTES / 1024 / 1024}MB 이하여야 합니다.`,
      ),
    );
    return { value: null, issues };
  }

  try {
    return { value: JSON.parse(text) as unknown, issues };
  } catch {
    issues.push(createIssue("error", "$", "올바른 JSON 파일이 아닙니다."));
    return { value: null, issues };
  }
}

export function migrateBackup(value: unknown) {
  if (!isRecord(value) || typeof value.version !== "number") {
    return {
      value,
      issues: [] as BackupIssue[],
    };
  }

  if (value.version === APP_BACKUP_VERSION) {
    return { value, issues: [] as BackupIssue[] };
  }

  const message =
    value.version > APP_BACKUP_VERSION
      ? `더 새로운 백업 version ${value.version}은 현재 앱에서 지원하지 않습니다.`
      : `백업 version ${value.version}의 마이그레이션은 아직 지원하지 않습니다.`;
  return {
    value,
    issues: [createIssue("error", "version", message)],
  };
}

export function validateBackup(value: unknown): BackupValidationResult {
  const issues: BackupIssue[] = [];
  scanDangerousKeys(value, "$", issues);

  if (!isRecord(value)) {
    issues.push(createIssue("error", "$", "백업 최상위 값은 객체여야 합니다."));
    return finalizeValidation(null, issues);
  }

  warnUnknownKeys(
    value,
    ["format", "version", "exportedAt", "app", "summary", "data"],
    "$",
    issues,
  );
  if (value.summary !== undefined) {
    if (isRecord(value.summary)) {
      warnUnknownKeys(
        value.summary,
        [
          "cardCount",
          "statusCount",
          "attemptCount",
          "myAnswerCount",
          "memoCount",
          "memoCardCount",
          "pinnedMemoCount",
          "savedPassageCount",
          "personalMemoCount",
          "pinnedPersonalMemoCount",
          "answerLearningStatusCount",
          "answerLearningAttemptCount",
          "archivedCardCount",
          "settingsCount",
        ],
        "summary",
        issues,
      );
    } else {
      issues.push(
        createIssue("warning", "summary", "요약 정보가 올바르지 않아 다시 계산합니다."),
      );
    }
  }

  if (value.format !== APP_BACKUP_FORMAT) {
    issues.push(
      createIssue(
        "error",
        "format",
        `format은 '${APP_BACKUP_FORMAT}'이어야 합니다.`,
      ),
    );
  }
  if (value.version !== APP_BACKUP_VERSION) {
    issues.push(
      createIssue(
        "error",
        "version",
        `지원하는 백업 version은 ${APP_BACKUP_VERSION}입니다.`,
      ),
    );
  }
  if (!isValidIsoDate(value.exportedAt)) {
    issues.push(
      createIssue("error", "exportedAt", "유효한 ISO 날짜가 필요합니다."),
    );
  }

  const app = isRecord(value.app) ? value.app : null;
  if (!app) {
    issues.push(createIssue("error", "app", "app 정보가 필요합니다."));
  } else {
    warnUnknownKeys(app, ["name", "schemaVersion"], "app", issues);
    if (app.schemaVersion !== APP_SCHEMA_VERSION) {
      issues.push(
        createIssue(
          "error",
          "app.schemaVersion",
          `지원하는 앱 schemaVersion은 ${APP_SCHEMA_VERSION}입니다.`,
        ),
      );
    }
    if (app.name !== APP_BACKUP_NAME) {
      issues.push(
        createIssue(
          "warning",
          "app.name",
          `앱 이름을 '${APP_BACKUP_NAME}'으로 정규화합니다.`,
        ),
      );
    }
  }

  const data = isRecord(value.data) ? value.data : null;
  if (!data) {
    issues.push(createIssue("error", "data", "data 객체가 필요합니다."));
    return finalizeValidation(null, issues);
  }
  warnUnknownKeys(
    data,
    [
      "cardDataset",
      "cardStatuses",
      "attempts",
      "myAnswers",
      "cardMemos",
      "savedPassages",
      "personalMemos",
      "answerLearningStatuses",
      "answerLearningAttempts",
      "archivedCardIds",
      "settings",
    ],
    "data",
    issues,
  );

  const dataset = isRecord(data.cardDataset) ? data.cardDataset : null;
  const normalizedCards: OpicCard[] = [];
  let datasetUpdatedAt = value.exportedAt;
  if (!dataset) {
    issues.push(
      createIssue("error", "data.cardDataset", "cardDataset 객체가 필요합니다."),
    );
  } else {
    warnUnknownKeys(
      dataset,
      ["version", "updatedAt", "cards"],
      "data.cardDataset",
      issues,
    );
    if (dataset.version !== CARD_DATASET_VERSION) {
      issues.push(
        createIssue(
          "error",
          "data.cardDataset.version",
          `카드 데이터 version은 ${CARD_DATASET_VERSION}이어야 합니다.`,
        ),
      );
    }
    if (!isValidIsoDate(dataset.updatedAt)) {
      issues.push(
        createIssue(
          "error",
          "data.cardDataset.updatedAt",
          "유효한 ISO 날짜가 필요합니다.",
        ),
      );
    } else {
      datasetUpdatedAt = dataset.updatedAt;
    }

    if (!Array.isArray(dataset.cards)) {
      issues.push(
        createIssue(
          "error",
          "data.cardDataset.cards",
          "cards 배열이 필요합니다.",
        ),
      );
    } else {
      dataset.cards.forEach((candidate, index) => {
        const path = `data.cardDataset.cards[${index}]`;
        if (!isOpicCard(candidate)) {
          issues.push(
            createIssue("error", path, "필수 카드 필드 또는 타입이 올바르지 않습니다."),
          );
          return;
        }
        const record = candidate as unknown as Record<string, unknown>;
        warnUnknownKeys(
          record,
          ["id", "deck", "front", "frontKo", "firstLine", "hint", "back", "tags"],
          path,
          issues,
        );
        const hint = record.hint as Record<string, unknown>;
        warnUnknownKeys(
          hint,
          ["title", "memoryTip", "subjectTip", "minimum", "flow"],
          `${path}.hint`,
          issues,
        );
        normalizedCards.push(cloneCard(candidate));
      });

      const seenIds = new Set<string>();
      normalizedCards.forEach((card, index) => {
        if (seenIds.has(card.id)) {
          issues.push(
            createIssue(
              "error",
              `data.cardDataset.cards[${index}].id`,
              `카드 ID '${card.id}'가 중복되었습니다.`,
            ),
          );
        }
        seenIds.add(card.id);
      });
    }
  }

  const statusValue = data.cardStatuses;
  const normalizedStatusEntries: Array<[string, FirstLineResult]> = [];
  if (!isRecord(statusValue)) {
    issues.push(
      createIssue(
        "error",
        "data.cardStatuses",
        "cardStatuses 객체가 필요합니다.",
      ),
    );
  } else {
    Object.entries(statusValue).forEach(([cardId, status]) => {
      if (!cardId.trim() || !VALID_RESULTS.has(status as FirstLineResult)) {
        issues.push(
          createIssue(
            "error",
            `data.cardStatuses.${cardId || "(empty)"}`,
            "상태는 success, again, hard 중 하나여야 합니다.",
          ),
        );
        return;
      }
      normalizedStatusEntries.push([cardId, status as FirstLineResult]);
    });
  }
  const normalizedStatuses = Object.fromEntries(
    normalizedStatusEntries,
  ) as Record<string, FirstLineResult>;

  const normalizedAttempts: StudyAttempt[] = [];
  const seenAttemptIds = new Set<string>();
  if (!Array.isArray(data.attempts)) {
    issues.push(
      createIssue("error", "data.attempts", "attempts 배열이 필요합니다."),
    );
  } else {
    data.attempts.forEach((candidate, index) => {
      const path = `data.attempts[${index}]`;
      if (!isRecord(candidate)) {
        issues.push(createIssue("error", path, "학습 시도는 객체여야 합니다."));
        return;
      }
      warnUnknownKeys(
        candidate,
        ["id", "date", "cardId", "status", "timestamp"],
        path,
        issues,
      );
      const valid =
        (candidate.id === undefined ||
          (typeof candidate.id === "string" && candidate.id.length > 0)) &&
        isValidDateKey(candidate.date) &&
        typeof candidate.cardId === "string" &&
        candidate.cardId.trim().length > 0 &&
        VALID_RESULTS.has(candidate.status as FirstLineResult) &&
        isValidIsoDate(candidate.timestamp);
      if (!valid) {
        issues.push(
          createIssue("error", path, "학습 시도의 필수 필드 또는 타입이 올바르지 않습니다."),
        );
        return;
      }
      if (typeof candidate.id === "string") {
        if (seenAttemptIds.has(candidate.id)) {
          issues.push(
            createIssue("error", `${path}.id`, `학습 시도 ID '${candidate.id}'가 중복되었습니다.`),
          );
          return;
        }
        seenAttemptIds.add(candidate.id);
      }
      normalizedAttempts.push({
        ...(candidate.id ? { id: candidate.id as string } : {}),
        date: candidate.date as string,
        cardId: candidate.cardId as string,
        status: candidate.status as FirstLineResult,
        timestamp: candidate.timestamp as string,
      });
    });
  }

  const normalizedMyAnswers = normalizeBackupMyAnswers(data.myAnswers, issues);
  const normalizedCardMemos = normalizeBackupCardMemos(data.cardMemos, issues);
  const normalizedSavedPassages = normalizeBackupSavedPassages(
    data.savedPassages,
    issues,
  );
  const normalizedPersonalMemos = normalizeBackupPersonalMemos(
    data.personalMemos,
    issues,
  );
  const normalizedAnswerLearningStatuses =
    normalizeBackupAnswerLearningStatuses(
      data.answerLearningStatuses,
      issues,
    );
  const normalizedAnswerLearningAttempts =
    normalizeBackupAnswerLearningAttempts(
      data.answerLearningAttempts,
      issues,
    );
  const normalizedArchivedCardIds = (() => {
    if (data.archivedCardIds === undefined) return [];
    if (!Array.isArray(data.archivedCardIds)) {
      issues.push(createIssue("warning", "data.archivedCardIds", "보관 카드 목록이 올바르지 않아 빈 목록으로 복구합니다."));
      return [];
    }
    const normalized = normalizeArchivedCardIds(data.archivedCardIds);
    if (normalized.length !== data.archivedCardIds.length) {
      issues.push(createIssue("warning", "data.archivedCardIds", "잘못되거나 중복된 보관 카드 ID를 제외했습니다."));
    }
    return normalized;
  })();
  const settings = normalizeSettings(data.settings, issues);
  if (issues.some((issue) => issue.severity === "error")) {
    return finalizeValidation(null, issues);
  }

  const backup: AppBackupV1 = {
    format: APP_BACKUP_FORMAT,
    version: APP_BACKUP_VERSION,
    exportedAt: value.exportedAt as string,
    app: {
      name: APP_BACKUP_NAME,
      schemaVersion: APP_SCHEMA_VERSION,
    },
    summary: summarizeBackupData(
      normalizedCards,
      normalizedStatuses,
      normalizedAttempts,
      normalizedMyAnswers,
      normalizedCardMemos,
      normalizedSavedPassages,
      normalizedPersonalMemos,
      normalizedAnswerLearningStatuses,
      normalizedAnswerLearningAttempts,
      normalizedArchivedCardIds,
      settings,
    ),
    data: {
      cardDataset: {
        version: CARD_DATASET_VERSION,
        updatedAt: datasetUpdatedAt as string,
        cards: normalizedCards,
      },
      cardStatuses: normalizedStatuses,
      attempts: normalizedAttempts,
      myAnswers: normalizedMyAnswers,
      cardMemos: normalizedCardMemos,
      savedPassages: normalizedSavedPassages,
      personalMemos: normalizedPersonalMemos,
      answerLearningStatuses: normalizedAnswerLearningStatuses,
      answerLearningAttempts: normalizedAnswerLearningAttempts,
      archivedCardIds: normalizedArchivedCardIds,
      settings,
    },
  };
  return finalizeValidation(backup, issues);
}

function finalizeValidation(
  backup: AppBackupV1 | null,
  issues: BackupIssue[],
): BackupValidationResult {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  return {
    backup: errorCount === 0 ? backup : null,
    issues,
    errorCount,
    warningCount,
    canRestore: errorCount === 0 && backup !== null,
  };
}

export function parseAndValidateBackup(
  text: string,
  byteLength?: number,
): BackupValidationResult {
  const parsed = parseBackup(text, byteLength);
  if (parsed.value === null) return finalizeValidation(null, parsed.issues);
  const migrated = migrateBackup(parsed.value);
  if (migrated.issues.length > 0) {
    return finalizeValidation(null, [...parsed.issues, ...migrated.issues]);
  }
  const validated = validateBackup(migrated.value);
  return {
    ...validated,
    issues: [...parsed.issues, ...validated.issues],
  };
}

function backupToStorageValues(backup: AppBackupV1) {
  const settings = backup.data.settings;
  return new Map<string, string>([
    [CARD_DATASET_STORAGE_KEY, JSON.stringify(backup.data.cardDataset)],
    [FIRST_LINE_STATUSES_STORAGE_KEY, JSON.stringify(backup.data.cardStatuses)],
    [STUDY_ATTEMPTS_STORAGE_KEY, JSON.stringify(groupAttemptsByDate(backup.data.attempts))],
    [MY_ANSWERS_STORAGE_KEY, JSON.stringify(backup.data.myAnswers)],
    [CARD_MEMOS_STORAGE_KEY, JSON.stringify(backup.data.cardMemos)],
    [SAVED_PASSAGES_STORAGE_KEY, JSON.stringify(backup.data.savedPassages)],
    [PERSONAL_MEMOS_STORAGE_KEY, JSON.stringify(backup.data.personalMemos)],
    [ANSWER_LEARNING_STATUSES_STORAGE_KEY, JSON.stringify(backup.data.answerLearningStatuses)],
    [ANSWER_LEARNING_ATTEMPTS_STORAGE_KEY, JSON.stringify(groupAnswerLearningAttempts(backup.data.answerLearningAttempts))],
    [ARCHIVED_CARD_IDS_STORAGE_KEY, JSON.stringify(backup.data.archivedCardIds)],
    [THEME_STORAGE_KEY, settings.theme],
    [STUDY_DAY_START_STORAGE_KEY, settings.studyDayStartTime],
    [TTS_RATE_STORAGE_KEY, String(settings.ttsRate)],
    [QUESTION_TTS_AUTOPLAY_STORAGE_KEY, String(settings.questionAutoplay)],
    [AUTO_ADVANCE_STORAGE_KEY, String(settings.autoAdvance)],
    [STUDY_CARD_SCOPE_STORAGE_KEY, settings.cardScope],
    [STUDY_ORDER_STORAGE_KEY, settings.studyOrder],
    [SHADOWING_REPEAT_MODE_KEY, settings.shadowingRepeatMode],
    [SHADOWING_REPEAT_COUNT_KEY, String(settings.shadowingRepeatCount)],
    [SHADOWING_REST_LEVEL_KEY, settings.shadowingRestLevel],
  ]);
}

function snapshotStorage(storage: KeyValueStorage, keys: string[]) {
  return new Map(keys.map((key) => [key, storage.getItem(key)]));
}

function restoreStorageSnapshot(
  storage: KeyValueStorage,
  snapshot: Map<string, string | null>,
) {
  snapshot.forEach((value, key) => {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  });
}

function clearNavigationSession(sessionStorageValue?: KeyValueStorage) {
  try {
    sessionStorageValue?.removeItem(NAVIGATION_SESSION_STORAGE_KEY);
  } catch {
    // Long-term data is already restored; stale navigation is validated on reload.
  }
}

function writeBackupValues(
  backup: AppBackupV1,
  storage: KeyValueStorage,
) {
  backupToStorageValues(backup).forEach((value, key) => {
    storage.setItem(key, value);
  });
}

export function applyBackupWithSafety(
  targetBackup: AppBackupV1,
  currentBackup: AppBackupV1,
  storage: KeyValueStorage = localStorage,
  sessionStorageValue?: KeyValueStorage,
) {
  const keys = [...MANAGED_LOCAL_STORAGE_KEYS, FULL_RESTORE_BACKUP_STORAGE_KEY];
  const snapshot = snapshotStorage(storage, keys);
  const safetyBackup: FullRestoreSafetyBackup = {
    version: 1,
    createdAt: new Date().toISOString(),
    backup: currentBackup,
  };

  try {
    storage.setItem(
      FULL_RESTORE_BACKUP_STORAGE_KEY,
      JSON.stringify(safetyBackup),
    );
    writeBackupValues(targetBackup, storage);
    clearNavigationSession(sessionStorageValue);
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      restoreStorageSnapshot(storage, snapshot);
    } catch {
      rollbackSucceeded = false;
    }
    const reason = error instanceof Error ? error.message : "저장 공간 오류";
    throw new BackupApplyError(
      `전체 복구 저장에 실패했습니다: ${reason}`,
      rollbackSucceeded,
    );
  }
}

export function readFullRestoreBackup(
  storage: KeyValueStorage = localStorage,
): FullRestoreSafetyBackup | null {
  try {
    const raw = storage.getItem(FULL_RESTORE_BACKUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !isValidIsoDate(parsed.createdAt)) {
      return null;
    }
    const validation = validateBackup(parsed.backup);
    if (!validation.backup) return null;
    return {
      version: 1,
      createdAt: parsed.createdAt,
      backup: validation.backup,
    };
  } catch {
    return null;
  }
}

export function restoreFullRestoreBackup(
  storage: KeyValueStorage = localStorage,
  sessionStorageValue?: KeyValueStorage,
) {
  const safety = readFullRestoreBackup(storage);
  if (!safety) return false;

  const keys = [...MANAGED_LOCAL_STORAGE_KEYS, FULL_RESTORE_BACKUP_STORAGE_KEY];
  const snapshot = snapshotStorage(storage, keys);
  try {
    writeBackupValues(safety.backup, storage);
    storage.removeItem(FULL_RESTORE_BACKUP_STORAGE_KEY);
    clearNavigationSession(sessionStorageValue);
    return true;
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      restoreStorageSnapshot(storage, snapshot);
    } catch {
      rollbackSucceeded = false;
    }
    const reason = error instanceof Error ? error.message : "저장 공간 오류";
    throw new BackupApplyError(
      `직전 전체 복구 되돌리기에 실패했습니다: ${reason}`,
      rollbackSucceeded,
    );
  }
}
