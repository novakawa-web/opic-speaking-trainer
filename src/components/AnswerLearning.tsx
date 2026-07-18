import { useCallback, useEffect, useMemo, useState } from "react";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import type {
  AnswerLearningAnswerSource,
  AnswerLearningStatus,
  OpicCard,
} from "../types";
import type { AnswerLearningRevealState } from "../utils/answerLearningSession";
import { extractMyFirstLine } from "../utils/myAnswerStorage";
import { createModelAnswerSource, createMyAnswerSource, type ShadowingSource } from "../utils/shadowingPlayer";
import { segmentEnglishText } from "../utils/sentenceSegmenter";
import { readTtsRate, stripQuestionPrefix } from "../utils/ttsSettings";
import { isFirstLineOnlyCard } from "../utils/cardContent";

type Props = {
  card: OpicCard;
  myAnswer?: string;
  status: AnswerLearningStatus | null;
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
  onUndo: () => void;
  onReset: () => void;
  onStartShadowing: (source: ShadowingSource) => void;
  onBack: () => void;
};

const statusOptions = [
  { value: "hard", label: "어려움", symbol: "!" },
  { value: "learning", label: "익히는 중", symbol: "↻" },
  { value: "speakable", label: "말할 수 있음", symbol: "✓" },
] as const;

export function AnswerLearning({
  card,
  myAnswer,
  status,
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
  onUndo,
  onReset,
  onStartShadowing,
  onBack,
}: Props) {
  const [ttsRate] = useState(readTtsRate);
  const { isSupported, activeTarget, message, speak, stop } = useSpeechSynthesis(ttsRate);
  const modelText = card.back.join("\n");
  const resolvedSource = answerSource === "my-answer" && myAnswer ? "my-answer" : "default";
  const missingFullAnswer = isFirstLineOnlyCard(card) && resolvedSource === "default";
  const answerText = resolvedSource === "my-answer" ? myAnswer! : modelText;
  const firstLine = resolvedSource === "my-answer" ? extractMyFirstLine(answerText) : card.firstLine;
  const sentences = useMemo(() => segmentEnglishText(answerText), [answerText]);
  const shadowingSource = missingFullAnswer ? null : resolvedSource === "my-answer"
    ? createMyAnswerSource(card, answerText)
    : createModelAnswerSource(card);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => stop(), [card.id, stop]);

  const goPrevious = useCallback(() => {
    stop();
    onPrevious();
  }, [onPrevious, stop]);
  const goNext = useCallback(() => {
    stop();
    onNext();
  }, [onNext, stop]);
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: canGoNext ? goNext : undefined,
    onSwipeRight: canGoPrevious ? goPrevious : undefined,
  });

  function toggle(key: keyof AnswerLearningRevealState) {
    onRevealChange({ ...reveal, [key]: !reveal[key] });
  }

  function toggleSpeech(text: string, target: "question" | "firstLine" | "modelAnswer" | "myAnswer") {
    if (activeTarget === target) stop();
    else speak(text, target);
  }

  return (
    <main className="answer-learning-page" {...swipeHandlers}>
      <section className="answer-learning-question">
        <div className="answer-learning-progress" aria-live="polite">
          <button type="button" className="answer-learning-inline-back" onClick={() => { stop(); onBack(); }}>← 준비 화면</button>
          <strong>{currentPosition} / {totalCards} 카드</strong>
          <span>{card.deck}</span>
        </div>
        <h1>{card.front}</h1>
        <div className="answer-learning-question-actions">
          <button type="button" className={activeTarget === "question" ? "is-playing" : ""} disabled={!isSupported} onClick={() => toggleSpeech(stripQuestionPrefix(card.front), "question")}>
            {activeTarget === "question" ? "문제 듣기 중지" : "문제 듣기"}
          </button>
          <button type="button" aria-expanded={reveal.frontKo} onClick={() => toggle("frontKo")}>
            {reveal.frontKo ? "한국어 뜻 숨기기" : "한국어 뜻 보기"}
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
            {card.hint.flow.length > 0 && <ol>{card.hint.flow.map((step) => <li key={step}>{step}</li>)}</ol>}
          </div>
        )}
        {reveal.firstLine && (
          <div className="answer-learning-first-line">
            <p>{firstLine}</p>
            <button type="button" disabled={!isSupported} onClick={() => toggleSpeech(firstLine, "firstLine")}>
              {activeTarget === "firstLine" ? "첫 문장 듣기 중지" : "첫 문장 듣기"}
            </button>
          </div>
        )}
        {reveal.answer && (
          <div className="answer-learning-answer">
            <div className="answer-learning-tabs" role="tablist" aria-label="답변 종류">
              <button type="button" role="tab" aria-selected={resolvedSource === "default"} onClick={() => onAnswerSourceChange("default")}>기본 답변</button>
              <button type="button" role="tab" aria-selected={resolvedSource === "my-answer"} disabled={!myAnswer} onClick={() => onAnswerSourceChange("my-answer")}>나만의 답변</button>
            </div>
            <div className="answer-learning-answer-actions">
              <button type="button" disabled={!isSupported} onClick={() => toggleSpeech(answerText, resolvedSource === "my-answer" ? "myAnswer" : "modelAnswer")}>
                {activeTarget === (resolvedSource === "my-answer" ? "myAnswer" : "modelAnswer") ? "전체 답변 듣기 중지" : "전체 답변 듣기"}
              </button>
            </div>
            <div className="answer-learning-sentences">
              {sentences.map((sentence, index) => (
                <button key={`${card.id}-${index}`} type="button" onClick={() => speak(sentence, resolvedSource === "my-answer" ? "myAnswer" : "modelAnswer")}>
                  <span>{index + 1}</span>{sentence}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="answer-learning-rating" aria-labelledby="answer-learning-rating-title">
        <h2 id="answer-learning-rating-title">전체 답변을 얼마나 말할 수 있나요?</h2>
        <p>완벽히 외웠는지보다, 핵심 내용을 연결해 끝까지 말할 수 있는지를 기준으로 선택하세요.</p>
        <div className="answer-learning-status-buttons">
          {statusOptions.map((option) => (
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
        <button type="button" className="secondary-button answer-learning-shadowing" disabled={!shadowingSource} aria-describedby={!shadowingSource ? `shadowing-unavailable-${card.id}` : undefined} onClick={() => { if (!shadowingSource) return; stop(); onStartShadowing(shadowingSource); }}>
          이 답변 쉐도잉하기
        </button>
        {!shadowingSource && <p id={`shadowing-unavailable-${card.id}`} className="disabled-reason">전체 답변이 없어 쉐도잉을 시작할 수 없습니다.</p>}
        <p className="answer-learning-feedback" aria-live="polite">{feedbackMessage || message}</p>
      </section>

      <nav className="answer-learning-navigation" aria-label="답변 익히기 카드 이동">
        <button type="button" disabled={!canGoPrevious} aria-label="이전 카드" onClick={goPrevious}>이전</button>
        <strong>{currentPosition} / {totalCards}</strong>
        <button type="button" disabled={!canGoNext} aria-label="다음 카드" onClick={goNext}>다음</button>
      </nav>
    </main>
  );
}
