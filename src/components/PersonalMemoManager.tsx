import { useEffect, useMemo, useRef, useState } from "react";
import { formatMemoDate } from "../utils/cardMemoStorage";
import { SimpleMarkdown } from "./SimpleMarkdown";
import { simpleMarkdownToPlainText } from "../utils/simpleMarkdown";
import {
  PERSONAL_MEMO_CONTENT_MAX_LENGTH,
  PERSONAL_MEMO_TITLE_MAX_LENGTH,
  clearPersonalMemoEditorSession,
  createEmptyPersonalMemoEditorSession,
  getPinnedPersonalMemoCount,
  normalizePersonalMemoText,
  readPersonalMemoEditorSession,
  resolvePersonalMemoInput,
  savePersonalMemoEditorSession,
  searchPersonalMemos,
  sortPersonalMemos,
  type PersonalMemo,
  type PersonalMemoDataset,
  type PersonalMemoEditorSession,
} from "../utils/personalMemoStorage";

type PersonalMemoSummaryProps = {
  dataset: PersonalMemoDataset;
  onOpenLibrary: () => void;
  onStartNew: () => void;
};

export function PersonalMemoSummary({
  dataset,
  onOpenLibrary,
  onStartNew,
}: PersonalMemoSummaryProps) {
  const ordered = useMemo(() => sortPersonalMemos(dataset.memos), [dataset]);
  const pinned = ordered.filter((memo) => memo.pinned).slice(0, 3);
  const recent = [...dataset.memos]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 3);

  return (
    <section className="personal-memo-summary home-material-card" aria-labelledby="personal-memo-summary-title">
      <div className="section-title-row personal-memo-summary-heading">
        <div>
          <p className="eyebrow">PERSONAL STUDY NOTES</p>
          <h2 id="personal-memo-summary-title" className="home-section-title">개인 학습 메모</h2>
          <p className="home-card-description">공부법, 시험 전략, 기억할 표현을 카드와 별도로 저장하세요.</p>
        </div>
      </div>

      <div className="personal-memo-counts summary-chip-row" aria-label="개인 학습 메모 요약">
        <span className="summary-chip">저장 {dataset.memos.length}</span>
        <span className="summary-chip">고정 {getPinnedPersonalMemoCount(dataset)}</span>
      </div>

      <div className="personal-memo-summary-actions">
        <button type="button" className="primary-button" onClick={onStartNew}>
          새 메모 작성
        </button>
        <button type="button" className="secondary-button" onClick={onOpenLibrary}>
          전체 메모 보기
        </button>
      </div>

      {dataset.memos.length === 0 ? (
        <p className="personal-memo-summary-empty">아직 저장한 개인 메모가 없어요.</p>
      ) : (
        <div className="personal-memo-summary-columns">
          {pinned.length > 0 && (
            <div>
              <h3>고정 메모</h3>
              <ul>
                {pinned.map((memo) => (
                  <li key={memo.id}>
                    <button type="button" onClick={onOpenLibrary}>
                      <strong>📌 {memo.title}</strong>
                      <span>{simpleMarkdownToPlainText(memo.content)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3>최근 메모</h3>
            <ul>
              {recent.map((memo) => (
                <li key={memo.id}>
                  <button type="button" onClick={onOpenLibrary}>
                    <strong>{memo.title}</strong>
                    <time dateTime={memo.updatedAt}>{formatMemoDate(memo.updatedAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

type DeletedPersonalMemo = {
  memo: PersonalMemo;
  index: number;
};

type PersonalMemoLibraryProps = {
  dataset: PersonalMemoDataset;
  onBack: () => void;
  onCreate: (title: string, content: string) => void;
  onUpdate: (memoId: string, title: string, content: string) => void;
  onTogglePinned: (memoId: string) => void;
  onDelete: (memoId: string) => DeletedPersonalMemo | null;
  onRestore: (deleted: DeletedPersonalMemo) => void;
};

function restoreEditor(
  dataset: PersonalMemoDataset,
): PersonalMemoEditorSession | null {
  const session = readPersonalMemoEditorSession();
  if (!session) return null;
  if (
    session.mode === "edit" &&
    !dataset.memos.some((memo) => memo.id === session.memoId)
  ) {
    clearPersonalMemoEditorSession();
    return null;
  }
  return session;
}

export function PersonalMemoLibrary({
  dataset,
  onBack,
  onCreate,
  onUpdate,
  onTogglePinned,
  onDelete,
  onRestore,
}: PersonalMemoLibraryProps) {
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<PersonalMemoEditorSession | null>(() =>
    restoreEditor(dataset),
  );
  const [openMemoId, setOpenMemoId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PersonalMemo | null>(null);
  const [deletedMemo, setDeletedMemo] = useState<DeletedPersonalMemo | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const memoHeadingRefs = useRef(new Map<string, HTMLHeadingElement>());
  const results = useMemo(
    () => searchPersonalMemos(dataset.memos, query),
    [dataset.memos, query],
  );

  const originalMemo =
    editor?.mode === "edit"
      ? dataset.memos.find((memo) => memo.id === editor.memoId) ?? null
      : null;
  const normalizedTitle = editor?.titleDraft.trim() ?? "";
  const normalizedContent = normalizePersonalMemoText(editor?.contentDraft ?? "");
  const resolvedInput = editor
    ? resolvePersonalMemoInput(editor.titleDraft, editor.contentDraft)
    : null;
  const isDirty = Boolean(
    editor &&
      (editor.mode === "new"
        ? normalizedTitle.length > 0 || normalizedContent.length > 0
        : normalizedTitle !== originalMemo?.title ||
          normalizedContent !== originalMemo?.content),
  );
  const canSave = Boolean(editor && resolvedInput);

  function confirmDiscard() {
    return (
      !isDirty ||
      window.confirm("저장하지 않은 개인 학습 메모가 있습니다. 변경 내용을 버릴까요?")
    );
  }

  function closeEditor() {
    setEditor(null);
    clearPersonalMemoEditorSession();
  }

  useEffect(() => {
    if (!editor) return;
    savePersonalMemoEditorSession({ ...editor, dirty: isDirty });
  }, [editor, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (openMemoId && !results.some((memo) => memo.id === openMemoId)) {
      setOpenMemoId(null);
    }
  }, [openMemoId, results]);

  function showMemo(memoId: string) {
    setOpenMemoId(memoId);
    window.requestAnimationFrame(() => {
      const heading = memoHeadingRefs.current.get(memoId);
      heading?.scrollIntoView({ behavior: "auto", block: "start" });
      heading?.focus({ preventScroll: true });
    });
  }

  function moveOpenMemo(offset: -1 | 1) {
    if (!openMemoId || editor) return;
    const currentIndex = results.findIndex((memo) => memo.id === openMemoId);
    const nextMemo = results[currentIndex + offset];
    if (nextMemo) showMemo(nextMemo.id);
  }

  function startNew() {
    if (editor && !confirmDiscard()) return;
    setEditor(createEmptyPersonalMemoEditorSession());
    setOpenMemoId(null);
    setMessage("");
  }

  function startEdit(memo: PersonalMemo) {
    if (editor && !confirmDiscard()) return;
    setEditor({
      mode: "edit",
      memoId: memo.id,
      titleDraft: memo.title,
      contentDraft: memo.content,
      dirty: false,
    });
    setOpenMemoId(null);
    setMessage("");
  }

  function cancelEditor() {
    if (!confirmDiscard()) return;
    closeEditor();
    setMessage("개인 메모 편집을 취소했습니다.");
  }

  function saveEditor() {
    if (!editor || !canSave) return;
    if (editor.mode === "new") {
      onCreate(normalizedTitle, normalizedContent);
      setMessage("개인 학습 메모를 저장했습니다.");
    } else if (editor.memoId) {
      onUpdate(editor.memoId, normalizedTitle, normalizedContent);
      setMessage("개인 학습 메모를 수정했습니다.");
    }
    closeEditor();
    setDeletedMemo(null);
  }

  function handleBack() {
    if (!confirmDiscard()) return;
    closeEditor();
    onBack();
  }

  function openDeleteDialog(memo: PersonalMemo, trigger: HTMLButtonElement) {
    if (editor && !confirmDiscard()) return;
    closeEditor();
    deleteTriggerRef.current = trigger;
    setDeleteTarget(memo);
    deleteDialogRef.current?.showModal();
  }

  function closeDeleteDialog() {
    deleteDialogRef.current?.close();
    setDeleteTarget(null);
    window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const deleteIndex = results.findIndex((memo) => memo.id === deleteTarget.id);
    const replacementMemo =
      results[deleteIndex + 1] ?? results[deleteIndex - 1] ?? null;
    const deleted = onDelete(deleteTarget.id);
    setDeletedMemo(deleted);
    setOpenMemoId((current) =>
      current === deleteTarget.id ? replacementMemo?.id ?? null : current,
    );
    setMessage(deleted ? "개인 학습 메모를 삭제했습니다." : "삭제할 메모를 찾지 못했습니다.");
    closeDeleteDialog();
  }

  function undoDelete() {
    if (!deletedMemo) return;
    onRestore(deletedMemo);
    setDeletedMemo(null);
    setMessage("방금 삭제한 개인 학습 메모를 복원했습니다.");
  }

  return (
    <main className="personal-memo-library">
      <section className="personal-memo-library-toolbar" aria-labelledby="personal-memo-library-title">
        <div>
          <p className="eyebrow">PERSONAL STUDY NOTES</p>
          <h2 id="personal-memo-library-title">개인 학습 메모</h2>
          <p>카드와 무관한 공부법, 시험 전략과 기억할 내용을 관리합니다.</p>
        </div>
        <div className="personal-memo-toolbar-actions">
          <button type="button" className="secondary-button" onClick={handleBack}>홈으로</button>
          <button type="button" className="primary-button" onClick={startNew}>새 메모</button>
        </div>
      </section>

      {!editor && (
        <label className="personal-memo-search" htmlFor="personal-memo-search-input">
          <span>개인 메모 검색</span>
          <input
            id="personal-memo-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목 또는 본문 검색"
          />
        </label>
      )}

      <p className="personal-memo-result-count" aria-live="polite">
        {editor
          ? editor.mode === "new" ? "새 개인 메모 작성" : "개인 메모 수정"
          : query.trim() ? `검색 결과 ${results.length}개` : `저장 메모 ${results.length}개`}
      </p>

      {editor && (
        <section className="personal-memo-editor" aria-labelledby="personal-memo-editor-title">
          <h3 id="personal-memo-editor-title">
            {editor.mode === "new" ? "새 개인 학습 메모" : "개인 학습 메모 수정"}
          </h3>
          <label htmlFor="personal-memo-title-input">제목 <span className="optional-field-label">선택</span></label>
          <input
            id="personal-memo-title-input"
            value={editor.titleDraft}
            maxLength={PERSONAL_MEMO_TITLE_MAX_LENGTH}
            placeholder="비워두면 본문의 첫 줄을 제목으로 사용해요."
            onChange={(event) =>
              setEditor((current) => current ? { ...current, titleDraft: event.target.value } : current)
            }
            autoFocus
          />
          <div className="personal-memo-field-count">
            {editor.titleDraft.length} / {PERSONAL_MEMO_TITLE_MAX_LENGTH}자
          </div>
          {!normalizedTitle && resolvedInput && (
            <p className="auto-title-preview">자동 제목: <strong>{resolvedInput.title}</strong></p>
          )}
          <label htmlFor="personal-memo-content-input">본문</label>
          <textarea
            id="personal-memo-content-input"
            value={editor.contentDraft}
            maxLength={PERSONAL_MEMO_CONTENT_MAX_LENGTH}
            onChange={(event) =>
              setEditor((current) => current ? { ...current, contentDraft: event.target.value } : current)
            }
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                saveEditor();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelEditor();
              }
            }}
            placeholder="공부법, 시험 전략, 기억할 표현을 자유롭게 적어 보세요."
          />
          <div className="personal-memo-field-count">
            {editor.contentDraft.length.toLocaleString()} / {PERSONAL_MEMO_CONTENT_MAX_LENGTH.toLocaleString()}자
          </div>
            <p className="personal-memo-markdown-help">
              제목(#), 굵게(**), 목록(-), 인용(&gt;) 형식을 사용할 수 있어요.
            </p>
          <div className="personal-memo-editor-actions">
            <button type="button" className="primary-button" disabled={!canSave} onClick={saveEditor}>저장</button>
            <button type="button" className="secondary-button" onClick={cancelEditor}>취소</button>
          </div>
          {!canSave && (
            <p className="disabled-reason">본문을 입력하면 제목을 직접 쓰거나 첫 줄에서 자동으로 만들 수 있습니다.</p>
          )}
          <p className="editor-shortcut-help">Ctrl/Cmd + Enter 저장 · Esc 취소</p>
        </section>
      )}

      {!editor && results.length === 0 && (
        <section className="personal-memo-empty-state">
          <p>{dataset.memos.length === 0 ? "아직 저장한 개인 메모가 없어요." : "검색 결과가 없어요."}</p>
          {dataset.memos.length === 0 && (
            <button type="button" className="primary-button" onClick={startNew}>첫 메모 작성</button>
          )}
        </section>
      )}

      {!editor && results.length > 0 && (
        <div className="personal-memo-list">
          {results.map((memo, memoIndex) => {
            const isOpen = openMemoId === memo.id;
            const previousMemo = results[memoIndex - 1];
            const nextMemo = results[memoIndex + 1];
            return (
              <article className={`personal-memo-item ${memo.pinned ? "is-pinned" : ""}`} key={memo.id}>
                <div className="personal-memo-item-meta">
                  <span>{memo.pinned ? "📌 고정됨" : "개인 학습 메모"}</span>
                  <time dateTime={memo.updatedAt}>{formatMemoDate(memo.updatedAt)}</time>
                </div>
                <h3
                  ref={(node) => {
                    if (node) memoHeadingRefs.current.set(memo.id, node);
                    else memoHeadingRefs.current.delete(memo.id);
                  }}
                  tabIndex={isOpen ? -1 : undefined}
                >
                  {memo.title}
                </h3>
                {isOpen ? (
                  <>
                    <SimpleMarkdown content={memo.content} className="personal-memo-rendered" />
                    <nav className="personal-memo-view-navigation" aria-label="열린 개인 메모 이동">
                      <button
                        type="button"
                        disabled={!previousMemo}
                        aria-label={previousMemo ? `이전 메모: ${previousMemo.title}` : "이전 메모 없음"}
                        onClick={() => moveOpenMemo(-1)}
                      >
                        ‹ 이전 메모
                      </button>
                      <strong aria-live="polite">{memoIndex + 1} / {results.length}</strong>
                      <button
                        type="button"
                        disabled={!nextMemo}
                        aria-label={nextMemo ? `다음 메모: ${nextMemo.title}` : "다음 메모 없음"}
                        onClick={() => moveOpenMemo(1)}
                      >
                        다음 메모 ›
                      </button>
                    </nav>
                  </>
                ) : (
                  <p>{simpleMarkdownToPlainText(memo.content)}</p>
                )}
                <div className="personal-memo-item-actions">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`${memo.title} 개인 메모 ${isOpen ? "접기" : "열기"}`}
                    onClick={() => isOpen ? setOpenMemoId(null) : showMemo(memo.id)}
                  >
                    {isOpen ? "접기" : "열기"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={memo.pinned}
                    aria-label={`${memo.title} ${memo.pinned ? "고정 해제" : "고정"}`}
                    onClick={() => onTogglePinned(memo.id)}
                  >
                    {memo.pinned ? "해제" : "고정"}
                  </button>
                  <button type="button" onClick={() => startEdit(memo)}>수정</button>
                  <button
                    type="button"
                    className="is-danger-quiet"
                    onClick={(event) => openDeleteDialog(memo, event.currentTarget)}
                  >
                    삭제
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="personal-memo-live-message" aria-live="polite">
        {message}
        {deletedMemo && (
          <button type="button" onClick={undoDelete}>방금 삭제한 메모 되돌리기</button>
        )}
      </div>
      <p className="personal-memo-backup-note">
        개인 학습 메모는 전체 JSON 백업에 포함되며 카드 TSV에는 포함되지 않습니다.
      </p>

      <dialog
        ref={deleteDialogRef}
        className="personal-memo-delete-dialog"
        aria-labelledby="personal-memo-delete-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDeleteDialog();
        }}
      >
        <h2 id="personal-memo-delete-dialog-title">개인 메모를 삭제할까요?</h2>
        <p><strong>{deleteTarget?.title}</strong></p>
        <blockquote>{deleteTarget?.content.slice(0, 180)}</blockquote>
        <div>
          <button type="button" className="secondary-button" onClick={closeDeleteDialog}>취소</button>
          <button type="button" className="delete-confirm-button" onClick={confirmDelete}>개인 메모 삭제</button>
        </div>
      </dialog>
    </main>
  );
}
