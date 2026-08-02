import type { DeckName } from "../types";
import type { AnswerContentFilter } from "../utils/cardContent";
import type { FirstLineMode, MockQuestionCount } from "../utils/firstLineMockSession";
import type { StudyCardScope, StudyOrder } from "../utils/studyPreferences";
import { TagFilter } from "./TagFilter";
import type { ArchiveFilter } from "../utils/cardArchiveStorage";
import { StudyScopeSummary } from "./StudyScopeSummary";
import type { CardTagDimensionFilters } from "../utils/cardTagFilters";

type Props = {
  cardCount: number;
  decks: DeckName[];
  tags: string[];
  selectedDeck: DeckName | "all";
  selectedTag: string;
  selectedWeeks: string[];
  selectedTopics: string[];
  selectedTypes: string[];
  finalOnly: boolean;
  hardOnly: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  answerContentFilter: AnswerContentFilter;
  answerStatusOnly: boolean;
  mode: FirstLineMode;
  questionCount: MockQuestionCount;
  onDeckChange: (value: DeckName | "all") => void;
  onTagChange: (value: string) => void;
  onTagDimensionsChange: (next: CardTagDimensionFilters) => void;
  onFinalOnlyChange: (value: boolean) => void;
  onHardOnlyChange: (value: boolean) => void;
  onCardScopeChange: (value: StudyCardScope) => void;
  onStudyOrderChange: (value: StudyOrder) => void;
  onAnswerContentFilterChange: (value: AnswerContentFilter) => void;
  onAnswerStatusOnlyChange: (value: boolean) => void;
  onModeChange: (value: FirstLineMode) => void;
  onQuestionCountChange: (value: MockQuestionCount) => void;
  onReset: () => void;
  onStart: () => void;
  onBack: () => void;
  backLabel: string;
  handoffCount: number | null;
  onClearHandoff: () => void;
  archiveFilter: ArchiveFilter;
  onArchiveFilterChange: (value: ArchiveFilter) => void;
};

export function FirstLineSetup(props: Props) {
  return (
    <main className="first-line-setup">
      <section className="first-line-setup-intro">
        <button type="button" className="answer-learning-inline-back" onClick={props.onBack}>← {props.backLabel}</button>
        <p className="eyebrow">SPEAK FIRST</p>
        <h1>첫 문장 연습 준비</h1>
        <p>현재 조건에서 연습하거나, 무작위 모의고사로 실전처럼 확인하세요.</p>
      </section>

      {props.handoffCount === null ? (
        <TagFilter
          decks={props.decks}
          tags={props.tags}
          selectedDeck={props.selectedDeck}
          selectedTag={props.selectedTag}
          selectedWeeks={props.selectedWeeks}
          selectedTopics={props.selectedTopics}
          selectedTypes={props.selectedTypes}
          finalOnly={props.finalOnly}
          hardOnly={props.hardOnly}
          cardScope={props.cardScope}
          studyOrder={props.studyOrder}
          answerContentFilter={props.answerContentFilter}
          answerStatusOnly={props.answerStatusOnly}
          onDeckChange={props.onDeckChange}
          onTagChange={props.onTagChange}
          onTagDimensionsChange={props.onTagDimensionsChange}
          onFinalOnlyChange={props.onFinalOnlyChange}
          onHardOnlyChange={props.onHardOnlyChange}
          onCardScopeChange={props.onCardScopeChange}
          onStudyOrderChange={props.onStudyOrderChange}
          onAnswerContentFilterChange={props.onAnswerContentFilterChange}
          onAnswerStatusOnlyChange={props.onAnswerStatusOnlyChange}
          onReset={props.onReset}
          archiveFilter={props.archiveFilter}
          onArchiveFilterChange={props.onArchiveFilterChange}
        />
      ) : (
        <section className="study-handoff-notice" aria-labelledby="first-line-handoff-title">
          <div>
            <p className="eyebrow">FROM CARD LIBRARY</p>
            <h2 id="first-line-handoff-title">카드 라이브러리 결과 {props.handoffCount}장</h2>
            <p>검색과 필터 결과를 그대로 사용합니다.</p>
          </div>
          <button type="button" className="secondary-button" onClick={props.onClearHandoff}>
            준비 화면에서 다시 고르기
          </button>
        </section>
      )}

      <section className="first-line-mode-panel" aria-labelledby="first-line-mode-title">
        <div>
          <p className="eyebrow">MODE</p>
          <h2 id="first-line-mode-title">진행 방식</h2>
        </div>
        <div className="first-line-mode-options" role="radiogroup" aria-label="첫 문장 진행 방식">
          <label><input type="radio" name="first-line-mode" value="practice" checked={props.mode === "practice"} onChange={() => props.onModeChange("practice")} /><span><strong>연습</strong><small>현재 순서와 설정으로 반복 연습</small></span></label>
          <label><input type="radio" name="first-line-mode" value="mock" checked={props.mode === "mock"} onChange={() => props.onModeChange("mock")} /><span><strong>모의고사</strong><small>무작위 문제와 3초 카운트다운</small></span></label>
        </div>
        {props.mode === "mock" && (
          <label className="mock-question-count">
            <span>출제 수</span>
            <select value={props.questionCount} onChange={(event) => props.onQuestionCountChange(event.target.value === "all" ? "all" : Number(event.target.value) as MockQuestionCount)}>
              <option value={10}>10문제</option><option value={15}>15문제</option><option value={20}>20문제</option><option value="all">전체</option>
            </select>
          </label>
        )}
        <StudyScopeSummary
          className="first-line-study-scope"
          eyebrow="STUDY SCOPE"
          title="학습 범위"
          titleId="first-line-study-scope-title"
          headingLevel="h3"
          description="현재 조건에 맞는 카드를 모두 사용합니다."
          countLabel={`현재 조건 ${props.cardCount}장`}
          note={props.cardCount === 0 && <p className="disabled-reason">현재 조건에 맞는 카드가 없습니다.</p>}
          actions={(
            <button type="button" className="primary-button first-line-setup-start" disabled={props.cardCount === 0} onClick={props.onStart}>
              {props.mode === "mock" ? "모의고사 시작" : "첫 문장 연습 시작"}
            </button>
          )}
        />
      </section>
    </main>
  );
}
