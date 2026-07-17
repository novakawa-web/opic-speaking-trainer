import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { OpicCard } from "../types";
import {
  createSampleCards,
  exportCardsToTsv,
  parseCardTsv,
  type CardTsvParseResult,
} from "../utils/cardTsv";
import {
  applyCardImport,
  clearImportBackup,
  readImportBackup,
  saveActiveCards,
  saveImportBackup,
  type CardConflictPolicy,
} from "../utils/cardStorage";
import { activateButton } from "../utils/buttonFocus";

type CardDataManagerProps = {
  cards: OpicCard[];
  storageWarning?: boolean;
  onCardsChange: (cards: OpicCard[]) => void;
};

const policyLabels: Record<CardConflictPolicy, string> = {
  "new-only": "새 카드만 추가",
  overwrite: "같은 ID 덮어쓰기",
  replace: "전체 교체",
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function downloadTsv(contents: string, fileName: string) {
  const blob = new Blob([contents], {
    type: "text/tab-separated-values;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function previewStatusLabel(status: "new" | "existing" | "error") {
  if (status === "new") return "새 카드";
  if (status === "existing") return "기존 카드";
  return "오류";
}

export function CardDataManager({
  cards,
  storageWarning = false,
  onCardsChange,
}: CardDataManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CardTsvParseResult | null>(null);
  const [policy, setPolicy] = useState<CardConflictPolicy>("new-only");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(
    () => readImportBackup() !== null,
  );
  const [message, setMessage] = useState("");
  const [isReading, setIsReading] = useState(false);

  const hasBlockingErrors = (preview?.errorCount ?? 0) > 0;
  const hasImportableCards = (preview?.validCards.length ?? 0) > 0;
  const importDisabled =
    !preview ||
    hasBlockingErrors ||
    !hasImportableCards ||
    (policy === "replace" && !replaceConfirmed);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReading(true);
    setMessage("");
    setPolicy("new-only");
    setReplaceConfirmed(false);
    try {
      const parsed = parseCardTsv(await file.text(), cards);
      setFileName(file.name);
      setPreview(parsed);
      setMessage(
        parsed.errorCount > 0
          ? `검증에서 오류 ${parsed.errorCount}건을 찾았습니다. 파일을 수정한 뒤 다시 선택해 주세요.`
          : `검증 완료: ${parsed.validCards.length}장을 가져올 수 있습니다.`,
      );
    } catch {
      setFileName(file.name);
      setPreview(null);
      setMessage("파일을 읽을 수 없습니다. UTF-8 TSV 파일인지 확인해 주세요.");
    } finally {
      setIsReading(false);
    }
  }

  function clearSelectedFile() {
    setFileName("");
    setPreview(null);
    setReplaceConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleImport() {
    if (!preview || importDisabled) return;

    try {
      // The active card set is backed up before every successful import.
      saveImportBackup(cards);
      const result = applyCardImport(cards, preview.validCards, policy);
      saveActiveCards(result.cards);
      onCardsChange(result.cards);
      setBackupAvailable(true);
      setMessage(
        `가져오기 완료: 추가 ${result.added}장, 업데이트 ${result.updated}장, ` +
          `건너뜀 ${result.skipped}장, 전체 ${result.cards.length}장`,
      );
      clearSelectedFile();
    } catch {
      setMessage(
        "카드 데이터를 저장하지 못했습니다. 브라우저 저장 공간과 개인정보 보호 설정을 확인해 주세요.",
      );
    }
  }

  function handleRestore() {
    const backup = readImportBackup();
    if (!backup) {
      setBackupAvailable(false);
      setMessage("복구할 직전 가져오기 백업이 없습니다.");
      return;
    }

    try {
      saveActiveCards(backup.cards);
      onCardsChange(backup.cards);
      clearImportBackup();
      setBackupAvailable(false);
      clearSelectedFile();
      setMessage(`직전 가져오기 전 카드 ${backup.cards.length}장으로 복구했습니다.`);
    } catch {
      setMessage("백업 카드를 복구하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
    }
  }

  const visibleIssues = preview?.issues.slice(0, 40) ?? [];
  const hiddenIssueCount = Math.max(0, (preview?.issues.length ?? 0) - 40);

  return (
    <section className="card-data-manager" aria-labelledby="card-data-title">
      <div className="section-title-row data-manager-heading">
        <div>
          <p className="eyebrow">DATA MANAGEMENT</p>
          <h2 id="card-data-title">카드 데이터 관리</h2>
          <p className="data-manager-intro">
            Excel·Google Sheets에서 편집할 TSV를 내보내거나, 검증 후 안전하게 가져옵니다.
          </p>
        </div>
        <span className="card-count">활성 카드 {cards.length}장</span>
      </div>

      {storageWarning && (
        <p className="data-storage-warning" role="status">
          저장된 카드 데이터가 올바르지 않아 기본 카드로 안전하게 열었습니다.
        </p>
      )}

      <div className="data-action-grid">
        <button
          type="button"
          className="data-action-button"
          onClick={(event) =>
            activateButton(event, () =>
              downloadTsv(
                exportCardsToTsv(cards),
                `opic-cards-${localDateKey()}.tsv`,
              ),
            )
          }
        >
          TSV 내보내기
        </button>
        <button
          type="button"
          className="data-action-button is-secondary"
          onClick={(event) =>
            activateButton(event, () =>
              downloadTsv(
                exportCardsToTsv(createSampleCards()),
                "opic-cards-template.tsv",
              ),
            )
          }
        >
          샘플 TSV
        </button>
        <button
          type="button"
          className="data-action-button is-quiet"
          disabled={!backupAvailable}
          aria-describedby="restore-help"
          onClick={(event) => activateButton(event, handleRestore)}
        >
          직전 가져오기 되돌리기
        </button>
      </div>
      <p id="restore-help" className="data-helper-text">
        {backupAvailable
          ? "카드 내용만 복구하며 상태와 시도 기록은 유지됩니다."
          : "가져오기를 실행하면 직전 카드 구성이 한 번 자동 백업됩니다."}
      </p>

      <details className="data-format-help">
        <summary>TSV 형식과 편집 규칙</summary>
        <code>
          id · deck · tags · front · frontKo · firstLine · hintTitle · memoryTip ·
          subjectTip · minimum · flow · answer · final_rep
        </code>
        <p>
          tags는 <strong>|</strong> 또는 쉼표로 구분합니다. flow와 answer는 셀 안의 실제 줄바꿈이나
          <strong> \n</strong>으로 줄을 나눌 수 있고, final_rep는 true/false를 사용합니다.
        </p>
      </details>

      <div className="file-picker-panel">
        <label className="file-picker-label" htmlFor="card-tsv-file">
          TSV 파일 선택
        </label>
        <input
          ref={fileInputRef}
          id="card-tsv-file"
          className="file-picker-input"
          type="file"
          accept=".tsv,text/tab-separated-values,text/plain"
          onChange={handleFileChange}
        />
        <p className="data-helper-text">
          파일을 선택해도 즉시 반영되지 않습니다. 검증 결과와 충돌 정책을 먼저 확인합니다.
        </p>
      </div>

      {isReading && <p className="data-reading-message">파일을 확인하는 중입니다…</p>}

      {preview && (
        <div className="import-preview">
          <div className="import-preview-heading">
            <div>
              <p className="eyebrow">IMPORT PREVIEW</p>
              <h3>{fileName}</h3>
            </div>
            <button
              type="button"
              className="preview-clear-button"
              onClick={(event) => activateButton(event, clearSelectedFile)}
            >
              파일 닫기
            </button>
          </div>

          <dl className="preview-stats">
            <div><dt>전체 행</dt><dd>{preview.totalRows}</dd></div>
            <div><dt>정상 카드</dt><dd>{preview.validCards.length}</dd></div>
            <div><dt>오류 행</dt><dd>{preview.errorRowCount}</dd></div>
            <div><dt>중복 ID 행</dt><dd>{preview.duplicateIdCount}</dd></div>
            <div><dt>기존 ID 충돌</dt><dd>{preview.existingConflictCount}</dd></div>
          </dl>

          <div className="preview-card-list" aria-label="가져오기 카드 미리보기">
            {preview.rows.slice(0, 100).map((row) => (
              <article className={`preview-card is-${row.status}`} key={`${row.rowNumber}-${row.id}`}>
                <div className="preview-card-topline">
                  <span>행 {row.rowNumber}</span>
                  <span className={`preview-status is-${row.status}`}>
                    {previewStatusLabel(row.status)}
                  </span>
                </div>
                <strong>{row.id || "ID 없음"}</strong>
                <small>{row.deck || "덱 없음"}</small>
                <p>{row.front || "질문 없음"}</p>
              </article>
            ))}
          </div>
          {preview.rows.length > 100 && (
            <p className="data-helper-text">처음 100개 행만 미리보기에 표시합니다.</p>
          )}

          {visibleIssues.length > 0 && (
            <div className="validation-issues" aria-labelledby="validation-title">
              <h4 id="validation-title">검증 메시지</h4>
              <ul>
                {visibleIssues.map((issue, index) => (
                  <li className={`is-${issue.severity}`} key={`${issue.rowNumber}-${issue.field}-${index}`}>
                    <strong>{issue.severity === "error" ? "오류" : "경고"}</strong>
                    <span>
                      행 {issue.rowNumber}
                      {issue.cardId ? ` · ${issue.cardId}` : ""}
                      {issue.field ? ` · ${issue.field}` : ""}: {issue.message}
                    </span>
                  </li>
                ))}
              </ul>
              {hiddenIssueCount > 0 && (
                <p className="data-helper-text">추가 메시지 {hiddenIssueCount}건은 생략했습니다.</p>
              )}
            </div>
          )}

          <fieldset className="conflict-policy" disabled={hasBlockingErrors}>
            <legend>기존 카드 충돌 정책</legend>
            {(Object.keys(policyLabels) as CardConflictPolicy[]).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="card-conflict-policy"
                  value={value}
                  checked={policy === value}
                  onChange={() => {
                    setPolicy(value);
                    setReplaceConfirmed(false);
                  }}
                />
                <span>{policyLabels[value]}</span>
              </label>
            ))}
          </fieldset>

          <p className="data-helper-text policy-help">
            {policy === "new-only" && "기존 ID는 건너뛰고 새로운 ID만 뒤에 추가합니다."}
            {policy === "overwrite" && "같은 ID의 카드 내용만 바꾸며 해당 ID의 학습 기록은 유지합니다."}
            {policy === "replace" && "활성 카드 전체를 정상 TSV 카드로 교체합니다. 사라진 ID의 학습 기록은 삭제하지 않습니다."}
          </p>

          {policy === "replace" && (
            <label className="replace-confirmation">
              <input
                type="checkbox"
                checked={replaceConfirmed}
                onChange={(event) => setReplaceConfirmed(event.target.checked)}
              />
              <span>
                현재 {cards.length}장을 가져올 {preview.validCards.length}장으로 전체 교체하는 것을 확인했습니다.
              </span>
            </label>
          )}

          <button
            type="button"
            className="import-execute-button"
            disabled={importDisabled}
            aria-describedby="import-disabled-reason"
            onClick={(event) => activateButton(event, handleImport)}
          >
            가져오기 실행
          </button>
          <p id="import-disabled-reason" className="data-helper-text">
            {hasBlockingErrors
              ? "오류가 하나라도 있으면 가져올 수 없습니다. 모든 오류를 수정해 주세요."
              : policy === "replace" && !replaceConfirmed
                ? "전체 교체 확인에 체크해야 실행할 수 있습니다."
                : !hasImportableCards
                  ? "가져올 정상 카드가 없습니다."
                  : "실행 직전 현재 카드 데이터가 자동으로 한 번 백업됩니다."}
          </p>
        </div>
      )}

      <p className="data-result-message" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
