import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createLibraryStudyHandoff,
  mergeLibraryStudySelection,
  resolveLibraryStudyCards,
} from "../src/utils/libraryStudyHandoff.ts";

const cards = [
  { id: "card-a" },
  { id: "card-b" },
  { id: "card-c" },
];

let passed = 0;
function test(name, run) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("라이브러리 결과 ID는 현재 순서를 유지하고 중복·빈 값을 제거", () => {
  const handoff = createLibraryStudyHandoff("firstLine", [
    "card-c",
    "",
    "card-a",
    "card-c",
    "   ",
  ]);
  assert.deepEqual(handoff, {
    target: "firstLine",
    cardIds: ["card-c", "card-a"],
  });
});

test("첫 문장 전달은 페이지 표시 수와 무관하게 전체 ID 순서를 복원", () => {
  const handoff = createLibraryStudyHandoff("firstLine", ["card-c", "card-a"]);
  assert.deepEqual(
    resolveLibraryStudyCards(cards, handoff, "firstLine").map((card) => card.id),
    ["card-c", "card-a"],
  );
});

test("현재 catalog에서 사라진 카드는 전달 범위에서 안전하게 제외", () => {
  const handoff = createLibraryStudyHandoff("firstLine", ["card-c", "removed", "card-a"]);
  assert.deepEqual(
    resolveLibraryStudyCards(cards, handoff, "firstLine").map((card) => card.id),
    ["card-c", "card-a"],
  );
});

test("답변 익히기는 active catalog와 전달 ID의 교집합만 사용", () => {
  const handoff = createLibraryStudyHandoff("answerLearning", ["card-c", "card-b", "card-a"]);
  const activeCards = cards.filter((card) => card.id !== "card-b");
  assert.deepEqual(
    resolveLibraryStudyCards(activeCards, handoff, "answerLearning").map((card) => card.id),
    ["card-c", "card-a"],
  );
});

test("다른 학습 대상의 전달 범위는 현재 카드 배열을 제한하지 않음", () => {
  const handoff = createLibraryStudyHandoff("firstLine", ["card-c"]);
  assert.deepEqual(
    resolveLibraryStudyCards(cards, handoff, "answerLearning").map((card) => card.id),
    ["card-a", "card-b", "card-c"],
  );
});

test("답변 익히기 전달은 기존 숨은 선택을 지우지 않고 새 범위만 추가", () => {
  assert.deepEqual(
    mergeLibraryStudySelection(
      ["previous-hidden", "card-a"],
      ["card-c", "card-a"],
    ),
    ["previous-hidden", "card-a", "card-c"],
  );
});

test("helper는 입력 ID와 카드 배열을 변경하지 않음", () => {
  const ids = ["card-c", "card-a"];
  const originalCards = [...cards];
  const handoff = createLibraryStudyHandoff("firstLine", ids);
  resolveLibraryStudyCards(cards, handoff, "firstLine");
  mergeLibraryStudySelection(["card-b"], ids);
  assert.deepEqual(ids, ["card-c", "card-a"]);
  assert.deepEqual(cards, originalCards);
});

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const library = await readFile(new URL("../src/components/CardLibrary.tsx", import.meta.url), "utf8");
const firstLineSetup = await readFile(new URL("../src/components/FirstLineSetup.tsx", import.meta.url), "utf8");
const answerSetup = await readFile(new URL("../src/components/AnswerLearningSetup.tsx", import.meta.url), "utf8");

test("카드 라이브러리는 두 전달 action과 0장 disabled 경계를 제공", () => {
  assert.match(library, /onStartFirstLine/);
  assert.match(library, /onStartAnswerLearning/);
  assert.match(library, /disabled=\{cards\.length === 0\}/);
  assert.match(library, /disabled=\{answerLearningCardCount === 0\}/);
});

test("첫 문장과 답변 익히기 준비 화면은 전달 범위와 동적 복귀 문구를 표시", () => {
  assert.match(firstLineSetup, /카드 라이브러리 결과 \{props\.handoffCount\}장/);
  assert.match(firstLineSetup, /← \{props\.backLabel\}/);
  assert.match(answerSetup, /카드 라이브러리 결과 \{handoffCount\}장/);
  assert.match(answerSetup, /← \{backLabel\}/);
});

test("답변 익히기 표시 후보와 실제 시작 후보는 같은 scoped 배열을 사용", () => {
  const occurrences = app.match(/answerLearningSetupCards/g) ?? [];
  assert.ok(occurrences.length >= 4);
  assert.match(app, /filterAnswerLearningCards\(\s*answerLearningSetupCards,/);
  assert.match(app, /<AnswerLearningSetup\s+cards=\{answerLearningSetupCards\}/);
});

test("전달 상태는 메모리 전용이며 새 storage key를 만들지 않음", () => {
  for (const source of [app, library, firstLineSetup, answerSetup]) {
    assert.doesNotMatch(source, /library-handoff|study-handoff-storage/i);
  }
  assert.doesNotMatch(app, /localStorage\.(?:setItem|getItem)\([^)]*handoff/i);
  assert.doesNotMatch(app, /sessionStorage\.(?:setItem|getItem)\([^)]*handoff/i);
});

console.log(`Library study handoff verification passed: ${passed}/${passed}`);
