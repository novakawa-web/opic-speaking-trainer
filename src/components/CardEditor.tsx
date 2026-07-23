import { useEffect, useMemo, useState } from "react";
import type { OpicCard } from "../types";
import {
  createEmptyCardEditorDraft,
  createCardEditorDraft,
  getChangedCardEditorDraftFields,
  validateCardEditorDraft,
  type CardEditorDraft,
} from "../utils/cardEditor";
import { DECK_NAMES } from "../utils/cardStorage";

type CardEditorProps = {
  mode?: "create" | "edit";
  card?: OpicCard;
  onSave: (card: OpicCard) => void;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  submissionError?: string | null;
  duplicateCardId?: string | null;
  onOpenDuplicate?: (cardId: string) => void;
  onInputChange?: () => void;
};

export function CardEditor({
  mode = "edit",
  card,
  onSave,
  onCancel,
  onDirtyChange,
  submissionError,
  duplicateCardId,
  onOpenDuplicate,
  onInputChange,
}: CardEditorProps) {
  const initialDraft = useMemo(
    () => mode === "create"
      ? createEmptyCardEditorDraft()
      : card
        ? createCardEditorDraft(card)
        : createEmptyCardEditorDraft(),
    [card, mode],
  );
  const [draft, setDraft] = useState<CardEditorDraft>(() => initialDraft);
  const validation = useMemo(() => validateCardEditorDraft(draft), [draft]);
  const changedFields = useMemo(
    () => getChangedCardEditorDraftFields(initialDraft, draft),
    [draft, initialDraft],
  );
  const isDirty = changedFields.length > 0;
  const isCreate = mode === "create";

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function update<K extends keyof CardEditorDraft>(
    field: K,
    value: CardEditorDraft[K],
  ) {
    onInputChange?.();
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function cancel() {
    const message = isCreate
      ? "저장하지 않은 새 카드 내용이 있습니다. 화면을 나갈까요?"
      : "저장하지 않은 카드 수정 내용을 버릴까요?";
    if (isDirty && !window.confirm(message)) return;
    onCancel();
  }

  function save() {
    if (!isDirty) return;
    if (!validation.card) {
      const targetId = !draft.front.trim()
        ? "card-editor-front"
        : !draft.firstLine.trim()
          ? "card-editor-first-line"
          : "card-editor-answer";
      document.getElementById(targetId)?.focus();
      return;
    }
    onSave(validation.card);
  }

  return (
    <main className="card-editor-page">
      <section className="card-editor-panel" aria-labelledby="card-editor-title">
        <div className="card-editor-heading">
          <div>
            <p className="eyebrow">{isCreate ? "CREATE CARD" : "EDIT CARD"}</p>
            <h1 id="card-editor-title">{isCreate ? "새 카드 추가" : "카드 수정"}</h1>
          </div>
          <button type="button" className="secondary-button" onClick={cancel}>
            {isCreate ? "카드 라이브러리로 돌아가기" : "상세로 돌아가기"}
          </button>
        </div>

        <div className="card-editor-grid">
          {!isCreate && (
            <label className="card-editor-field card-editor-field-wide">
              <span>카드 ID</span>
              <input value={draft.id} readOnly aria-describedby="card-id-help" />
              <small id="card-id-help">카드 ID를 유지하면 기존 학습 기록이 보존됩니다.</small>
            </label>
          )}

          <label className="card-editor-field">
            <span>덱</span>
            <select value={draft.deck} onChange={(event) => update("deck", event.target.value as CardEditorDraft["deck"])}>
              {DECK_NAMES.map((deck) => <option key={deck} value={deck}>{deck}</option>)}
            </select>
          </label>

          <label className="card-editor-field">
            <span>태그</span>
            <input value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="home | week7 | firstline_only" />
            <small>| 또는 쉼표로 구분합니다.</small>
          </label>

          <label className="card-editor-field card-editor-field-wide">
            <span>영어 문제 *</span>
            <textarea id="card-editor-front" value={draft.front} onChange={(event) => update("front", event.target.value)} rows={3} required aria-invalid={isDirty && !draft.front.trim()} aria-describedby={validation.errors.length > 0 ? "card-editor-errors" : undefined} />
          </label>

          <label className="card-editor-field card-editor-field-wide">
            <span>한국어 뜻</span>
            <textarea value={draft.frontKo} onChange={(event) => update("frontKo", event.target.value)} rows={2} />
          </label>

          <label className="card-editor-field card-editor-field-wide">
            <span>첫 문장 *</span>
            <textarea id="card-editor-first-line" value={draft.firstLine} onChange={(event) => update("firstLine", event.target.value)} rows={2} required aria-invalid={isDirty && !draft.firstLine.trim()} aria-describedby={validation.errors.length > 0 ? "card-editor-errors" : undefined} />
          </label>

          <label className="card-editor-field">
            <span>힌트 제목</span>
            <input value={draft.hintTitle} onChange={(event) => update("hintTitle", event.target.value)} />
          </label>

          <label className="card-editor-field">
            <span>기억 팁</span>
            <textarea value={draft.memoryTip} onChange={(event) => update("memoryTip", event.target.value)} rows={3} />
          </label>

          <label className="card-editor-field">
            <span>주어 팁</span>
            <textarea value={draft.subjectTip} onChange={(event) => update("subjectTip", event.target.value)} rows={3} />
          </label>

          <label className="card-editor-field">
            <span>최소 답변</span>
            <textarea value={draft.minimum} onChange={(event) => update("minimum", event.target.value)} rows={3} />
          </label>

          <label className="card-editor-field card-editor-field-wide">
            <span>답변 흐름</span>
            <textarea value={draft.flow} onChange={(event) => update("flow", event.target.value)} rows={4} />
            <small>한 줄에 한 단계씩 입력합니다.</small>
          </label>

          <label className="card-editor-field card-editor-field-wide">
            <span>전체 답변 *</span>
            <textarea id="card-editor-answer" value={draft.answer} onChange={(event) => update("answer", event.target.value)} rows={9} required aria-invalid={isDirty && (!draft.answer.trim() || !validation.card)} aria-describedby={validation.errors.length > 0 ? "card-editor-errors" : undefined} />
            <small>첫 문장 또는 첫 줄은 위의 첫 문장과 같아야 합니다.</small>
          </label>

          <label className="card-editor-check card-editor-field-wide">
            <input type="checkbox" checked={draft.finalRep} onChange={(event) => update("finalRep", event.target.checked)} />
            <span>final_rep 카드</span>
          </label>
        </div>

        <section className="card-editor-review" aria-labelledby="card-editor-review-title">
          <h2 id="card-editor-review-title">저장 전 확인</h2>
          <p>
            {changedFields.length > 0
              ? `변경된 필드: ${changedFields.join(", ")}`
              : "변경된 필드가 없습니다."}
          </p>
          {validation.errors.length > 0 && (
            <ul id="card-editor-errors" className="card-editor-errors" role="alert">
              {validation.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
          {validation.warnings.length > 0 && (
            <ul className="card-editor-warnings">
              {validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          {submissionError && (
            <div className="card-editor-submission-error" role="alert">
              <p>{submissionError}</p>
              {duplicateCardId && onOpenDuplicate && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onOpenDuplicate(duplicateCardId)}
                >
                  기존 카드 열기
                </button>
              )}
            </div>
          )}
        </section>

        <div className="card-editor-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!isDirty || (!isCreate && !validation.card)}
            onClick={save}
          >
            {isCreate ? "카드 추가" : "저장"}
          </button>
          <button type="button" className="secondary-button" onClick={cancel}>취소</button>
        </div>
        {!isDirty && (
          <p className="disabled-reason">
            {isCreate
              ? "카드 내용을 입력하면 추가할 수 있습니다."
              : "수정한 내용이 있을 때 저장할 수 있습니다."}
          </p>
        )}
      </section>
    </main>
  );
}
