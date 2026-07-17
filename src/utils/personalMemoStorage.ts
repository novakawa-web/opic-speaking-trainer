export const PERSONAL_MEMOS_STORAGE_KEY = "opic-personal-memos";
export const PERSONAL_MEMO_EDITOR_SESSION_KEY =
  "opic-personal-memo-editor-session";
export const PERSONAL_MEMO_LIBRARY_SESSION_KEY =
  "opic-personal-memo-library-open";
export const PERSONAL_MEMO_DATASET_VERSION = 1;
export const PERSONAL_MEMO_TITLE_MAX_LENGTH = 120;
export const PERSONAL_MEMO_CONTENT_MAX_LENGTH = 10_000;

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type PersonalMemo = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonalMemoDataset = {
  version: 1;
  memos: PersonalMemo[];
};

export type PersonalMemoEditorSession = {
  mode: "new" | "edit";
  memoId: string | null;
  titleDraft: string;
  contentDraft: string;
  dirty: boolean;
};

export type PersonalMemoStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const EMPTY_PERSONAL_MEMO_DATASET: PersonalMemoDataset = {
  version: PERSONAL_MEMO_DATASET_VERSION,
  memos: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !BLOCKED_KEYS.has(value)
  );
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function normalizePersonalMemoText(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function isPersonalMemo(value: unknown): value is PersonalMemo {
  if (!isRecord(value)) return false;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const content =
    typeof value.content === "string"
      ? normalizePersonalMemoText(value.content)
      : "";
  return (
    isSafeId(value.id) &&
    title.length > 0 &&
    title.length <= PERSONAL_MEMO_TITLE_MAX_LENGTH &&
    content.length > 0 &&
    content.length <= PERSONAL_MEMO_CONTENT_MAX_LENGTH &&
    typeof value.pinned === "boolean" &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  );
}

export function normalizePersonalMemo(memo: PersonalMemo): PersonalMemo {
  return {
    id: memo.id,
    title: memo.title.trim(),
    content: normalizePersonalMemoText(memo.content),
    pinned: memo.pinned,
    createdAt: memo.createdAt,
    updatedAt: memo.updatedAt,
  };
}

/** Invalid entries are excluded so one damaged memo does not hide valid notes. */
export function normalizePersonalMemoDataset(
  value: unknown,
): PersonalMemoDataset {
  if (
    !isRecord(value) ||
    value.version !== PERSONAL_MEMO_DATASET_VERSION ||
    !Array.isArray(value.memos)
  ) {
    return { ...EMPTY_PERSONAL_MEMO_DATASET, memos: [] };
  }
  const seen = new Set<string>();
  const memos = value.memos.flatMap((candidate) => {
    if (!isPersonalMemo(candidate) || seen.has(candidate.id)) return [];
    seen.add(candidate.id);
    return [normalizePersonalMemo(candidate)];
  });
  return { version: PERSONAL_MEMO_DATASET_VERSION, memos };
}

export function readPersonalMemoDataset(
  storage: PersonalMemoStorage | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
): PersonalMemoDataset {
  try {
    return normalizePersonalMemoDataset(
      JSON.parse(storage?.getItem(PERSONAL_MEMOS_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...EMPTY_PERSONAL_MEMO_DATASET, memos: [] };
  }
}

export function savePersonalMemoDataset(
  dataset: PersonalMemoDataset,
  storage: PersonalMemoStorage | undefined =
    typeof localStorage === "undefined" ? undefined : localStorage,
) {
  const normalized = normalizePersonalMemoDataset(dataset);
  try {
    storage?.setItem(PERSONAL_MEMOS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Keep the normalized in-memory dataset usable when storage is unavailable.
  }
  return normalized;
}

export function createPersonalMemoId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Use the local fallback below.
  }
  return `personal-memo-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function isValidPersonalMemoInput(title: string, content: string) {
  const normalizedTitle = title.trim();
  const normalizedContent = normalizePersonalMemoText(content);
  return (
    normalizedTitle.length > 0 &&
    normalizedTitle.length <= PERSONAL_MEMO_TITLE_MAX_LENGTH &&
    normalizedContent.length > 0 &&
    normalizedContent.length <= PERSONAL_MEMO_CONTENT_MAX_LENGTH
  );
}

export function createPersonalMemo(
  dataset: PersonalMemoDataset,
  title: string,
  content: string,
  options: { now?: Date; id?: string } = {},
) {
  const id = options.id ?? createPersonalMemoId();
  if (!isSafeId(id) || !isValidPersonalMemoInput(title, content)) {
    throw new Error("제목과 본문을 확인해 주세요.");
  }
  if (dataset.memos.some((memo) => memo.id === id)) {
    throw new Error("이미 존재하는 개인 메모 ID입니다.");
  }
  const timestamp = (options.now ?? new Date()).toISOString();
  const memo: PersonalMemo = {
    id,
    title: title.trim(),
    content: normalizePersonalMemoText(content),
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    dataset: savePersonalMemoDataset({
      version: PERSONAL_MEMO_DATASET_VERSION,
      memos: [memo, ...dataset.memos],
    }),
    memo,
  };
}

export function updatePersonalMemo(
  dataset: PersonalMemoDataset,
  memoId: string,
  title: string,
  content: string,
  now = new Date(),
) {
  if (!isValidPersonalMemoInput(title, content)) {
    throw new Error("제목과 본문을 확인해 주세요.");
  }
  let updated: PersonalMemo | null = null;
  const memos = dataset.memos.map((memo) => {
    if (memo.id !== memoId) return memo;
    updated = {
      ...memo,
      title: title.trim(),
      content: normalizePersonalMemoText(content),
      updatedAt: now.toISOString(),
    };
    return updated;
  });
  if (!updated) throw new Error("수정할 개인 메모를 찾지 못했습니다.");
  return {
    dataset: savePersonalMemoDataset({
      version: PERSONAL_MEMO_DATASET_VERSION,
      memos,
    }),
    memo: updated as PersonalMemo,
  };
}

export function togglePersonalMemoPinned(
  dataset: PersonalMemoDataset,
  memoId: string,
) {
  let changed = false;
  const memos = dataset.memos.map((memo) => {
    if (memo.id !== memoId) return memo;
    changed = true;
    return { ...memo, pinned: !memo.pinned };
  });
  return changed
    ? savePersonalMemoDataset({
        version: PERSONAL_MEMO_DATASET_VERSION,
        memos,
      })
    : dataset;
}

export function deletePersonalMemo(
  dataset: PersonalMemoDataset,
  memoId: string,
) {
  const index = dataset.memos.findIndex((memo) => memo.id === memoId);
  if (index < 0) return { dataset, deletedMemo: null, index: -1 };
  const deletedMemo = normalizePersonalMemo(dataset.memos[index]);
  return {
    dataset: savePersonalMemoDataset({
      version: PERSONAL_MEMO_DATASET_VERSION,
      memos: dataset.memos.filter((memo) => memo.id !== memoId),
    }),
    deletedMemo,
    index,
  };
}

export function restorePersonalMemo(
  dataset: PersonalMemoDataset,
  memo: PersonalMemo,
  index: number,
) {
  if (!isPersonalMemo(memo)) return dataset;
  const withoutDuplicate = dataset.memos.filter((item) => item.id !== memo.id);
  const insertIndex = Math.max(0, Math.min(index, withoutDuplicate.length));
  const memos = [...withoutDuplicate];
  memos.splice(insertIndex, 0, normalizePersonalMemo(memo));
  return savePersonalMemoDataset({
    version: PERSONAL_MEMO_DATASET_VERSION,
    memos,
  });
}

export function sortPersonalMemos(memos: PersonalMemo[]) {
  return [...memos].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      left.title.localeCompare(right.title, "ko"),
  );
}

export function searchPersonalMemos(memos: PersonalMemo[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return sortPersonalMemos(memos).filter((memo) => {
    if (!normalizedQuery) return true;
    return `${memo.title}\n${memo.content}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}

export function getPinnedPersonalMemoCount(dataset: PersonalMemoDataset) {
  return dataset.memos.filter((memo) => memo.pinned).length;
}

export function createEmptyPersonalMemoEditorSession(): PersonalMemoEditorSession {
  return {
    mode: "new",
    memoId: null,
    titleDraft: "",
    contentDraft: "",
    dirty: false,
  };
}

export function normalizePersonalMemoEditorSession(
  value: unknown,
): PersonalMemoEditorSession | null {
  if (!isRecord(value)) return null;
  if (value.mode !== "new" && value.mode !== "edit") return null;
  if (
    (value.memoId !== null && !isSafeId(value.memoId)) ||
    (value.mode === "edit" && value.memoId === null) ||
    typeof value.titleDraft !== "string" ||
    value.titleDraft.length > PERSONAL_MEMO_TITLE_MAX_LENGTH ||
    typeof value.contentDraft !== "string" ||
    value.contentDraft.length > PERSONAL_MEMO_CONTENT_MAX_LENGTH ||
    typeof value.dirty !== "boolean"
  ) {
    return null;
  }
  return {
    mode: value.mode,
    memoId: value.memoId,
    titleDraft: value.titleDraft,
    contentDraft: value.contentDraft.replace(/\r\n?/g, "\n"),
    dirty: value.dirty,
  };
}

export function readPersonalMemoEditorSession(
  storage: PersonalMemoStorage | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  try {
    return normalizePersonalMemoEditorSession(
      JSON.parse(storage?.getItem(PERSONAL_MEMO_EDITOR_SESSION_KEY) ?? "null"),
    );
  } catch {
    return null;
  }
}

export function savePersonalMemoEditorSession(
  session: PersonalMemoEditorSession,
  storage: PersonalMemoStorage | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  const normalized = normalizePersonalMemoEditorSession(session);
  if (!normalized) return null;
  try {
    storage?.setItem(
      PERSONAL_MEMO_EDITOR_SESSION_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // The editor remains usable in memory.
  }
  return normalized;
}

export function clearPersonalMemoEditorSession(
  storage: PersonalMemoStorage | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  try {
    storage?.removeItem(PERSONAL_MEMO_EDITOR_SESSION_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}

export function readPersonalMemoLibrarySession(
  storage: PersonalMemoStorage | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  try {
    return storage?.getItem(PERSONAL_MEMO_LIBRARY_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function savePersonalMemoLibrarySession(
  open: boolean,
  storage: PersonalMemoStorage | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  try {
    if (open) storage?.setItem(PERSONAL_MEMO_LIBRARY_SESSION_KEY, "true");
    else storage?.removeItem(PERSONAL_MEMO_LIBRARY_SESSION_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}
