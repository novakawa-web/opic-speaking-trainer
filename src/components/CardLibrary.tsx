import { useEffect, useRef, useState } from "react";
import type { AnswerLearningStatuses, DeckName, FirstLineStatusMap, OpicCard } from "../types";
import type { CardMemos } from "../utils/cardMemoStorage";
import {
  CARD_LIBRARY_PAGE_SIZE,
  getNextCardLibraryVisibleCount,
  readCardLibrarySession,
  resolveCardLibraryVisibleCount,
  saveCardLibrarySession,
} from "../utils/cardLibrarySession";
import type { MyAnswers } from "../utils/myAnswerStorage";
import type { StudyCardScope, StudyOrder } from "../utils/studyPreferences";
import type { AnswerContentFilter } from "../utils/cardContent";
import { CardList } from "./CardList";
import { TagFilter } from "./TagFilter";
import type { ArchiveFilter } from "../utils/cardArchiveStorage";
import type { AnswerLearningStatusFilter } from "../utils/answerLearningSession";
import { normalizeCardSearchQuery } from "../utils/cardSearch";
import { StudyScopeSummary } from "./StudyScopeSummary";

type CardLibraryProps = {
  cards: OpicCard[];
  catalogCount: number;
  statuses: FirstLineStatusMap;
  answerLearningStatuses: AnswerLearningStatuses;
  myAnswers: MyAnswers;
  cardMemos: CardMemos;
  decks: DeckName[];
  tags: string[];
  selectedDeck: DeckName | "all";
  selectedTag: string;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  finalOnly: boolean;
  hardOnly: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  filterSignature: string;
  onDeckChange: (deck: DeckName | "all") => void;
  onTagChange: (tag: string) => void;
  onFinalOnlyChange: (checked: boolean) => void;
  onHardOnlyChange: (checked: boolean) => void;
  onCardScopeChange: (scope: StudyCardScope) => void;
  onStudyOrderChange: (order: StudyOrder) => void;
  onReset: () => void;
  onSelect: (card: OpicCard) => void;
  onCreate: () => void;
  answerLearningCardCount: number;
  onStartFirstLine: () => void;
  onStartAnswerLearning: () => void;
  answerLearningStatusFilter: AnswerLearningStatusFilter;
  onAnswerLearningStatusFilterChange: (value: AnswerLearningStatusFilter) => void;
  answerContentFilter: AnswerContentFilter;
  onAnswerContentFilterChange: (value: AnswerContentFilter) => void;
  archiveFilter: ArchiveFilter;
  onArchiveFilterChange: (value: ArchiveFilter) => void;
  archivedCardIds: string[];
};

