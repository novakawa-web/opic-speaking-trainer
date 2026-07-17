import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import type { FirstLineStatus, OpicCard } from "../types";
import { activateButton } from "../utils/buttonFocus";
import { extractMyFirstLine, normalizeMyAnswerText } from "../utils/myAnswerStorage";
import { readTtsRate } from "../utils/ttsSettings";
import { ShortcutHelp } from "./ShortcutHelp";
import { StudyNavigation } from "./StudyNavigation";
import {
  CardMemoSection,
  type CardMemoSectionHandle,
} from "./CardMemoSection";
import type { CardMemo } from "../utils/cardMemoStorage";
import {
  createModelAnswerSource,
  createMyAnswerSource,
  type ShadowingSource,
} from "../utils/shadowingPlayer";
import {
  readCardDetailUiSession,
  updateCardDetailUiSession,
} from "../utils/uiSessionStorage";
import { isRecordingBusy, type RecordingStatus } from "../utils/audioRecorder";
import {
  AudioRecorder,
  type AudioRecorderHandle,
} from "./AudioRecorder";

type CardDetailProps = {
  card: OpicCard;
  status: FirstLineStatus;
  myAnswer?: string;
  memos: CardMemo[];
  focusMemoId?: string | null;
  currentPosition: number;
  totalCards: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onStartDrill: () => void;
  onSaveMyAnswer: (cardId: string, answer: string) => void;
  onDeleteMyAnswer: (cardId: string) => void;
  onCreateMemo: (cardId: string, content: string) => void;
  onUpdateMemo: (cardId: string, memoId: string, content: string) => void;
  onToggleMemoPinned: (cardId: string, memoId: string) => void;
  onDeleteMemo: (cardId: string, memoId: string) => void;
  onRestoreMemo: (memo: CardMemo, index: number) => void;
  onStartShadowing: (source: ShadowingSource) => void;
};

type AnswerTab = "model" | "mine";

const statusLabels = {
  success: "성공",
  again: "연습 필요",
  hard: "어려움",
} as const;

const detailShortcuts = [
  { keyLabel: "Q", description: "이전 카드" },
  { keyLabel: "W", description: "다음 카드" },
  { keyLabel: "Enter", description: "다음 카드" },
  { keyLabel: "Space", description: "힌트 보기·숨기기" },
];

