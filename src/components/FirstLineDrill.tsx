import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import type { FirstLineResult, FirstLineStatus, OpicCard } from "../types";
import { activateButton } from "../utils/buttonFocus";
import {
  readAutoAdvanceAfterRating,
  saveAutoAdvanceAfterRating,
} from "../utils/studyPreferences";
import {
  isTtsRate,
  readQuestionTtsAutoplay,
  readTtsRate,
  saveQuestionTtsAutoplay,
  saveTtsRate,
  stripQuestionPrefix,
  TTS_RATE_OPTIONS,
} from "../utils/ttsSettings";
import { ShortcutHelp } from "./ShortcutHelp";
import { StudyNavigation } from "./StudyNavigation";
import type { FirstLineMode } from "../utils/firstLineMockSession";

type FirstLineDrillProps = {
  card: OpicCard;
  status: FirstLineStatus;
  currentPosition: number;
  totalCards: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  backLabel: string;
  undoTarget: {
    cardId: string;
    cardTitle: string;
    statusLabel: string;
  } | null;
  feedbackMessage: string | null;
  onStatusChange: (status: Exclude<FirstLineStatus, null>) => void;
  onUndo: () => void;
  onResetStatus: () => void;
  onBack: () => void;
  onPrevious: () => void;
  onNext: (source?: "manual" | "auto") => void;
  mode?: FirstLineMode;
};

const statusOptions = [
  { value: "success", label: "성공", symbol: "✓", shortcut: "A" },
  { value: "again", label: "연습 필요", symbol: "↻", shortcut: "S" },
  { value: "hard", label: "어려움", symbol: "!", shortcut: "D" },
] as const;

const drillShortcuts = [
  { keyLabel: "Q", description: "이전 카드" },
  { keyLabel: "W", description: "다음 카드" },
  { keyLabel: "Enter", description: "다음 카드" },
  { keyLabel: "Space", description: "첫 문장 보기·숨기기" },
  { keyLabel: "A", description: "성공" },
  { keyLabel: "S", description: "연습 필요" },
  { keyLabel: "D", description: "어려움" },
  { keyLabel: "Z", description: "실행 취소" },
];

const SWIPE_HINT_SESSION_KEY = "opic-swipe-navigation-hint-seen";

function shouldShowSwipeHint() {
  try {
    return sessionStorage.getItem(SWIPE_HINT_SESSION_KEY) !== "true";
  } catch {
    return true;
  }
}

function rememberSwipeHint() {
  try {
    sessionStorage.setItem(SWIPE_HINT_SESSION_KEY, "true");
  } catch {
    // The hint can still be shown when session storage is unavailable.
  }
}

