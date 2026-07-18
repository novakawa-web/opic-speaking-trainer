import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  createPassageParagraphs,
  flattenParagraphSentences,
} from "../utils/passageParagraphs";
import {
  SAVED_PASSAGE_TEXT_MAX_LENGTH,
  SAVED_PASSAGE_TITLE_MAX_LENGTH,
  clearSavedPassageEditorSession,
  isValidSavedPassageInput,
  readSavedPassageEditorSession,
  readSavedPassageLibraryOpen,
  resolveSavedPassageInput,
  saveSavedPassageEditorSession,
  saveSavedPassageLibraryOpen,
  sortSavedPassages,
  type SavedPassage,
  type SavedPassageEditorSession,
} from "../utils/savedPassageStorage";
import {
  createCustomTextSource,
  createSavedPassageSource,
  isValidDirectPracticeText,
  type ShadowingSource,
} from "../utils/shadowingPlayer";

type DeletedPassage = { passage: SavedPassage; index: number };

type DirectTextPracticeProps = {
  passages: SavedPassage[];
  onCreate: (title: string, text: string) => SavedPassage;
  onUpdate: (passageId: string, title: string, text: string) => SavedPassage;
  onDelete: (passageId: string) => DeletedPassage | null;
  onRestore: (deleted: DeletedPassage) => void;
  onStart: (source: ShadowingSource) => void;
};

function formatPassageDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function emptyEditor(): SavedPassageEditorSession {
  return {
    mode: "new",
    passageId: null,
    titleDraft: "",
    textDraft: "",
    dirty: false,
  };
}

