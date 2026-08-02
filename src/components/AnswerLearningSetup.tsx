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
import { DEFAULT_ANSWER_LEARNING_FILTERS } from "../utils/answerLearningSession";
import {
  filterAnswerLearningCards,
  orderAnswerLearningCards,
} from "../utils/answerLearningSelectors";
import { StudyScopeSummary } from "./StudyScopeSummary";
import { CardTagDimensionFilters } from "./CardTagDimensionFilters";
import { getCardTagFilterOptions } from "../utils/cardTagFilters";

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
  backLabel: string;
  handoffCount: number | null;
  onClearHandoff: () => void;
};

const statusLabels = {
  hard: "어려움",
  learning: "익히는 중",
  speakable: "말할 수 있음",
} as const;

export function getAnswerLearningSelectionState(
  visibleCards: readonly Pick<OpicCard, "id">[],
  selectedCardIds: readonly string[],
) {
  const selected = new Set(selectedCardIds);
  const visibleCardIds = new Set(visibleCards.map((card) => card.id));
  const startCandidateCount = visibleCards.filter((card) => selected.has(card.id)).length;
  const hiddenSelectedCount = selectedCardIds.filter((cardId) => !visibleCardIds.has(cardId)).length;

  return {
    startCandidateCount,
    hiddenSelectedCount,
    allVisibleSelected: visibleCards.length > 0 && startCandidateCount === visibleCards.length,
    countLabel: `학습할 카드 ${startCandidateCount}장`,
    hiddenSelectionMessage: hiddenSelectedCount > 0
      ? `필터 밖에서 선택한 ${hiddenSelectedCount}장은 유지되지만 이번 학습에는 포함되지 않아요.`
      : null,
    startLabel: `선택한 ${startCandidateCount}장으로 답변 익히기 시작`,
    startDisabled: startCandidateCount === 0,
    clearDisabled: selectedCardIds.length === 0,
  };
}

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
  backLabel,
  handoffCount,
  onClearHandoff,
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
  const selectionState = getAnswerLearningSelectionState(visibleCards, session.selectedCardIds);
  const { otherTags } = getCardTagFilterOptions(tags);

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

  function selectAllVisible() {
    const visibleIds = visibleCards.map((card) => card.id);
    const next = [...new Set([...session.selectedCardIds, ...visibleIds])];
    onSessionChange({ ...session, selectedCardIds: next, screen: "setup" });
  }

  function clearSelection() {
    onSessionChange({ ...session, selectedCardIds: [], screen: "setup" });
  }

  return (
    <main className="answer-learning-setup">
      <section className="answer-learning-setup-intro">
        <button type="button" className="answer-learning-inline-back" onClick={onBack}>← {backLabel}</button>
        <p className="eyebrow">ANSWER LEARNING</p>
        <h1>답변 익히기 준비</h1>
        <p>힌트와 답변을 단계적으로 확인하며, 전체 내용을 끝까지 말할 수 있는지 익혀 보세요.</p>
      </section>

      {handoffCount !== null && (
        <section className="study-handoff-notice" aria-labelledby="answer-learning-handoff-title">
          <div>
            <p className="eyebrow">FROM CARD LIBRARY</p>
            <h2 id="answer-learning-handoff-title">카드 라이브러리 결과 {handoffCount}장</h2>
            <p>이 범위 안에서 답변 익히기 카드를 선택합니다.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onClearHandoff}>
            전체 카드 조건으로 전환
          </button>
        </section>
      )}

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
                filters: { ...DEFAULT_ANSWER_LEARNING_FILTERS },
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
          <CardTagDimensionFilters
            tags={tags}
            selectedWeeks={session.filters.selectedWeeks}
            selectedTopics={session.filters.selectedTopics}
            selectedTypes={session.filters.selectedTypes}
            onChange={(next) => updateFilters(next)}
          />
          {otherTags.length > 0 && (
            <label>
              <span>기타 태그</span>
              <select value={session.filters.tag} onChange={(event) => updateFilters({ tag: event.target.value })}>
                <option value="all">전체 기타 태그</option>
                {otherTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </label>
          )}
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
              <option value="unlearned">답변 연습 상태 없음</option>
              <option value="with-status">답변 연습 상태 있음</option>
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

      <section className="answer-learning-selection">
        <StudyScopeSummary
          className="answer-learning-scope"
          eyebrow="STUDY SCOPE"
          title="학습 범위"
          titleId="answer-selection-title"
          description={`현재 필터·정렬 결과 ${visibleCards.length}장 중 학습할 카드를 선택하세요.`}
          countLabel={selectionState.countLabel}
          note={selectionState.hiddenSelectionMessage && (
            <p className="answer-selection-hidden-note">
              {selectionState.hiddenSelectionMessage}
            </p>
          )}
          actions={(
            <>
              <div className="answer-selection-buttons">
                <button type="button" className="secondary-button" disabled={visibleCards.length === 0 || selectionState.allVisibleSelected} onClick={selectAllVisible}>
                  전체 선택
                </button>
                <button type="button" className="secondary-button" disabled={selectionState.clearDisabled} onClick={clearSelection}>
                  선택 해제
                </button>
              </div>
              <button type="button" className="primary-button answer-learning-start" disabled={selectionState.startDisabled} onClick={onStart}>
                {selectionState.startLabel}
              </button>
            </>
          )}
        />

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
      </section>
    </main>
  );
}
