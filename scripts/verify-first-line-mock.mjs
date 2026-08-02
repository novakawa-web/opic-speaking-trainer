import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIRST_LINE_MOCK_SESSION_KEY,
  clearFirstLineMockSession,
  createFirstLineMockSession,
  parseFirstLineMockSession,
  readFirstLineMockSession,
  saveFirstLineMockSession,
  summarizeFirstLineMock,
} from "../src/utils/firstLineMockSession.ts";
import { matchesAnswerContentFilter } from "../src/utils/cardContent.ts";
import {
  filterCardsByAnswerLearningStatusPresence,
} from "../src/utils/answerLearningSelectors.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
globalThis.sessionStorage = new MemoryStorage();

const ids = Array.from({ length: 25 }, (_, index) => `card-${index + 1}`);
const candidateCards = ids.slice(0, 5).map((id, index) => ({
  id,
  deck: index < 3 ? "deck-a" : "deck-b",
}));
const candidateStatuses = {
  [candidateCards[0].id]: "hard",
  [candidateCards[1].id]: "learning",
  [candidateCards[2].id]: "speakable",
  "removed-card": "hard",
};
const tests = [];
function test(name, run) { tests.push({ name, run }); }

function cssRuleBodies(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))]
    .map((match) => match[1]);
}

function readPixelDeclaration(ruleBody, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = ruleBody.match(new RegExp(`${escaped}\\s*:\\s*(\\d+)px\\s*;`));
  return match ? Number(match[1]) : null;
}

