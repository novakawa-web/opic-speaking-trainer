import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  AnswerLearningAttemptsByDate,
  AnswerLearningStatuses,
  FirstLineStatusMap,
  OpicCard,
  StudyAttemptsByDate,
} from "../types";
import type { MyAnswers } from "../utils/myAnswerStorage";
import type { SavedPassageDataset } from "../utils/savedPassageStorage";
import {
  getPinnedPersonalMemoCount,
  type PersonalMemoDataset,
} from "../utils/personalMemoStorage";
import {
  getMemoCount,
  type CardMemos,
} from "../utils/cardMemoStorage";
import {
  BackupApplyError,
  MAX_BACKUP_FILE_BYTES,
  applyBackupWithSafety,
  createAppBackup,
  parseAndValidateBackup,
  readFullRestoreBackup,
  restoreFullRestoreBackup,
  serializeAppBackup,
  type BackupValidationResult,
  type KeyValueStorage,
} from "../utils/appBackup";
import { activateButton } from "../utils/buttonFocus";
import { savePostRestoreNavigation } from "../utils/postRestoreNavigation";

type BackupManagerProps = {
  cards: OpicCard[];
  statuses: FirstLineStatusMap;
  attemptsByDate: StudyAttemptsByDate;
  myAnswers: MyAnswers;
  cardMemos: CardMemos;
  savedPassages: SavedPassageDataset;
  personalMemos: PersonalMemoDataset;
  answerLearningStatuses: AnswerLearningStatuses;
  answerLearningAttemptsByDate: AnswerLearningAttemptsByDate;
  postRestoreMessage?: string;
};

function localBackupFileName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `opic-trainer-backup-${year}-${month}-${day}-${hours}${minutes}.json`;
}

