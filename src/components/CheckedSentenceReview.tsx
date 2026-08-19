import { useMemo, useState } from "react";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import type { OpicCard } from "../types";
import type { AnswerLearningSentenceChecks } from "../utils/answerLearningSentenceChecks";
import {
  countCheckedSentenceReviewSentences,
  createCheckedSentenceReviewCards,
} from "../utils/checkedSentenceReview";
import { splitParagraphTexts } from "../utils/passageParagraphs";
import {
  isTtsRate,
  readTtsRate,
  saveTtsRate,
  stripQuestionPrefix,
  TTS_RATE_OPTIONS,
} from "../utils/ttsSettings";

type Props = {
  cards: readonly OpicCard[];
  myAnswers: Readonly<Record<string, string>>;
  checks: AnswerLearningSentenceChecks;
  onBack: () => void;
};

const sourceLabels = {
  default: "기본 답변",
  "my-answer": "나만의 답변",
} as const;

export function CheckedSentenceReview({ cards, myAnswers, checks, onBack }: Props) {
  const [ttsRate, setTtsRate] = useState(readTtsRate);
  const [expandedHints, setExpandedHints] = useState<Set<string>>(() => new Set());
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(() => new Set());
  const reviewCards = useMemo(
    () => createCheckedSentenceReviewCards(cards, myAnswers, checks),
    [cards, checks, myAnswers],
  );
  const sentenceCount = countCheckedSentenceReviewSentences(reviewCards);
  const { isSupported, message, speak, stop } = useSpeechSynthesis(ttsRate);

  function changeRate(rawValue: string) {
    const nextRate = Number(rawValue);
    if (!isTtsRate(nextRate)) return;
    stop();
    setTtsRate(nextRate);
    saveTtsRate(nextRate);
  }

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="checked-sentence-review-page">
      <section className="checked-sentence-review-summary">
        <button type="button" className="text-button" onClick={onBack}>← 홈으로</button>
        <div>
          <p className="eyebrow">CHECKED SENTENCES</p>
          <h1>체크 문장 모아보기</h1>
          <p>질문이나 체크 문장을 누르면 선택한 속도로 한 번 읽어 줍니다.</p>
        </div>
        <div className="checked-sentence-review-metrics">
          <label>
            <span>문장 듣기 속도</span>
            <select value={ttsRate} onChange={(event) => changeRate(event.target.value)}>
              {TTS_RATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <p><span>선택 질문 개수</span><strong>{reviewCards.length}</strong></p>
          <p><span>체크 답변 개수</span><strong>{sentenceCount}</strong></p>
        </div>
        <p className="checked-sentence-review-message" aria-live="polite">
          {!isSupported ? "이 브라우저에서는 음성 읽기를 지원하지 않습니다." : message}
        </p>
      </section>

      {reviewCards.length === 0 ? (
        <section className="checked-sentence-review-empty">
          <h2>아직 체크한 문장이 없습니다.</h2>
          <p>답변 익히기에서 다시 보고 싶은 문장의 체크 버튼을 눌러 주세요.</p>
        </section>
      ) : (
        <div className="checked-sentence-review-list">
          {reviewCards.map(({ card, sentences, answers }) => {
            const hintOpen = expandedHints.has(card.id);
            const answerOpen = expandedAnswers.has(card.id);
            return (
              <article key={card.id} className="checked-sentence-review-card">
                <div className="checked-sentence-review-meta">
                  <span>카드 ID · {card.id}</span>
                  <span>덱 · {card.deck}</span>
                </div>
                <button
                  type="button"
                  className="checked-sentence-review-question"
                  disabled={!isSupported}
                  onClick={() => speak(stripQuestionPrefix(card.front), "question")}
                >
                  <small>질문 · 눌러서 듣기</small>
                  <strong>{card.front}</strong>
                </button>
                <p className="checked-sentence-review-hint-title">힌트 제목 · {card.hint.title}</p>
                <div className="checked-sentence-review-sentences">
                  {sentences.map((sentence) => (
                    <button
                      type="button"
                      key={`${sentence.source}-${sentence.id}`}
                      disabled={!isSupported}
                      onClick={() => speak(sentence.text, "modelAnswer")}
                    >
                      <small>{sourceLabels[sentence.source]} · {sentence.sentenceIndex + 1}번 · 눌러서 듣기</small>
                      <span>{sentence.text}</span>
                    </button>
                  ))}
                </div>
                <div className="checked-sentence-review-actions">
                  <button type="button" aria-expanded={hintOpen} onClick={() => toggle(setExpandedHints, card.id)}>
                    {hintOpen ? "힌트 접기" : "힌트 펼치기"}
                  </button>
                  <button type="button" aria-expanded={answerOpen} onClick={() => toggle(setExpandedAnswers, card.id)}>
                    {answerOpen ? "전체 답변 접기" : "전체 답변 펼치기"}
                  </button>
                </div>
                {hintOpen && (
                  <div className="checked-sentence-review-expanded">
                    {card.hint.memoryTip && <p>{card.hint.memoryTip}</p>}
                    {card.hint.subjectTip && <p>{card.hint.subjectTip}</p>}
                    {card.hint.minimum && <p><strong>최소 답변</strong> {card.hint.minimum}</p>}
                    {card.hint.flow.map((step, index) => <p key={`${index}-${step}`}>{step}</p>)}
                  </div>
                )}
                {answerOpen && (
                  <div className="checked-sentence-review-expanded checked-sentence-review-answers">
                    {answers.map((answer) => (
                      <section key={answer.source}>
                        <h3>{sourceLabels[answer.source]}</h3>
                        {splitParagraphTexts(answer.text).map((paragraph, index) => (
                          <p key={`${answer.source}-${index}`}>{paragraph}</p>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
