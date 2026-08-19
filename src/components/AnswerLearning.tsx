import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAnswerLearningSpeech } from "../hooks/useAnswerLearningSpeech";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import type {
  AnswerLearningAnswerSource,
  AnswerLearningStatus,
  FirstLineResult,
  FirstLineStatus,
  OpicCard,
} from "../types";
import type { AnswerLearningRevealState } from "../utils/answerLearningSession";
import {
  resolveAnswerLearningSentencePress,
  resolveAnswerLearningSentenceSelection,
  shouldShowAnswerLearningStopControl,
  type AnswerLearningSentenceSelection,
} from "../utils/answerLearningPlayback";
import { extractMyFirstLine } from "../utils/myAnswerStorage";
import { createModelAnswerSource, createMyAnswerSource, type ShadowingSource } from "../utils/shadowingPlayer";
import {
  createPassageParagraphs,
  flattenParagraphSentences,
} from "../utils/passageParagraphs";
import { joinAnswerLines } from "../utils/answerText";
import {
  isTtsRate,
  readTtsRate,
  saveTtsRate,
  stripQuestionPrefix,
  TTS_RATE_OPTIONS,
} from "../utils/ttsSettings";
import { isFirstLineOnlyCard } from "../utils/cardContent";
import { formatAnswerLearningTag } from "../utils/cardTagFilters";
import {
  getTemporaryAudioDiscardMessage,
  isRecordingBusy,
  type RecordingStatus,
} from "../utils/audioRecorder";
import { SPEECH_DRAFT_FEATURE_ENABLED } from "../utils/speechDraft";
import {
  ANSWER_LEARNING_STATUS_OPTIONS,
  FIRST_LINE_STATUS_OPTIONS,
} from "../utils/studyStatusOptions";
import { createAnswerLearningSentenceCheckIds } from "../utils/answerLearningSentenceChecks";
import { CardEditor } from "./CardEditor";
import {
  AudioRecorder,
  type AudioRecorderHandle,
  type AudioRecorderSpeechDraftConfig,
} from "./AudioRecorder";
import { FavoriteButton } from "./FavoriteButton";
import {
  CardMemoSection,
  type CardMemoSectionHandle,
} from "./CardMemoSection";
import type { CardMemo } from "../utils/cardMemoStorage";

type Props = {
  card: OpicCard;
  myAnswer?: string;
  status: AnswerLearningStatus | null;
  firstLineStatus: FirstLineStatus;
  answerSource: AnswerLearningAnswerSource;
  reveal: AnswerLearningRevealState;
  currentPosition: number;
  totalCards: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  undoTarget: { cardTitle: string; statusLabel: string } | null;
  feedbackMessage: string | null;
  checkedSentenceIds: readonly string[];
  sentenceCheckMessage: string | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onAnswerSourceChange: (source: AnswerLearningAnswerSource) => void;
  onRevealChange: (reveal: AnswerLearningRevealState) => void;
  onPrevious: () => void;
  onNext: () => void;
  onStatusChange: (status: AnswerLearningStatus) => void;
  onFirstLineStatusChange: (status: FirstLineResult) => void;
  onUndo: () => void;
  onReset: () => void;
  onToggleSentenceCheck: (
    sentenceId: string,
    validSentenceIds: readonly string[],
  ) => void;
  onStartShadowing: (source: ShadowingSource) => void;
  onBack: () => void;
  onSaveCardEdit: (card: OpicCard, myAnswer: string) => boolean;
  onSaveSpeechDraft: AudioRecorderSpeechDraftConfig["onApply"];
  memos: CardMemo[];
  onCreateMemo: (cardId: string, content: string) => void;
  onUpdateMemo: (cardId: string, memoId: string, content: string) => void;
  onToggleMemoPinned: (cardId: string, memoId: string) => void;
  onDeleteMemo: (cardId: string, memoId: string) => void;
  onRestoreMemo: (memo: CardMemo, index: number) => void;
  cardEditError?: string | null;
  onCardEditInputChange?: () => void;
  cardEditingBlocked?: boolean;
  registerHomeNavigationGuard?: (guard: () => boolean) => () => void;
  registerBackNavigationHandler?: (handler: () => void) => () => void;
};