function downloadJson(contents: string, fileName: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function countAttempts(attemptsByDate: StudyAttemptsByDate) {
  return Object.values(attemptsByDate).reduce(
    (count, attempts) => count + attempts.length,
    0,
  );
}

function getSessionStorage(): KeyValueStorage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function BackupManager({
  cards,
  statuses,
  attemptsByDate,
  myAnswers,
  cardMemos,
  savedPassages,
  personalMemos,
  answerLearningStatuses,
  answerLearningAttemptsByDate,
  postRestoreMessage,
}: BackupManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<BackupValidationResult | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [message, setMessage] = useState(postRestoreMessage ?? "");
  const [isReading, setIsReading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [safetyBackupAvailable, setSafetyBackupAvailable] = useState(
    () => readFullRestoreBackup() !== null,
  );

  const currentAttemptCount = countAttempts(attemptsByDate);
  const currentStatusCount = Object.values(statuses).filter(Boolean).length;
  const currentMyAnswerCount = Object.keys(myAnswers).length;
  const currentMemoCount = getMemoCount(cardMemos);
  const currentSavedPassageCount = savedPassages.passages.length;
  const currentPersonalMemoCount = personalMemos.memos.length;
  const currentAnswerLearningStatusCount = Object.keys(answerLearningStatuses).length;
  const currentAnswerLearningAttemptCount = Object.values(
    answerLearningAttemptsByDate,
  ).reduce((count, attempts) => count + attempts.length, 0);
  const backup = preview?.backup ?? null;
  const restoreDisabled =
    !backup || !preview?.canRestore || !restoreConfirmed || isRestoring;

  function createCurrentBackup() {
    return createAppBackup(
      cards,
      statuses,
      attemptsByDate,
      undefined,
      undefined,
      myAnswers,
      cardMemos,
      savedPassages,
      personalMemos,
      answerLearningStatuses,
      answerLearningAttemptsByDate,
    );
  }

  function handleExport() {
    const currentBackup = createCurrentBackup();
    downloadJson(
      serializeAppBackup(currentBackup),
      localBackupFileName(new Date(currentBackup.exportedAt)),
    );
    setMessage(
      `전체 백업을 만들었습니다: 카드 ${currentBackup.summary.cardCount}장, ` +
        `상태 ${currentBackup.summary.statusCount}개, 시도 ${currentBackup.summary.attemptCount}건, ` +
        `나만의 답변 ${currentBackup.summary.myAnswerCount}개, 메모 ${currentBackup.summary.memoCount}개, ` +
        `저장 지문 ${currentBackup.summary.savedPassageCount}개, ` +
        `개인 메모 ${currentBackup.summary.personalMemoCount}개`,
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setRestoreConfirmed(false);
    setMessage("");
    setIsReading(true);
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        setPreview(parseAndValidateBackup("", file.size));
        setMessage("파일이 10MB 제한을 초과했습니다.");
        return;
      }
      const result = parseAndValidateBackup(await file.text(), file.size);
      setPreview(result);
      setMessage(
        result.canRestore
          ? `복구 준비됨: 경고 ${result.warningCount}건, 복구할 수 있습니다.`
          : `검증 실패: 오류 ${result.errorCount}건을 확인해 주세요.`,
      );
    } catch {
      setPreview(null);
      setMessage("백업 파일을 읽지 못했습니다. JSON 파일인지 확인해 주세요.");
    } finally {
      setIsReading(false);
    }
  }

  function clearPreview() {
    setFileName("");
    setPreview(null);
    setRestoreConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function chooseAnotherFile() {
    clearPreview();
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  function scheduleReload() {
    window.speechSynthesis?.cancel();
    window.setTimeout(() => window.location.reload(), 450);
  }

  function handleRestore() {
    if (!backup || restoreDisabled) return;
    setIsRestoring(true);
    try {
      applyBackupWithSafety(
        backup,
        createCurrentBackup(),
        window.localStorage,
        getSessionStorage(),
      );
      setSafetyBackupAvailable(true);
      savePostRestoreNavigation("전체 복구가 완료됐어요.");
      setMessage("전체 복구 완료: 데이터를 저장했습니다. 안전하게 다시 불러오는 중입니다…");
      scheduleReload();
    } catch (error) {
      setIsRestoring(false);
      const rollbackMessage =
        error instanceof BackupApplyError && !error.rollbackSucceeded
          ? " 자동 롤백도 완료하지 못했습니다. 직전 안전 백업을 확인해 주세요."
          : " 기존 데이터는 자동으로 롤백했습니다.";
      setMessage(
        `${error instanceof Error ? error.message : "전체 복구에 실패했습니다."}${rollbackMessage}`,
      );
    }
  }

  function handleUndoRestore() {
    setIsRestoring(true);
    try {
      const restored = restoreFullRestoreBackup(
        window.localStorage,
        getSessionStorage(),
      );
      if (!restored) {
        setSafetyBackupAvailable(false);
        setIsRestoring(false);
        setMessage("되돌릴 직전 전체 복구 안전 백업이 없습니다.");
        return;
      }
      setSafetyBackupAvailable(false);
      savePostRestoreNavigation("직전 전체 복구 이전 상태로 돌아왔어요.");
      setMessage("직전 전체 복구 이전 상태를 저장했습니다. 다시 불러오는 중입니다…");
      scheduleReload();
    } catch (error) {
      setIsRestoring(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "직전 전체 복구 되돌리기에 실패했습니다.",
      );
    }
  }

  const visibleIssues = preview?.issues.slice(0, 40) ?? [];
  const hiddenIssueCount = Math.max(0, (preview?.issues.length ?? 0) - 40);
  const fileFlowStatus = isReading
    ? "파일을 확인하고 있어요."
    : preview
      ? preview.canRestore
        ? "복구 준비됨"
        : "복구 준비 불가"
      : fileName
        ? "파일을 확인하지 못했어요."
        : "선택한 백업 파일이 없어요.";

  return (
    <section id="backup-manager" className="backup-manager" aria-labelledby="backup-manager-title">
      <div className="section-title-row backup-manager-heading">
        <div>
          <p className="eyebrow">BACKUP &amp; RESTORE</p>
          <h2 id="backup-manager-title">백업 및 복구</h2>
          <p className="backup-manager-intro">
            카드, 학습 기록과 장기 설정을 한 JSON 파일로 보관합니다.
          </p>
        </div>
        <span className="backup-version-badge">JSON v1</span>
      </div>

      <p className="backup-privacy-note">
        백업 파일은 서버로 전송되지 않고 이 기기에서 생성됩니다. 카드 내용과 학습 기록이
        포함되므로 파일 공유에 주의해 주세요.
      </p>

      <div className="data-transfer-section is-export">
        <h3>전체 백업 내보내기</h3>
        <div className="backup-action-grid">
        <button
          type="button"
          className="backup-action-button"
          onClick={(event) => activateButton(event, handleExport)}
        >
          전체 백업 내보내기
        </button>
        </div>
      </div>

      <div className="data-transfer-section is-restore">
        <h3>JSON 백업 복구</h3>
        <p className="backup-helper-text">
          전체 백업 파일을 선택한 뒤 내용을 확인하고 복구합니다.
        </p>
      <ol className="file-workflow-steps" aria-label="JSON 전체 백업 복구 단계">
        <li className={preview || isReading ? "is-complete" : "is-current"}>
          <span>1</span>
          <strong>{fileName ? "파일 선택 완료" : "파일 선택"}</strong>
        </li>
        <li className={preview ? "is-complete" : isReading ? "is-current" : ""}>
          <span>2</span>
          <strong>복구 미리보기</strong>
        </li>
        <li className={preview ? "is-current" : ""}>
          <span>3</span>
          <strong>전체 복구 실행</strong>
        </li>
      </ol>

      <div className="backup-file-panel">
        <p className="file-picker-label" id="full-backup-json-file-label">
          전체 백업 JSON 파일
        </p>
        <div className="managed-file-picker">
        <input
          ref={fileInputRef}
          id="full-backup-json-file"
          className="managed-file-input"
          type="file"
          accept=".json,application/json"
          aria-label="JSON 백업 복구"
          aria-describedby="full-backup-json-file-help"
          onChange={handleFileChange}
        />
          <label
            id="full-backup-json-file-trigger"
            className="managed-file-trigger"
            htmlFor="full-backup-json-file"
          >
            JSON 백업 복구
          </label>
          <span className="managed-file-name">
            {fileName || "선택한 백업 파일이 없어요."}
          </span>
        </div>
        <p id="full-backup-json-file-help">
          전체 백업 파일을 선택한 뒤 내용을 확인하고 복구합니다. 최대 10MB까지 확인할 수 있어요.
        </p>
      </div>

      <p
        className={`file-flow-status ${preview?.canRestore ? "is-ready" : ""}`.trim()}
        role="status"
        aria-live="polite"
      >
        {fileFlowStatus}
      </p>

      {preview && (
        <div className="backup-preview">
          <div className="backup-preview-heading">
            <div>
              <p className="eyebrow">RESTORE PREVIEW</p>
              <p className={`transfer-ready-label ${preview.canRestore ? "" : "is-error"}`.trim()}>
                {preview.canRestore ? "복구 준비됨" : "오류를 확인해 주세요"}
              </p>
              <h3>복구할 백업 파일</h3>
              <p className="managed-preview-file-name">파일명: {fileName}</p>
            </div>
            <button
              type="button"
              className="backup-preview-close"
              onClick={(event) => activateButton(event, chooseAnotherFile)}
            >
              다른 파일 선택
            </button>
          </div>

          {backup && (
            <>
              <p className="backup-created-at">
                백업 생성: {new Date(backup.exportedAt).toLocaleString("ko-KR")}
              </p>
              <dl className="backup-comparison">
                <div>
                  <dt>카드</dt>
                  <dd>{cards.length} → <strong>{backup.summary.cardCount}</strong></dd>
                </div>
                <div>
                  <dt>상태 있는 카드</dt>
                  <dd>{currentStatusCount} → <strong>{backup.summary.statusCount}</strong></dd>
                </div>
                <div>
                  <dt>학습 시도</dt>
                  <dd>{currentAttemptCount} → <strong>{backup.summary.attemptCount}</strong></dd>
                </div>
                <div>
                  <dt>나만의 답변</dt>
                  <dd>{currentMyAnswerCount} → <strong>{backup.summary.myAnswerCount}</strong></dd>
                </div>
                <div>
                  <dt>메모</dt>
                  <dd>{currentMemoCount} → <strong>{backup.summary.memoCount}</strong></dd>
                </div>
                <div>
                  <dt>저장 지문</dt>
                  <dd>{currentSavedPassageCount} → <strong>{backup.summary.savedPassageCount}</strong></dd>
                </div>
                <div>
                  <dt>개인 학습 메모</dt>
                  <dd>{currentPersonalMemoCount} → <strong>{backup.summary.personalMemoCount}</strong></dd>
                </div>
                <div>
                  <dt>고정 개인 메모</dt>
                  <dd>{getPinnedPersonalMemoCount(personalMemos)} → <strong>{backup.summary.pinnedPersonalMemoCount}</strong></dd>
                </div>
                <div>
                  <dt>답변 익히기 상태</dt>
                  <dd>{currentAnswerLearningStatusCount} → <strong>{backup.summary.answerLearningStatusCount}</strong></dd>
                </div>
                <div>
                  <dt>답변 익히기 시도</dt>
                  <dd>{currentAnswerLearningAttemptCount} → <strong>{backup.summary.answerLearningAttemptCount}</strong></dd>
                </div>
                <div>
                  <dt>설정</dt>
                  <dd><strong>{backup.summary.settingsCount}개</strong></dd>
                </div>
                <div>
                  <dt>백업 version</dt>
                  <dd><strong>v{backup.version}</strong></dd>
                </div>
                <div>
                  <dt>검증</dt>
                  <dd><strong>오류 {preview.errorCount} · 경고 {preview.warningCount}</strong></dd>
                </div>
              </dl>
              <p className="backup-settings-summary">
                테마 {backup.data.settings.theme} · 학습일 {backup.data.settings.studyDayStartTime} ·
                TTS {backup.data.settings.ttsRate}x · 자동재생 {backup.data.settings.questionAutoplay ? "켬" : "끔"} ·
                자동 넘김 {backup.data.settings.autoAdvance ? "켬" : "끔"}
              </p>
            </>
          )}

          {visibleIssues.length > 0 && (
            <div className="backup-issues" aria-labelledby="backup-issues-title">
              <h4 id="backup-issues-title">검증 메시지</h4>
              <ul>
                {visibleIssues.map((issue, index) => (
                  <li className={`is-${issue.severity}`} key={`${issue.path}-${index}`}>
                    <strong>{issue.severity === "error" ? "오류" : "경고"}</strong>
                    <span>{issue.path}: {issue.message}</span>
                  </li>
                ))}
              </ul>
              {hiddenIssueCount > 0 && (
                <p className="backup-helper-text">추가 메시지 {hiddenIssueCount}건은 생략했습니다.</p>
              )}
            </div>
          )}

          {backup && (
            <label className="full-restore-confirmation">
              <input
                type="checkbox"
                checked={restoreConfirmed}
                onChange={(event) => setRestoreConfirmed(event.target.checked)}
              />
              <span>
                현재 카드 {cards.length}장·시도 {currentAttemptCount}건을 백업의 카드 {backup.summary.cardCount}장·
                시도 {backup.summary.attemptCount}건으로 전체 복구합니다. 현재 데이터는 먼저 자동 안전 백업됩니다.
              </span>
            </label>
          )}

          <button
            type="button"
            className="full-restore-button"
            disabled={restoreDisabled}
            aria-describedby="full-restore-disabled-help"
            onClick={(event) => activateButton(event, handleRestore)}
          >
            전체 복구 실행
          </button>
          <p id="full-restore-disabled-help" className="backup-helper-text">
            {!preview.canRestore
              ? "오류가 있는 백업은 복구할 수 없습니다."
              : !restoreConfirmed
                ? "비교 내용을 확인하고 전체 복구 확인에 체크해 주세요."
                : "복구 후 임시 화면·랜덤 순서는 초기화되고 앱을 다시 불러옵니다."}
          </p>
        </div>
      )}

      <div className="transfer-undo-area" aria-label="JSON 전체 복구 되돌리기">
        {safetyBackupAvailable ? (
          <>
            <button
              type="button"
              className="backup-action-button is-quiet"
              disabled={isRestoring}
              aria-describedby="full-restore-undo-help"
              onClick={(event) => activateButton(event, handleUndoRestore)}
            >
              직전 전체 복구 되돌리기
            </button>
            <p id="full-restore-undo-help" className="backup-helper-text">
              직전 전체 복구를 실행하기 전 상태로 한 번만 돌아갈 수 있습니다.
            </p>
          </>
        ) : (
          <p className="backup-helper-text">되돌릴 전체 복구가 없어요.</p>
        )}
      </div>

      </div>

      <p className="backup-result-message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
