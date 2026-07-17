import { useMemo, useState } from "react";
import type { OpicCard } from "../types";
import {
  formatMemoDate,
  getMemoCount,
  searchCardMemos,
  type CardMemos,
} from "../utils/cardMemoStorage";

type MemoSearchProps = {
  cards: OpicCard[];
  cardMemos: CardMemos;
  onOpenCard: (cardId: string, memoId: string) => void;
};

export function MemoSearch({ cards, cardMemos, onOpenCard }: MemoSearchProps) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchCardMemos(cardMemos, cards, query),
    [cardMemos, cards, query],
  );
  const totalMemoCount = getMemoCount(cardMemos);

  return (
    <section className="memo-search-section" aria-labelledby="memo-search-title">
      <div className="section-title-row memo-search-heading">
        <div>
          <p className="eyebrow">MEMO SEARCH</p>
          <h2 id="memo-search-title">전체 메모 검색</h2>
          <p>메모 내용과 카드 질문·한국어 뜻·덱·태그를 함께 검색합니다.</p>
        </div>
        <span className="card-count">{totalMemoCount}개</span>
      </div>

      <label className="memo-search-control" htmlFor="memo-search-input">
        <span>검색어</span>
        <input
          id="memo-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="메모, 질문, 태그 검색"
        />
      </label>

      <p className="memo-search-summary" aria-live="polite">
        {query.trim()
          ? `검색 결과 ${results.length}개`
          : `최근 메모 ${results.length}개 · 고정 우선`}
      </p>

      {results.length === 0 ? (
        <div className="memo-search-empty">
          <p>{totalMemoCount === 0 ? "아직 저장된 메모가 없어요." : "검색 결과가 없어요."}</p>
        </div>
      ) : (
        <div className="memo-search-results">
          {results.map(({ memo, card }) => (
            <article className="memo-search-result" key={memo.id}>
              <div className="memo-search-result-meta">
                <span>{memo.pinned ? "📌 고정 메모" : "메모"}</span>
                <time dateTime={memo.updatedAt}>{formatMemoDate(memo.updatedAt)}</time>
              </div>
              <p className="memo-search-content">{memo.content}</p>
              <div className="memo-search-card-info">
                <strong>{card?.hint.title ?? memo.cardId}</strong>
                <span>{card?.deck ?? "현재 카드 목록에 없는 메모입니다."}</span>
              </div>
              <button
                type="button"
                disabled={!card}
                aria-label={card ? `${card.hint.title} 카드에서 메모 열기` : "현재 카드 목록에 없는 메모"}
                onClick={() => card && onOpenCard(card.id, memo.id)}
              >
                {card ? "카드 열기" : "이동할 수 없음"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