test("답변 상태 필터 OFF는 전체 후보 유지", () => {
  assert.equal(
    filterCardsByAnswerLearningStatusPresence(
      candidateCards,
      candidateStatuses,
      false,
    ).length,
    candidateCards.length,
  );
});
test("답변 상태 필터 ON은 유효 상태 카드만 후보", () => {
  assert.deepEqual(
    filterCardsByAnswerLearningStatusPresence(
      candidateCards,
      candidateStatuses,
      true,
    ).map((card) => card.id),
    candidateCards.slice(0, 3).map((card) => card.id),
  );
});
test("답변 상태 필터는 다른 필터와 AND", () => {
  const deckCandidates = candidateCards.filter((card) => card.deck === "deck-b");
  assert.deepEqual(
    filterCardsByAnswerLearningStatusPresence(
      deckCandidates,
      candidateStatuses,
      true,
    ),
    [],
  );
});
test("답변 상태 필터를 다시 끄면 전체 후보 복원", () => {
  const filtered = filterCardsByAnswerLearningStatusPresence(
    candidateCards,
    candidateStatuses,
    true,
  );
  const restored = filterCardsByAnswerLearningStatusPresence(
    candidateCards,
    candidateStatuses,
    false,
  );
  assert.ok(filtered.length < restored.length);
  assert.deepEqual(restored, candidateCards);
});
test("상태 있음 후보 0장", () => {
  assert.equal(
    filterCardsByAnswerLearningStatusPresence(candidateCards, {}, true).length,
    0,
  );
});
test("표시 후보와 연습 카드 ID가 일치", () => {
  const visible = filterCardsByAnswerLearningStatusPresence(
    candidateCards,
    candidateStatuses,
    true,
  );
  const drillCardIds = visible.map((card) => card.id);
  assert.equal(drillCardIds.length, visible.length);
  assert.deepEqual(drillCardIds, candidateCards.slice(0, 3).map((card) => card.id));
});
test("표시 후보와 모의고사 출제 후보가 일치", () => {
  const visible = filterCardsByAnswerLearningStatusPresence(
    candidateCards,
    candidateStatuses,
    true,
  );
  const session = createFirstLineMockSession(
    visible.map((card) => card.id),
    "all",
    () => 0.3,
  );
  assert.equal(session.sourceCardIds.length, visible.length);
  assert.deepEqual(
    new Set(session.sourceCardIds),
    new Set(visible.map((card) => card.id)),
  );
});
test("random은 최종 후보 집합을 유지하고 순서만 변경", () => {
  const visibleIds = filterCardsByAnswerLearningStatusPresence(
    candidateCards,
    candidateStatuses,
    true,
  ).map((card) => card.id);
  const order = createFirstLineMockSession(visibleIds, "all", () => 0).cardOrder;
  assert.deepEqual(new Set(order), new Set(visibleIds));
  assert.notDeepEqual(order, visibleIds);
});
test("첫 문장 후보는 숨은 라이브러리 검색어와 분리", () => {
  const librarySearchQuery = "card-1";
  const libraryCandidates = candidateCards.filter((card) =>
    card.id.includes(librarySearchQuery),
  );
  const firstLineCandidates = filterCardsByAnswerLearningStatusPresence(
    candidateCards,
    candidateStatuses,
    false,
  );
  assert.equal(libraryCandidates.length, 1);
  assert.equal(firstLineCandidates.length, candidateCards.length);
  assert.equal(librarySearchQuery, "card-1");
});
test("첫 문장 필터 UI와 초기화·후보 wiring 계약", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const setupSource = readFileSync(new URL("../src/components/FirstLineSetup.tsx", import.meta.url), "utf8");
  const filterSource = readFileSync(new URL("../src/components/TagFilter.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const firstLineCandidateBlock = appSource.slice(
    appSource.indexOf("const firstLineFilteredCards"),
    appSource.indexOf("const orderedFirstLineCards"),
  );
  const firstLineResetBlock = appSource.slice(
    appSource.indexOf("function resetVisibleStudyFilters"),
    appSource.indexOf("function resetFilters"),
  );

  assert.ok(filterSource.includes('className="toggle-row first-line-answer-status-toggle"'));
  assert.ok(firstLineResetBlock.includes("setFirstLineAnswerStatusOnly(false)"));
  assert.equal(firstLineResetBlock.includes("setCardSearchQuery"), false);
  assert.ok(appSource.includes("onReset={resetVisibleStudyFilters}"));
  assert.ok(appSource.includes("cardCount={firstLineSetupCards.length}"));
  assert.ok(appSource.includes("createDrillCardIds(firstLineSetupCards)"));
  assert.ok(appSource.includes("firstLineSetupCards.map((card) => card.id)"));
  assert.match(
    appSource,
    /libraryStudyHandoff\?\.target === "firstLine"[\s\S]*?: orderedFirstLineCards/,
  );
  assert.equal(firstLineCandidateBlock.includes("cardSearchQuery"), false);
  assert.ok(setupSource.includes("disabled={props.cardCount === 0}"));

  const labelStart = filterSource.lastIndexOf(
    "<label",
    filterSource.indexOf('className="toggle-row first-line-answer-status-toggle"'),
  );
  const labelEnd = filterSource.indexOf("</label>", labelStart);
  const statusToggleLabel = filterSource.slice(labelStart, labelEnd);
  assert.equal(
    (filterSource.match(/first-line-answer-status-toggle/g) ?? []).length,
    1,
  );
  assert.match(
    statusToggleLabel,
    /className="toggle-row first-line-answer-status-toggle"/,
  );
  assert.match(statusToggleLabel, />답변 연습 상태 있음</);

  const dedicatedRules = cssRuleBodies(
    styles,
    ".toggle-row.first-line-answer-status-toggle",
  );
  assert.equal(dedicatedRules.length, 1);
  assert.equal(readPixelDeclaration(dedicatedRules[0], "min-height"), 44);
  assert.match(dedicatedRules[0], /align-items\s*:\s*center\s*;/);
  assert.match(dedicatedRules[0], /white-space\s*:\s*normal\s*;/);
  assert.equal(
    (styles.match(/first-line-answer-status-toggle/g) ?? []).length,
    1,
  );

  const sharedToggleRules = cssRuleBodies(styles, ".toggle-row");
  assert.equal(sharedToggleRules.length, 1);
  assert.equal(readPixelDeclaration(sharedToggleRules[0], "min-height"), null);
  assert.match(sharedToggleRules[0], /white-space\s*:\s*nowrap\s*;/);

  const compactToggleRules = cssRuleBodies(styles, ".compact-toggle-control");
  assert.deepEqual(
    compactToggleRules.map((rule) => readPixelDeclaration(rule, "min-height")),
    [44, 34],
  );
  assert.equal(statusToggleLabel.includes("compact-toggle-control"), false);

  const startButtonRules = cssRuleBodies(styles, ".first-line-setup-start");
  assert.equal(startButtonRules.length, 1);
  assert.equal(readPixelDeclaration(startButtonRules[0], "min-height"), 52);
});

