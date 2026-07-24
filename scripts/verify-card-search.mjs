import assert from "node:assert/strict";
import {
  createCardSearchText,
  filterCardsBySearch,
  matchesCardSearch,
} from "../src/utils/cardSearch.ts";

const baseCard = {
  id: "card-alpha",
  deck: "OPIc 03_주제별답변",
  front: "Tell me about your home.",
  frontKo: "당신의 아파트와 집에 대해 말해 주세요.",
  firstLine: "Okay, let me tell you about my home.",
  hint: {
    title: "Home description",
    memoryTip: "Start with the type of home.",
    subjectTip: "Use I as the subject.",
    minimum: "Mention one room.",
    flow: ["집 종류", "좋아하는 공간"],
  },
  back: [
    "I live in an apartment.",
    "My room is small, but it is cozy.",
  ],
  tags: ["topic_home", "type_description"],
};

const secondCard = {
  ...baseCard,
  id: "card-beta",
  front: "Tell me about public transportation.",
  frontKo: "대중교통에 대해 말해 주세요.",
  firstLine: "I usually take the subway.",
  hint: {
    ...baseCard.hint,
    title: "Transportation",
    flow: ["교통수단", "이용 이유"],
  },
  back: ["The subway is convenient."],
  tags: ["topic_transportation"],
};

const sources = {
  cardMemos: {
    "card-alpha": [{
      id: "memo-alpha",
      cardId: "card-alpha",
      content: "Balcony detail needs practice.",
      pinned: false,
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
    }],
  },
  myAnswers: {
    "card-alpha": "My custom answer mentions a quiet neighborhood.",
  },
};

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("질문으로 검색", () => assert.equal(matchesCardSearch(baseCard, "tell me about your home", sources), true));
test("첫 문장으로 검색", () => assert.equal(matchesCardSearch(baseCard, "let me tell you", sources), true));
test("기본 답변으로 검색", () => assert.equal(matchesCardSearch(baseCard, "live in an apartment", sources), true));
test("뜻·번역으로 검색", () => assert.equal(matchesCardSearch(baseCard, "당신의 아파트", sources), true));
test("힌트로 검색", () => assert.equal(matchesCardSearch(baseCard, "type of home", sources), true));
test("한글 흐름으로 검색", () => assert.equal(matchesCardSearch(baseCard, "좋아하는 공간", sources), true));
test("태그로 검색", () => assert.equal(matchesCardSearch(baseCard, "pic_home", sources), true));
test("카드 메모로 검색", () => assert.equal(matchesCardSearch(baseCard, "balcony detail", sources), true));
test("나만의 답변으로 검색", () => assert.equal(matchesCardSearch(baseCard, "quiet neighborhood", sources), true));
test("영문 대소문자 무시", () => assert.equal(matchesCardSearch(baseCard, "APARTMENT", sources), true));
test("앞뒤 공백 무시", () => assert.equal(matchesCardSearch(baseCard, "   apartment   ", sources), true));
test("여러 줄 답변은 줄바꿈을 공백으로 검색", () => {
  const card = { ...baseCard, back: ["Alpha\nBeta"] };
  assert.equal(matchesCardSearch(card, "alpha beta", sources), true);
});
test("부분 문자열 검색", () => assert.equal(matchesCardSearch(baseCard, "apart", sources), true));
test("검색어 없음은 원래 전체 배열", () => {
  const cards = [baseCard, secondCard];
  assert.equal(filterCardsBySearch(cards, "  ", sources), cards);
});
test("결과 없음", () => assert.deepEqual(filterCardsBySearch([baseCard], "volcano", sources), []));
test("검색과 태그 필터 동시 사용", () => {
  const tagged = [baseCard, secondCard].filter((card) => card.tags.includes("topic_home"));
  assert.deepEqual(filterCardsBySearch(tagged, "apartment", sources).map((card) => card.id), ["card-alpha"]);
});
test("검색과 상태 필터 동시 사용", () => {
  const statuses = { "card-alpha": "hard", "card-beta": "success" };
  const hard = [baseCard, secondCard].filter((card) => statuses[card.id] === "hard");
  assert.deepEqual(filterCardsBySearch(hard, "home", sources).map((card) => card.id), ["card-alpha"]);
});
test("보관 카드 화면에서 검색", () => {
  const archived = new Set(["card-alpha"]);
  const archivedCards = [baseCard, secondCard].filter((card) => archived.has(card.id));
  assert.equal(filterCardsBySearch(archivedCards, "apartment", sources).length, 1);
});
test("검색 후 기존 정렬 순서 유지", () => {
  const ordered = [secondCard, baseCard];
  assert.deepEqual(filterCardsBySearch(ordered, "tell me", sources).map((card) => card.id), ["card-beta", "card-alpha"]);
});
test("다른 카드 내용과 내부 ID가 잘못 매칭되지 않음", () => {
  assert.equal(matchesCardSearch(secondCard, "apartment", sources), false);
  assert.equal(matchesCardSearch(baseCard, "card-alpha", sources), false);
});
test("검색은 카드·메모·나만의 답변을 변경하지 않음", () => {
  const before = JSON.stringify({ baseCard, sources });
  createCardSearchText(baseCard, sources);
  filterCardsBySearch([baseCard, secondCard], "home", sources);
  assert.equal(JSON.stringify({ baseCard, sources }), before);
});
test("실제 사용자 storage를 사용하지 않음", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("localStorage accessed"); } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("sessionStorage accessed"); } });
  try {
    assert.equal(filterCardsBySearch([baseCard], "home", sources).length, 1);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  }
});

for (const { name, run } of tests) {
  run();
  console.log(`PASS ${name}`);
}
console.log(`Card search verification: ${tests.length}/${tests.length} passed`);
