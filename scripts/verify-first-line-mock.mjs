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

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
globalThis.sessionStorage = new MemoryStorage();

const ids = Array.from({ length: 25 }, (_, index) => `card-${index + 1}`);
const tests = [];
function test(name, run) { tests.push({ name, run }); }

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
  assert.ok(styles.includes(".mobile-drill-navigation {\n  display: none;"));
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.mobile-drill-navigation \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.mobile-drill-navigation \.navigation-button \{[\s\S]*min-height: 42px;[\s\S]*font-size: 0\.92rem;/);
});

let passed = 0;
for (const { name, run } of tests) { await run(); passed += 1; console.log(`✓ ${name}`); }
console.log(`\nFirst-line mock verification ${passed}/${tests.length} passed`);
