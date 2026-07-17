import type { DeckName } from "../types";
import type {
  StudyCardScope,
  StudyOrder,
} from "../utils/studyPreferences";

type TagFilterProps = {
  decks: DeckName[];
  tags: string[];
  selectedDeck: DeckName | "all";
  selectedTag: string;
  finalOnly: boolean;
  hardOnly: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  onDeckChange: (deck: DeckName | "all") => void;
  onTagChange: (tag: string) => void;
  onFinalOnlyChange: (checked: boolean) => void;
  onHardOnlyChange: (checked: boolean) => void;
  onCardScopeChange: (scope: StudyCardScope) => void;
  onStudyOrderChange: (order: StudyOrder) => void;
  onReset: () => void;
};

export function TagFilter({
  decks,
  tags,
  selectedDeck,
  selectedTag,
  finalOnly,
  hardOnly,
  cardScope,
  studyOrder,
  onDeckChange,
  onTagChange,
  onFinalOnlyChange,
  onHardOnlyChange,
  onCardScopeChange,
  onStudyOrderChange,
  onReset,
}: TagFilterProps) {
  return (
    <section className="filter-panel" aria-labelledby="filter-title">
      <div className="filter-heading">
        <div>
          <p className="eyebrow">STUDY FILTER</p>
          <h2 id="filter-title">오늘 연습할 카드 고르기</h2>
        </div>
        <button className="text-button" type="button" onClick={onReset}>
          필터 초기화
        </button>
      </div>

      <div className="filter-grid">
        <label className="field-label">
          <span>덱</span>
          <select
            value={selectedDeck}
            onChange={(event) =>
              onDeckChange(event.target.value as DeckName | "all")
            }
          >
            <option value="all">전체 덱</option>
            {decks.map((deck) => (
              <option key={deck} value={deck}>
                {deck}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          <span>태그</span>
          <select
            value={selectedTag}
            onChange={(event) => onTagChange(event.target.value)}
          >
            <option value="all">전체 태그</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          <span>학습 대상</span>
          <select
            value={cardScope}
            onChange={(event) =>
              onCardScopeChange(event.target.value as StudyCardScope)
            }
          >
            <option value="all">전체</option>
            <option value="new">새 카드</option>
          </select>
        </label>

        <label className="field-label">
          <span>학습 순서</span>
          <select
            value={studyOrder}
            onChange={(event) =>
              onStudyOrderChange(event.target.value as StudyOrder)
            }
          >
            <option value="default">기본 순서</option>
            <option value="random">랜덤</option>
            <option value="least-practiced">연습 횟수 적은 순</option>
          </select>
        </label>

        <p className="filter-scope-help">
          새 카드는 현재 평가 상태가 없는 카드입니다.
        </p>

        <div className="toggle-group" aria-label="빠른 필터">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={finalOnly}
              onChange={(event) => onFinalOnlyChange(event.target.checked)}
            />
            <span className="toggle-switch" aria-hidden="true" />
            <span>final_rep만 보기</span>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={hardOnly}
              onChange={(event) => onHardOnlyChange(event.target.checked)}
            />
            <span className="toggle-switch" aria-hidden="true" />
            <span>첫 문장 어려움만 보기</span>
          </label>
        </div>
      </div>
    </section>
  );
}
