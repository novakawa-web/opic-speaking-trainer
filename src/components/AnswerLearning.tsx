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
import { shouldShowAnswerLearningStopControl } from "../utils/answerLearningPlayback";
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
import { isRecordingBusy, type RecordingStatus } from "../utils/audioRecorder";
import {
  ANSWER_LEARNING_STATUS_OPTIONS,
  FIRST_LINE_STATUS_OPTIONS,
} from "../utils/studyStatusOptions";
import { CardEditor } from "./CardEditor";
import { AudioRecorder, type AudioRecorderHandle } from "./AudioRecorder";

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
  onAnswerSourceChange: (source: AnswerLearningAnswerSource) => void;
  onRevealChange: (reveal: AnswerLearningRevealState) => void;
  onPrevious: () => void;
  onNext: () => void;
  onStatusChange: (status: AnswerLearningStatus) => void;
  onFirstLineStatusChange: (status: FirstLineResult) => void;
  onUndo: () => void;
  onReset: () => void;
  onStartShadowing: (source: ShadowingSource) => void;
  onBack: () => void;
  onSaveCardEdit: (card: OpicCard, myAnswer: string) => boolean;
  cardEditError?: string | null;
  onCardEditInputChange?: () => void;
  cardEditingBlocked?: boolean;
  registerHomeNavigationGuard?: (guard: () => boolean) => () => void;
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
  onAnswerSourceChange,
  onRevealChange,
  onPrevious,
  onNext,
  onStatusChange,
  onFirstLineStatusChange,
  onUndo,
  onReset,
  onStartShadowing,
  onBack,
  onSaveCardEdit,
  cardEditError,
  onCardEditInputChange,
  cardEditingBlocked = false,
  registerHomeNavigationGuard,
}: Props) {
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [isCardEditorDirty, setIsCardEditorDirty] = useState(false);
  const [ttsRate, setTtsRate] = useState(readTtsRate);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>("idle");
  const { isSupported, activeTarget, message, speak, stop } = useSpeechSynthesis(ttsRate);
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
  const answerSpeech = useAnswerLearningSpeech(answerSentences, ttsRate, () => {
    stop();
    recorderRef.current?.stopPlayback();
  });
  const recorderBusy = isRecordingBusy(recordingStatus);
  const shadowingSource = missingFullAnswer ? null : resolvedSource === "my-answer"
    ? createMyAnswerSource(card, answerText)
    : createModelAnswerSource(card);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    stop();
    answerSpeech.stop();
    recorderRef.current?.clearRecording();
  }, [answerSpeech.stop, card.id, resolvedSource, stop]);

  const clearCurrentAudio = useCallback(() => {
    stop();
    answerSpeech.stop();
    recorderRef.current?.clearRecording();
  }, [answerSpeech.stop, stop]);

  const confirmNavigation = useCallback(() => {
    if (
      isEditingCard &&
      isCardEditorDirty &&
      !window.confirm("저장하지 않은 카드와 나만의 답변 수정 내용이 있습니다. 현재 화면을 나갈까요?")
    ) {
      return false;
    }
    clearCurrentAudio();
    return true;
  }, [clearCurrentAudio, isCardEditorDirty, isEditingCard]);

  useLayoutEffect(() => {
    if (!registerHomeNavigationGuard) return;
    return registerHomeNavigationGuard(confirmNavigation);
  }, [confirmNavigation, registerHomeNavigationGuard]);

  const goPrevious = useCallback(() => {
    clearCurrentAudio();
    onPrevious();
  }, [clearCurrentAudio, onPrevious]);
  const goNext = useCallback(() => {
    clearCurrentAudio();
    onNext();
  }, [clearCurrentAudio, onNext]);
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: canGoNext ? goNext : undefined,
    onSwipeRight: canGoPrevious ? goPrevious : undefined,
  });

  function toggle(key: keyof AnswerLearningRevealState) {
    onRevealChange({ ...reveal, [key]: !reveal[key] });
  }

  function toggleSpeech(text: string, target: "question" | "firstLine" | "modelAnswer" | "myAnswer") {
    if (recorderBusy) return;
    answerSpeech.stop();
    recorderRef.current?.stopPlayback();
    if (activeTarget === target) stop();
    else speak(text, target);
  }

  function changeAnswerSource(source: AnswerLearningAnswerSource) {
    if (source === resolvedSource) return;
    clearCurrentAudio();
    onAnswerSourceChange(source);
  }

  function changeRate(rawValue: string) {
    const nextRate = Number(rawValue);
    if (!isTtsRate(nextRate)) return;
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
    answerSpeech.playAll();
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

  function openCardEditor() {
    clearCurrentAudio();
    onCardEditInputChange?.();
    setIsEditingCard(true);
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
      />
    );
  }

  return (
    <main className="answer-learning-page" {...swipeHandlers}>
      <section className="answer-learning-question">
        <div className="answer-learning-progress" aria-live="polite">
          <button type="button" className="answer-learning-inline-back" onClick={() => { clearCurrentAudio(); onBack(); }}>← 준비 화면으로</button>
          <strong>{currentPosition} / {totalCards} 카드</strong>
          <span>{card.deck}</span>
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
          <button type="button" aria-expanded={reveal.hint} aria-pressed={reveal.hint} onClick={() => toggle("hint")}>힌트</button>
          <button type="button" aria-expanded={reveal.firstLine} aria-pressed={reveal.firstLine} onClick={() => toggle("firstLine")}>첫 문장</button>
          <button type="button" aria-expanded={reveal.answer} aria-pressed={reveal.answer} disabled={missingFullAnswer} onClick={() => toggle("answer")}>전체 답변</button>
        </div>

        {missingFullAnswer && <p className="first-line-only-notice" role="note">전체 답변이 아직 없어요. 첫 문장은 첫 문장 연습에서 그대로 사용할 수 있습니다.</p>}

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
                <button
                  key={option.value}
                  type="button"
                  className={`status-button status-button-${option.value} ${
                    firstLineStatus === option.value ? "is-selected" : ""
                  }`}
                  aria-pressed={firstLineStatus === option.value}
                  onClick={() => onFirstLineStatusChange(option.value)}
                >
                  <span className="status-button-content">
                    <span className="status-button-icon" aria-hidden="true">{option.symbol}</span>
                    <span className="status-button-label">{option.label}</span>
                  </span>
                </button>
              ))}
            </div>
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
                <button type="button" onClick={answerSpeech.stop}>정지</button>
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
              {answerPlaybackLabel || "정지 상태에서는 문장을 누르면 선택한 문장만 재생합니다."}
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
                    return (
                      <button
                        key={`${card.id}-${sentenceIndex}`}
                        type="button"
                        className={isCurrentSentence ? "is-current" : ""}
                        aria-current={isCurrentSentence ? "true" : undefined}
                        aria-label={`${sentenceIndex + 1}번 문장${
                          stopsCurrentSentence
                            ? " 재생 중지"
                            : answerSpeech.isActive &&
                                answerSpeech.playback.mode === "continuous"
                            ? "부터 끝까지 재생"
                            : "만 재생"
                        }`}
                        disabled={recorderBusy}
                        onClick={() => answerSpeech.playFromSentence(sentenceIndex)}
                      >
                        <span>{sentenceIndex + 1}</span>
                        {sentence}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
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
        <button type="button" className="secondary-button answer-learning-shadowing" disabled={!shadowingSource || recorderBusy} aria-describedby={!shadowingSource ? `shadowing-unavailable-${card.id}` : undefined} onClick={() => { if (!shadowingSource) return; clearCurrentAudio(); onStartShadowing(shadowingSource); }}>
          이 답변 쉐도잉하기
        </button>
        {!shadowingSource && <p id={`shadowing-unavailable-${card.id}`} className="disabled-reason">전체 답변이 없어 쉐도잉을 시작할 수 없습니다.</p>}
        <p className="answer-learning-feedback" aria-live="polite">{feedbackMessage || message}</p>
      </section>

      {!missingFullAnswer && (
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
          }}
          onBeforePlayback={() => {
            stop();
            answerSpeech.stop();
          }}
          onStatusChange={setRecordingStatus}
        />
      )}

      <nav className="answer-learning-navigation" aria-label="답변 익히기 카드 이동">
        <button type="button" disabled={!canGoPrevious} aria-label="이전 카드" onClick={goPrevious}>이전</button>
        <strong>{currentPosition} / {totalCards}</strong>
        <button type="button" disabled={!canGoNext} aria-label="다음 카드" onClick={goNext}>다음</button>
      </nav>
    </main>
  );
}