test("10문제 출제", () => assert.equal(createFirstLineMockSession(ids, 10, () => 0.4).cardOrder.length, 10));
test("15문제 출제", () => assert.equal(createFirstLineMockSession(ids, 15, () => 0.4).cardOrder.length, 15));
test("20문제 출제", () => assert.equal(createFirstLineMockSession(ids, 20, () => 0.4).cardOrder.length, 20));
test("전체 출제", () => assert.equal(createFirstLineMockSession(ids, "all", () => 0.4).cardOrder.length, 25));
test("카드가 적으면 가능한 카드 전체", () => assert.equal(createFirstLineMockSession(ids.slice(0, 3), 10).cardOrder.length, 3));
test("한 바퀴 중복 없음", () => {
  const order = createFirstLineMockSession([...ids, ids[0]], "all").cardOrder;
  assert.equal(new Set(order).size, order.length);
});
test("생성된 세션 순서 고정", () => {
  const session = createFirstLineMockSession(ids, 10, () => 0.2);
  saveFirstLineMockSession(session);
  assert.deepEqual(readFirstLineMockSession(ids).cardOrder, session.cardOrder);
});
test("삭제된 카드는 복원 세션에서 제외", () => {
  const session = createFirstLineMockSession(ids.slice(0, 3), "all", () => 0.2);
  assert.equal(parseFirstLineMockSession(JSON.stringify(session), ids.slice(0, 2)).cardOrder.length, 2);
});
test("잘못된 세션 fallback", () => assert.equal(parseFirstLineMockSession("{}", ids), null));
test("세션 지우기", () => {
  saveFirstLineMockSession(createFirstLineMockSession(ids, 10));
  clearFirstLineMockSession();
  assert.equal(sessionStorage.getItem(FIRST_LINE_MOCK_SESSION_KEY), null);
});
test("결과 요약", () => {
  const session = createFirstLineMockSession(ids.slice(0, 3), "all", () => 0.2);
  session.answers = { [session.cardOrder[0]]: "success", [session.cardOrder[1]]: "again", [session.cardOrder[2]]: "hard" };
  assert.deepEqual(summarizeFirstLineMock(session), { total: 3, success: 1, again: 1, hard: 1, successRate: 33 });
});
test("첫 문장 전용/전체 답변 필터", () => {
  const firstOnly = { id: "x", deck: "OPIc 03_주제별답변", front: "Q", firstLine: "Hello.", hint: { title: "", memoryTip: "", minimum: "", flow: [] }, back: ["Hello."], tags: [] };
  const full = { ...firstOnly, id: "y", hint: { ...firstOnly.hint, title: "full" }, back: ["Hello.", "More."] };
  assert.equal(matchesAnswerContentFilter(firstOnly, "first-line-only"), true);
  assert.equal(matchesAnswerContentFilter(full, "full-answer"), true);
});
test("모의고사 UI는 3초 카운트다운과 정답 확인을 제공", () => {
  const source = readFileSync(new URL("../src/components/FirstLineDrill.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("setCountdown(3)"));
  assert.ok(source.includes("정답 확인"));
  assert.ok(source.includes('mode === "mock" && !showFirstLine'));
});
test("완료 화면은 결과와 재도전 동작을 제공", () => {
  const source = readFileSync(new URL("../src/components/FirstLineMockResult.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("성공률"));
  assert.ok(source.includes("어려운 카드만 다시 도전"));
  assert.ok(source.includes("같은 조건으로 새 모의고사"));
});
test("모의고사 저장은 sessionStorage 전용", () => {
  const source = readFileSync(new URL("../src/utils/firstLineMockSession.ts", import.meta.url), "utf8");
  assert.ok(source.includes("sessionStorage"));
  assert.equal(source.includes("localStorage"), false);
});
test("답변 익히기는 전체 답변 없음과 쉐도잉 제한을 안내", () => {
  const source = readFileSync(new URL("../src/components/AnswerLearning.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("전체 답변이 아직 없어요"));
  assert.ok(source.includes("전체 답변이 없어 쉐도잉을 시작할 수 없습니다"));
});
test("모바일 카드 이동은 기존 이전 다음 handler를 재사용", () => {
  const source = readFileSync(new URL("../src/components/FirstLineDrill.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('className="mobile-drill-navigation"'));
  assert.ok(source.includes("activateButton(event, goPrevious)"));
  assert.ok(source.includes("activateButton(event, goNext)"));
  assert.ok(source.includes('aria-label="이전 카드"'));
  assert.ok(source.includes('aria-label="다음 카드"'));
});
test("모바일 이동 행은 700px 이하에서만 2열로 표시", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.mobile-drill-navigation \{\r?\n  display: none;/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.mobile-drill-navigation \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.mobile-drill-navigation \.navigation-button \{[\s\S]*min-height: 42px;[\s\S]*font-size: 0\.92rem;/);
});

let passed = 0;
for (const { name, run } of tests) { await run(); passed += 1; console.log(`✓ ${name}`); }
console.log(`\nFirst-line mock verification ${passed}/${tests.length} passed`);
