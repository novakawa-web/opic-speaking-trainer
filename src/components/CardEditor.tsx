import { useEffect, useMemo, useState } from "react";
import type { OpicCard } from "../types";
import {
  createCardEditorDraft,
  getChangedCardFields,
  validateCardEditorDraft,
  type CardEditorDraft,
} from "../utils/cardEditor";
import { DECK_NAMES } from "../utils/cardStorage";

type CardEditorProps = {
  card: OpicCard;
  onSave: (card: OpicCard) => void;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
};

export function CardEditor({ card, onSave, onCancel, onDirtyChange }: CardEditorProps) {
  const [draft, setDraft] = useState<CardEditorDraft>(() =>
    createCardEditorDraft(card),
  );
  const validation = useMemo(() => validateCardEditorDraft(draft), [draft]);
  const changedFields = useMemo(
    () => getChangedCardFields(card, draft),
    [card, draft],
  );
  const isDirty = changedFields.length > 0;

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
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function cancel() {
    if (isDirty && !window.confirm("저장하지 않은 카드 수정 내용을 버릴까요?")) return;
    onCancel();
  }

  function save() {
    if (!validation.card || !isDirty) return;
    onSave(validation.card);
  }

  return (
    <main className="card-editor-page">
      <section className="card-editor-panel" aria-labelledby="card-editor-title">
        <div className="card-editor-heading">
          <div>
            <p className="eyebrow">EDIT CARD</p>
            <h1 id="card-editor-title">카드 수정</h1>
          </div>
          <button type="button" className="secondary-button" onClick={cancel}>
            상세로 돌아가기
          </button>
        </div>

        <div className="card-editor-grid">
          <label className="card-editor-field card-editor-field-wide">
            <span>카드 ID</span>
            <input value={draft.id} readOnly aria-describedby="card-id-help" />
            <small id="card-id-help">카드 ID를 유지하면 기존 학습 기록이 보존됩니다.</small>
          </label>

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
            <textarea value={draft.front} onChange={(event) => update("front", event.target.value)} rows={3} required />
          </label>

          <label className="card-editor-field card-editor-field-wide">
            <span>한국어 뜻</span>
            <textarea value={draft.frontKo} onChange={(event) => update("frontKo", event.target.value)} rows={2} />
          </label>

          <label className="card-editor-field card-editor-field-wide">
            <span>첫 문장 *</span>
            <textarea value={draft.firstLine} onChange={(event) => update("firstLine", event.target.value)} rows={2} required />
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
            <textarea value={draft.answer} onChange={(event) => update("answer", event.target.value)} rows={9} required />
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
            <ul className="card-editor-errors" role="alert">
              {validation.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
          {validation.warnings.length > 0 && (
            <ul className="card-editor-warnings">
              {validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
        </section>

        <div className="card-editor-actions">
          <button type="button" className="primary-button" disabled={!validation.card || !isDirty} onClick={save}>저장</button>
          <button type="button" className="secondary-button" onClick={cancel}>취소</button>
        </div>
        {!isDirty && <p className="disabled-reason">수정한 내용이 있을 때 저장할 수 있습니다.</p>}
      </section>
    </main>
  );
}
