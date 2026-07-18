import { useMemo } from "react";
import type {
  AnswerLearningStatuses,
  DeckName,
  OpicCard,
} from "../types";
import type { CardMemos } from "../utils/cardMemoStorage";
import { getMemoCount } from "../utils/cardMemoStorage";
import type { MyAnswers } from "../utils/myAnswerStorage";
import type {
  AnswerLearningFilters,
  AnswerLearningSession,
} from "../utils/answerLearningSession";
import {
  filterAnswerLearningCards,
  orderAnswerLearningCards,
} from "../utils/answerLearningSelectors";

type Props = {
  cards: OpicCard[];
  decks: DeckName[];
  tags: string[];
  statuses: AnswerLearningStatuses;
  myAnswers: MyAnswers;
  cardMemos: CardMemos;
  attemptCounts: Record<string, number>;
  session: AnswerLearningSession;
  onSessionChange: (session: AnswerLearningSession) => void;
  onStart: () => void;
  onBack: () => void;
};

const statusLabels = {
  hard: "어려움",
  learning: "익히는 중",
  speakable: "말할 수 있음",
} as const;

export function AnswerLearningSetup({
  cards,
  decks,
  tags,
  statuses,
  myAnswers,
  cardMemos,
  attemptCounts,
  session,
  onSessionChange,
  onStart,
  onBack,
}: Props) {
  const visibleCards = useMemo(
    () =>
      orderAnswerLearningCards(
        filterAnswerLearningCards(cards, session.filters, statuses, myAnswers),
        session.filters.order,
        attemptCounts,
      ),
    [attemptCounts, cards, myAnswers, session.filters, statuses],
  );
  const selected = new Set(session.selectedCardIds);
  const selectedVisibleCount = visibleCards.filter((card) => selected.has(card.id)).length;
  const allVisibleSelected = visibleCards.length > 0 && selectedVisibleCount === visibleCards.length;

  function updateFilters(updates: Partial<AnswerLearningFilters>) {
    onSessionChange({
      ...session,
      filters: { ...session.filters, ...updates },
      screen: "setup",
    });
  }

  function toggleCard(cardId: string) {
    const next = selected.has(cardId)
      ? session.selectedCardIds.filter((id) => id !== cardId)
      : [...session.selectedCardIds, cardId];
    onSessionChange({ ...session, selectedCardIds: next, screen: "setup" });
  }

  function toggleAllVisible() {
    const visibleIds = visibleCards.map((card) => card.id);
    const visibleSet = new Set(visibleIds);
    const next = allVisibleSelected
      ? session.selectedCardIds.filter((id) => !visibleSet.has(id))
      : [...new Set([...session.selectedCardIds, ...visibleIds])];
    onSessionChange({ ...session, selectedCardIds: next, screen: "setup" });
  }

  return (
    <main className="answer-learning-setup">
      <section className="answer-learning-setup-intro">
        <button type="button" className="answer-learning-inline-back" onClick={onBack}>← 홈으로</button>
        <p className="eyebrow">ANSWER LEARNING</p>
        <h1>답변 익히기 준비</h1>
        <p>힌트와 답변을 단계적으로 확인하며, 전체 내용을 끝까지 말할 수 있는지 익혀 보세요.</p>
      </section>

      <section className="answer-learning-filter" aria-labelledby="answer-filter-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">SELECT CARDS</p>
            <h2 id="answer-filter-title">학습 카드 고르기</h2>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onSessionChange({
                ...session,
                filters: {
                  deck: "all",
                  tag: "all",
                  finalOnly: false,
                  answerPresence: "all",
                  status: "all",
                  order: "default",
                },
                screen: "setup",
              })
            }
          >
            필터 초기화
          </button>
        </div>
        <div className="answer-learning-filter-grid">
          <label>
            <span>덱</span>
            <select value={session.filters.deck} onChange={(event) => updateFilters({ deck: event.target.value })}>
              <option value="all">전체 덱</option>
              {decks.map((deck) => <option key={deck} value={deck}>{deck}</option>)}
            </select>
          </label>
          <label>
            <span>태그</span>
            <select value={session.filters.tag} onChange={(event) => updateFilters({ tag: event.target.value })}>
              <option value="all">전체 태그</option>
              {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
          <label>
            <span>나만의 답변</span>
            <select value={session.filters.answerPresence} onChange={(event) => updateFilters({ answerPresence: event.target.value as AnswerLearningFilters["answerPresence"] })}>
              <option value="all">전체</option>
              <option value="with">있음</option>
              <option value="without">없음</option>
            </select>
          </label>
          <label>
            <span>답변 익히기 상태</span>
            <select value={session.filters.status} onChange={(event) => updateFilters({ status: event.target.value as AnswerLearningFilters["status"] })}>
              <option value="all">전체</option>
              <option value="unlearned">미학습</option>
              <option value="hard">어려움</option>
              <option value="learning">익히는 중</option>
              <option value="speakable">말할 수 있음</option>
            </select>
          </label>
          <label>
            <span>학습 순서</span>
            <select value={session.filters.order} onChange={(event) => updateFilters({ order: event.target.value as AnswerLearningFilters["order"] })}>
              <option value="default">기본 순서</option>
              <option value="random">랜덤</option>
              <option value="least-practiced">연습 횟수 적은 순</option>
            </select>
          </label>
          <label className="answer-final-filter">
            <input type="checkbox" checked={session.filters.finalOnly} onChange={(event) => updateFilters({ finalOnly: event.target.checked })} />
            <span>final_rep만 보기</span>
          </label>
        </div>
      </section>

      <section className="answer-learning-selection" aria-labelledby="answer-selection-title">
        <div className="answer-selection-toolbar">
          <div>
            <h2 id="answer-selection-title">카드 {visibleCards.length}장</h2>
            <p aria-live="polite">선택 {session.selectedCardIds.length}장 · 현재 결과에서 {selectedVisibleCount}장</p>
          </div>
          <div>
            <button type="button" className="secondary-button" disabled={visibleCards.length === 0} onClick={toggleAllVisible}>
              {allVisibleSelected ? "현재 결과 선택 해제" : "현재 결과 전체 선택"}
            </button>
            <button type="button" className="text-button" disabled={session.selectedCardIds.length === 0} onClick={() => onSessionChange({ ...session, selectedCardIds: [], screen: "setup" })}>
              전체 선택 해제
            </button>
          </div>
        </div>

        {visibleCards.length === 0 ? (
          <p className="answer-learning-empty">조건에 맞는 카드가 없어요.</p>
        ) : (
          <div className="answer-learning-card-checklist">
            {visibleCards.map((card) => {
              const status = statuses[card.id];
              const memoCount = getMemoCount(cardMemos, card.id);
              return (
                <label key={card.id} className="answer-learning-card-option">
                  <input type="checkbox" checked={selected.has(card.id)} onChange={() => toggleCard(card.id)} />
                  <span className="answer-learning-card-copy">
                    <strong>{card.hint.title}</strong>
                    <span>{card.front}</span>
                    <small>
                      {status ? `답변: ${statusLabels[status]}` : "답변: 미학습"}
                      {myAnswers[card.id] ? " · 내 답변" : ""}
                      {memoCount ? ` · 메모 ${memoCount}` : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <button type="button" className="primary-button answer-learning-start" disabled={session.selectedCardIds.length === 0} onClick={onStart}>
          선택한 {session.selectedCardIds.length}장으로 답변 익히기 시작
        </button>
        {session.selectedCardIds.length === 0 && <p className="disabled-reason">학습할 카드를 한 장 이상 선택해 주세요.</p>}
      </section>
    </main>
  );
}
