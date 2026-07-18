import type { DeckName } from "../types";
import type { AnswerContentFilter } from "../utils/cardContent";
import type { FirstLineMode, MockQuestionCount } from "../utils/firstLineMockSession";
import type { StudyCardScope, StudyOrder } from "../utils/studyPreferences";
import { TagFilter } from "./TagFilter";
import type { ArchiveFilter } from "../utils/cardArchiveStorage";

type Props = {
  cardCount: number;
  decks: DeckName[];
  tags: string[];
  selectedDeck: DeckName | "all";
  selectedTag: string;
  finalOnly: boolean;
  hardOnly: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  answerContentFilter: AnswerContentFilter;
  mode: FirstLineMode;
  questionCount: MockQuestionCount;
  onDeckChange: (value: DeckName | "all") => void;
  onTagChange: (value: string) => void;
  onFinalOnlyChange: (value: boolean) => void;
  onHardOnlyChange: (value: boolean) => void;
  onCardScopeChange: (value: StudyCardScope) => void;
  onStudyOrderChange: (value: StudyOrder) => void;
  onAnswerContentFilterChange: (value: AnswerContentFilter) => void;
  onModeChange: (value: FirstLineMode) => void;
  onQuestionCountChange: (value: MockQuestionCount) => void;
  onReset: () => void;
  onStart: () => void;
  onBack: () => void;
  archiveFilter: ArchiveFilter;
  onArchiveFilterChange: (value: ArchiveFilter) => void;
};

export function FirstLineSetup(props: Props) {
  return (
    <main className="first-line-setup">
      <section className="first-line-setup-intro">
        <button type="button" className="answer-learning-inline-back" onClick={props.onBack}>← 홈</button>
        <p className="eyebrow">SPEAK FIRST</p>
        <h1>첫 문장 연습 준비</h1>
        <p>현재 조건에서 연습하거나, 무작위 모의고사로 실전처럼 확인하세요.</p>
      </section>

      <TagFilter
        decks={props.decks}
        tags={props.tags}
        selectedDeck={props.selectedDeck}
        selectedTag={props.selectedTag}
        finalOnly={props.finalOnly}
        hardOnly={props.hardOnly}
        cardScope={props.cardScope}
        studyOrder={props.studyOrder}
        answerContentFilter={props.answerContentFilter}
        onDeckChange={props.onDeckChange}
        onTagChange={props.onTagChange}
        onFinalOnlyChange={props.onFinalOnlyChange}
        onHardOnlyChange={props.onHardOnlyChange}
        onCardScopeChange={props.onCardScopeChange}
        onStudyOrderChange={props.onStudyOrderChange}
        onAnswerContentFilterChange={props.onAnswerContentFilterChange}
        onReset={props.onReset}
        archiveFilter={props.archiveFilter}
        onArchiveFilterChange={props.onArchiveFilterChange}
      />

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
        <p className="first-line-setup-count" aria-live="polite">현재 조건 {props.cardCount}장</p>
        <button type="button" className="primary-button first-line-setup-start" disabled={props.cardCount === 0} onClick={props.onStart}>
          {props.mode === "mock" ? "모의고사 시작" : "첫 문장 연습 시작"}
        </button>
        {props.cardCount === 0 && <p className="disabled-reason">현재 조건에 맞는 카드가 없습니다.</p>}
      </section>
    </main>
  );
}
