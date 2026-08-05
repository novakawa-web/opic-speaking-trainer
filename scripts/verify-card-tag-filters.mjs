import assert from "node:assert/strict";
import {
  EMPTY_CARD_TAG_DIMENSION_FILTERS,
  formatAnswerLearningTag,
  formatCardTagOption,
  formatCardTagSelectionSummary,
  getCardTagDimension,
  getCardTagFilterOptions,
  isDedicatedCardTag,
  matchesCardTagDimensionFilters,
  migrateLegacyCardTagFilter,
  normalizeCardTagDimensionFilters,
  normalizeCardTagSelection,
  resolveCardTagDimensionFilters,
} from "../src/utils/cardTagFilters.ts";

let passed = 0;
function test(name, run) {
  try {
    run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

const cards = [
  { id: "a", tags: ["week6", "topic_home", "type_description", "core"] },
  { id: "b", tags: ["week7", "topic_cafe", "type_description", "priority_a"] },
  { id: "c", tags: ["week8", "topic_home", "type_experience", "core"] },
  { id: "d", tags: ["weekday_evening", "topic_homework", "typewriter"] },
];

test("weekN과 승인된 대체 태그만 학습 세트 차원으로 분류", () => {
  assert.equal(getCardTagDimension("week6"), "week");
  assert.equal(getCardTagDimension("WEEK14"), "week");
  assert.equal(getCardTagDimension("practice-session"), "week");
  assert.equal(getCardTagDimension("level_1"), "week");
  assert.equal(getCardTagDimension("LEVEL_3"), "week");
  assert.equal(getCardTagDimension("weekday_evening"), null);
  assert.equal(getCardTagDimension("level_4"), null);
  assert.equal(getCardTagDimension("v2"), null);
});

test("topic_와 type_ 접두사만 각 차원으로 분류", () => {
  assert.equal(getCardTagDimension("topic_home"), "topic");
  assert.equal(getCardTagDimension("type_past_experience"), "type");
  assert.equal(getCardTagDimension("typewriter"), null);
});

test("학습 세트는 주차 다음 연습 세션과 레벨 순이며 v2는 기타에 유지", () => {
  assert.deepEqual(
    getCardTagFilterOptions([
      "level_3", "week10", "v2", "practice-session", "week6", "level_1",
      "topic_home", "type_description", "final_rep", "core", "level_2",
    ]),
    {
      weeks: ["week6", "week10", "practice-session", "level_1", "level_2", "level_3"],
      topics: ["topic_home"],
      types: ["type_description"],
      otherTags: ["core", "v2"],
    },
  );
  assert.equal(isDedicatedCardTag("practice-session"), true);
  assert.equal(isDedicatedCardTag("level_2"), true);
  assert.equal(isDedicatedCardTag("v2"), false);
});

test("선택 배열은 문자열만 중복 제거 후 canonical 정렬", () => {
  assert.deepEqual(normalizeCardTagSelection(["week10", "week6", "week6", null, 3]), ["week6", "week10"]);
  assert.deepEqual(normalizeCardTagSelection("week6"), []);
});

test("세 차원 malformed 값은 빈 배열로 정규화", () => {
  assert.deepEqual(
    normalizeCardTagDimensionFilters({ selectedWeeks: "week6", selectedTopics: null }),
    EMPTY_CARD_TAG_DIMENSION_FILTERS,
  );
});

test("학습 세트 선택은 주차 연습 세션 레벨 순으로 정규화하고 v2를 제외", () => {
  assert.deepEqual(
    normalizeCardTagDimensionFilters({
      selectedWeeks: ["level_3", "practice-session", "week10", "v2", "week6", "level_1"],
    }).selectedWeeks,
    ["week6", "week10", "practice-session", "level_1", "level_3"],
  );
});

test("구형 week 단일 태그는 singleton 주차로 승격", () => {
  const migrated = migrateLegacyCardTagFilter("week7", EMPTY_CARD_TAG_DIMENSION_FILTERS, false);
  assert.equal(migrated.selectedTag, "all");
  assert.deepEqual(migrated.dimensions.selectedWeeks, ["week7"]);
});

test("구형 연습 세션과 레벨 단일 태그는 학습 세트로 승격하고 v2는 기타에 유지", () => {
  const practice = migrateLegacyCardTagFilter(
    "practice-session",
    EMPTY_CARD_TAG_DIMENSION_FILTERS,
    false,
  );
  const level = migrateLegacyCardTagFilter("level_2", EMPTY_CARD_TAG_DIMENSION_FILTERS, false);
  const version = migrateLegacyCardTagFilter("v2", EMPTY_CARD_TAG_DIMENSION_FILTERS, false);
  assert.equal(practice.selectedTag, "all");
  assert.deepEqual(practice.dimensions.selectedWeeks, ["practice-session"]);
  assert.equal(level.selectedTag, "all");
  assert.deepEqual(level.dimensions.selectedWeeks, ["level_2"]);
  assert.equal(version.selectedTag, "v2");
  assert.deepEqual(version.dimensions, EMPTY_CARD_TAG_DIMENSION_FILTERS);
});

test("구형 topic/type 단일 태그는 해당 차원으로 승격", () => {
  const topic = migrateLegacyCardTagFilter("topic_home", EMPTY_CARD_TAG_DIMENSION_FILTERS, false);
  const type = migrateLegacyCardTagFilter("type_description", EMPTY_CARD_TAG_DIMENSION_FILTERS, false);
  assert.deepEqual(topic.dimensions.selectedTopics, ["topic_home"]);
  assert.deepEqual(type.dimensions.selectedTypes, ["type_description"]);
});

test("구형 final_rep 단일 태그는 전용 toggle로 승격", () => {
  const migrated = migrateLegacyCardTagFilter("final_rep", EMPTY_CARD_TAG_DIMENSION_FILTERS, false);
  assert.equal(migrated.selectedTag, "all");
  assert.equal(migrated.finalOnly, true);
});

test("일반 태그는 기존 단일 태그로 보존", () => {
  const migrated = migrateLegacyCardTagFilter("core", EMPTY_CARD_TAG_DIMENSION_FILTERS, false);
  assert.equal(migrated.selectedTag, "core");
  assert.deepEqual(migrated.dimensions, EMPTY_CARD_TAG_DIMENSION_FILTERS);
});

test("선택 없는 차원은 모든 카드를 허용", () => {
  assert.equal(matchesCardTagDimensionFilters(cards[3], EMPTY_CARD_TAG_DIMENSION_FILTERS), true);
  assert.equal(matchesCardTagDimensionFilters(cards[3], {}), true);
});

test("같은 차원의 다중 선택은 OR", () => {
  const filters = { ...EMPTY_CARD_TAG_DIMENSION_FILTERS, selectedWeeks: ["week6", "week8"] };
  assert.deepEqual(cards.filter((card) => matchesCardTagDimensionFilters(card, filters)).map((card) => card.id), ["a", "c"]);
});

test("주차 연습 세션 레벨은 같은 학습 세트 차원에서 OR", () => {
  const learningSetCards = [
    { id: "week", tags: ["week6"] },
    { id: "practice", tags: ["practice-session"] },
    { id: "level", tags: ["level_1"] },
    { id: "other-level", tags: ["level_2"] },
  ];
  const filters = {
    ...EMPTY_CARD_TAG_DIMENSION_FILTERS,
    selectedWeeks: ["week6", "practice-session", "level_1"],
  };
  assert.deepEqual(
    learningSetCards
      .filter((card) => matchesCardTagDimensionFilters(card, filters))
      .map((card) => card.id),
    ["week", "practice", "level"],
  );
});

test("서로 다른 차원은 AND", () => {
  const filters = {
    selectedWeeks: ["week6", "week7"],
    selectedTopics: ["topic_home"],
    selectedTypes: ["type_description", "type_experience"],
  };
  assert.deepEqual(cards.filter((card) => matchesCardTagDimensionFilters(card, filters)).map((card) => card.id), ["a"]);
});

test("선택한 차원 태그가 없는 카드는 그 차원에서 제외", () => {
  const filters = { ...EMPTY_CARD_TAG_DIMENSION_FILTERS, selectedTopics: ["topic_home"] };
  assert.equal(matchesCardTagDimensionFilters(cards[3], filters), false);
});

test("dataset 변경 시 존재하지 않는 선택만 제거", () => {
  assert.deepEqual(
    resolveCardTagDimensionFilters(
      {
        selectedWeeks: ["week6", "week9"],
        selectedTopics: ["topic_home"],
        selectedTypes: ["type_description"],
      },
      cards.flatMap((card) => card.tags),
    ),
    {
      selectedWeeks: ["week6"],
      selectedTopics: ["topic_home"],
      selectedTypes: ["type_description"],
    },
  );
});

test("화면 표시는 원문 태그를 바꾸지 않고 접두사만 정리", () => {
  assert.equal(formatCardTagOption("week06"), "Week 6");
  assert.equal(formatCardTagOption("practice-session"), "연습 세션");
  assert.equal(formatCardTagOption("level_2"), "Level 2");
  assert.equal(formatCardTagOption("v2"), "v2");
  assert.equal(formatCardTagOption("topic_public_transportation"), "public transportation");
  assert.equal(formatAnswerLearningTag("topic_public_transportation"), "public transportation");
  assert.equal(formatAnswerLearningTag("category_daily_life"), "daily life");
  assert.equal(formatAnswerLearningTag("Catecory_Work"), "Work");
  assert.equal(formatAnswerLearningTag("v2"), "v2");
  assert.equal(
    formatCardTagSelectionSummary(
      ["category_daily_life"],
      "전체 기타 태그",
      formatAnswerLearningTag,
    ),
    "daily life",
  );
  assert.equal(
    formatCardTagSelectionSummary(["level_1", "week8"], "전체 학습 세트"),
    "Week 8 외 1개",
  );
});

console.log(`\n${passed} card tag filter checks passed.`);
