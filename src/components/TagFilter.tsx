import type { DeckName } from "../types";
import type {
  StudyCardScope,
  StudyOrder,
} from "../utils/studyPreferences";
import type { AnswerContentFilter } from "../utils/cardContent";
import type { ArchiveFilter } from "../utils/cardArchiveStorage";
import type { AnswerLearningStatusFilter } from "../utils/answerLearningSession";
import {
  getCardTagFilterOptions,
  type CardTagDimensionFilters,
} from "../utils/cardTagFilters";
import { CardTagDimensionFilters as CardTagDimensionFilterFields } from "./CardTagDimensionFilters";

type TagFilterProps = {
  decks: DeckName[];
  tags: string[];
  selectedDeck: DeckName | "all";
  selectedTag: string;
  selectedWeeks: string[];
  selectedTopics: string[];
  selectedTypes: string[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  favoriteOnly: boolean;
  finalOnly: boolean;
  hardOnly: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  onDeckChange: (deck: DeckName | "all") => void;
  onTagChange: (tag: string) => void;
  onTagDimensionsChange: (next: CardTagDimensionFilters) => void;
  onFavoriteOnlyChange: (checked: boolean) => void;
  onFinalOnlyChange: (checked: boolean) => void;
  onHardOnlyChange: (checked: boolean) => void;
  onCardScopeChange: (scope: StudyCardScope) => void;
  onStudyOrderChange: (order: StudyOrder) => void;
  onReset: () => void;
  answerLearningStatusFilter?: AnswerLearningStatusFilter;
  onAnswerLearningStatusFilterChange?: (
    value: AnswerLearningStatusFilter,
  ) => void;
  answerContentFilter?: AnswerContentFilter;
  onAnswerContentFilterChange?: (value: AnswerContentFilter) => void;
  answerStatusOnly?: boolean;
  onAnswerStatusOnlyChange?: (value: boolean) => void;
  archiveFilter?: ArchiveFilter;
  onArchiveFilterChange?: (value: ArchiveFilter) => void;
};

export function TagFilter({
  decks,
  tags,
  selectedDeck,
  selectedTag,
  selectedWeeks,
  selectedTopics,
  selectedTypes,
  searchQuery,
  onSearchQueryChange,
  favoriteOnly,
  finalOnly,
  hardOnly,
  cardScope,
  studyOrder,
  onDeckChange,
  onTagChange,
  onTagDimensionsChange,
  onFavoriteOnlyChange,
  onFinalOnlyChange,
  onHardOnlyChange,
  onCardScopeChange,
  onStudyOrderChange,
  onReset,
  answerLearningStatusFilter,
  onAnswerLearningStatusFilterChange,
  answerContentFilter,
  onAnswerContentFilterChange,
  answerStatusOnly,
  onAnswerStatusOnlyChange,
  archiveFilter,
  onArchiveFilterChange,
}: TagFilterProps) {
  const { otherTags } = getCardTagFilterOptions(tags);

  return (
    <section className="filter-panel" aria-labelledby="filter-title">
      <div className="filter-heading">
        <div>
          <p className="eyebrow">Filter and select cards</p>
          <h2 id="filter-title">카드 찾기 및 선택</h2>
        </div>
        <button className="text-button" type="button" onClick={onReset}>
          필터 초기화
        </button>
      </div>

      <div className="filter-grid">
        {searchQuery !== undefined && onSearchQueryChange && (
          <div className="card-library-search-control">
            <label className="field-label" htmlFor="card-library-content-search">
              <span>카드 내용 검색</span>
              <input
                id="card-library-content-search"
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="카드 내용 검색"
                aria-describedby="card-library-content-search-help"
              />
            </label>
            <p id="card-library-content-search-help" className="sr-only">
              질문, 첫 문장, 기본 답변, 번역, 힌트, 한글 흐름, 태그, 카드 메모와 나만의 답변에서 검색합니다.
            </p>
          </div>
        )}
        {archiveFilter && onArchiveFilterChange && (
          <label className="field-label">
            <span>카드 보관 상태</span>
            <select value={archiveFilter} onChange={(event) => onArchiveFilterChange(event.target.value as ArchiveFilter)}>
              <option value="active">사용 중</option>
              <option value="archived">보관됨</option>
              <option value="all">전체</option>
            </select>
          </label>
        )}
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

        <CardTagDimensionFilterFields
          tags={tags}
          selectedWeeks={selectedWeeks}
          selectedTopics={selectedTopics}
          selectedTypes={selectedTypes}
          onChange={onTagDimensionsChange}
        />

        {otherTags.length > 0 && (
          <label className="field-label">
            <span>기타 태그</span>
            <select
              value={selectedTag}
              onChange={(event) => onTagChange(event.target.value)}
            >
              <option value="all">전체 기타 태그</option>
              {otherTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        )}

        {answerContentFilter && onAnswerContentFilterChange && (
          <label className="field-label">
            <span>답변 구성</span>
            <select value={answerContentFilter} onChange={(event) => onAnswerContentFilterChange(event.target.value as AnswerContentFilter)}>
              <option value="all">전체</option>
              <option value="first-line-only">첫 문장 전용</option>
              <option value="full-answer">전체 답변 있음</option>
            </select>
          </label>
        )}

        {answerLearningStatusFilter && onAnswerLearningStatusFilterChange && (
          <label className="field-label">
            <span>답변 익히기 상태</span>
            <select
              value={answerLearningStatusFilter}
              onChange={(event) =>
                onAnswerLearningStatusFilterChange(
                  event.target.value as AnswerLearningStatusFilter,
                )
              }
            >
              <option value="all">전체</option>
              <option value="unlearned">답변 연습 상태 없음</option>
              <option value="with-status">답변 연습 상태 있음</option>
              <option value="hard">어려움</option>
              <option value="learning">익히는 중</option>
              <option value="speakable">말할 수 있음</option>
            </select>
          </label>
        )}

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
              checked={favoriteOnly}
              onChange={(event) => onFavoriteOnlyChange(event.target.checked)}
            />
            <span className="toggle-switch" aria-hidden="true" />
            <span>즐겨찾기만 보기</span>
          </label>

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

          {answerStatusOnly !== undefined && onAnswerStatusOnlyChange && (
            <label className="toggle-row first-line-answer-status-toggle">
              <input
                type="checkbox"
                checked={answerStatusOnly}
                onChange={(event) =>
                  onAnswerStatusOnlyChange(event.target.checked)
                }
              />
              <span className="toggle-switch" aria-hidden="true" />
              <span>답변 연습 상태 있음</span>
            </label>
          )}
        </div>
      </div>
    </section>
  );
}
