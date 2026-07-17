import type { FirstLineStatusMap, OpicCard } from "../types";
import type { MyAnswers } from "../utils/myAnswerStorage";
import { selectHasMyAnswer } from "../utils/myAnswerStorage";
import {
  getMemoCount,
  getPinnedMemoCount,
  type CardMemos,
} from "../utils/cardMemoStorage";

type CardListProps = {
  cards: OpicCard[];
  statuses: FirstLineStatusMap;
  myAnswers: MyAnswers;
  cardMemos: CardMemos;
  onSelect: (card: OpicCard) => void;
};

const statusLabels = {
  success: "첫 문장 성공",
  again: "첫 문장 연습 필요",
  hard: "첫 문장 어려움",
} as const;

export function CardList({ cards, statuses, myAnswers, cardMemos, onSelect }: CardListProps) {
  if (cards.length === 0) {
    return (
      <section className="empty-state">
        <span className="empty-icon" aria-hidden="true">
          ◎
        </span>
        <h2>조건에 맞는 카드가 없어요</h2>
        <p>필터를 초기화하거나 다른 조건을 선택해 보세요.</p>
      </section>
    );
  }

  return (
    <section className="card-list-section" aria-labelledby="card-list-title">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">CARD LIBRARY</p>
          <h2 id="card-list-title">연습 카드</h2>
        </div>
        <span className="card-count">{cards.length}개</span>
      </div>

      <div className="card-grid">
        {cards.map((card, index) => {
          const status = statuses[card.id];
          const hasMyAnswer = selectHasMyAnswer(myAnswers, card.id);
          const memoCount = getMemoCount(cardMemos, card.id);
          const pinnedMemoCount = getPinnedMemoCount(cardMemos, card.id);
          return (
            <button
              className="study-card"
              type="button"
              key={card.id}
              onClick={() => onSelect(card)}
            >
              <div className="card-topline">
                <span className="card-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {status && (
                  <span className={`status-badge status-${status}`}>
                    {statusLabels[status]}
                  </span>
                )}
                {hasMyAnswer && (
                  <span className="my-answer-badge">
                    <span aria-hidden="true">✎</span> 내 답변
                  </span>
                )}
                {memoCount > 0 && (
                  <span className="memo-count-badge">
                    <span aria-hidden="true">{pinnedMemoCount > 0 ? "📌" : "📝"}</span>
                    메모 {memoCount}
                  </span>
                )}
              </div>

              <p className="deck-name">{card.deck}</p>
              <h3>{card.hint.title}</h3>
              <p className="card-question">{card.front}</p>

              <div className="tag-row" aria-label="카드 태그">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`tag-badge ${tag === "final_rep" ? "tag-final" : ""}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <span className="open-card-label">카드 열기 →</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