export function AnswerLearning({
  card,
  myAnswer,
  status,
  firstLineStatus,
  answerSource,
  reveal,
  currentPosition,
  totalCards,
  canGoPrevious,
  canGoNext,
  undoTarget,
  feedbackMessage,
  checkedSentenceIds,
  sentenceCheckMessage,
  isFavorite,
  onToggleFavorite,
  onAnswerSourceChange,
  onRevealChange,
  onPrevious,
  onNext,
  onStatusChange,
  onFirstLineStatusChange,
  onUndo,
  onReset,
  onToggleSentenceCheck,
  onStartShadowing,
  onBack,
  onSaveCardEdit,
  onSaveSpeechDraft,
  memos,
  onCreateMemo,
  onUpdateMemo,
  onToggleMemoPinned,
  onDeleteMemo,
  onRestoreMemo,
  cardEditError,
  onCardEditInputChange,
  cardEditingBlocked = false,
  registerHomeNavigationGuard,
  registerBackNavigationHandler,
}: Props) {
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [isCardEditorDirty, setIsCardEditorDirty] = useState(false);
  const [isSpeechDraftDirty, setIsSpeechDraftDirty] = useState(false);
  const [ttsRate, setTtsRate] = useState(readTtsRate);
  const [sentenceSelection, setSentenceSelection] =
    useState<AnswerLearningSentenceSelection | null>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const memoSectionRef = useRef<CardMemoSectionHandle | null>(null);
  const [recordingCountdown, setRecordingCountdown] = useState<number | null>(null);
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>("idle");
  const [recordingPreparing, setRecordingPreparing] = useState(false);
  const { isSupported, activeTarget, message, speak, speakAndWait, stop } = useSpeechSynthesis(ttsRate);
  const modelText = joinAnswerLines(card.back);
  const resolvedSource = answerSource === "my-answer" && myAnswer ? "my-answer" : "default";
  const missingFullAnswer = isFirstLineOnlyCard(card) && resolvedSource === "default";
  const answerText = resolvedSource === "my-answer" ? myAnswer! : modelText;
  const firstLine = resolvedSource === "my-answer" ? extractMyFirstLine(answerText) : card.firstLine;
  const answerParagraphs = useMemo(
    () => createPassageParagraphs(answerText),
    [answerText],
  );
  const answerSentences = useMemo(
    () => flattenParagraphSentences(answerParagraphs),
    [answerParagraphs],
  );
  const sentenceCheckIds = useMemo(
    () => createAnswerLearningSentenceCheckIds(answerSentences),
    [answerSentences],
  );
  const checkedSentenceIdSet = useMemo(
    () => new Set(checkedSentenceIds),
    [checkedSentenceIds],
  );
  const answerSpeech = useAnswerLearningSpeech(answerSentences, ttsRate, () => {
    stop();
    recorderRef.current?.stopPlayback();
  });
  const recorderBusy = recordingPreparing || isRecordingBusy(recordingStatus);
  const shadowingSource = missingFullAnswer ? null : resolvedSource === "my-answer"
    ? createMyAnswerSource(card, answerText)
    : createModelAnswerSource(card);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    stop();
    answerSpeech.stop();
    setSentenceSelection(null);
    recorderRef.current?.clearRecording();
  }, [answerSpeech.stop, card.id, resolvedSource, stop]);

  useEffect(() => {
    if (sentenceSelection?.phase === "playing" && !answerSpeech.isActive) {
      setSentenceSelection(null);
    }
  }, [answerSpeech.isActive, sentenceSelection]);

  useEffect(() => {
    if (!reveal.answer) setSentenceSelection(null);
  }, [reveal.answer]);

  const clearCurrentAudio = useCallback(() => {
    stop();
    answerSpeech.stop();
    setSentenceSelection(null);
    setRecordingCountdown(null);
    setRecordingStatus("idle");
    setIsSpeechDraftDirty(false);
    recorderRef.current?.clearRecording();
  }, [answerSpeech.stop, stop]);

  const confirmTemporaryAudioDiscard = useCallback((actionLabel: string) => {
    const warning = getTemporaryAudioDiscardMessage(
      actionLabel,
      recordingStatus,
      isSpeechDraftDirty,
    );
    if (warning && !window.confirm(warning)) return false;
    clearCurrentAudio();
    return true;
  }, [clearCurrentAudio, isSpeechDraftDirty, recordingStatus]);

  const confirmNavigation = useCallback(() => {
    if (
      isEditingCard &&
      isCardEditorDirty &&
      !window.confirm("저장하지 않은 카드와 나만의 답변 수정 내용이 있습니다. 현재 화면을 나갈까요?")
    ) {
      return false;
    }
    if (!memoSectionRef.current?.confirmDiscardAndClose()) return false;
    return confirmTemporaryAudioDiscard("현재 화면을 나가면");
  }, [confirmTemporaryAudioDiscard, isCardEditorDirty, isEditingCard]);

  useLayoutEffect(() => {
    if (!registerHomeNavigationGuard) return;
    return registerHomeNavigationGuard(confirmNavigation);
  }, [confirmNavigation, registerHomeNavigationGuard]);

  const goPrevious = useCallback(() => {
    if (!confirmNavigation()) return;
    onPrevious();
  }, [confirmNavigation, onPrevious]);
  const goNext = useCallback(() => {
    if (!confirmNavigation()) return;
    onNext();
  }, [confirmNavigation, onNext]);
  const goBack = useCallback(() => {
    if (!confirmNavigation()) return;
    onBack();
  }, [confirmNavigation, onBack]);
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: canGoNext ? goNext : undefined,
    onSwipeRight: canGoPrevious ? goPrevious : undefined,
  });

  function toggle(key: keyof AnswerLearningRevealState) {
    onRevealChange({ ...reveal, [key]: !reveal[key] });
  }

  function toggleSpeech(text: string, target: "question" | "firstLine" | "modelAnswer" | "myAnswer") {
    if (recorderBusy) return;
    setSentenceSelection(null);
    answerSpeech.stop();
    recorderRef.current?.stopPlayback();
    if (activeTarget === target) stop();
    else speak(text, target);
  }

  function changeAnswerSource(source: AnswerLearningAnswerSource) {
    if (source === resolvedSource) return;
    if (!confirmTemporaryAudioDiscard("답변을 바꾸면")) return;
    onAnswerSourceChange(source);
  }

  function changeRate(rawValue: string) {
    const nextRate = Number(rawValue);
    if (!isTtsRate(nextRate)) return;
    setSentenceSelection(null);
    stop();
    answerSpeech.stop();
    setTtsRate(nextRate);
    saveTtsRate(nextRate);
  }

  function toggleAnswerPlayback() {
    if (recorderBusy) return;
    if (
      answerSpeech.playback.status === "loading" ||
      answerSpeech.playback.status === "playing"
    ) {
      answerSpeech.pause();
      return;
    }
    if (answerSpeech.playback.status === "paused") {
      answerSpeech.resume();
      return;
    }
    setSentenceSelection(null);
    answerSpeech.playAll();
  }

  function handleSentencePress(sentenceIndex: number) {
    const action = resolveAnswerLearningSentencePress(
      answerSpeech.playback,
      sentenceSelection?.index ?? null,
      sentenceIndex,
    );
    setSentenceSelection(
      resolveAnswerLearningSentenceSelection(
        answerSpeech.playback,
        action,
        sentenceIndex,
      ),
    );
    if (action === "select") return;
    answerSpeech.playFromSentence(sentenceIndex);
  }

  const answerPlaybackLabel =
    answerSpeech.playback.status === "loading"
      ? `${answerSpeech.playback.currentIndex + 1}번째 문장 준비 중`
      : answerSpeech.playback.status === "playing"
        ? `${answerSpeech.playback.currentIndex + 1}번째 문장 재생 중`
        : answerSpeech.playback.status === "paused"
          ? `${answerSpeech.playback.currentIndex + 1}번째 문장에서 일시정지`
          : answerSpeech.playback.status === "completed"
            ? "전체 답변 재생을 완료했습니다."
            : answerSpeech.message;
  const sentenceSelectionLabel = sentenceSelection?.phase === "armed"
    ? `${sentenceSelection.index + 1}번째 문장이 선택되었습니다. 같은 문장을 한 번 더 누르면 재생합니다.`
    : null;

  function openCardEditor() {
    if (!confirmTemporaryAudioDiscard("카드 수정으로 이동하면")) return;
    onCardEditInputChange?.();
    setIsEditingCard(true);
  }

  function startShadowing() {
    if (!shadowingSource) return;
    if (!confirmTemporaryAudioDiscard("쉐도잉을 시작하면")) return;
    onStartShadowing(shadowingSource);
  }

  function saveCard(nextCard: OpicCard, nextMyAnswer = "") {
    if (!onSaveCardEdit(nextCard, nextMyAnswer)) return;
    setIsEditingCard(false);
  }

  if (isEditingCard) {
    return (
      <CardEditor
        card={card}
        myAnswer={myAnswer}
        includeMyAnswer
        returnLabel="답변 익히기로 돌아가기"
        onSave={saveCard}
        onCancel={() => {
          onCardEditInputChange?.();
          setIsEditingCard(false);
        }}
        onDirtyChange={setIsCardEditorDirty}
        submissionError={cardEditError}
        onInputChange={onCardEditInputChange}
        savingBlocked={cardEditingBlocked}
        registerBackNavigationHandler={registerBackNavigationHandler}
      />
    );
  }

  return (
    <main className="answer-learning-page" {...swipeHandlers}>
      <section className="answer-learning-question">
        <div className="answer-learning-progress" aria-live="polite">
          <button type="button" className="answer-learning-inline-back" onClick={goBack}>← 준비 화면으로</button>
          <strong>{currentPosition} / {totalCards} 카드</strong>
          <span>{card.deck}</span>
        </div>
        <div className="answer-learning-favorite-row">
          <FavoriteButton
            isFavorite={isFavorite}
            onToggle={onToggleFavorite}
          />
        </div>
        <h1>{card.front}</h1>
        <div className="answer-learning-question-actions">
          <button type="button" className={activeTarget === "question" ? "is-playing" : ""} disabled={!isSupported || recorderBusy} onClick={() => toggleSpeech(stripQuestionPrefix(card.front), "question")}>
            <span aria-hidden="true">{activeTarget === "question" ? "■" : "🔊"}</span>
            <span>{activeTarget === "question" ? "문제 중지" : "문제 듣기"}</span>
          </button>
          <button type="button" aria-expanded={reveal.frontKo} onClick={() => toggle("frontKo")}>
            {reveal.frontKo ? "한국어 뜻 숨기기" : "한국어 뜻 보기"}
          </button>
          <button
            type="button"
            className="answer-learning-edit-card"
            disabled={cardEditingBlocked}
            onClick={openCardEditor}
          >
            카드 수정
          </button>
        </div>
        {reveal.frontKo && <p className="answer-learning-front-ko">{card.frontKo || "등록된 한국어 뜻이 없습니다."}</p>}
        <p className="answer-learning-hint-title">힌트 제목 · {card.hint.title}</p>
      </section>

      <section className="answer-learning-reveal" aria-labelledby="answer-learning-reveal-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">STEP BY STEP</p>
            <h2 id="answer-learning-reveal-title">필요한 만큼만 확인하기</h2>
          </div>
        </div>
        <div className="answer-learning-reveal-buttons">
          <button type="button" aria-expanded={reveal.firstLine} aria-pressed={reveal.firstLine} onClick={() => toggle("firstLine")}>첫 문장</button>
          <button type="button" aria-expanded={reveal.hint} aria-pressed={reveal.hint} onClick={() => toggle("hint")}>힌트</button>
          <button type="button" aria-expanded={reveal.answer} aria-pressed={reveal.answer} disabled={missingFullAnswer} onClick={() => toggle("answer")}>전체 답변</button>
        </div>

        {missingFullAnswer && <p className="first-line-only-notice" role="note">전체 답변이 아직 없어요. 첫 문장은 첫 문장 연습에서 그대로 사용할 수 있습니다.</p>}

        {reveal.firstLine && (
          <div className="answer-learning-first-line">
            <div className="answer-learning-first-line-content">
              <p>{firstLine}</p>
              <button type="button" disabled={!isSupported || recorderBusy} onClick={() => toggleSpeech(firstLine, "firstLine")}>
                {activeTarget === "firstLine" ? "첫 문장 듣기 중지" : "첫 문장 듣기"}
              </button>
            </div>
            <div className="answer-learning-first-line-status" role="group" aria-label="첫 문장 상태">
              {FIRST_LINE_STATUS_OPTIONS.map((option) => (
                <button key={option.value} type="button" className={`status-button status-button-${option.value} ${firstLineStatus === option.value ? "is-selected" : ""}`} aria-pressed={firstLineStatus === option.value} onClick={() => onFirstLineStatusChange(option.value)}>
                  <span className="status-button-content"><span className="status-button-icon" aria-hidden="true">{option.symbol}</span><span className="status-button-label">{option.label}</span></span>
                </button>
              ))}
            </div>
          </div>
        )}
        {reveal.hint && (
          <div className="answer-learning-hint-box">
            <h3>{card.hint.title}</h3>
            {card.hint.memoryTip && <p>{card.hint.memoryTip}</p>}
            {card.hint.subjectTip && <p>{card.hint.subjectTip}</p>}
            {card.hint.minimum && <p><strong>최소 답변</strong> {card.hint.minimum}</p>}
            {card.tags.length > 0 && (
              <p className="answer-learning-hint-tags">
                {card.tags.map(formatAnswerLearningTag).join(" · ")}
              </p>
            )}
            {card.hint.flow.length > 0 && (
              <div className="hint-flow-lines" role="list">
                {card.hint.flow.map((step, index) => (
                  <p key={`${index}-${step}`} role="listitem">{step}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {reveal.answer && (
          <div className="answer-learning-answer">
            <div className="answer-learning-answer-actions">
              <button
                type="button"
                className={answerSpeech.isActive ? "is-playing" : ""}
                disabled={!answerSpeech.isSupported || recorderBusy}
                onClick={toggleAnswerPlayback}
              >
                <span aria-hidden="true">
                  {answerSpeech.playback.status === "paused"
                    ? "▶"
                    : answerSpeech.playback.status === "loading" ||
                        answerSpeech.playback.status === "playing"
                      ? "⏸"
                      : "🔊"}
                </span>
                <span>
                  {answerSpeech.playback.status === "paused"
                    ? "이어 듣기"
                    : answerSpeech.playback.status === "loading" ||
                        answerSpeech.playback.status === "playing"
                      ? "일시정지"
                      : "전체 답변 듣기"}
                </span>
              </button>
              {shouldShowAnswerLearningStopControl(answerSpeech.playback) && (
                <button
                  type="button"
                  onClick={() => {
                    setSentenceSelection(null);
                    answerSpeech.stop();
                  }}
                >
                  정지
                </button>
              )}
              <label className="answer-learning-tts-rate">
                <span>속도</span>
                <select
                  aria-label="답변 익히기 TTS 읽기 속도"
                  value={ttsRate}
                  disabled={!answerSpeech.isSupported || recorderBusy}
                  onChange={(event) => changeRate(event.target.value)}
                >
                  {TTS_RATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="answer-learning-tabs" role="tablist" aria-label="답변 종류">
              <button type="button" role="tab" aria-selected={resolvedSource === "default"} onClick={() => changeAnswerSource("default")}>기본 답변</button>
              <button type="button" role="tab" aria-selected={resolvedSource === "my-answer"} disabled={!myAnswer} onClick={() => changeAnswerSource("my-answer")}>나만의 답변</button>
            </div>
            <p className="answer-learning-playback-status" aria-live="polite">
              {sentenceSelectionLabel || answerPlaybackLabel || "정지 상태에서는 문장을 한 번 선택하고, 같은 문장을 다시 누르면 재생합니다."}
            </p>
            <div className="answer-learning-sentences">
              {answerParagraphs.map((paragraph, paragraphIndex) => (
                <div
                  className="answer-learning-paragraph"
                  key={`${card.id}-paragraph-${paragraphIndex}`}
                >
                  {paragraph.sentences.map((sentence, sentenceOffset) => {
                    const sentenceIndex =
                      paragraph.startSentenceIndex + sentenceOffset;
                    const isCurrentSentence =
                      answerSpeech.isActive &&
                      answerSpeech.playback.currentIndex === sentenceIndex;
                    const stopsCurrentSentence =
                      isCurrentSentence &&
                      answerSpeech.playback.mode === "single";
                    const isSelectedSentence =
                      sentenceSelection?.index === sentenceIndex;
                    const sentenceCheckId = sentenceCheckIds[sentenceIndex];
                    const isChecked = sentenceCheckId
                      ? checkedSentenceIdSet.has(sentenceCheckId)
                      : false;
                    return (
                      <div
                        key={`${card.id}-${sentenceIndex}`}
                        className="answer-learning-sentence-row"
                      >
                        <div className="answer-learning-sentence-meta">
                          <span className="answer-learning-sentence-number" aria-hidden="true">
                            {sentenceIndex + 1}
                          </span>
                          {sentenceCheckId && (
                            <button
                              type="button"
                              className="answer-learning-sentence-check"
                              aria-label={`${sentenceIndex + 1}번 문장 복습 체크${isChecked ? " 해제" : ""}`}
                              aria-pressed={isChecked}
                              onClick={() =>
                                onToggleSentenceCheck(
                                  sentenceCheckId,
                                  sentenceCheckIds,
                                )
                              }
                            >
                              <span aria-hidden="true">✓</span>
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`answer-learning-sentence-playback ${isSelectedSentence ? "is-selected" : ""} ${isCurrentSentence ? "is-current" : ""}`.trim()}
                          aria-pressed={isSelectedSentence}
                          aria-current={isCurrentSentence ? "true" : undefined}
                          aria-label={`${sentenceIndex + 1}번 문장${
                            stopsCurrentSentence
                              ? " 재생 중지"
                              : answerSpeech.isActive &&
                                  answerSpeech.playback.mode === "continuous"
                              ? "부터 끝까지 재생"
                              : isSelectedSentence
                                ? " 듣기"
                                : " 선택"
                          }`}
                          disabled={!answerSpeech.isSupported || recorderBusy}
                          onClick={() => handleSentencePress(sentenceIndex)}
                        >
                          <span className="answer-learning-sentence-text">{sentence}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {sentenceCheckMessage && (
              <p className="answer-learning-sentence-check-feedback" role="status">
                {sentenceCheckMessage}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="answer-learning-rating" aria-labelledby="answer-learning-rating-title">
        <h2 id="answer-learning-rating-title">전체 답변을 얼마나 말할 수 있나요?</h2>
        <p className="answer-learning-rating-description">완벽히 외웠는지보다, 핵심 내용을 연결해 끝까지 말할 수 있는지를 기준으로 선택하세요.</p>
        <div className="answer-learning-status-buttons">
          {ANSWER_LEARNING_STATUS_OPTIONS.map((option) => (
            <button key={option.value} type="button" aria-pressed={status === option.value} className={`answer-status-${option.value}`} onClick={() => onStatusChange(option.value)}>
              <span aria-hidden="true">{option.symbol}</span>{option.label}
            </button>
          ))}
        </div>
        <div className="answer-learning-secondary-actions">
          <button type="button" className="secondary-button utility-action" disabled={!undoTarget} aria-label={undoTarget ? `${undoTarget.cardTitle}의 ${undoTarget.statusLabel} 선택 실행 취소` : "실행 취소할 선택 없음"} onClick={onUndo}>
            {undoTarget ? `${undoTarget.cardTitle} · ${undoTarget.statusLabel} 실행 취소` : "방금 선택 실행 취소"}
          </button>
          <button type="button" className="text-button utility-action" disabled={!status} onClick={onReset}>현재 상태 초기화</button>
        </div>
        <button type="button" className="secondary-button answer-learning-shadowing" disabled={!shadowingSource || recorderBusy} aria-describedby={!shadowingSource ? `shadowing-unavailable-${card.id}` : undefined} onClick={startShadowing}>
          이 답변 쉐도잉하기
        </button>
        {!shadowingSource && <p id={`shadowing-unavailable-${card.id}`} className="disabled-reason">전체 답변이 없어 쉐도잉을 시작할 수 없습니다.</p>}
        <p className="answer-learning-feedback" aria-live="polite">{feedbackMessage || message}</p>
      </section>

      {!missingFullAnswer && (
        <>
        <CardMemoSection
          ref={memoSectionRef}
          cardId={card.id}
          cardTitle={card.hint.title}
          hasMyAnswer={Boolean(myAnswer)}
          memos={memos}
          onBeforeStartEditing={() => confirmTemporaryAudioDiscard("메모를 작성하면")}
          onCreate={(content) => onCreateMemo(card.id, content)}
          onUpdate={(memoId, content) => onUpdateMemo(card.id, memoId, content)}
          onTogglePinned={(memoId) => onToggleMemoPinned(card.id, memoId)}
          onDelete={(memoId) => onDeleteMemo(card.id, memoId)}
          onRestore={onRestoreMemo}
          persistUiSession={false}
        />
        <AudioRecorder
          ref={recorderRef}
          className="answer-learning-audio-recorder"
          eyebrow="SPEAK & CHECK"
          title="말한 답변 바로 확인하기"
          scopeLabel={
            resolvedSource === "my-answer"
              ? "현재 선택한 나만의 답변 전체를 말해 보세요."
              : "현재 선택한 기본 답변 전체를 말해 보세요."
          }
          onBeforeRecord={() => {
            stop();
            answerSpeech.stop();
            setSentenceSelection(null);
          }}
          onPrepareRecord={async (signal) => {
            await speakAndWait(stripQuestionPrefix(card.front), "question");
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            for (let seconds = 3; seconds >= 1; seconds -= 1) {
              setRecordingCountdown(seconds);
              await new Promise<void>((resolve, reject) => {
                const timeoutId = window.setTimeout(resolve, 1000);
                signal.addEventListener("abort", () => {
                  window.clearTimeout(timeoutId);
                  reject(new DOMException("Aborted", "AbortError"));
                }, { once: true });
              });
            }
            setRecordingCountdown(null);
          }}
          preparationStatus={recordingCountdown === null ? "질문 읽는 중" : `${recordingCountdown}초 뒤 녹음`}
          onPreparingChange={setRecordingPreparing}
          onBeforePlayback={() => {
            stop();
            answerSpeech.stop();
            setSentenceSelection(null);
          }}
          onStatusChange={setRecordingStatus}
          onSpeechDraftDirtyChange={setIsSpeechDraftDirty}
          speechDraft={SPEECH_DRAFT_FEATURE_ENABLED
            ? {
                existingAnswer: myAnswer,
                disabled: cardEditingBlocked,
                onApply: onSaveSpeechDraft,
              }
            : undefined}
        />
        <p className="answer-learning-recording-guide">녹음 시작을 누르면 질문을 한 번 읽고, 3초를 센 뒤 자동으로 녹음을 시작합니다.</p>
        </>
      )}

      <nav className="answer-learning-navigation" aria-label="답변 익히기 카드 이동">
        <button type="button" disabled={!canGoPrevious} aria-label="이전 카드" onClick={goPrevious}>이전</button>
        <strong>{currentPosition} / {totalCards}</strong>
        <button type="button" disabled={!canGoNext} aria-label="다음 카드" onClick={goNext}>다음</button>
      </nav>
    </main>
  );
}
