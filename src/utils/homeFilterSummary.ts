import type { AnswerLearningStatusFilter } from "./answerLearningSession.ts";
import type { ArchiveFilter } from "./cardArchiveStorage.ts";
import type { AnswerContentFilter } from "./cardContent.ts";
import { normalizeCardSearchQuery } from "./cardSearch.ts";
import type { StudyCardScope, StudyOrder } from "./studyPreferences.ts";
import { formatCardTagOption } from "./cardTagFilters.ts";

export type HomeFilterSummaryInput = {
  selectedDeck: string;
  selectedTag: string;
  selectedWeeks: string[];
  selectedTopics: string[];
  selectedTypes: string[];
  favoriteOnly: boolean;
  finalOnly: boolean;
  hardOnly: boolean;
  cardScope: StudyCardScope;
  studyOrder: StudyOrder;
  answerLearningStatusFilter: AnswerLearningStatusFilter;
  answerContentFilter: AnswerContentFilter;
  archiveFilter: ArchiveFilter;
  cardSearchQuery: string;
};

const answerLearningStatusLabels: Record<
  Exclude<AnswerLearningStatusFilter, "all">,
  string
> = {
  unlearned: "답변 연습 상태 없음",
  "with-status": "답변 연습 상태 있음",
  hard: "답변 어려움",
  learning: "답변 익히는 중",
  speakable: "답변 말할 수 있음",
};

function formatDimensionSummary(label: string, values: readonly string[]) {
  if (values.length === 0) return null;
  return values.length === 1 ? formatCardTagOption(values[0]) : `${label} ${values.length}개`;
}

export function formatHomeFilterSummary({
  selectedDeck,
  selectedTag,
  selectedWeeks = [],
  selectedTopics = [],
  selectedTypes = [],
  favoriteOnly,
  finalOnly,
  hardOnly,
  cardScope,
  studyOrder,
  answerLearningStatusFilter,
  answerContentFilter,
  archiveFilter,
  cardSearchQuery,
}: HomeFilterSummaryInput) {
  const parts: string[] = [];
  if (selectedDeck !== "all") parts.push(selectedDeck);
  const weekSummary = formatDimensionSummary("학습 세트", selectedWeeks);
  const topicSummary = formatDimensionSummary("주제", selectedTopics);
  const typeSummary = formatDimensionSummary("유형", selectedTypes);
  if (weekSummary) parts.push(weekSummary);
  if (topicSummary) parts.push(topicSummary);
  if (typeSummary) parts.push(typeSummary);
  if (selectedTag !== "all") parts.push(`#${selectedTag}`);
  if (favoriteOnly) parts.push("즐겨찾기");
  if (finalOnly) parts.push("final_rep");
  if (hardOnly) parts.push("첫 문장 어려움");
  if (answerLearningStatusFilter !== "all") {
    parts.push(answerLearningStatusLabels[answerLearningStatusFilter]);
  }
  if (cardScope === "new") parts.push("새 카드");
  if (answerContentFilter === "first-line-only") parts.push("첫 문장 전용");
  if (answerContentFilter === "full-answer") parts.push("전체 답변 있음");
  if (archiveFilter === "archived") parts.push("보관됨");
  if (archiveFilter === "all") parts.push("사용 중+보관됨");
  if (normalizeCardSearchQuery(cardSearchQuery)) parts.push("카드 내용 검색");
  if (studyOrder === "random") parts.push("랜덤 순서");
  if (studyOrder === "least-practiced") parts.push("연습 횟수 적은 순");
  return parts.length > 0 ? parts.join(" · ") : "필터 없음 · 기본 순서";
}
