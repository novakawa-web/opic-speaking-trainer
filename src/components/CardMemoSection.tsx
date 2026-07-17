import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CARD_MEMO_MAX_LENGTH,
  formatMemoDate,
  normalizeMemoContent,
  sortCardMemos,
  type CardMemo,
} from "../utils/cardMemoStorage";
import {
  readCardDetailUiSession,
  updateCardDetailUiSession,
  type MemoEditorSession,
} from "../utils/uiSessionStorage";

export type CardMemoSectionHandle = {
  confirmDiscardAndClose: () => boolean;
};

type CardMemoSectionProps = {
  cardId: string;
  cardTitle: string;
  hasMyAnswer: boolean;
  memos: CardMemo[];
  focusMemoId?: string | null;
  onBeforeStartEditing: () => boolean;
  onCreate: (content: string) => void;
  onUpdate: (memoId: string, content: string) => void;
  onTogglePinned: (memoId: string) => void;
  onDelete: (memoId: string) => void;
  onRestore: (memo: CardMemo, index: number) => void;
};

type EditorState = { mode: "new"; original: "" } | { mode: "edit"; memo: CardMemo; original: string };

function restoreEditor(
  session: MemoEditorSession | null,
  memos: CardMemo[],
): EditorState | null {
  if (!session) return null;
  if (session.mode === "new") return { mode: "new", original: "" };
  const memo = memos.find((candidate) => candidate.id === session.memoId);
  return memo ? { mode: "edit", memo, original: memo.content } : null;
}

