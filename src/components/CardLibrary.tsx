import { useEffect, useRef, useState } from "react";
import type { DeckName, FirstLineStatusMap, OpicCard } from "../types";
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
import { CardList } from "./CardList";
import { TagFilter } from "./TagFilter";

type CardLibraryProps = {
  cards: OpicCard[];
  catalogCount: number;
  statuses: FirstLineStatusMap;
  myAnswers: MyAnswers;
  cardMemos: CardMemos;
  decks: DeckName[];
  tags: string[];
  selectedDeck: DeckName | "all";
  selectedTag: string;
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
};

export function CardLibrary({
  cards,
  catalogCount,
  statuses,
  myAnswers,
  cardMemos,
  decks,
  tags,
  selectedDeck,
  selectedTag,
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
}: CardLibraryProps) {
  const initialSessionRef = useRef(readCardLibrarySession());
  const visibleCountRef = useRef(CARD_LIBRARY_PAGE_SIZE);
  const filterSignatureRef = useRef(filterSignature);
  const previousFilterSignatureRef = useRef(filterSignature);
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
          <p>필터와 학습 순서를 정한 뒤 카드를 열거나 홈에서 첫 문장 연습을 시작하세요.</p>
        </div>
        <span className="card-count">전체 {catalogCount}장</span>
      </section>

      <TagFilter
        decks={decks}
        tags={tags}
        selectedDeck={selectedDeck}
        selectedTag={selectedTag}
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
      />

      <p className="card-library-result-count" aria-live="polite">
        총 {cards.length}장 중 {shownCards.length}장 표시
      </p>

      <CardList
        cards={shownCards}
        totalCount={cards.length}
        statuses={statuses}
        myAnswers={myAnswers}
        cardMemos={cardMemos}
        onSelect={selectCard}
      />

      {hasMore && (
        <button type="button" className="card-library-more-button" onClick={showMore}>
          카드 더 보기
          <span>다음 {Math.min(CARD_LIBRARY_PAGE_SIZE, cards.length - shownCards.length)}장</span>
        </button>
      )}
    </main>
  );
}
