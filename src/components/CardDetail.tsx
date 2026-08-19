import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import type { AnswerLearningStatus, FirstLineStatus, OpicCard } from "../types";
import { activateButton } from "../utils/buttonFocus";
import { extractMyFirstLine } from "../utils/myAnswerStorage";
import {
  createAnswerDisplayRows,
  joinAnswerLines,
} from "../utils/answerText";
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
import { isFirstLineOnlyCard } from "../utils/cardContent";
import { CardEditor } from "./CardEditor";

type CardDetailProps = {
  card: OpicCard;
  status: FirstLineStatus;
  answerLearningStatus: AnswerLearningStatus | null;
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
  onStartAnswerLearning: () => void;
  onSaveMyAnswer: (cardId: string, answer: string) => void;
  onDeleteMyAnswer: (cardId: string) => void;
  onCreateMemo: (cardId: string, content: string) => void;
  onUpdateMemo: (cardId: string, memoId: string, content: string) => void;
  onToggleMemoPinned: (cardId: string, memoId: string) => void;
  onDeleteMemo: (cardId: string, memoId: string) => void;
  onRestoreMemo: (memo: CardMemo, index: number) => void;
  onStartShadowing: (source: ShadowingSource) => void;
  isArchived: boolean;
  hasRelatedRecords: boolean;
  onSaveCardEdit: (card: OpicCard, myAnswer: string) => boolean;
  cardEditError?: string | null;
  onCardEditInputChange?: () => void;
  onArchiveCard: (cardId: string, archived: boolean) => void;
  onDeleteCard: (cardId: string) => void;
  destructiveActionsBlocked?: boolean;
  registerHomeNavigationGuard?: (guard: () => boolean) => () => void;
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
  answerLearningStatus,
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
  onStartAnswerLearning,
  onSaveMyAnswer,
  onDeleteMyAnswer,
  onCreateMemo,
  onUpdateMemo,
  onToggleMemoPinned,
  onDeleteMemo,
  onRestoreMemo,
  onStartShadowing,
  isArchived,
  hasRelatedRecords,
  onSaveCardEdit,
  cardEditError,
  onCardEditInputChange,
  onArchiveCard,
  onDeleteCard,
  destructiveActionsBlocked = false,
  registerHomeNavigationGuard,
}: CardDetailProps) {
  const [initialUiSession] = useState(() =>
    readCardDetailUiSession(card.id, Boolean(myAnswer)),
  );
  const [showHint, setShowHint] = useState(initialUiSession.showHint);
  const [showAnswer, setShowAnswer] = useState(initialUiSession.showAnswer);
  const [answerTab, setAnswerTab] = useState<AnswerTab>(initialUiSession.answerTab);
  const [message, setMessage] = useState("");
  const [deletedAnswer, setDeletedAnswer] = useState<string | null>(null);
  const [ttsRate] = useState(readTtsRate);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const cardDeleteDialogRef = useRef<HTMLDialogElement>(null);
  const cardDeleteTriggerRef = useRef<HTMLButtonElement>(null);
  const memoSectionRef = useRef<CardMemoSectionHandle>(null);
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [isCardEditorDirty, setIsCardEditorDirty] = useState(false);
  const [cardEditorMyAnswerSeed, setCardEditorMyAnswerSeed] = useState<string | null>(null);
  const {
    isSupported,
    activeTarget,
    message: ttsMessage,
    speak,
    stop,
  } = useSpeechSynthesis(ttsRate);
  const myFirstLine = myAnswer ? extractMyFirstLine(myAnswer) : "";
  const modelAnswerText = joinAnswerLines(card.back);
  const modelAnswerRows = createAnswerDisplayRows(modelAnswerText);
  const myAnswerRows = myAnswer ? createAnswerDisplayRows(myAnswer) : [];
  const firstLineOnly = isFirstLineOnlyCard(card);
  const shadowingSource =
    answerTab === "model"
      ? firstLineOnly ? null : createModelAnswerSource(card)
      : myAnswer
        ? createMyAnswerSource(card, myAnswer)
        : null;
  const toggleHint = useCallback(() => {
    setShowHint((current) => !current);
  }, []);

  const runAfterDiscardCheck = useCallback(
    (action: () => void) => {
      if (!(memoSectionRef.current?.confirmDiscardAndClose() ?? true)) return;
      stop();
      action();
    },
    [stop],
  );

  const confirmDetailNavigation = useCallback(() => {
    if (
      isEditingCard &&
      isCardEditorDirty &&
      !window.confirm("저장하지 않은 카드와 나만의 답변 수정 내용이 있습니다. 현재 화면을 나갈까요?")
    ) {
      return false;
    }
    if (!(memoSectionRef.current?.confirmDiscardAndClose() ?? true)) return false;
    stop();
    return true;
  }, [isCardEditorDirty, isEditingCard, stop]);

  useLayoutEffect(() => {
    if (!registerHomeNavigationGuard) return;
    return registerHomeNavigationGuard(confirmDetailNavigation);
  }, [confirmDetailNavigation, registerHomeNavigationGuard]);

  // A discarded mobile tab restores the same detail controls.
  useLayoutEffect(() => {
    const restored = readCardDetailUiSession(card.id, Boolean(myAnswer));
    setShowHint(restored.showHint);
    setShowAnswer(restored.showAnswer);
    setAnswerTab(restored.answerTab);
    setIsEditingCard(false);
    setIsCardEditorDirty(false);
    setCardEditorMyAnswerSeed(null);
    setMessage("");
    setDeletedAnswer(null);
    stop();
  }, [card.id, stop]);

  useEffect(() => {
    updateCardDetailUiSession(card.id, Boolean(myAnswer), {
      showHint,
      showAnswer,
      answerTab,
      myAnswerEditing: false,
      myAnswerDraft: "",
    });
  }, [answerTab, card.id, myAnswer, showAnswer, showHint]);

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
  }, !isEditingCard);

  function changeTab(nextTab: AnswerTab) {
    if (nextTab === answerTab) return;
    stop();
    setAnswerTab(nextTab);
  }

  function toggleSpeech(
    text: string,
    target: "modelAnswer" | "myAnswer" | "myFirstLine",
  ) {
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
    stop();
    return true;
  }

  function startCardEditing(seed = myAnswer ?? "") {
    runAfterDiscardCheck(() => {
      onCardEditInputChange?.();
      setCardEditorMyAnswerSeed(seed);
      setIsEditingCard(true);
      setMessage("");
    });
  }

  function saveCard(nextCard: OpicCard, nextMyAnswer = "") {
    if (!onSaveCardEdit(nextCard, nextMyAnswer)) return;
    setAnswerTab(nextMyAnswer ? "mine" : "model");
    setDeletedAnswer(null);
    setMessage("카드와 나만의 답변을 저장했습니다.");
    setCardEditorMyAnswerSeed(null);
    setIsEditingCard(false);
  }

  function closeCardDeleteDialog() {
    cardDeleteDialogRef.current?.close();
    window.setTimeout(() => cardDeleteTriggerRef.current?.focus(), 0);
  }

  if (isEditingCard) {
    return (
      <CardEditor
        card={card}
        myAnswer={myAnswer}
        myAnswerSeed={cardEditorMyAnswerSeed ?? myAnswer ?? ""}
        includeMyAnswer
        onSave={saveCard}
        onCancel={() => {
          onCardEditInputChange?.();
          setCardEditorMyAnswerSeed(null);
          setIsEditingCard(false);
        }}
        onDirtyChange={setIsCardEditorDirty}
        submissionError={cardEditError}
        onInputChange={onCardEditInputChange}
        savingBlocked={destructiveActionsBlocked}
      />
    );
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
            {firstLineOnly && <span className="first-line-only-badge">첫 문장 전용 카드</span>}
            {status && (
              <span className={`status-badge status-${status}`}>
                첫 문장 {statusLabels[status]}
              </span>
            )}
            {answerLearningStatus && (
              <span className={`answer-learning-badge answer-status-${answerLearningStatus}`}>
                답변 {answerLearningStatus === "hard" ? "어려움" : answerLearningStatus === "learning" ? "익히는 중" : "말할 수 있음"}
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
                  setShowAnswer((value) => !value);
                })
              }
            >
              답변
            </button>
          </div>
          <button
            type="button"
            className="secondary-button detail-answer-learning-entry"
            onClick={(event) => activateButton(event, () => runAfterDiscardCheck(onStartAnswerLearning))}
          >
            이 카드 답변 익히기
          </button>
        </div>
      </article>

      <section className="card-management-panel" aria-labelledby="card-management-title">
        <div>
          <p className="eyebrow">CARD MANAGEMENT</p>
          <h2 id="card-management-title">카드 관리</h2>
        </div>
        <div className="card-management-primary-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => startCardEditing()}
            disabled={destructiveActionsBlocked}
          >
            수정
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={destructiveActionsBlocked}
            onClick={() => {
              const nextArchived = !isArchived;
              onArchiveCard(card.id, nextArchived);
            }}
          >
            {isArchived ? "복원" : "보관"}
          </button>
        </div>
        <p className="card-management-help">
          {destructiveActionsBlocked
            ? "저장 상태를 다시 확인할 때까지 카드 수정·보관·삭제를 사용할 수 없습니다."
            : isArchived
            ? "보관된 카드는 학습 목록에서 숨겨져 있으며 기록은 그대로 유지됩니다."
            : "보관하면 학습 목록에서 숨길 수 있고 나중에 복원할 수 있습니다."}
        </p>
        <details className="card-danger-zone">
          <summary>더보기</summary>
          <p>완전 삭제는 카드와 연결된 학습 기록도 함께 제거합니다.</p>
          <button
            ref={cardDeleteTriggerRef}
            type="button"
            className="is-danger-quiet"
            disabled={destructiveActionsBlocked}
            onClick={() => cardDeleteDialogRef.current?.showModal()}
          >
            카드 완전 삭제
          </button>
        </details>
      </section>

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
            <div className="hint-flow-lines" role="list">
              {card.hint.flow.map((step, index) => (
                <p key={`${index}-${step}`} role="listitem">{step}</p>
              ))}
            </div>
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
              disabled={!shadowingSource}
              onClick={() => {
                if (!shadowingSource) return;
                runAfterDiscardCheck(() => onStartShadowing(shadowingSource));
              }}
            >
              ▶ 현재 답변으로 쉐도잉 연습
            </button>
            <span>
              {answerTab === "model" && firstLineOnly
                ? "전체 답변이 없어 쉐도잉을 시작할 수 없습니다."
                : answerTab === "model"
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
                  className={`speech-button answer-listen-button ${activeTarget === "modelAnswer" ? "is-playing" : ""}`}
                  aria-pressed={activeTarget === "modelAnswer"}
                  disabled={!isSupported}
                  onClick={() => toggleSpeech(modelAnswerText, "modelAnswer")}
                >
                  {activeTarget === "modelAnswer"
                    ? "기본 답변 듣기 중지"
                    : "기본 답변 듣기"}
                </button>
                <span>기본 답변은 수정되지 않습니다.</span>
              </div>
              <div className="answer-lines">
                {modelAnswerRows.map((row, index) =>
                  row.kind === "paragraph-break" ? (
                    <div
                      key={`${card.id}-paragraph-break-${index}`}
                      className="answer-paragraph-break"
                      aria-hidden="true"
                    />
                  ) : (
                    <p key={`${card.id}-line-${row.number}-${index}`}>
                      <span>{row.number}</span>
                      <span className="answer-line-text">{row.text}</span>
                    </p>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div
              id="my-answer-panel"
              role="tabpanel"
              aria-labelledby="my-answer-tab"
            >
              {myAnswer ? (
                <div className="my-answer-view">
                  <div className="my-answer-toolbar">
                    <button
                      type="button"
                      className={`speech-button answer-listen-button ${activeTarget === "myAnswer" ? "is-playing" : ""}`}
                      aria-pressed={activeTarget === "myAnswer"}
                      disabled={!isSupported}
                      onClick={() => toggleSpeech(myAnswer, "myAnswer")}
                    >
                      {activeTarget === "myAnswer" ? "전체 듣기 중지" : "전체 듣기"}
                    </button>
                    <div className="my-answer-management-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => startCardEditing(myAnswer)}
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
                  </div>

                  <div className="my-first-line-box">
                    <div>
                      <span>나의 첫 문장</span>
                      <p>{myFirstLine}</p>
                    </div>
                    <button
                      type="button"
                      className={`speech-button answer-listen-button ${activeTarget === "myFirstLine" ? "is-playing" : ""}`}
                      aria-pressed={activeTarget === "myFirstLine"}
                      disabled={!isSupported || !myFirstLine}
                      onClick={() => toggleSpeech(myFirstLine, "myFirstLine")}
                    >
                      {activeTarget === "myFirstLine"
                        ? "첫 문장 듣기 중지"
                        : "나의 첫 문장 듣기"}
                    </button>
                  </div>
                  <div className="answer-lines my-answer-lines">
                    {myAnswerRows.map((row, index) =>
                      row.kind === "paragraph-break" ? (
                        <div key={`my-answer-paragraph-${index}`} className="answer-paragraph-break" aria-hidden="true" />
                      ) : (
                        <p key={`my-answer-line-${row.number}-${index}`}>
                          <span>{row.number}</span>
                          <span className="answer-line-text">{row.text}</span>
                        </p>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="my-answer-empty">
                  <p>아직 작성한 답변이 없어요.</p>
                  <div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => startCardEditing("")}
                    >
                      빈 답변으로 작성
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startCardEditing(modelAnswerText)}
                    >
                      기본 답변 복사해서 수정
                    </button>
                  </div>
                  <small>나만의 답변은 전체 JSON 백업에 포함됩니다.</small>
                </div>
              )}
            </div>
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

      <dialog
        ref={cardDeleteDialogRef}
        className="my-answer-delete-dialog card-delete-dialog"
        aria-labelledby="card-delete-title"
        onCancel={(event) => {
          event.preventDefault();
          closeCardDeleteDialog();
        }}
      >
        <h2 id="card-delete-title">이 카드와 관련 기록을 완전히 삭제할까요?</h2>
        <dl>
          <div><dt>질문</dt><dd>{card.front}</dd></div>
          <div><dt>카드 ID</dt><dd><code>{card.id}</code></dd></div>
          <div><dt>관련 학습 기록</dt><dd>{hasRelatedRecords ? "있음" : "없음"}</dd></div>
        </dl>
        <p>삭제 후 복구가 어렵습니다. 개인 학습 메모와 저장 지문은 삭제되지 않습니다.</p>
        <div>
          <button type="button" className="secondary-button" onClick={closeCardDeleteDialog}>취소</button>
          <button
            type="button"
            className="delete-confirm-button"
            onClick={() => {
              cardDeleteDialogRef.current?.close();
              onDeleteCard(card.id);
            }}
          >
            완전 삭제
          </button>
        </div>
      </dialog>
    </main>
  );
}
