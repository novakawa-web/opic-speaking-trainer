import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useShadowingPlayer } from "../hooks/useShadowingPlayer";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import type { OpicCard, ThemeMode } from "../types";
import {
  createPassageParagraphs,
  flattenParagraphSentences,
  getParagraphIndexForSentence,
} from "../utils/passageParagraphs";
import type { ShadowingSource } from "../utils/shadowingPlayer";
import {
  formatRepeatProgress,
  parseRepeatCount,
  readShadowingPlaybackSettings,
  REPEAT_COUNT_OPTIONS,
  REPEAT_MODE_OPTIONS,
  REST_LEVEL_OPTIONS,
  saveShadowingPlaybackSettings,
  type RepeatMode,
  type RestLevel,
  type ShadowingPlaybackSettings,
} from "../utils/shadowingSettings";
import {
  readTtsRate,
  saveTtsRate,
  TTS_RATE_OPTIONS,
  stripQuestionPrefix,
  type TtsRate,
} from "../utils/ttsSettings";
import {
  readShadowingPlayerSession,
  saveShadowingPlayerSession,
} from "../utils/uiSessionStorage";
import { isRecordingBusy, type RecordingStatus } from "../utils/audioRecorder";
import {
  AudioRecorder,
  type AudioRecorderHandle,
} from "./AudioRecorder";

type ShadowingPlayerProps = {
  source: ShadowingSource;
  card?: OpicCard | null;
  myAnswer?: string;
  currentCardPosition?: number;
  totalCards?: number;
  canGoPreviousCard?: boolean;
  canGoNextCard?: boolean;
  theme: ThemeMode;
  onBack: () => void;
  onToggleTheme: () => void;
  onPreviousCard?: () => void;
  onNextCard?: () => void;
  onSourceTypeChange?: (sourceType: "modelAnswer" | "myAnswer") => void;
};

const statusLabels = {
  idle: "재생 준비",
  loading: "영어 음성 준비 중",
  playing: "읽는 중",
  resting: "따라 말하기 휴식 중",
  paused: "일시정지",
  completed: "재생 완료",
  error: "재생 오류",
} as const;