export const CardMemoSection = forwardRef<CardMemoSectionHandle, CardMemoSectionProps>(
  function CardMemoSection(
    {
      cardId,
      cardTitle,
      hasMyAnswer,
      memos,
      focusMemoId,
      onBeforeStartEditing,
      onCreate,
      onUpdate,
      onTogglePinned,
      onDelete,
      onRestore,
    },
    ref,
  ) {
    const [initialUiSession] = useState(() =>
      readCardDetailUiSession(cardId, hasMyAnswer),
    );
    const [expanded, setExpanded] = useState(
      Boolean(focusMemoId) || initialUiSession.memoExpanded,
    );
    const [editor, setEditor] = useState<EditorState | null>(() =>
      restoreEditor(initialUiSession.memoEditor, memos),
    );
    const [draft, setDraft] = useState(initialUiSession.memoEditor?.draft ?? "");
    const [message, setMessage] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<CardMemo | null>(null);
    const [deletedMemo, setDeletedMemo] = useState<{ memo: CardMemo; index: number } | null>(null);
    const deleteDialogRef = useRef<HTMLDialogElement>(null);
    const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
    const orderedMemos = useMemo(() => sortCardMemos(memos), [memos]);
    const normalizedDraft = normalizeMemoContent(draft);
    const isDirty = Boolean(editor) && normalizedDraft !== (editor?.original ?? "");
    const canSave = normalizedDraft.length > 0 && normalizedDraft.length <= CARD_MEMO_MAX_LENGTH;

    function confirmDiscard() {
      if (!isDirty) return true;
      return window.confirm("저장하지 않은 메모 수정 내용이 있습니다. 변경 내용을 버릴까요?");
    }

    function closeEditor() {
      setEditor(null);
      setDraft("");
    }

    useImperativeHandle(ref, () => ({
      confirmDiscardAndClose() {
        if (!confirmDiscard()) return false;
        closeEditor();
        return true;
      },
    }));

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
      const restored = readCardDetailUiSession(cardId, hasMyAnswer);
      const restoredEditor = focusMemoId
        ? null
        : restoreEditor(restored.memoEditor, memos);
      setExpanded(Boolean(focusMemoId) || restored.memoExpanded);
      setEditor(restoredEditor);
      setDraft(restoredEditor ? restored.memoEditor?.draft ?? "" : "");
      setMessage("");
      setDeletedMemo(null);
    }, [cardId, focusMemoId]);

    useEffect(() => {
      updateCardDetailUiSession(cardId, hasMyAnswer, {
        memoExpanded: expanded,
        memoEditor: editor
          ? {
              mode: editor.mode,
              memoId: editor.mode === "edit" ? editor.memo.id : null,
              draft,
            }
          : null,
      });
    }, [cardId, draft, editor, expanded, hasMyAnswer]);

    useEffect(() => {
      if (!focusMemoId || !expanded) return;
      const element = document.getElementById(`card-memo-${focusMemoId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [expanded, focusMemoId]);

    function startNewMemo() {
      if (!onBeforeStartEditing()) return;
      if (editor && !confirmDiscard()) return;
      setExpanded(true);
      setEditor({ mode: "new", original: "" });
      setDraft("");
      setMessage("");
    }

    function startEditMemo(memo: CardMemo) {
      if (!onBeforeStartEditing()) return;
      if (editor && !confirmDiscard()) return;
      setEditor({ mode: "edit", memo, original: memo.content });
      setDraft(memo.content);
      setMessage("");
    }

    function cancelEdit() {
      if (!confirmDiscard()) return;
      closeEditor();
      setMessage("메모 편집을 취소했습니다.");
    }

    function saveMemo() {
      if (!editor || !canSave) return;
      if (editor.mode === "new") {
        onCreate(normalizedDraft);
        setMessage("메모를 저장했습니다.");
      } else {
        onUpdate(editor.memo.id, normalizedDraft);
        setMessage("메모를 수정했습니다.");
      }
      closeEditor();
      setDeletedMemo(null);
    }

    function openDeleteDialog(memo: CardMemo, trigger: HTMLButtonElement) {
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
      const originalIndex = memos.findIndex((memo) => memo.id === deleteTarget.id);
      onDelete(deleteTarget.id);
      setDeletedMemo({ memo: deleteTarget, index: Math.max(0, originalIndex) });
      setMessage("메모를 삭제했습니다.");
      closeDeleteDialog();
    }

    function undoDelete() {
      if (!deletedMemo) return;
      onRestore(deletedMemo.memo, deletedMemo.index);
      setDeletedMemo(null);
      setMessage("방금 삭제한 메모를 복원했습니다.");
    }

    return (
      <section className="card-memo-section" aria-labelledby={`memo-title-${cardId}`}>
        <div className="card-memo-header">
          <div>
            <p className="eyebrow">CARD NOTES</p>
            <h2 id={`memo-title-${cardId}`}>메모 <span>{memos.length}</span></h2>
          </div>
          <button
            type="button"
            className="memo-expand-button"
            aria-expanded={expanded}
            aria-controls={`memo-content-${cardId}`}
            onClick={() => {
              if (expanded && editor && !confirmDiscard()) return;
              if (expanded) closeEditor();
              setExpanded((current) => !current);
            }}
          >
            {expanded ? "접기" : "펼치기"}
          </button>
        </div>

        {expanded && (
          <div id={`memo-content-${cardId}`} className="card-memo-content">
            <div className="memo-section-actions">
              <p>고정 메모를 먼저, 나머지는 최근 수정순으로 표시합니다.</p>
              {!editor && orderedMemos.length > 0 && (
                <button type="button" className="primary-button" onClick={startNewMemo}>
                  메모 작성
                </button>
              )}
            </div>

            {editor && (
              <div className="memo-editor">
                <label htmlFor={`memo-editor-${cardId}`}>
                  {editor.mode === "new" ? "새 메모" : "메모 수정"}
                </label>
                <textarea
                  id={`memo-editor-${cardId}`}
                  value={draft}
                  maxLength={CARD_MEMO_MAX_LENGTH}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      saveMemo();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEdit();
                    }
                  }}
                  placeholder="발음, 표현, 수정할 내용 등을 기록해 보세요."
                  autoFocus
                />
                <div className="memo-editor-meta">
                  <span>{draft.length.toLocaleString()} / {CARD_MEMO_MAX_LENGTH.toLocaleString()}자</span>
                </div>
                <div className="memo-editor-actions">
                  <button type="button" className="primary-button" disabled={!canSave} onClick={saveMemo}>저장</button>
                  <button type="button" className="secondary-button" onClick={cancelEdit}>취소</button>
                </div>
                {!canSave && <p className="disabled-reason">공백이 아닌 메모를 입력하면 저장할 수 있습니다.</p>}
                <p className="editor-shortcut-help">Ctrl/Cmd + Enter 저장 · Esc 취소</p>
              </div>
            )}

            {!editor && orderedMemos.length === 0 && (
              <div className="memo-empty-state">
                <p>아직 작성한 메모가 없어요.</p>
                <button type="button" className="primary-button" onClick={startNewMemo}>메모 작성</button>
              </div>
            )}

            {!editor && orderedMemos.length > 0 && (
              <div className="memo-list">
                {orderedMemos.map((memo) => (
                  <article
                    id={`card-memo-${memo.id}`}
                    className={`memo-item ${memo.pinned ? "is-pinned" : ""}`}
                    key={memo.id}
                  >
                    <div className="memo-item-meta">
                      <span>{memo.pinned ? "📌 고정됨" : "메모"}</span>
                      <time dateTime={memo.updatedAt}>{formatMemoDate(memo.updatedAt)}</time>
                    </div>
                    <div className="memo-content-text">{memo.content}</div>
                    <div className="memo-item-actions">
                      <button
                        type="button"
                        aria-pressed={memo.pinned}
                        aria-label={memo.pinned ? "메모 고정 해제" : "메모 고정"}
                        onClick={() => onTogglePinned(memo.id)}
                      >
                        {memo.pinned ? "고정 해제" : "고정"}
                      </button>
                      <button type="button" onClick={() => startEditMemo(memo)}>수정</button>
                      <button
                        type="button"
                        className="is-danger-quiet"
                        onClick={(event) => openDeleteDialog(memo, event.currentTarget)}
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="memo-live-message" aria-live="polite">
              {message}
              {deletedMemo && (
                <button type="button" onClick={undoDelete}>방금 삭제한 메모 되돌리기</button>
              )}
            </div>
            <p className="memo-backup-note">메모는 전체 JSON 백업에 포함됩니다.</p>
          </div>
        )}

        <dialog
          ref={deleteDialogRef}
          className="memo-delete-dialog"
          aria-labelledby="memo-delete-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            closeDeleteDialog();
          }}
        >
          <h2 id="memo-delete-dialog-title">메모를 삭제할까요?</h2>
          <p><strong>{cardTitle}</strong>의 메모만 삭제됩니다.</p>
          <blockquote>{deleteTarget?.content.slice(0, 160)}</blockquote>
          <div>
            <button type="button" className="secondary-button" onClick={closeDeleteDialog}>취소</button>
            <button type="button" className="delete-confirm-button" onClick={confirmDelete}>메모 삭제</button>
          </div>
        </dialog>
      </section>
    );
  },
);
