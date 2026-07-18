import assert from "node:assert/strict";
import { cards } from "../src/data/cards.ts";
import {
  calculateAnswerLearningAttemptCounts,
  calculateAnswerLearningDailyStats,
  flattenAnswerLearningAttempts,
  normalizeAnswerLearningAttempts,
  normalizeAnswerLearningStatuses,
  readAnswerLearningAttempts,
  readAnswerLearningStatuses,
  recordAnswerLearningAttempt,
  removeAnswerLearningAttempt,
  saveAnswerLearningStatuses,
} from "../src/utils/answerLearningStorage.ts";
import {
  createEmptyAnswerLearningSession,
  normalizeAnswerLearningSession,
  shuffleAnswerLearningIds,
} from "../src/utils/answerLearningSession.ts";
import {
  filterAnswerLearningCards,
  orderAnswerLearningCards,
} from "../src/utils/answerLearningSelectors.ts";
import {
  createAppBackup,
  parseAndValidateBackup,
  serializeAppBackup,
} from "../src/utils/appBackup.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();

const tests = [];
function test(name, run) { tests.push({ name, run }); }
const cardA = cards[0];
const cardB = cards[1];
const now = new Date(2026, 6, 17, 4, 30); // 실행 환경의 로컬 시각 2026-07-17 04:30

test("빈 상태 저장소", () => assert.deepEqual(readAnswerLearningStatuses(new MemoryStorage()), {}));
test("hard 상태 정규화", () => assert.equal(normalizeAnswerLearningStatuses({ [cardA.id]: "hard" })[cardA.id], "hard"));
test("learning 상태 정규화", () => assert.equal(normalizeAnswerLearningStatuses({ [cardA.id]: "learning" })[cardA.id], "learning"));
test("speakable 상태 정규화", () => assert.equal(normalizeAnswerLearningStatuses({ [cardA.id]: "speakable" })[cardA.id], "speakable"));
test("잘못된 상태 제외", () => assert.deepEqual(normalizeAnswerLearningStatuses({ [cardA.id]: "success" }), {}));
test("prototype key 제외", () => assert.equal(Object.hasOwn(normalizeAnswerLearningStatuses({ constructor: "hard" }), "constructor"), false));
test("상태 저장 round trip", () => {
  const storage = new MemoryStorage();
  saveAnswerLearningStatuses({ [cardA.id]: "learning" }, storage);
  assert.equal(readAnswerLearningStatuses(storage)[cardA.id], "learning");
});
test("잘못된 상태 저장소 fallback", () => {
  const storage = new MemoryStorage(); storage.setItem("opic-answer-learning-statuses", "{");
  assert.deepEqual(readAnswerLearningStatuses(storage), {});
});

test("시도 생성과 UUID", () => {
  const result = recordAnswerLearningAttempt({}, cardA.id, "hard", "default", "04:00", now);
  assert.ok(result.attempt.id);
  assert.equal(result.attempt.answerSource, "default");
});
test("04:00 이후 당일 학습일", () => {
  const result = recordAnswerLearningAttempt({}, cardA.id, "hard", "default", "04:00", now);
  assert.equal(result.attempt.date, "2026-07-17");
});
test("04:00 이전 전날 학습일", () => {
  const early = new Date(2026, 6, 17, 3, 59);
  const result = recordAnswerLearningAttempt({}, cardA.id, "learning", "my-answer", "04:00", early);
  assert.equal(result.attempt.date, "2026-07-16");
});
test("시도 제거", () => {
  const result = recordAnswerLearningAttempt({}, cardA.id, "hard", "default", "04:00", now);
  assert.equal(removeAnswerLearningAttempt(result.attemptsByDate, result.attempt.date, result.attempt.id)[result.attempt.date].length, 0);
});
test("다른 UUID 시도 보존", () => {
  const one = recordAnswerLearningAttempt({}, cardA.id, "hard", "default", "04:00", now);
  const two = recordAnswerLearningAttempt(one.attemptsByDate, cardB.id, "learning", "default", "04:00", now);
  assert.equal(removeAnswerLearningAttempt(two.attemptsByDate, one.attempt.date, one.attempt.id)[one.attempt.date].length, 1);
});
test("orphan 시도 보존", () => {
  const attempts = normalizeAnswerLearningAttempts({ "2026-07-17": [{ id: "orphan-1", date: "2026-07-17", cardId: "removed-card", status: "hard", timestamp: now.toISOString(), answerSource: "default" }] });
  assert.equal(attempts["2026-07-17"][0].cardId, "removed-card");
});
test("중복 시도 UUID 제외", () => {
  const attempt = { id: "dup", date: "2026-07-17", cardId: cardA.id, status: "hard", timestamp: now.toISOString(), answerSource: "default" };
  assert.equal(normalizeAnswerLearningAttempts({ "2026-07-17": [attempt, attempt] })["2026-07-17"].length, 1);
});
test("잘못된 시도 저장소 fallback", () => {
  const storage = new MemoryStorage(); storage.setItem("opic-answer-learning-attempts-by-date", "bad");
  assert.deepEqual(readAnswerLearningAttempts(storage), {});
});
test("시도 횟수 계산", () => {
  const data = { "2026-07-17": [
    { id: "1", date: "2026-07-17", cardId: cardA.id, status: "hard", timestamp: now.toISOString(), answerSource: "default" },
    { id: "2", date: "2026-07-17", cardId: cardA.id, status: "learning", timestamp: now.toISOString(), answerSource: "default" },
  ] };
  assert.equal(calculateAnswerLearningAttemptCounts(data)[cardA.id], 2);
});
test("오늘 답변 시도 통계", () => {
  const result = recordAnswerLearningAttempt({}, cardA.id, "speakable", "default", "04:00", now);
  assert.equal(calculateAnswerLearningDailyStats(result.attemptsByDate, "04:00", now).attemptCount, 1);
});
test("오늘 말할 수 있음 고유 카드", () => {
  const one = recordAnswerLearningAttempt({}, cardA.id, "speakable", "default", "04:00", now);
  const two = recordAnswerLearningAttempt(one.attemptsByDate, cardA.id, "speakable", "default", "04:00", now);
  assert.equal(calculateAnswerLearningDailyStats(two.attemptsByDate, "04:00", now).speakableCardCount, 1);
});
test("flatten 날짜 순서", () => {
  const values = normalizeAnswerLearningAttempts({
    "2026-07-18": [{ id: "b", date: "2026-07-18", cardId: cardB.id, status: "hard", timestamp: now.toISOString(), answerSource: "default" }],
    "2026-07-17": [{ id: "a", date: "2026-07-17", cardId: cardA.id, status: "hard", timestamp: now.toISOString(), answerSource: "default" }],
  });
  assert.equal(flattenAnswerLearningAttempts(values)[0].id, "a");
});