export function CardDetail({
  card,
  status,
  myAnswer,
  memos,
  focusMemoId,
  currentPosition,
  totalCards,
  canGoPrevious,
  canGoNext,
  onBack,
  onPrevious,
  onNext,
  onStartDrill,
  onSaveMyAnswer,
  onDeleteMyAnswer,
  onCreateMemo,
  onUpdateMemo,
  onToggleMemoPinned,
  onDeleteMemo,
  onRestoreMemo,
  onStartShadowing,
}: CardDetailProps) {
  const [initialUiSession] = useState(() =>
    readCardDetailUiSession(card.id, Boolean(myAnswer)),
  );
  const [showHint, setShowHint] = useState(initialUiSession.showHint);
  const [showAnswer, setShowAnswer] = useState(initialUiSession.showAnswer);
  const [answerTab, setAnswerTab] = useState<AnswerTab>(initialUiSession.answerTab);
  const [isEditing, setIsEditing] = useState(initialUiSession.myAnswerEditing);
  const [draft, setDraft] = useState(initialUiSession.myAnswerDraft);
  const [message, setMessage] = useState("");
  const [deletedAnswer, setDeletedAnswer] = useState<string | null>(null);
  const [ttsRate] = useState(readTtsRate);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const memoSectionRef = useRef<CardMemoSectionHandle>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>("idle");
  const {
    isSupported,
    activeTarget,
    message: ttsMessage,
    speak,
    stop,
  } = useSpeechSynthesis(ttsRate);
  const normalizedDraft = normalizeMyAnswerText(draft);
  const originalAnswer = myAnswer ?? "";
  const isDirty = isEditing && normalizedDraft !== originalAnswer;
  const myFirstLine = myAnswer ? extractMyFirstLine(myAnswer) : "";
  const modelAnswerText = card.back.join("\n");
  const recorderBusy = isRecordingBusy(recordingStatus);
  const shadowingSource =
    answerTab === "model"
      ? createModelAnswerSource(card)
      : myAnswer
        ? createMyAnswerSource(card, myAnswer)
        : null;
  const toggleHint = useCallback(() => {
    setShowHint((current) => !current);
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(
      "저장하지 않은 나만의 답변 수정 내용이 있습니다. 변경 내용을 버릴까요?",
    );
  }, [isDirty]);

  const runAfterDiscardCheck = useCallback(
    (action: () => void) => {
      if (!confirmDiscard()) return;
      if (!(memoSectionRef.current?.confirmDiscardAndClose() ?? true)) return;
      recorderRef.current?.clearRecording();
      stop();
      setIsEditing(false);
      action();
    },
    [confirmDiscard, stop],
  );

  // A discarded mobile tab restores the same detail controls and unsaved answer draft.
  useLayoutEffect(() => {
    const restored = readCardDetailUiSession(card.id, Boolean(myAnswer));
    setShowHint(restored.showHint);
    setShowAnswer(restored.showAnswer);
    setAnswerTab(restored.answerTab);
    setIsEditing(restored.myAnswerEditing);
    setDraft(restored.myAnswerDraft);
    setMessage("");
    setDeletedAnswer(null);
    recorderRef.current?.clearRecording();
    stop();
  }, [card.id, stop]);

  useEffect(() => {
    updateCardDetailUiSession(card.id, Boolean(myAnswer), {
      showHint,
      showAnswer,
      answerTab,
      myAnswerEditing: isEditing,
      myAnswerDraft: isEditing ? draft : "",
    });
  }, [answerTab, card.id, draft, isEditing, myAnswer, showAnswer, showHint]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const goPrevious = useCallback(
    () => runAfterDiscardCheck(onPrevious),
    [onPrevious, runAfterDiscardCheck],
  );
  const goNext = useCallback(
    () => runAfterDiscardCheck(onNext),
    [onNext, runAfterDiscardCheck],
  );

  useKeyboardShortcuts({
    q: canGoPrevious ? goPrevious : undefined,
    w: canGoNext ? goNext : undefined,
    Enter: canGoNext ? goNext : undefined,
    Space: toggleHint,
  });

  function startEditing(seed: string) {
    if (!(memoSectionRef.current?.confirmDiscardAndClose() ?? true)) return;
    recorderRef.current?.clearRecording();
    stop();
    setAnswerTab("mine");
    setDraft(seed);
    setIsEditing(true);
    setMessage("");
  }

  function cancelEditing() {
    if (!confirmDiscard()) return;
    setDraft("");
    setIsEditing(false);
    setMessage("수정을 취소했습니다.");
  }

  function saveAnswer() {
    if (!normalizedDraft) return;
    onSaveMyAnswer(card.id, normalizedDraft);
    setDraft("");
    setIsEditing(false);
    setAnswerTab("mine");
    setDeletedAnswer(null);
    setMessage("나만의 답변을 저장했습니다.");
  }

  function changeTab(nextTab: AnswerTab) {
    if (nextTab === answerTab || !confirmDiscard()) return;
    recorderRef.current?.clearRecording();
    stop();
    setIsEditing(false);
    setDraft("");
    setAnswerTab(nextTab);
  }

  function toggleSpeech(
    text: string,
    target: "modelAnswer" | "myAnswer" | "myFirstLine",
  ) {
    if (recorderBusy) return;
    recorderRef.current?.stopPlayback();
    if (activeTarget === target) stop();
    else speak(text, target);
  }

  function closeDeleteDialog() {
    deleteDialogRef.current?.close();
    window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
  }

  function confirmDelete() {
    if (!myAnswer) return;
    const removed = myAnswer;
    stop();
    onDeleteMyAnswer(card.id);
    setDeletedAnswer(removed);
    setAnswerTab("model");
    setIsEditing(false);
    setMessage("나만의 답변을 삭제했습니다.");
    closeDeleteDialog();
  }

  function undoDelete() {
    if (!deletedAnswer) return;
    onSaveMyAnswer(card.id, deletedAnswer);
    setDeletedAnswer(null);
    setAnswerTab("mine");
    setMessage("방금 삭제한 나만의 답변을 복원했습니다.");
  }

  function prepareMemoEditing() {
    if (!confirmDiscard()) return false;
    stop();
    setIsEditing(false);
    setDraft("");
    return true;
  }

  return (
    <main className="detail-page">
      <StudyNavigation
        currentPosition={currentPosition}
        totalCards={totalCards}
        backLabel="카드 목록"
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onBack={() => runAfterDiscardCheck(onBack)}
        onPrevious={goPrevious}
        onNext={goNext}
      />

      <article className="question-panel">
        <div className="question-content">
          <div className="detail-meta">
            <span className="mode-chip">SPEAK FIRST</span>
            {status && (
              <span className={`status-badge status-${status}`}>
                첫 문장 {statusLabels[status]}
              </span>
            )}
          </div>

          <p className="detail-deck">{card.deck}</p>
          <h1>{card.front}</h1>
          <p className="speak-prompt">
            답을 보기 전에, 알고 있는 문장부터 소리 내어 말해보세요.
          </p>

          <div className="tag-row centered-tags">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className={`tag-badge ${tag === "final_rep" ? "tag-final" : ""}`}
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="detail-actions">
            <button
              className="primary-button"
              type="button"
              aria-label="첫 문장 훈련 시작"
              onClick={(event) =>
                activateButton(event, () => runAfterDiscardCheck(onStartDrill))
              }
            >
              첫 문장
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-expanded={showHint}
              aria-pressed={showHint}
              aria-label={showHint ? "힌트 숨기기" : "힌트 보기"}
              aria-keyshortcuts="Space"
              onClick={(event) => activateButton(event, toggleHint)}
            >
              힌트
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-expanded={showAnswer}
              aria-pressed={showAnswer}
              aria-label={showAnswer ? "답변 숨기기" : "답변 보기"}
              onClick={(event) =>
                activateButton(event, () => {
                  if (showAnswer && !confirmDiscard()) return;
                  if (showAnswer) setIsEditing(false);
                  setShowAnswer((value) => !value);
                })
              }
            >
              답변
            </button>
          </div>
        </div>
      </article>

      {showHint && (
        <section className="hint-panel" aria-label="암기 힌트">
          <div className="panel-heading">
            <span className="panel-icon" aria-hidden="true">
              ✦
            </span>
            <div>
              <p className="eyebrow">MEMORY HINT</p>
              <h2>{card.hint.title}</h2>
            </div>
          </div>

          <dl className="hint-list">
            <div>
              <dt>암기 흐름</dt>
              <dd>{card.hint.memoryTip}</dd>
            </div>
            {card.hint.subjectTip && (
              <div>
                <dt>주어 · 문장 팁</dt>
                <dd>{card.hint.subjectTip}</dd>
              </div>
            )}
            <div>
              <dt>최소 암기</dt>
              <dd className="minimum-line">{card.hint.minimum}</dd>
            </div>
          </dl>

          <div className="flow-box">
            <h3>한글 흐름</h3>
            <ol>
              {card.hint.flow.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {showAnswer && (
        <section className="answer-panel" aria-label="영어 답변">
          <div className="panel-heading answer-panel-heading">
            <span className="panel-icon answer-icon" aria-hidden="true">
              A
            </span>
            <div>
              <p className="eyebrow">ANSWER LIBRARY</p>
              <h2>답변 연습</h2>
            </div>
          </div>

          <div className="answer-tabs" role="tablist" aria-label="답변 종류">
            <button
              id="model-answer-tab"
              type="button"
              role="tab"
              aria-selected={answerTab === "model"}
              aria-controls="model-answer-panel"
              onClick={() => changeTab("model")}
            >
              기본 답변
            </button>
            <button
              id="my-answer-tab"
              type="button"
              role="tab"
              aria-selected={answerTab === "mine"}
              aria-controls="my-answer-panel"
              onClick={() => changeTab("mine")}
            >
              나만의 답변
              {myAnswer && (
                <span className="tab-saved-dot" aria-label="저장됨">●</span>
              )}
            </button>
          </div>

          <div className="answer-shadowing-entry">
            <button
              type="button"
              className="primary-button"
              disabled={!shadowingSource || isEditing || recorderBusy}
              onClick={() => {
                if (!shadowingSource) return;
                runAfterDiscardCheck(() => onStartShadowing(shadowingSource));
              }}
            >
              ▶ 현재 답변으로 쉐도잉 연습
            </button>
            <span>
              {answerTab === "model"
                ? "기본 답변을 문장별로 재생합니다."
                : myAnswer
                  ? "나만의 답변을 문장별로 재생합니다."
                  : "나만의 답변을 먼저 작성해 주세요."}
            </span>
          </div>

          {answerTab === "model" ? (
            <div
              id="model-answer-panel"
              role="tabpanel"
              aria-labelledby="model-answer-tab"
            >
              <div className="answer-toolbar">
                <button
                  type="button"
                  className={`speech-button ${activeTarget === "modelAnswer" ? "is-playing" : ""}`}
                  disabled={!isSupported || recorderBusy}
                  onClick={() => toggleSpeech(modelAnswerText, "modelAnswer")}
                >
                  {activeTarget === "modelAnswer"
                    ? "기본 답변 듣기 중지"
                    : "기본 답변 듣기"}
                </button>
                <span>기본 답변은 수정되지 않습니다.</span>
              </div>
              <div className="answer-lines">
                {card.back.map((line, index) => (
                  <p key={`${card.id}-${index}`}>
                    <span>{index + 1}</span>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div
              id="my-answer-panel"
              role="tabpanel"
              aria-labelledby="my-answer-tab"
            >
              {isEditing ? (
                <div className="my-answer-editor">
                  <label htmlFor={`my-answer-${card.id}`}>나만의 답변</label>
                  <textarea
                    id={`my-answer-${card.id}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        saveAnswer();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEditing();
                      }
                    }}
                    placeholder="내 상황에 맞는 영어 답변을 작성해 보세요."
                    autoFocus
                  />
                  <div className="editor-meta">
                    <span>{draft.length.toLocaleString()}자</span>
                    <span>{draft ? draft.split(/\r?\n/).length : 0}줄</span>
                  </div>
                  <div className="editor-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!normalizedDraft}
                      onClick={saveAnswer}
                    >
                      저장
                    </button>
                    <button type="button" className="secondary-button" onClick={cancelEditing}>
                      취소
                    </button>
                  </div>
                  {!normalizedDraft && (
                    <p className="disabled-reason">
                      공백이 아닌 답변을 입력하면 저장할 수 있습니다.
                    </p>
                  )}
                  <p className="editor-shortcut-help">Ctrl/Cmd + Enter 저장 · Esc 취소</p>
                </div>
              ) : myAnswer ? (
                <div className="my-answer-view">
                  <div className="my-answer-toolbar">
                    <button
                      type="button"
                      className={`speech-button ${activeTarget === "myAnswer" ? "is-playing" : ""}`}
                      disabled={!isSupported || recorderBusy}
                      onClick={() => toggleSpeech(myAnswer, "myAnswer")}
                    >
                      {activeTarget === "myAnswer" ? "전체 듣기 중지" : "전체 듣기"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startEditing(myAnswer)}
                    >
                      수정
                    </button>
                    <button
                      ref={deleteTriggerRef}
                      type="button"
                      className="secondary-button is-danger-quiet"
                      onClick={() => {
                        stop();
                        deleteDialogRef.current?.showModal();
                      }}
                    >
                      삭제
                    </button>
                  </div>

                  <div className="my-first-line-box">
                    <div>
                      <span>나의 첫 문장</span>
                      <p>{myFirstLine}</p>
                    </div>
                    <button
                      type="button"
                      className={`speech-button ${activeTarget === "myFirstLine" ? "is-playing" : ""}`}
                      disabled={!isSupported || !myFirstLine || recorderBusy}
                      onClick={() => toggleSpeech(myFirstLine, "myFirstLine")}
                    >
                      {activeTarget === "myFirstLine"
                        ? "첫 문장 듣기 중지"
                        : "나의 첫 문장 듣기"}
                    </button>
                  </div>
                  <div className="my-answer-text">{myAnswer}</div>
                </div>
              ) : (
                <div className="my-answer-empty">
                  <p>아직 작성한 답변이 없어요.</p>
                  <div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => startEditing("")}
                    >
                      빈 답변으로 작성
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startEditing(modelAnswerText)}
                    >
                      기본 답변 복사해서 수정
                    </button>
                  </div>
                  <small>나만의 답변은 전체 JSON 백업에 포함됩니다.</small>
                </div>
              )}
            </div>
          )}

          {!isEditing && (answerTab === "model" || Boolean(myAnswer)) && (
            <AudioRecorder
              ref={recorderRef}
              className="detail-audio-recorder"
              scopeLabel={
                answerTab === "model"
                  ? "기본 답변 전체를 말해보세요."
                  : "나만의 답변 전체를 말해보세요."
              }
              onBeforeRecord={stop}
              onBeforePlayback={stop}
              onStatusChange={setRecordingStatus}
            />
          )}

          <div className="answer-message" aria-live="polite">
            {message}
            {deletedAnswer && (
              <button type="button" onClick={undoDelete}>
                방금 삭제한 답변 되돌리기
              </button>
            )}
          </div>
          <p className="tts-detail-message" aria-live="polite">
            {!isSupported
              ? "이 브라우저에서는 음성 읽기를 지원하지 않습니다."
              : ttsMessage}
          </p>
        </section>
      )}

      <CardMemoSection
        ref={memoSectionRef}
        cardId={card.id}
        cardTitle={card.hint.title}
        hasMyAnswer={Boolean(myAnswer)}
        memos={memos}
        focusMemoId={focusMemoId}
        onBeforeStartEditing={prepareMemoEditing}
        onCreate={(content) => onCreateMemo(card.id, content)}
        onUpdate={(memoId, content) => onUpdateMemo(card.id, memoId, content)}
        onTogglePinned={(memoId) => onToggleMemoPinned(card.id, memoId)}
        onDelete={(memoId) => onDeleteMemo(card.id, memoId)}
        onRestore={onRestoreMemo}
      />

      <ShortcutHelp items={detailShortcuts} defaultExpanded={false} />

      <dialog
        ref={deleteDialogRef}
        className="my-answer-delete-dialog"
        aria-labelledby="my-answer-delete-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDeleteDialog();
        }}
      >
        <h2 id="my-answer-delete-title">나만의 답변을 삭제할까요?</h2>
        <p>
          <strong>{card.hint.title}</strong>에 저장한 개인 답변만 삭제됩니다.
          기본 답변에는 영향이 없습니다.
        </p>
        <div>
          <button type="button" className="secondary-button" onClick={closeDeleteDialog}>
            취소
          </button>
          <button
            type="button"
            className="delete-confirm-button"
            onClick={confirmDelete}
            autoFocus
          >
            나만의 답변 삭제
          </button>
        </div>
      </dialog>
    </main>
  );
}