export function ShadowingPlayer({
  source,
  card = null,
  myAnswer,
  currentCardPosition = 0,
  totalCards = 0,
  canGoPreviousCard = false,
  canGoNextCard = false,
  theme,
  onBack,
  onToggleTheme,
  onPreviousCard,
  onNextCard,
  onSourceTypeChange,
}: ShadowingPlayerProps) {
  const restoredSession = useMemo(() => {
    const stored =
      source.cardId || source.savedPassageId
        ? readShadowingPlayerSession()
        : null;
    if (!stored) return null;
    if (source.sourceType === "savedPassage") {
      return stored.sourceType === "savedPassage" &&
        stored.savedPassageId === source.savedPassageId
        ? stored
        : null;
    }
    return stored.sourceType !== "savedPassage" &&
      stored.cardId === source.cardId &&
      stored.sourceType === source.sourceType
        ? stored
        : null;
  }, [source.cardId, source.savedPassageId, source.sourceType]);
  const paragraphs = useMemo(
    () =>
      createPassageParagraphs(
        source.paragraphTexts?.length ? source.paragraphTexts : source.sourceText,
      ),
    [source.paragraphTexts, source.sourceText],
  );
  const sentences = useMemo(
    () => flattenParagraphSentences(paragraphs),
    [paragraphs],
  );
  const [rate, setRate] = useState<TtsRate>(readTtsRate);
  const [playbackSettings, setPlaybackSettings] =
    useState<ShadowingPlaybackSettings>(readShadowingPlaybackSettings);
  const [questionExpanded, setQuestionExpanded] = useState(
    restoredSession?.questionExpanded ?? false,
  );
  const [showFrontKo, setShowFrontKo] = useState(restoredSession?.showFrontKo ?? false);
  const sentenceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>("idle");
  const {
    isSupported,
    currentIndex,
    status,
    errorMessage,
    wakeLockActive,
    completedRepeats,
    currentRestMs,
    play,
    pause,
    resume,
    stop,
    restart,
    previousSentence,
    nextSentence,
    seekToSentence,
    interruptForExternalSpeech,
  } = useShadowingPlayer(
    sentences,
    rate,
    restoredSession?.currentIndex ?? 0,
    restoredSession?.status ?? "idle",
    playbackSettings,
    paragraphs,
    recordingStatus,
  );
  const {
    isSupported: isQuestionTtsSupported,
    activeTarget: questionSpeechTarget,
    message: questionTtsMessage,
    speak: speakQuestion,
    stop: stopQuestion,
  } = useSpeechSynthesis(rate, () => ({
    recorderStatus: recordingStatus,
    playerStatus: status,
  }));
  const isPlaying =
    status === "playing" || status === "loading" || status === "resting";
  const recorderBusy = isRecordingBusy(recordingStatus);
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < sentences.length - 1;

  const togglePlayback = useCallback(() => {
    if (recorderBusy) return;
    if (isPlaying) pause();
    else {
      recorderRef.current?.stopPlayback();
      stopQuestion();
      if (status === "paused") resume();
      else play();
    }
  }, [isPlaying, pause, play, recorderBusy, resume, status, stopQuestion]);

  const leavePlayer = useCallback(() => {
    recorderRef.current?.clearRecording();
    stopQuestion();
    stop();
    onBack();
  }, [onBack, stop, stopQuestion]);

  const moveCard = useCallback(
    (direction: "previous" | "next") => {
      recorderRef.current?.clearRecording();
      stopQuestion();
      stop();
      if (direction === "previous") onPreviousCard?.();
      else onNextCard?.();
    },
    [onNextCard, onPreviousCard, stop, stopQuestion],
  );

  const toggleQuestionSpeech = useCallback(() => {
    if (!card || recorderBusy) return;
    if (questionSpeechTarget === "question") {
      stopQuestion();
      return;
    }
    recorderRef.current?.stopPlayback();
    interruptForExternalSpeech();
    speakQuestion(stripQuestionPrefix(card.front), "question");
  }, [card, interruptForExternalSpeech, questionSpeechTarget, recorderBusy, speakQuestion, stopQuestion]);

  useKeyboardShortcuts({
    Space: recorderBusy ? undefined : togglePlayback,
    ArrowLeft: canGoPrevious ? previousSentence : undefined,
    ArrowRight: canGoNext ? nextSentence : undefined,
    Home: sentences.length > 0 ? () => seekToSentence(0) : undefined,
    Escape: leavePlayer,
  });

  useEffect(() => {
    const currentElement = sentenceRefs.current[currentIndex];
    if (!currentElement) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentElement.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [currentIndex]);

  useEffect(() => {
    const sessionState = {
      active: true,
      currentIndex,
      status:
        status === "playing" ||
        status === "loading" ||
        status === "resting" ||
        status === "error"
          ? "paused"
          : status,
      questionExpanded,
      showFrontKo,
    } as const;
    if (source.sourceType === "savedPassage" && source.savedPassageId) {
      saveShadowingPlayerSession({
        ...sessionState,
        sourceType: "savedPassage",
        savedPassageId: source.savedPassageId,
      });
      return;
    }
    if (
      !card ||
      !source.cardId ||
      (source.sourceType !== "modelAnswer" && source.sourceType !== "myAnswer")
    ) {
      return;
    }
    saveShadowingPlayerSession({
      ...sessionState,
      cardId: card.id,
      sourceType: source.sourceType,
    });
  }, [
    card,
    currentIndex,
    questionExpanded,
    showFrontKo,
    source.cardId,
    source.savedPassageId,
    source.sourceType,
    status,
  ]);

  function updateRate(nextRate: TtsRate) {
    setRate(nextRate);
    saveTtsRate(nextRate);
  }

  function updatePlaybackSettings(
    updates: Partial<ShadowingPlaybackSettings>,
  ) {
    setPlaybackSettings((current) => {
      const next = { ...current, ...updates };
      saveShadowingPlaybackSettings(next);
      return next;
    });
  }

  const baseRepeatProgress = formatRepeatProgress(
    playbackSettings.repeatMode,
    playbackSettings.repeatCount,
    completedRepeats,
    status === "completed" ? "completed" : isPlaying ? "active" : "idle",
  );
  const currentParagraphIndex = getParagraphIndexForSentence(
    paragraphs,
    currentIndex,
  );
  const repeatProgress =
    playbackSettings.repeatMode === "paragraph"
      ? `문단 ${currentParagraphIndex + 1} / ${paragraphs.length} · ${baseRepeatProgress}`
      : baseRepeatProgress;
  const selectedRestOption = REST_LEVEL_OPTIONS.find(
    (option) => option.value === playbackSettings.restLevel,
  );
  const recordingScopeLabel =
    playbackSettings.repeatMode === "sentence"
      ? `${currentIndex + 1}번 문장을 따라 말해보세요.`
      : playbackSettings.repeatMode === "paragraph"
        ? `${currentParagraphIndex + 1}번 문단을 따라 말해보세요.`
        : `‘${source.sourceTitle}’ 전체 답변을 말해보세요.`;

  const playbackLabel = isPlaying
    ? "일시정지"
    : status === "paused"
      ? "이어 듣기"
      : status === "completed"
        ? "처음부터 재생"
        : "재생";

  return (
    <div className="shadowing-screen">
      <header className="shadowing-header">
        <button type="button" className="shadowing-back" onClick={leavePlayer} aria-label="쉐도잉 연습에서 뒤로가기">←</button>
        <strong>쉐도잉 연습</strong>
        <span role="status" aria-label={`현재 문장 ${currentIndex + 1}, 전체 ${sentences.length}`}>
          {sentences.length > 0 ? currentIndex + 1 : 0} / {sentences.length}
        </span>
        <button
          type="button"
          className="shadowing-theme"
          aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          aria-pressed={theme === "dark"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>

      <main className="shadowing-main">
        <section className="shadowing-intro">
          <p className="eyebrow">
            {source.sourceType === "custom"
              ? "TEMPORARY TEXT"
              : source.sourceType === "savedPassage"
                ? "SAVED PASSAGE"
                : "CARD ANSWER"}
          </p>
          <h1>{source.sourceTitle}</h1>
          <div className="shadowing-status-row" aria-live="polite">
            <strong>{statusLabels[status]}</strong>
            <span>{repeatProgress}</span>
            {status === "resting" && currentRestMs > 0 && (
              <span>약 {(currentRestMs / 1000).toFixed(1)}초 휴식</span>
            )}
            {wakeLockActive && <span>화면 켜짐 유지 중</span>}
            <span>속도 변경은 다음 문장부터 적용됩니다.</span>
          </div>
          {!isSupported && <p className="player-error">이 브라우저는 음성 재생을 지원하지 않습니다.</p>}
          {errorMessage && <p className="player-error">{errorMessage}</p>}
        </section>

        {card && source.sourceType !== "custom" && (
          <section className="shadowing-question-card" aria-labelledby="shadowing-question-title">
            <div className="shadowing-card-navigation">
              <button
                type="button"
                aria-label="이전 카드"
                disabled={!canGoPreviousCard}
                onClick={() => moveCard("previous")}
              >
                ‹ 이전
              </button>
              <strong>{currentCardPosition} / {totalCards} 카드</strong>
              <button
                type="button"
                aria-label="다음 카드"
                disabled={!canGoNextCard}
                onClick={() => moveCard("next")}
              >
                다음 ›
              </button>
            </div>
            <p className="eyebrow">QUESTION</p>
            <h2
              id="shadowing-question-title"
              className={questionExpanded ? "is-expanded" : ""}
            >
              {card.front}
            </h2>
            <div className="shadowing-question-actions">
              <button
                type="button"
                aria-expanded={questionExpanded}
                onClick={() => setQuestionExpanded((current) => !current)}
              >
                {questionExpanded ? "질문 접기" : "질문 펼치기"}
              </button>
              <button
                type="button"
                aria-expanded={showFrontKo}
                onClick={() => setShowFrontKo((current) => !current)}
              >
                {showFrontKo ? "한국어 뜻 숨기기" : "한국어 뜻 보기"}
              </button>
              <button
                type="button"
                className={questionSpeechTarget === "question" ? "is-playing" : ""}
                disabled={!isQuestionTtsSupported || recorderBusy}
                onClick={toggleQuestionSpeech}
              >
                {questionSpeechTarget === "question" ? "질문 듣기 중지" : "질문 듣기"}
              </button>
            </div>
            {showFrontKo && (
              <p className="shadowing-front-ko">
                {card.frontKo || "등록된 한국어 뜻이 없습니다."}
              </p>
            )}
            {questionTtsMessage && <p className="tts-message">{questionTtsMessage}</p>}
            <label className="shadowing-source-control">
              <span>연습 답변</span>
              <select
                value={source.sourceType}
                aria-label="쉐도잉 답변 종류"
                onChange={(event) =>
                  onSourceTypeChange?.(
                    event.target.value as "modelAnswer" | "myAnswer",
                  )
                }
              >
                <option value="modelAnswer">기본 답변</option>
                <option value="myAnswer" disabled={!myAnswer}>나만의 답변</option>
              </select>
            </label>
          </section>
        )}

        <section className="shadowing-playback-settings" aria-labelledby="shadowing-playback-settings-title">
          <div className="shadowing-playback-settings-heading">
            <div>
              <p className="eyebrow">REPEAT & REST</p>
              <h2 id="shadowing-playback-settings-title">반복과 따라 말하기 시간</h2>
            </div>
            <strong aria-live="polite">{repeatProgress}</strong>
          </div>
          <div className="shadowing-playback-settings-grid">
            <label>
              <span>반복 단위</span>
              <select
                value={playbackSettings.repeatMode}
                aria-label="쉐도잉 반복 단위"
                onChange={(event) =>
                  updatePlaybackSettings({ repeatMode: event.target.value as RepeatMode })
                }
              >
                {REPEAT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>반복 횟수</span>
              <select
                value={playbackSettings.repeatCount}
                aria-label="쉐도잉 반복 횟수"
                onChange={(event) => {
                  const repeatCount = parseRepeatCount(event.target.value);
                  if (repeatCount) updatePlaybackSettings({ repeatCount });
                }}
              >
                {REPEAT_COUNT_OPTIONS.map((option) => (
                  <option key={String(option.value)} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>문장 사이 휴식</span>
              <select
                value={playbackSettings.restLevel}
                aria-label="문장 사이 휴식 길이"
                onChange={(event) =>
                  updatePlaybackSettings({ restLevel: event.target.value as RestLevel })
                }
              >
                {REST_LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="shadowing-rest-description">
            {selectedRestOption?.description}. 현재 TTS 속도로 실제 읽은 시간을 기준으로 계산합니다.{" "}
            설정을 바꾸면 현재 문장은 유지하고 반복 진행은 처음부터 다시 셉니다.
          </p>
        </section>

        <AudioRecorder
          ref={recorderRef}
          className="shadowing-audio-recorder"
          scopeLabel={recordingScopeLabel}
          onBeforeRecord={() => {
            stopQuestion();
            interruptForExternalSpeech();
          }}
          onBeforePlayback={() => {
            stopQuestion();
            interruptForExternalSpeech();
          }}
          onStatusChange={setRecordingStatus}
        />

        <section className="shadowing-sentence-list" aria-label="쉐도잉 문장 목록">
          {paragraphs.map((paragraph, paragraphIndex) => {
            const isCurrentParagraph = paragraphIndex === currentParagraphIndex;
            const isRepeatTarget =
              playbackSettings.repeatMode === "paragraph" && isCurrentParagraph;
            return (
              <section
                className={`shadowing-paragraph ${isRepeatTarget ? "is-repeat-target" : ""}`}
                key={paragraph.id}
                aria-label={`${paragraphIndex + 1}번 문단`}
              >
                <button
                  type="button"
                  className="shadowing-paragraph-button"
                  aria-label={`${paragraphIndex + 1}번 문단부터 연습`}
                  aria-current={isCurrentParagraph ? "true" : undefined}
                  onClick={() => seekToSentence(paragraph.startSentenceIndex)}
                >
                  <span>문단 {paragraphIndex + 1}</span>
                  <small>{paragraph.sentences.length}문장</small>
                  {isRepeatTarget && <strong>반복 대상</strong>}
                </button>
                <div className="shadowing-paragraph-sentences">
                  {paragraph.sentences.map((sentence, localIndex) => {
                    const index = paragraph.startSentenceIndex + localIndex;
                    return (
                      <button
                        key={`${index}-${sentence.slice(0, 24)}`}
                        ref={(element) => { sentenceRefs.current[index] = element; }}
                        type="button"
                        className={`shadowing-sentence ${index === currentIndex ? "is-current" : ""}`}
                        aria-current={index === currentIndex ? "true" : undefined}
                        aria-label={`${index + 1}번 문장${index === currentIndex ? ", 현재 문장" : ""}`}
                        onClick={() => seekToSentence(index)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <p>{sentence}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      </main>

      <div className="shadowing-controls" aria-label="쉐도잉 재생 컨트롤">
        <div className="shadowing-control-grid">
          <button
            type="button"
            onClick={() => {
              recorderRef.current?.stopPlayback();
              restart();
            }}
            disabled={!isSupported || sentences.length === 0 || recorderBusy}
          >
            처음부터
          </button>
          <button
            type="button"
            onClick={() => {
              recorderRef.current?.stopPlayback();
              previousSentence();
            }}
            disabled={!canGoPrevious || recorderBusy}
          >
            이전 문장
          </button>
          <button
            type="button"
            className="shadowing-play-button"
            onClick={togglePlayback}
            disabled={!isSupported || sentences.length === 0 || recorderBusy}
            aria-label={playbackLabel}
          >
            {isPlaying ? "Ⅱ" : "▶"} {playbackLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              recorderRef.current?.stopPlayback();
              nextSentence();
            }}
            disabled={!canGoNext || recorderBusy}
          >
            다음 문장
          </button>
          <button
            type="button"
            onClick={() => {
              recorderRef.current?.stopPlayback();
              stop();
            }}
            disabled={status === "idle" || recorderBusy}
          >
            정지
          </button>
        </div>
        <label className="shadowing-rate-control">
          <span>속도</span>
          <select
            value={rate}
            aria-label="TTS 읽기 속도"
            onChange={(event) => updateRate(Number(event.target.value) as TtsRate)}
          >
            {TTS_RATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <p className="shadowing-shortcuts">Space 재생/일시정지 · ←/→ 문장 이동 · Home 첫 문장 · Esc 나가기</p>
      </div>
    </div>
  );
}