test("기본 세션", () => assert.equal(createEmptyAnswerLearningSession().screen, "setup"));
test("개별 카드 선택 복원", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), selectedCardIds: [cardA.id] }, cards.map((card) => card.id));
  assert.deepEqual(session.selectedCardIds, [cardA.id]);
});
test("삭제 카드 세션 제외", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), selectedCardIds: ["missing"] }, cards.map((card) => card.id));
  assert.deepEqual(session.selectedCardIds, []);
});
test("학습 카드 순서 유지", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), screen: "learning", selectedCardIds: [cardA.id, cardB.id], cardOrder: [cardB.id, cardA.id], currentIndex: 1 }, cards.map((card) => card.id));
  assert.deepEqual(session.cardOrder, [cardB.id, cardA.id]);
  assert.equal(session.currentIndex, 1);
});
test("현재 인덱스 경계", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), screen: "learning", selectedCardIds: [cardA.id], cardOrder: [cardA.id], currentIndex: 99 }, cards.map((card) => card.id));
  assert.equal(session.currentIndex, 0);
});
test("공개 상태 복원", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), reveals: { [cardA.id]: { hint: true, firstLine: true, answer: false, frontKo: true } } }, cards.map((card) => card.id));
  assert.equal(session.reveals[cardA.id].firstLine, true);
});
test("답변 소스 복원", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), answerSources: { [cardA.id]: "my-answer" } }, cards.map((card) => card.id));
  assert.equal(session.answerSources[cardA.id], "my-answer");
});
test("랜덤은 원본 불변", () => {
  const ids = ["a", "b", "c"];
  shuffleAnswerLearningIds(ids, () => 0);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

const filters = { deck: "all", tag: "all", finalOnly: false, answerPresence: "all", status: "all", order: "default" };
test("미학습 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, status: "unlearned" }, { [cardA.id]: "hard" }, {}).every((card) => card.id !== cardA.id)));
test("어려움 필터", () => assert.deepEqual(filterAnswerLearningCards(cards, { ...filters, status: "hard" }, { [cardA.id]: "hard" }, {}).map((card) => card.id), [cardA.id]));
test("익히는 중 필터", () => assert.deepEqual(filterAnswerLearningCards(cards, { ...filters, status: "learning" }, { [cardA.id]: "learning" }, {}).map((card) => card.id), [cardA.id]));
test("말할 수 있음 필터", () => assert.deepEqual(filterAnswerLearningCards(cards, { ...filters, status: "speakable" }, { [cardA.id]: "speakable" }, {}).map((card) => card.id), [cardA.id]));
test("내 답변 있음 필터", () => assert.deepEqual(filterAnswerLearningCards(cards, { ...filters, answerPresence: "with" }, {}, { [cardA.id]: "answer" }).map((card) => card.id), [cardA.id]));
test("final_rep 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, finalOnly: true }, {}, {}).every((card) => card.tags.includes("final_rep"))));
test("연습 적은 순 안정 정렬", () => {
  const ordered = orderAnswerLearningCards([cardA, cardB], "least-practiced", { [cardA.id]: 2, [cardB.id]: 1 });
  assert.equal(ordered[0].id, cardB.id);
});
test("기본 순서 유지", () => assert.deepEqual(orderAnswerLearningCards([cardA, cardB], "default", {}).map((card) => card.id), [cardA.id, cardB.id]));
test("덱 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, deck: cardA.deck }, {}, {}).every((card) => card.deck === cardA.deck)));
test("태그 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, tag: cardA.tags[0] }, {}, {}).every((card) => card.tags.includes(cardA.tags[0]))));
test("내 답변 없음 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, answerPresence: "without" }, {}, { [cardA.id]: "answer" }).every((card) => card.id !== cardA.id)));
test("전체 필터는 카드 수 유지", () => assert.equal(filterAnswerLearningCards(cards, filters, {}, {}).length, cards.length));
test("잘못된 세션 order fallback", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), filters: { ...filters, order: "broken" } }, cards.map((card) => card.id));
  assert.equal(session.filters.order, "default");
});
test("잘못된 세션 source 제외", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), answerSources: { [cardA.id]: "other" } }, cards.map((card) => card.id));
  assert.equal(session.answerSources[cardA.id], undefined);
});
test("학습 화면은 카드가 없으면 준비 화면", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), screen: "learning" }, cards.map((card) => card.id));
  assert.equal(session.screen, "setup");
});
test("상태 수정은 최신 값", () => {
  const statuses = normalizeAnswerLearningStatuses({ [cardA.id]: "hard", [cardB.id]: "learning" });
  statuses[cardA.id] = "speakable";
  assert.equal(statuses[cardA.id], "speakable");
});
test("상태 초기화는 시도 기록과 독립", () => {
  const result = recordAnswerLearningAttempt({}, cardA.id, "hard", "default", "04:00", now);
  const statuses = { [cardA.id]: "hard" };
  delete statuses[cardA.id];
  assert.equal(result.attemptsByDate[result.attempt.date].length, 1);
});