export function CardLibrary({
  cards,
  catalogCount,
  statuses,
  answerLearningStatuses,
  myAnswers,
  cardMemos,
  decks,
  tags,
  selectedDeck,
  selectedTag,
  searchQuery,
  onSearchQueryChange,
  finalOnly,
  hardOnly,
  cardScope,
  studyOrder,
  filterSignature,
  onDeckChange,
  onTagChange,
  onFinalOnlyChange,
  onHardOnlyChange,
  onCardScopeChange,
  onStudyOrderChange,
  onReset,
  onSelect,
  onCreate,
  answerLearningCardCount,
  onStartFirstLine,
  onStartAnswerLearning,
  answerLearningStatusFilter,
  onAnswerLearningStatusFilterChange,
  answerContentFilter,
  onAnswerContentFilterChange,
  archiveFilter,
  onArchiveFilterChange,
  archivedCardIds,
}: CardLibraryProps) {
  const initialSessionRef = useRef(readCardLibrarySession());
  const visibleCountRef = useRef(CARD_LIBRARY_PAGE_SIZE);
  const filterSignatureRef = useRef(filterSignature);
  const previousFilterSignatureRef = useRef(filterSignature);
  const previousSearchQueryRef = useRef(searchQuery);
  const [visibleCount, setVisibleCount] = useState(() =>
    resolveCardLibraryVisibleCount(initialSessionRef.current, filterSignature),
  );
  visibleCountRef.current = visibleCount;
  filterSignatureRef.current = filterSignature;

  const shownCards = cards.slice(0, visibleCount);
  const hasMore = shownCards.length < cards.length;

  useEffect(() => {
    const restored = initialSessionRef.current;
    if (restored.filterSignature !== filterSignature || restored.scrollY <= 0) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: restored.scrollY, behavior: "auto" });
    });
  }, []);

  useEffect(() => {
    const saveScroll = () => {
      saveCardLibrarySession({
        filterSignature: filterSignatureRef.current,
        visibleCount: visibleCountRef.current,
        scrollY: window.scrollY,
      });
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", saveScroll);
      saveScroll();
    };
  }, []);

  useEffect(() => {
    if (previousFilterSignatureRef.current === filterSignature) return;
    previousFilterSignatureRef.current = filterSignature;
    visibleCountRef.current = CARD_LIBRARY_PAGE_SIZE;
    setVisibleCount(CARD_LIBRARY_PAGE_SIZE);
    saveCardLibrarySession({
      filterSignature,
      visibleCount: CARD_LIBRARY_PAGE_SIZE,
      scrollY: 0,
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [filterSignature]);

  useEffect(() => {
    if (previousSearchQueryRef.current === searchQuery) return;
    previousSearchQueryRef.current = searchQuery;
    visibleCountRef.current = CARD_LIBRARY_PAGE_SIZE;
    setVisibleCount(CARD_LIBRARY_PAGE_SIZE);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [searchQuery]);

  function selectCard(card: OpicCard) {
    saveCardLibrarySession({
      filterSignature,
      visibleCount,
      scrollY: window.scrollY,
    });
    onSelect(card);
  }

  function showMore() {
    setVisibleCount((current) => {
      const next = getNextCardLibraryVisibleCount(current);
      saveCardLibrarySession({
        filterSignature,
        visibleCount: next,
        scrollY: window.scrollY,
      });
      return next;
    });
  }

  return (
    <main className="card-library-page">
      <section className="card-library-intro" aria-labelledby="card-library-page-title">
        <div>
          <p className="eyebrow">CARD LIBRARY</p>
          <h2 id="card-library-page-title">카드 라이브러리</h2>
          <p>필터 결과를 그대로 연습으로 보내거나, 카드를 열어 자세히 확인하세요.</p>
        </div>
        <div className="card-library-primary-actions">
          <span className="card-count">전체 {catalogCount}장</span>
          <button
            type="button"
            className="primary-button card-library-create-button"
            onClick={onCreate}
          >
            새 카드 추가
          </button>
        </div>
      </section>

      <TagFilter
        decks={decks}
        tags={tags}
        selectedDeck={selectedDeck}
        selectedTag={selectedTag}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        finalOnly={finalOnly}
        hardOnly={hardOnly}
        cardScope={cardScope}
        studyOrder={studyOrder}
        onDeckChange={onDeckChange}
        onTagChange={onTagChange}
        onFinalOnlyChange={onFinalOnlyChange}
        onHardOnlyChange={onHardOnlyChange}
        onCardScopeChange={onCardScopeChange}
        onStudyOrderChange={onStudyOrderChange}
        onReset={onReset}
        answerLearningStatusFilter={answerLearningStatusFilter}
        onAnswerLearningStatusFilterChange={onAnswerLearningStatusFilterChange}
        answerContentFilter={answerContentFilter}
        onAnswerContentFilterChange={onAnswerContentFilterChange}
        archiveFilter={archiveFilter}
        onArchiveFilterChange={onArchiveFilterChange}
      />

      <StudyScopeSummary
        className="card-library-study-actions"
        eyebrow="STUDY SCOPE"
        title="현재 결과로 연습"
        titleId="card-library-study-actions-title"
        description="현재 검색·필터 결과 전체를 학습 범위로 사용합니다."
        countLabel={`현재 결과 ${cards.length}장`}
        announceCount={false}
        note={answerLearningCardCount < cards.length && (
          <p className="card-library-study-note">
            보관 카드 {cards.length - answerLearningCardCount}장은 답변 익히기에서 제외됩니다.
          </p>
        )}
        actions={(
          <div className="card-library-study-buttons">
            <button
              type="button"
              className="secondary-button"
              disabled={cards.length === 0}
              onClick={onStartFirstLine}
            >
              첫 문장 연습 · {cards.length}장
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={answerLearningCardCount === 0}
              onClick={onStartAnswerLearning}
            >
              답변 익히기 · {answerLearningCardCount}장
            </button>
          </div>
        )}
      />

      <p className="card-library-result-count" aria-live="polite">
        총 {cards.length}장 중 {shownCards.length}장 표시
      </p>

      {cards.length === 0 && normalizeCardSearchQuery(searchQuery) ? (
        <section className="empty-state">
          <span className="empty-icon" aria-hidden="true">◎</span>
          <h2>일치하는 카드를 찾지 못했습니다.</h2>
          <p>검색어를 바꾸거나 필터를 초기화해 보세요.</p>
        </section>
      ) : (
        <CardList
          cards={shownCards}
          totalCount={cards.length}
          statuses={statuses}
          answerLearningStatuses={answerLearningStatuses}
          myAnswers={myAnswers}
          cardMemos={cardMemos}
          onSelect={selectCard}
          archivedCardIds={archivedCardIds}
        />
      )}

      {hasMore && (
        <button type="button" className="card-library-more-button" onClick={showMore}>
          카드 더 보기
          <span>다음 {Math.min(CARD_LIBRARY_PAGE_SIZE, cards.length - shownCards.length)}장</span>
        </button>
      )}
    </main>
  );
}