export function DirectTextPractice({
  passages,
  onCreate,
  onUpdate,
  onDelete,
  onRestore,
  onStart,
}: DirectTextPracticeProps) {
  const restoredEditor = useMemo(readSavedPassageEditorSession, []);
  const [expanded, setExpanded] = useState(
    () => Boolean(restoredEditor) || readSavedPassageLibraryOpen(),
  );
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState<SavedPassageEditorSession | null>(
    restoredEditor,
  );
  const [message, setMessage] = useState("");
  const [lastDeleted, setLastDeleted] = useState<DeletedPassage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedPassage | null>(null);
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sortedPassages = useMemo(
    () => sortSavedPassages(passages),
    [passages],
  );
  const visiblePassages = showAll
    ? sortedPassages
    : sortedPassages.slice(0, 5);
  const editorParagraphs = useMemo(
    () => createPassageParagraphs(editor?.textDraft ?? ""),
    [editor?.textDraft],
  );
  const sentenceCount = flattenParagraphSentences(editorParagraphs).length;
  const paragraphCount = editorParagraphs.length;
  const resolvedEditorInput = editor
    ? resolveSavedPassageInput(editor.titleDraft, editor.textDraft)
    : null;
  const canSave = Boolean(
    editor && isValidSavedPassageInput(editor.titleDraft, editor.textDraft),
  );
  const canPracticeWithoutSaving = Boolean(
    editor && isValidDirectPracticeText(editor.textDraft),
  );

  useEffect(() => {
    if (!editor) {
      clearSavedPassageEditorSession();
      return;
    }
    saveSavedPassageEditorSession(editor);
  }, [editor]);

  useEffect(() => {
    saveSavedPassageLibraryOpen(expanded);
  }, [expanded]);

  useEffect(() => {
    if (deleteTarget) deleteConfirmRef.current?.focus();
  }, [deleteTarget]);

  useEffect(() => {
    if (!editor?.dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editor?.dirty]);

  function canDiscardEditor() {
    return !editor?.dirty || window.confirm("저장하지 않은 지문 변경 내용을 버릴까요?");
  }

  function openNewEditor() {
    if (!canDiscardEditor()) return;
    setEditor(emptyEditor());
    setExpanded(true);
    setMessage("");
  }

  function openEditEditor(passage: SavedPassage) {
    if (!canDiscardEditor()) return;
    setEditor({
      mode: "edit",
      passageId: passage.id,
      titleDraft: passage.title,
      textDraft: passage.text,
      dirty: false,
    });
    setExpanded(true);
    setMessage("");
  }

  function closeEditor() {
    if (!canDiscardEditor()) return;
    setEditor(null);
  }

  function saveEditor(startAfterSave: boolean) {
    if (!editor || !canSave) return;
    const passage =
      editor.mode === "edit" && editor.passageId
        ? onUpdate(editor.passageId, editor.titleDraft, editor.textDraft)
        : onCreate(editor.titleDraft, editor.textDraft);
    setEditor(null);
    setLastDeleted(null);
    setMessage(`‘${passage.title}’ 지문을 저장했습니다.`);
    if (startAfterSave) {
      saveSavedPassageLibraryOpen(true);
      onStart(createSavedPassageSource(passage));
    }
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      saveEditor(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
    }
  }

  function requestPassageDelete(
    passage: SavedPassage,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    deleteTriggerRef.current = event.currentTarget;
    setDeleteTarget(passage);
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  function confirmPassageDelete() {
    if (!deleteTarget) return;
    const deleted = onDelete(deleteTarget.id);
    if (!deleted) return;
    setLastDeleted(deleted);
    setMessage(`‘${deleteTarget.title}’ 지문을 삭제했습니다.`);
    setDeleteTarget(null);
  }

  function restoreDeletedPassage() {
    if (!lastDeleted) return;
    onRestore(lastDeleted);
    setMessage(`‘${lastDeleted.passage.title}’ 지문을 복원했습니다.`);
    setLastDeleted(null);
  }

  return (
    <section className="direct-practice-section home-material-card" aria-labelledby="direct-practice-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">PASSAGE LIBRARY</p>
          <h2 id="direct-practice-title" className="home-section-title">쉐도잉 지문</h2>
          <p className="home-card-description">새 지문을 작성하거나 저장한 지문을 다시 열어 연습하세요.</p>
        </div>
        <span className="saved-passage-count summary-chip">저장 {passages.length}개</span>
      </div>

      <div className="saved-passage-primary-actions">
        <button type="button" className="primary-button" onClick={openNewEditor}>
          새 지문 작성
        </button>
        <button
          type="button"
          className="secondary-button"
          aria-expanded={expanded}
          aria-controls="saved-passage-library-content"
          onClick={() => {
            if (expanded && editor?.dirty && !canDiscardEditor()) return;
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "저장 지문 접기" : `저장한 지문 ${passages.length}개`}
        </button>
      </div>

      {expanded && (
        <div id="saved-passage-library-content" className="saved-passage-library-content">
          {editor && (
            <div className="saved-passage-editor">
              <div className="saved-passage-editor-heading">
                <strong>{editor.mode === "edit" ? "저장 지문 수정" : "새 지문 작성"}</strong>
                <span>{editor.dirty ? "저장하지 않은 변경 있음" : "편집 준비"}</span>
              </div>
              <label htmlFor="saved-passage-title-input">지문 제목 <span className="optional-field-label">선택</span></label>
              <input
                id="saved-passage-title-input"
                value={editor.titleDraft}
                maxLength={SAVED_PASSAGE_TITLE_MAX_LENGTH}
                placeholder="비워두면 본문의 첫 줄을 제목으로 사용해요."
                onKeyDown={handleEditorKeyDown}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, titleDraft: event.target.value, dirty: true }
                      : current,
                  )
                }
              />
              {!editor.titleDraft.trim() && resolvedEditorInput && (
                <p className="auto-title-preview">자동 제목: <strong>{resolvedEditorInput.title}</strong></p>
              )}
              <label htmlFor="saved-passage-text-input">영어 지문</label>
              <textarea
                id="saved-passage-text-input"
                value={editor.textDraft}
                maxLength={SAVED_PASSAGE_TEXT_MAX_LENGTH}
                placeholder="빈 줄로 문단을 나누어 영어 지문을 입력하세요."
                onKeyDown={handleEditorKeyDown}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, textDraft: event.target.value, dirty: true }
                      : current,
                  )
                }
              />
              <div className="direct-practice-meta">
                <span>{editor.textDraft.length.toLocaleString()} / {SAVED_PASSAGE_TEXT_MAX_LENGTH.toLocaleString()}자</span>
                <span>{sentenceCount}문장 · {paragraphCount}문단</span>
              </div>
              <div className="saved-passage-editor-actions">
                <button type="button" className="secondary-button" disabled={!canSave} onClick={() => saveEditor(false)}>
                  저장
                </button>
                <button type="button" className="primary-button" disabled={!canSave} onClick={() => saveEditor(true)}>
                  저장하고 연습
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!canPracticeWithoutSaving}
                  onClick={() =>
                    onStart(createCustomTextSource(editor.titleDraft, editor.textDraft))
                  }
                >
                  저장하지 않고 연습
                </button>
                <button type="button" className="text-button" onClick={closeEditor}>취소</button>
              </div>
              {!canSave && (
                <p className="disabled-reason">본문을 입력하면 제목을 직접 쓰거나 첫 줄에서 자동으로 만들 수 있습니다.</p>
              )}
              <p className="data-note">Ctrl/Cmd + Enter 저장 · Esc 취소 · 빈 줄은 문단 구분</p>
            </div>
          )}

          <div className="saved-passage-list-heading">
            <strong>저장한 지문</strong>
            {sortedPassages.length > 5 && (
              <button type="button" className="text-button" onClick={() => setShowAll((current) => !current)}>
                {showAll ? "최근 5개만" : `전체 ${sortedPassages.length}개 보기`}
              </button>
            )}
          </div>
          {visiblePassages.length === 0 ? (
            <p className="saved-passage-empty">아직 저장한 지문이 없습니다.</p>
          ) : (
            <div className="saved-passage-list">
              {visiblePassages.map((passage) => {
                const paragraphs = createPassageParagraphs(passage.text);
                const sentences = flattenParagraphSentences(paragraphs);
                return (
                  <article className="saved-passage-item" key={passage.id}>
                    <div>
                      <h3>{passage.title}</h3>
                      <p>{passage.text.replace(/\s+/g, " ").slice(0, 180)}</p>
                      <span>{sentences.length}문장 · {paragraphs.length}문단 · {formatPassageDate(passage.updatedAt)} 수정</span>
                    </div>
                    <div className="saved-passage-item-actions">
                      <button
                        type="button"
                        className="primary-button"
                        aria-label={`${passage.title} 연습`}
                        onClick={() => {
                          saveSavedPassageLibraryOpen(true);
                          onStart(createSavedPassageSource(passage));
                        }}
                      >
                        연습
                      </button>
                      <button type="button" className="secondary-button" aria-label={`${passage.title} 수정`} onClick={() => openEditEditor(passage)}>수정</button>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`${passage.title} 삭제`}
                        onClick={(event) => requestPassageDelete(passage, event)}
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {lastDeleted && (
            <div className="saved-passage-undo">
              <span>‘{lastDeleted.passage.title}’ 삭제됨</span>
              <button type="button" onClick={restoreDeletedPassage}>삭제 되돌리기</button>
            </div>
          )}
          <p className="data-note">저장 지문은 이 기기에 보관되며 전체 JSON 백업에 포함됩니다. 임시 지문은 포함되지 않습니다.</p>
        </div>
      )}
      <p className="saved-passage-message" aria-live="polite">{message}</p>
      {deleteTarget && (
        <div className="saved-passage-dialog-backdrop" role="presentation">
          <div
            className="saved-passage-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-passage-delete-title"
            aria-describedby="saved-passage-delete-description"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeDeleteDialog();
              }
            }}
          >
            <h3 id="saved-passage-delete-title">저장 지문 삭제</h3>
            <p id="saved-passage-delete-description">
              ‘{deleteTarget.title}’ 지문을 삭제할까요? 삭제 후에는 이번 세션에서 한 번 되돌릴 수 있습니다.
            </p>
            <div className="saved-passage-dialog-actions">
              <button type="button" className="secondary-button" onClick={closeDeleteDialog}>
                취소
              </button>
              <button
                ref={deleteConfirmRef}
                type="button"
                className="danger-button"
                onClick={confirmPassageDelete}
              >
                지문 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