test("JSON round trip", () => {
  const statuses = { [cardA.id]: "learning" };
  const attempts = { "2026-07-17": [{ id: "answer-1", date: "2026-07-17", cardId: cardA.id, status: "learning", timestamp: now.toISOString(), answerSource: "default" }] };
  const backup = createAppBackup(cards, {}, {}, undefined, now, {}, {}, undefined, undefined, statuses, attempts);
  const restored = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(restored.backup.data.answerLearningStatuses[cardA.id], "learning");
  assert.equal(restored.backup.data.answerLearningAttempts.length, 1);
});
test("기존 JSON 필드 누락", () => {
  const backup = createAppBackup(cards, {}, {}, undefined, now);
  delete backup.data.answerLearningStatuses;
  delete backup.data.answerLearningAttempts;
  delete backup.summary.answerLearningStatusCount;
  delete backup.summary.answerLearningAttemptCount;
  const restored = parseAndValidateBackup(JSON.stringify(backup));
  assert.deepEqual(restored.backup.data.answerLearningStatuses, {});
  assert.deepEqual(restored.backup.data.answerLearningAttempts, []);
});
test("잘못된 답변 상태는 경고 후 제외", () => {
  const backup = createAppBackup(cards, {}, {}, undefined, now);
  backup.data.answerLearningStatuses = { [cardA.id]: "success" };
  const restored = parseAndValidateBackup(JSON.stringify(backup));
  assert.equal(restored.canRestore, true);
  assert.deepEqual(restored.backup.data.answerLearningStatuses, {});
});
test("중복 answer attempt UUID는 오류", () => {
  const backup = createAppBackup(cards, {}, {}, undefined, now);
  const attempt = { id: "dup-answer", date: "2026-07-17", cardId: cardA.id, status: "hard", timestamp: now.toISOString(), answerSource: "default" };
  backup.data.answerLearningAttempts = [attempt, attempt];
  assert.equal(parseAndValidateBackup(JSON.stringify(backup)).canRestore, false);
});
test("첫 문장 데이터는 답변 학습과 분리", () => {
  const backup = createAppBackup(cards, { [cardA.id]: "success" }, {}, undefined, now, {}, {}, undefined, undefined, { [cardA.id]: "hard" }, {});
  assert.equal(backup.data.cardStatuses[cardA.id], "success");
  assert.equal(backup.data.answerLearningStatuses[cardA.id], "hard");
});

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed += 1; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
console.log(`Answer learning verification passed: ${passed} tests`);