export function FirstLineDrill({
  card,
  status,
  currentPosition,
  totalCards,
  canGoPrevious,
  canGoNext,
  backLabel,
  undoTarget,
  feedbackMessage,
  onStatusChange,
  onUndo,
  onResetStatus,
  onBack,
  onPrevious,
  onNext,
  mode = "practice",
}: FirstLineDrillProps) {
  const [showFirstLine, setShowFirstLine] = useState(false);
  const [showFrontKo, setShowFrontKo] = useState(false);
  const [questionAutoplay, setQuestionAutoplay] = useState(
    readQuestionTtsAutoplay,
  );
  const [ttsRate, setTtsRate] = useState(readTtsRate);
  const [autoAdvance, setAutoAdvance] = useState(
    readAutoAdvanceAfterRating,
  );
  const [autoAdvanceMessage, setAutoAdvanceMessage] = useState<string | null>(
    null,
  );
  const [showSwipeHint, setShowSwipeHint] = useState(shouldShowSwipeHint);
  const [countdown, setCountdown] = useState(3);
  const autoplayRef = useRef(questionAutoplay);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const questionText = stripQuestionPrefix(card.front);
  const {
    isSupported: isTtsSupported,
    activeTarget,
    message: ttsMessage,
    speak,
    stop,
    clearMessage,
  } = useSpeechSynthesis(ttsRate);

  autoplayRef.current = questionAutoplay;

  const toggleFirstLine = useCallback(() => {
    setShowFirstLine((current) => !current);
  }, []);

  const cancelAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setAutoAdvanceMessage(null);
  }, []);

  const saveStatus = useCallback(
    (nextStatus: FirstLineResult) => {
      if (mode === "mock" && !showFirstLine) return;
      cancelAutoAdvance();
      onStatusChange(nextStatus);

      if (!autoAdvance) return;
      if (!canGoNext) {
        setAutoAdvanceMessage("마지막 카드입니다. 이번 훈련을 완료했어요.");
        return;
      }

      setAutoAdvanceMessage("저장했습니다. 다음 카드로 이동합니다.");
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        setAutoAdvanceMessage(null);
        stop();
        onNext("auto");
      }, 450);
    },
    [autoAdvance, canGoNext, cancelAutoAdvance, mode, onNext, onStatusChange, showFirstLine, stop],
  );
  const goBack = useCallback(() => {
    cancelAutoAdvance();
    stop();
    onBack();
  }, [cancelAutoAdvance, onBack, stop]);
  const goPrevious = useCallback(() => {
    cancelAutoAdvance();
    stop();
    onPrevious();
  }, [cancelAutoAdvance, onPrevious, stop]);
  const goNext = useCallback(() => {
    cancelAutoAdvance();
    stop();
    onNext("manual");
  }, [cancelAutoAdvance, onNext, stop]);
  const swipePrevious = useCallback(() => {
    setShowSwipeHint(false);
    goPrevious();
  }, [goPrevious]);
  const swipeNext = useCallback(() => {
    setShowSwipeHint(false);
    goNext();
  }, [goNext]);
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: canGoNext ? swipeNext : undefined,
    onSwipeRight: canGoPrevious ? swipePrevious : undefined,
  });
  const undoLastSelection = useCallback(() => {
    cancelAutoAdvance();
    onUndo();
  }, [cancelAutoAdvance, onUndo]);

  const toggleQuestionSpeech = useCallback(() => {
    if (activeTarget === "question") {
      stop();
      return;
    }
    speak(questionText, "question", "manual");
  }, [activeTarget, questionText, speak, stop]);

  const toggleFirstLineSpeech = useCallback(() => {
    if (activeTarget === "firstLine") {
      stop();
      return;
    }
    speak(card.firstLine, "firstLine", "manual");
  }, [activeTarget, card.firstLine, speak, stop]);

  function changeAutoplay(enabled: boolean) {
    clearMessage();
    setQuestionAutoplay(enabled);
    autoplayRef.current = enabled;
    saveQuestionTtsAutoplay(enabled);
  }

  function changeRate(rawValue: string) {
    const nextRate = Number(rawValue);
    if (!isTtsRate(nextRate)) return;
    stop();
    clearMessage();
    setTtsRate(nextRate);
    saveTtsRate(nextRate);
  }

  function changeAutoAdvance(enabled: boolean) {
    if (!enabled) cancelAutoAdvance();
    setAutoAdvance(enabled);
    saveAutoAdvanceAfterRating(enabled);
  }

  useEffect(() => {
    setShowFirstLine(false);
    setShowFrontKo(false);
    cancelAutoAdvance();
    stop();
    clearMessage();

    if ((mode !== "mock" && !autoplayRef.current) || !isTtsSupported) return;

    // Defer until the new card has committed; cancellation keeps rapid navigation safe.
    const timerId = window.setTimeout(() => {
      speak(questionText, "question", "autoplay");
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      stop();
    };
  }, [
    card.id,
    cancelAutoAdvance,
    clearMessage,
    isTtsSupported,
    questionText,
    speak,
    stop,
    mode,
  ]);

  useEffect(() => {
    if (mode !== "mock") return;
    setCountdown(3);
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [card.id, mode]);

  useEffect(
    () => () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, [stop]);

  useEffect(() => {
    if (showSwipeHint) rememberSwipeHint();
  }, [showSwipeHint]);

  useKeyboardShortcuts({
    q: canGoPrevious ? goPrevious : undefined,
    w: canGoNext ? goNext : undefined,
    Enter: canGoNext ? goNext : undefined,
    Space: toggleFirstLine,
    a: mode === "mock" && !showFirstLine ? undefined : () => saveStatus("success"),
    s: mode === "mock" && !showFirstLine ? undefined : () => saveStatus("again"),
    d: mode === "mock" && !showFirstLine ? undefined : () => saveStatus("hard"),
    z: undoTarget ? undoLastSelection : undefined,
  });

  const undoTargetsCurrentCard = undoTarget?.cardId === card.id;
  const undoSummary = undoTarget
    ? undoTargetsCurrentCard
      ? `${undoTarget.cardTitle} · ${undoTarget.statusLabel}`
      : `이전 카드에 ‘${undoTarget.statusLabel}’로 저장했습니다.`
    : "취소할 최근 선택이 없습니다.";
  const undoAriaLabel = undoTarget
    ? `${undoTarget.cardTitle}의 ${undoTarget.statusLabel} 선택 실행 취소`
    : "실행 취소할 최근 선택 없음";

  return (
    <main className="drill-page">
      <section className="drill-card" {...swipeHandlers}>
        <div className="drill-decoration" aria-hidden="true" />
        <div className="drill-content">
          <span className="drill-kicker">{mode === "mock" ? "첫 문장 모의고사" : "3초 안에 시작해 보세요"}</span>
          {mode === "mock" && (
            <div className={`mock-countdown ${countdown === 0 ? "is-finished" : ""}`} role="timer" aria-live="polite">
              {countdown > 0 ? <><strong>{countdown}</strong><span>초 안에 첫 문장을 시작하세요</span></> : <span>말한 뒤 정답을 확인하세요</span>}
            </div>
          )}
          {showSwipeHint ? (
            <p className="swipe-hint" role="note">
              좌우로 밀어 카드를 이동할 수 있어요
            </p>
          ) : null}
          <div className="drill-question-area">
            <button
              className="question-side-button is-previous"
              type="button"
              aria-label="이전 카드"
              disabled={!canGoPrevious}
              onClick={(event) => activateButton(event, goPrevious)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <h1>{card.front}</h1>
            <button
              className="question-side-button is-next"
              type="button"
              aria-label="다음 카드"
              disabled={!canGoNext}
              onClick={(event) => activateButton(event, goNext)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>

          <div className="question-tools" aria-label="문제 학습 도구">
            <button
              className="speech-button"
              type="button"
              disabled={!isTtsSupported}
              aria-pressed={activeTarget === "question"}
              onClick={(event) => activateButton(event, toggleQuestionSpeech)}
            >
              <span aria-hidden="true">{activeTarget === "question" ? "■" : "🔊"}</span>
              {activeTarget === "question" ? "문제 듣기 중지" : "문제 듣기"}
            </button>
            <button
              className="translation-toggle"
              type="button"
              aria-expanded={showFrontKo}
              onClick={(event) =>
                activateButton(event, () => setShowFrontKo((current) => !current))
              }
            >
              {showFrontKo ? "한국어 뜻 숨기기" : "한국어 뜻 보기"}
            </button>
          </div>

          {showFrontKo ? (
            <div className="question-translation" role="region" aria-label="문제 한국어 뜻">
              {card.frontKo || "등록된 한국어 뜻이 없습니다"}
            </div>
          ) : null}

          <div className="self-check rating-first">
            <div className="status-buttons">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`status-button status-button-${option.value} ${
                    status === option.value ? "is-selected" : ""
                  }`}
                  aria-pressed={status === option.value}
                  aria-keyshortcuts={option.shortcut}
                  disabled={mode === "mock" && !showFirstLine}
                  onClick={(event) =>
                    activateButton(event, () => saveStatus(option.value))
                  }
                >
                  <span className="status-button-content">
                    <span className="status-button-icon" aria-hidden="true">
                      {option.symbol}
                    </span>
                    <span className="status-button-label">{option.label}</span>
                  </span>
                </button>
              ))}
            </div>

          </div>

          <p className="drill-instruction">
            질문을 보고 첫 문장만 소리 내어 말한 뒤 정답을 확인하세요.
          </p>

          <div className="first-line-stage">
            <div className="first-line-actions">
              <button
                className="reveal-button"
                type="button"
                aria-expanded={showFirstLine}
                aria-keyshortcuts="Space"
                onClick={(event) => activateButton(event, toggleFirstLine)}
              >
                {showFirstLine ? "다시 도전" : mode === "mock" ? "정답 확인" : "첫 문장 보기"}
              </button>
              <button
                className="speech-button first-line-speech-button"
                type="button"
                disabled={!isTtsSupported}
                aria-pressed={activeTarget === "firstLine"}
                onClick={(event) => activateButton(event, toggleFirstLineSpeech)}
              >
                <span aria-hidden="true">
                  {activeTarget === "firstLine" ? "■" : "🔊"}
                </span>
                {activeTarget === "firstLine"
                  ? "첫 문장 듣기 중지"
                  : "첫 문장 듣기"}
              </button>
            </div>
            <nav
              className="mobile-drill-navigation"
              aria-label="모바일 학습 카드 이동"
            >
              <button
                className="navigation-button"
                type="button"
                aria-label="이전 카드"
                disabled={!canGoPrevious}
                onClick={(event) => activateButton(event, goPrevious)}
              >
                <span aria-hidden="true">‹</span> 이전
              </button>
              <button
                className="navigation-button"
                type="button"
                aria-label="다음 카드"
                disabled={!canGoNext}
                onClick={(event) => activateButton(event, goNext)}
              >
                다음 <span aria-hidden="true">›</span>
              </button>
            </nav>
            {showFirstLine ? (
              <div
                className="first-line-box"
                role="region"
                aria-label="첫 문장 정답"
              >
                <span>FIRST LINE</span>
                <p>{card.firstLine}</p>
              </div>
            ) : null}
          </div>

          <div className="drill-divider" />

          <div className="drill-settings-group">
            <div className="tts-settings" aria-label="학습 및 영어 음성 설정">
              <label className="tts-autoplay-toggle">
                <span className="compact-setting-label">자동재생</span>
                <span className="compact-toggle-control">
                  <input
                    type="checkbox"
                    aria-label="카드 전환 시 문제 자동재생"
                    checked={questionAutoplay}
                    disabled={!isTtsSupported}
                    onChange={(event) => changeAutoplay(event.target.checked)}
                  />
                  <span aria-hidden="true" className="tts-toggle-track" />
                  <strong>{questionAutoplay ? "켬" : "끔"}</strong>
                </span>
              </label>
              <label className="tts-rate-control">
                <span className="compact-setting-label">속도</span>
                <select
                  aria-label="TTS 읽기 속도"
                  value={ttsRate}
                  disabled={!isTtsSupported}
                  onPointerDown={(event) => {
                    event.currentTarget.dataset.focusOrigin = "pointer";
                  }}
                  onKeyDown={(event) => {
                    delete event.currentTarget.dataset.focusOrigin;
                  }}
                  onBlur={(event) => {
                    delete event.currentTarget.dataset.focusOrigin;
                  }}
                  onChange={(event) => changeRate(event.target.value)}
                >
                  {TTS_RATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="auto-advance-setting">
                <span className="compact-setting-label">자동 넘김</span>
                <span className="compact-toggle-control">
                  <input
                    type="checkbox"
                    aria-label="상태 선택 후 자동으로 다음 카드"
                    checked={autoAdvance}
                    onChange={(event) => changeAutoAdvance(event.target.checked)}
                  />
                  <span aria-hidden="true" className="tts-toggle-track" />
                  <strong>{autoAdvance ? "켬" : "끔"}</strong>
                </span>
              </label>
            </div>

            <div className="tts-message-slot" aria-live="polite">
              {!isTtsSupported ? (
                <p>이 브라우저에서는 영어 음성 재생을 지원하지 않습니다.</p>
              ) : ttsMessage ? (
                <p>{ttsMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="self-check">
            <div
              className={`recent-rating-bar ${undoTarget ? "has-target" : ""}`}
              aria-live="polite"
            >
              <p title={undoTarget?.cardTitle}>{undoSummary}</p>
              <button
                className="undo-button"
                type="button"
                disabled={!undoTarget}
                aria-keyshortcuts="Z"
                aria-label={undoAriaLabel}
                onClick={(event) => activateButton(event, undoLastSelection)}
              >
                <span aria-hidden="true">↶</span>
                실행 취소
              </button>
            </div>

            <div className="status-reset-row">
              <button
                className="status-reset-button"
                type="button"
                disabled={status === null}
                onClick={(event) => activateButton(event, onResetStatus)}
              >
                현재 카드 상태 초기화
              </button>
              <p>현재 상태만 지우며 학습 기록은 유지됩니다.</p>
            </div>

            <div className="feedback-section">
              <div className="saved-message-slot" aria-live="polite">
                {autoAdvanceMessage ? (
                  <p className="status-feedback-message" role="status">
                    {autoAdvanceMessage}
                  </p>
                ) : feedbackMessage ? (
                  <p className="status-feedback-message" role="status">
                    {feedbackMessage}
                  </p>
                ) : status ? (
                  <p className="saved-message" role="status">
                    저장되었습니다. 새로고침해도 이 상태가 유지돼요.
                  </p>
                ) : null}
              </div>

              <div className="self-check-guidance">
                <h2>어땠나요?</h2>
                <p>생각보다 결과가 아닌, 오늘의 느낌대로 기록하면 됩니다.</p>
              </div>
            </div>

            <StudyNavigation
              bottom
              currentPosition={currentPosition}
              totalCards={totalCards}
              backLabel={backLabel}
              canGoPrevious={canGoPrevious}
              canGoNext={canGoNext}
              onBack={goBack}
              onPrevious={goPrevious}
              onNext={goNext}
            />

            <ShortcutHelp items={drillShortcuts} defaultExpanded={false} />
          </div>
        </div>
      </section>
    </main>
  );
}
