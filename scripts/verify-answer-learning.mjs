import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  createStartedAnswerLearningSession,
  createEmptyAnswerLearningSession,
  normalizeAnswerLearningSession,
  returnToAnswerLearningSetup,
  shuffleAnswerLearningIds,
} from "../src/utils/answerLearningSession.ts";
import {
  hasAnswerLearningStatus,
  filterAnswerLearningCards,
  matchesAnswerLearningStatusFilter,
  orderAnswerLearningCards,
} from "../src/utils/answerLearningSelectors.ts";
import {
  createAppBackup,
  parseAndValidateBackup,
  serializeAppBackup,
} from "../src/utils/appBackup.ts";
import {
  ANSWER_LEARNING_STATUS_OPTIONS,
  FIRST_LINE_STATUS_OPTIONS,
} from "../src/utils/studyStatusOptions.ts";
import {
  createAnswerLearningPlaybackState,
  finishAnswerLearningSentence,
  isAnswerLearningPlaybackActive,
  pauseAnswerLearningPlayback,
  resolveAnswerLearningSentencePress,
  resolveAnswerLearningSentenceSelection,
  resumeAnswerLearningPlayback,
  shouldShowAnswerLearningStopControl,
  shouldStopAnswerLearningSentencePlayback,
  startAnswerLearningSentencePlayback,
  startFullAnswerPlayback,
} from "../src/utils/answerLearningPlayback.ts";
import {
  ANSWER_LEARNING_SENTENCE_CHECKS_STORAGE_KEY,
  createAnswerLearningSentenceCheckIds,
  getAnswerLearningSentenceCheckIds,
  parseAnswerLearningSentenceChecks,
  readAnswerLearningSentenceChecks,
  saveAnswerLearningSentenceChecks,
  serializeAnswerLearningSentenceChecks,
  toggleAnswerLearningSentenceCheck,
} from "../src/utils/answerLearningSentenceChecks.ts";

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

test("문장 체크 ID는 공백을 정규화하고 동일 문장 출현 순서를 구분", () => {
  const ids = createAnswerLearningSentenceCheckIds([
    "First sentence.",
    " First   sentence. ",
    "Second sentence.",
  ]);
  assert.notEqual(ids[0], ids[1]);
  assert.equal(ids[0].replace(/-1$/, ""), ids[1].replace(/-2$/, ""));
  assert.equal(
    ids[2],
    createAnswerLearningSentenceCheckIds(["Second sentence."])[0],
  );
});

test("문장 체크는 카드와 기본·나만의 답변 source별로 분리", () => {
  const [sentenceId] = createAnswerLearningSentenceCheckIds(["Checked sentence."]);
  const modelChecked = toggleAnswerLearningSentenceCheck(
    {},
    cardA.id,
    "default",
    sentenceId,
    [sentenceId],
  );
  const bothChecked = toggleAnswerLearningSentenceCheck(
    modelChecked,
    cardA.id,
    "my-answer",
    sentenceId,
    [sentenceId],
  );
  assert.deepEqual(
    getAnswerLearningSentenceCheckIds(bothChecked, cardA.id, "default"),
    [sentenceId],
  );
  assert.deepEqual(
    getAnswerLearningSentenceCheckIds(bothChecked, cardA.id, "my-answer"),
    [sentenceId],
  );
});

test("문장 변경 뒤 토글하면 현재 존재하는 문장 체크만 남김", () => {
  const [oldId, currentId] = createAnswerLearningSentenceCheckIds([
    "Old sentence.",
    "Current sentence.",
  ]);
  const checks = { [cardA.id]: { default: [oldId, currentId] } };
  const toggled = toggleAnswerLearningSentenceCheck(
    checks,
    cardA.id,
    "default",
    currentId,
    [currentId],
  );
  assert.deepEqual(toggled, {});
});

test("문장 체크 저장은 version wrapper를 사용하고 원문을 저장하지 않음", () => {
  const [sentenceId] = createAnswerLearningSentenceCheckIds(["Private sentence text."]);
  const checks = { [cardA.id]: { default: [sentenceId] } };
  const raw = serializeAnswerLearningSentenceChecks(checks);
  assert.equal(raw.includes("Private sentence text."), false);
  assert.deepEqual(parseAnswerLearningSentenceChecks(raw), checks);
});

test("문장 체크 parser는 손상값·버전 불일치·위험 키를 빈 값으로 정리", () => {
  assert.deepEqual(parseAnswerLearningSentenceChecks("{"), {});
  assert.deepEqual(parseAnswerLearningSentenceChecks('{"version":2,"cards":{}}'), {});
  assert.deepEqual(
    parseAnswerLearningSentenceChecks(
      '{"version":1,"cards":{"__proto__":{"default":["v1-1-00000000-1"]}}}',
    ),
    {},
  );
});

test("문장 체크 localStorage round trip과 빈 값 key 제거", () => {
  const storage = new MemoryStorage();
  const [sentenceId] = createAnswerLearningSentenceCheckIds(["Stored sentence."]);
  const checks = { [cardA.id]: { default: [sentenceId] } };
  saveAnswerLearningSentenceChecks(checks, storage);
  assert.deepEqual(readAnswerLearningSentenceChecks(storage), checks);
  saveAnswerLearningSentenceChecks({}, storage);
  assert.equal(storage.getItem(ANSWER_LEARNING_SENTENCE_CHECKS_STORAGE_KEY), null);
});

test("문장 체크 저장 실패는 호출자에게 전달되어 낙관적 UI 반영을 막음", () => {
  const [sentenceId] = createAnswerLearningSentenceCheckIds(["Stored sentence."]);
  const failingStorage = {
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("QuotaExceededError"); },
  };
  assert.throws(() =>
    saveAnswerLearningSentenceChecks(
      { [cardA.id]: { default: [sentenceId] } },
      failingStorage,
    ),
  );
});

test("첫 문장 상태는 긍정에서 어려움 순서와 기존 단축키를 유지", () => {
  assert.deepEqual(
    FIRST_LINE_STATUS_OPTIONS.map(({ value, label, shortcut }) => ({ value, label, shortcut })),
    [
      { value: "success", label: "성공", shortcut: "A" },
      { value: "again", label: "연습 필요", shortcut: "S" },
      { value: "hard", label: "어려움", shortcut: "D" },
    ],
  );
});
test("답변 익히기 상태는 긍정에서 어려움 순서", () => {
  assert.deepEqual(
    ANSWER_LEARNING_STATUS_OPTIONS.map(({ value, label }) => ({ value, label })),
    [
      { value: "speakable", label: "말할 수 있음" },
      { value: "learning", label: "익히는 중" },
      { value: "hard", label: "어려움" },
    ],
  );
});
test("두 상태 선택지는 의미가 다른 저장 값을 공유하지 않음", () => {
  assert.deepEqual(
    FIRST_LINE_STATUS_OPTIONS.map(({ value }) => value),
    ["success", "again", "hard"],
  );
  assert.deepEqual(
    ANSWER_LEARNING_STATUS_OPTIONS.map(({ value }) => value),
    ["speakable", "learning", "hard"],
  );
});
test("답변 전체 듣기는 첫 문장부터 연속 재생으로 시작", () => {
  assert.deepEqual(startFullAnswerPlayback(3), {
    status: "loading",
    mode: "continuous",
    currentIndex: 0,
  });
});
test("빈 답변 전체 듣기는 정지 상태 유지", () => {
  assert.deepEqual(startFullAnswerPlayback(0), createAnswerLearningPlaybackState());
});
test("정지 상태 문장 선택은 선택 문장만 재생", () => {
  assert.deepEqual(
    startAnswerLearningSentencePlayback(createAnswerLearningPlaybackState(), 1, 3),
    { status: "loading", mode: "single", currentIndex: 1 },
  );
});
test("정지 상태 첫 문장 탭은 재생하지 않고 문장만 선택", () => {
  assert.equal(
    resolveAnswerLearningSentencePress(
      createAnswerLearningPlaybackState(),
      null,
      1,
    ),
    "select",
  );
});
test("시간 제한 없이 같은 문장 두 번째 탭은 단일 재생 요청", () => {
  assert.equal(
    resolveAnswerLearningSentencePress(
      createAnswerLearningPlaybackState(),
      1,
      1,
    ),
    "play",
  );
  assert.equal(
    resolveAnswerLearningSentencePress(
      createAnswerLearningPlaybackState(),
      1,
      2,
    ),
    "select",
  );
});
test("단일 문장 재생 중 현재 문장 재선택은 정지 요청", () => {
  assert.equal(
    shouldStopAnswerLearningSentencePlayback(
      { status: "playing", mode: "single", currentIndex: 1 },
      1,
    ),
    true,
  );
  assert.equal(
    shouldStopAnswerLearningSentencePlayback(
      { status: "loading", mode: "single", currentIndex: 1 },
      1,
    ),
    true,
  );
  assert.equal(
    shouldStopAnswerLearningSentencePlayback(
      { status: "paused", mode: "single", currentIndex: 1 },
      1,
    ),
    true,
  );
  assert.equal(
    shouldStopAnswerLearningSentencePlayback(
      { status: "playing", mode: "single", currentIndex: 1 },
      2,
    ),
    false,
  );
  assert.equal(
    shouldStopAnswerLearningSentencePlayback(
      { status: "playing", mode: "continuous", currentIndex: 1 },
      1,
    ),
    false,
  );
});
test("재생 중인 단일 문장 버튼은 정지 동작을 접근 가능한 이름으로 알림", () => {
  const source = readFileSync(new URL("../src/components/AnswerLearning.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("const stopsCurrentSentence ="));
  assert.ok(source.includes('? " 재생 중지"'));
});
test("연속 재생 중 문장 선택은 해당 문장부터 연속 재생", () => {
  assert.deepEqual(
    startAnswerLearningSentencePlayback(
      { status: "playing", mode: "continuous", currentIndex: 0 },
      2,
      4,
    ),
    { status: "loading", mode: "continuous", currentIndex: 2 },
  );
});
test("일시정지 중 문장 선택도 해당 문장부터 연속 재생", () => {
  assert.deepEqual(
    startAnswerLearningSentencePlayback(
      { status: "paused", mode: "continuous", currentIndex: 1 },
      3,
      5,
    ),
    { status: "loading", mode: "continuous", currentIndex: 3 },
  );
});
test("전체 완료 후 문장 선택은 선택 문장만 재생", () => {
  assert.deepEqual(
    startAnswerLearningSentencePlayback(
      { status: "completed", mode: "continuous", currentIndex: 2 },
      1,
      3,
    ),
    { status: "loading", mode: "single", currentIndex: 1 },
  );
});
test("일시정지와 이어 듣기는 현재 문장을 유지", () => {
  const playing = { status: "playing", mode: "continuous", currentIndex: 2 };
  const paused = pauseAnswerLearningPlayback(playing);
  assert.deepEqual(paused, { status: "paused", mode: "continuous", currentIndex: 2 });
  assert.deepEqual(resumeAnswerLearningPlayback(paused), {
    status: "loading",
    mode: "continuous",
    currentIndex: 2,
  });
});
test("연속 재생은 다음 문장으로 진행하고 마지막에 완료", () => {
  const first = { status: "playing", mode: "continuous", currentIndex: 0 };
  const second = finishAnswerLearningSentence(first, 2);
  assert.deepEqual(second, { status: "loading", mode: "continuous", currentIndex: 1 });
  assert.deepEqual(
    finishAnswerLearningSentence({ ...second, status: "playing" }, 2),
    { status: "completed", mode: "continuous", currentIndex: 1 },
  );
});
test("선택 문장 한 번 재생은 정지 상태로 종료", () => {
  assert.deepEqual(
    finishAnswerLearningSentence(
      { status: "playing", mode: "single", currentIndex: 1 },
      3,
    ),
    createAnswerLearningPlaybackState(),
  );
});
test("답변 TTS active 상태는 loading playing paused만 포함", () => {
  assert.equal(isAnswerLearningPlaybackActive("loading"), true);
  assert.equal(isAnswerLearningPlaybackActive("playing"), true);
  assert.equal(isAnswerLearningPlaybackActive("paused"), true);
  assert.equal(isAnswerLearningPlaybackActive("idle"), false);
  assert.equal(isAnswerLearningPlaybackActive("completed"), false);
  assert.equal(isAnswerLearningPlaybackActive("error"), false);
});

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
test("상태 있음 selector hard", () => assert.equal(hasAnswerLearningStatus({ [cardA.id]: "hard" }, cardA.id), true));
test("상태 있음 selector learning", () => assert.equal(hasAnswerLearningStatus({ [cardA.id]: "learning" }, cardA.id), true));
test("상태 있음 selector speakable", () => assert.equal(hasAnswerLearningStatus({ [cardA.id]: "speakable" }, cardA.id), true));
test("상태 있음 selector 속성 없음", () => assert.equal(hasAnswerLearningStatus({}, cardA.id), false));
test("상태 있음 selector 빈 값과 손상 값 제외", () => {
  for (const value of [undefined, null, "", { status: "hard" }]) {
    assert.equal(hasAnswerLearningStatus({ [cardA.id]: value }, cardA.id), false);
  }
});
test("상태 있음 selector 잘못된 문자열 제외", () => assert.equal(hasAnswerLearningStatus({ [cardA.id]: "success" }, cardA.id), false));
test("상태 있음 selector 상속 속성 제외", () => {
  const inherited = Object.create({ [cardA.id]: "hard" });
  assert.equal(hasAnswerLearningStatus(inherited, cardA.id), false);
});
test("상태 있음 selector 위험한 키 제외", () => {
  const statuses = Object.create(null);
  for (const cardId of ["__proto__", "constructor", "prototype"]) {
    statuses[cardId] = "hard";
    assert.equal(hasAnswerLearningStatus(statuses, cardId), false);
  }
});
test("orphan 상태 ID는 카드 순회 후보에 없음", () => {
  const candidates = cards
    .filter((card) =>
      hasAnswerLearningStatus({ "removed-card": "hard" }, card.id),
    );
  assert.deepEqual(candidates, []);
});
test("전체 상태 matcher는 상태 부재와 무관하게 일치", () => {
  assert.equal(matchesAnswerLearningStatusFilter({}, cardA.id, "all"), true);
});
test("상태 없음 matcher는 유효 상태만 제외", () => {
  assert.equal(matchesAnswerLearningStatusFilter({}, cardA.id, "unlearned"), true);
  assert.equal(matchesAnswerLearningStatusFilter({ [cardA.id]: "hard" }, cardA.id, "unlearned"), false);
  assert.equal(matchesAnswerLearningStatusFilter({ [cardA.id]: "success" }, cardA.id, "unlearned"), true);
  const inherited = Object.create({ [cardA.id]: "hard" });
  assert.equal(matchesAnswerLearningStatusFilter(inherited, cardA.id, "unlearned"), true);
});
test("상태 있음 matcher는 세 유효 상태를 모두 포함", () => {
  for (const status of ["hard", "learning", "speakable"]) {
    assert.equal(
      matchesAnswerLearningStatusFilter({ [cardA.id]: status }, cardA.id, "with-status"),
      true,
    );
  }
});
test("상태 있음 matcher는 부재 손상 빈 ID와 위험 키를 제외", () => {
  assert.equal(matchesAnswerLearningStatusFilter({}, cardA.id, "with-status"), false);
  assert.equal(matchesAnswerLearningStatusFilter({ [cardA.id]: "success" }, cardA.id, "with-status"), false);
  assert.equal(matchesAnswerLearningStatusFilter({ "": "hard" }, "", "with-status"), false);
  for (const cardId of ["__proto__", "constructor", "prototype"]) {
    const statuses = Object.create(null);
    statuses[cardId] = "hard";
    assert.equal(matchesAnswerLearningStatusFilter(statuses, cardId, "with-status"), false);
  }
  const inherited = Object.create({ [cardA.id]: "hard" });
  assert.equal(matchesAnswerLearningStatusFilter(inherited, cardA.id, "with-status"), false);
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
test("카드 상세 단일 학습은 준비 화면 선택과 독립된 순서를 복원", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    screen: "learning",
    selectedCardIds: [cardA.id],
    cardOrder: [cardB.id],
  }, cards.map((card) => card.id));
  assert.deepEqual(session.selectedCardIds, [cardA.id]);
  assert.deepEqual(session.cardOrder, [cardB.id]);
  assert.equal(session.screen, "learning");
});
test("답변 익히기 종료는 준비 화면 선택과 학습 순서를 보존", () => {
  const learning = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    screen: "learning",
    selectedCardIds: [cardA.id, cardB.id],
    cardOrder: [cardB.id],
    currentIndex: 0,
    filters: { ...createEmptyAnswerLearningSession().filters, status: "with-status" },
  }, cards.map((card) => card.id));
  const setup = returnToAnswerLearningSetup(learning);
  assert.equal(setup.screen, "setup");
  assert.deepEqual(setup.selectedCardIds, [cardA.id, cardB.id]);
  assert.deepEqual(setup.cardOrder, [cardB.id]);
  assert.equal(setup.filters.status, "with-status");
});
test("현재 인덱스 경계", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), screen: "learning", selectedCardIds: [cardA.id], cardOrder: [cardA.id], currentIndex: 99 }, cards.map((card) => card.id));
  assert.equal(session.currentIndex, 0);
});
test("공개 상태 복원", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), reveals: { [cardA.id]: { hint: true, firstLine: true, answer: false, frontKo: true } } }, cards.map((card) => card.id));
  assert.equal(session.reveals[cardA.id].firstLine, true);
});
test("새 답변 익히기 시작은 대상 카드 공개 상태를 모두 닫음", () => {
  const session = {
    ...createEmptyAnswerLearningSession(),
    reveals: {
      [cardA.id]: { hint: true, firstLine: true, answer: true, frontKo: true },
      [cardB.id]: { hint: true, firstLine: true, answer: false, frontKo: true },
    },
  };
  const started = createStartedAnswerLearningSession(
    session,
    [cardA.id, cardB.id],
    { [cardA.id]: "default", [cardB.id]: "my-answer" },
  );
  assert.deepEqual(started.reveals[cardA.id], { hint: false, firstLine: false, answer: false, frontKo: false });
  assert.deepEqual(started.reveals[cardB.id], { hint: false, firstLine: false, answer: false, frontKo: false });
  assert.equal(started.screen, "learning");
  assert.equal(started.currentIndex, 0);
});
test("새 답변 익히기 시작은 현재 학습 밖 카드 공개 상태를 보존", () => {
  const outsideCardId = "outside-card";
  const outsideReveal = { hint: true, firstLine: false, answer: true, frontKo: false };
  const session = {
    ...createEmptyAnswerLearningSession(),
    reveals: {
      [cardA.id]: { hint: false, firstLine: true, answer: false, frontKo: false },
      [outsideCardId]: outsideReveal,
    },
  };
  const started = createStartedAnswerLearningSession(session, [cardA.id], { [cardA.id]: "default" });
  assert.deepEqual(started.reveals[outsideCardId], outsideReveal);
});
test("새 답변 익히기 시작 계산은 기존 session과 입력 배열을 변경하지 않음", () => {
  const session = {
    ...createEmptyAnswerLearningSession(),
    reveals: { [cardA.id]: { hint: true, firstLine: true, answer: true, frontKo: true } },
  };
  const cardOrder = [cardA.id];
  const answerSources = { [cardA.id]: "default" };
  const before = structuredClone(session);
  createStartedAnswerLearningSession(session, cardOrder, answerSources);
  assert.deepEqual(session, before);
  assert.deepEqual(cardOrder, [cardA.id]);
  assert.deepEqual(answerSources, { [cardA.id]: "default" });
});
test("답변 소스 복원", () => {
  const session = normalizeAnswerLearningSession({ ...createEmptyAnswerLearningSession(), answerSources: { [cardA.id]: "my-answer" } }, cards.map((card) => card.id));
  assert.equal(session.answerSources[cardA.id], "my-answer");
});
test("이전 unlearned 상태 필터 세션 호환", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: { ...createEmptyAnswerLearningSession().filters, status: "unlearned" },
  }, cards.map((card) => card.id));
  assert.equal(session.filters.status, "unlearned");
});
test("새 with-status 상태 필터 세션 복원", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: { ...createEmptyAnswerLearningSession().filters, status: "with-status" },
  }, cards.map((card) => card.id));
  assert.equal(session.filters.status, "with-status");
});
test("구형 답변 익히기 차원 태그는 version 1 안에서 승격", () => {
  const week = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: { ...createEmptyAnswerLearningSession().filters, tag: "week7" },
  }, cards.map((card) => card.id));
  const topic = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: { ...createEmptyAnswerLearningSession().filters, tag: "topic_home" },
  }, cards.map((card) => card.id));
  const level = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: { ...createEmptyAnswerLearningSession().filters, tag: "level_2" },
  }, cards.map((card) => card.id));
  const version = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: { ...createEmptyAnswerLearningSession().filters, tag: "v2" },
  }, cards.map((card) => card.id));
  assert.equal(week.version, 1);
  assert.equal(week.filters.tag, "all");
  assert.deepEqual(week.filters.selectedWeeks, ["week7"]);
  assert.deepEqual(topic.filters.selectedTopics, ["topic_home"]);
  assert.equal(level.filters.tag, "all");
  assert.deepEqual(level.filters.selectedWeeks, ["level_2"]);
  assert.equal(version.filters.tag, "v2");
  assert.deepEqual(version.filters.selectedTags, ["v2"]);
  assert.deepEqual(version.filters.selectedWeeks, []);
});
test("답변 익히기 차원 선택은 malformed 제거와 canonical 정렬", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: {
      ...createEmptyAnswerLearningSession().filters,
      selectedWeeks: ["week10", "week6", "week6", null],
      selectedTopics: "topic_home",
      selectedTypes: ["type_description"],
    },
  }, cards.map((card) => card.id));
  assert.deepEqual(session.filters.selectedWeeks, ["week6", "week10"]);
  assert.deepEqual(session.filters.selectedTopics, []);
  assert.deepEqual(session.filters.selectedTypes, ["type_description"]);
});
test("답변 익히기 복원은 선택 ID를 보존하고 사라진 차원 필터만 제거", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    selectedCardIds: [cardB.id, cardA.id],
    cardOrder: [cardA.id, cardB.id],
    filters: {
      ...createEmptyAnswerLearningSession().filters,
      selectedWeeks: ["week6", "week99"],
      selectedTopics: ["topic_missing"],
      selectedTypes: ["type_description"],
    },
  }, cards.map((card) => card.id), ["week6", "type_description"]);
  assert.deepEqual(session.selectedCardIds, [cardB.id, cardA.id]);
  assert.deepEqual(session.cardOrder, [cardA.id, cardB.id]);
  assert.deepEqual(session.filters.selectedWeeks, ["week6"]);
  assert.deepEqual(session.filters.selectedTopics, []);
  assert.deepEqual(session.filters.selectedTypes, ["type_description"]);
});
test("단일 재생과 연속 재생의 기존 문장 탭 동작 유지", () => {
  assert.equal(
    resolveAnswerLearningSentencePress(
      { status: "playing", mode: "single", currentIndex: 1 },
      1,
      1,
    ),
    "stop",
  );
  assert.equal(
    resolveAnswerLearningSentencePress(
      { status: "playing", mode: "continuous", currentIndex: 0 },
      null,
      2,
    ),
    "play",
  );
  assert.deepEqual(
    resolveAnswerLearningSentenceSelection(
      { status: "playing", mode: "continuous", currentIndex: 0 },
      "play",
      2,
    ),
    null,
  );
  assert.deepEqual(
    resolveAnswerLearningSentenceSelection(
      { status: "paused", mode: "single", currentIndex: 1 },
      "play",
      2,
    ),
    { index: 2, phase: "playing" },
  );
  assert.deepEqual(
    resolveAnswerLearningSentenceSelection(
      { status: "completed", mode: "continuous", currentIndex: 2 },
      "play",
      1,
    ),
    { index: 1, phase: "playing" },
  );
  assert.deepEqual(
    resolveAnswerLearningSentenceSelection(
      { status: "playing", mode: "single", currentIndex: 1 },
      "stop",
      1,
    ),
    null,
  );
});
test("별도 정지 버튼은 전체 답변 연속 재생 중에만 표시", () => {
  assert.equal(
    shouldShowAnswerLearningStopControl({ status: "loading", mode: "continuous", currentIndex: 0 }),
    true,
  );
  assert.equal(
    shouldShowAnswerLearningStopControl({ status: "playing", mode: "continuous", currentIndex: 0 }),
    true,
  );
  assert.equal(
    shouldShowAnswerLearningStopControl({ status: "playing", mode: "single", currentIndex: 0 }),
    false,
  );
  assert.equal(
    shouldShowAnswerLearningStopControl({ status: "idle", mode: "single", currentIndex: 0 }),
    false,
  );
});
test("구형 단일 기타 태그는 다중 선택으로 복원", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: {
      ...createEmptyAnswerLearningSession().filters,
      tag: "v2",
      selectedTags: undefined,
    },
  }, cards.map((card) => card.id), ["v2", "core"]);
  assert.equal(session.filters.tag, "v2");
  assert.deepEqual(session.filters.selectedTags, ["v2"]);
});
test("기타 태그 다중 선택은 중복과 사라진 값을 정리하고 legacy mirror를 유지", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: {
      ...createEmptyAnswerLearningSession().filters,
      tag: "old",
      selectedTags: ["v2", "core", "v2", "missing", null],
    },
  }, cards.map((card) => card.id), ["week6", "v2", "core", "final_rep"]);
  assert.equal(session.filters.tag, "core");
  assert.deepEqual(session.filters.selectedTags, ["core", "v2"]);
});
test("구형 final_rep 태그는 기존 final toggle로 승격", () => {
  const session = normalizeAnswerLearningSession({
    ...createEmptyAnswerLearningSession(),
    filters: { ...createEmptyAnswerLearningSession().filters, tag: "final_rep" },
  }, cards.map((card) => card.id));
  assert.equal(session.filters.tag, "all");
  assert.equal(session.filters.finalOnly, true);
});
test("랜덤은 원본 불변", () => {
  const ids = ["a", "b", "c"];
  shuffleAnswerLearningIds(ids, () => 0);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

const filters = { ...createEmptyAnswerLearningSession().filters };
test("미학습 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, status: "unlearned" }, { [cardA.id]: "hard" }, {}).every((card) => card.id !== cardA.id)));
test("상태 있음 필터", () => assert.deepEqual(
  filterAnswerLearningCards(
    [cardA, cardB],
    { ...filters, status: "with-status" },
    { [cardA.id]: "hard" },
    {},
  ).map((card) => card.id),
  [cardA.id],
));
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
test("태그 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, selectedTags: [cardA.tags[0]] }, {}, {}).every((card) => card.tags.includes(cardA.tags[0]))));
test("기타 태그는 여러 항목을 OR로 선택", () => {
  const taggedCards = [
    { ...cardA, id: "core-card", tags: ["week6", "core"] },
    { ...cardB, id: "v2-card", tags: ["week6", "v2"] },
    { ...cardB, id: "other-card", tags: ["week6", "other"] },
  ];
  const result = filterAnswerLearningCards(
    taggedCards,
    { ...filters, selectedTags: ["core", "v2"] },
    {},
    {},
  );
  assert.deepEqual(result.map((card) => card.id), ["core-card", "v2-card"]);
});
test("차원 내 OR와 차원 간 AND", () => {
  const dimensionCards = [
    { ...cardA, id: "dimension-a", tags: ["week6", "topic_home", "type_description"] },
    { ...cardB, id: "dimension-b", tags: ["week7", "topic_cafe", "type_description"] },
    { ...cardB, id: "dimension-c", tags: ["week8", "topic_home", "type_experience"] },
  ];
  const result = filterAnswerLearningCards(
    dimensionCards,
    {
      ...filters,
      selectedWeeks: ["week6", "week8"],
      selectedTopics: ["topic_home"],
      selectedTypes: ["type_description", "type_experience"],
    },
    {},
    {},
  );
  assert.deepEqual(result.map((card) => card.id), ["dimension-a", "dimension-c"]);
});
test("일반 태그는 차원 필터와 AND", () => {
  const dimensionCards = [
    { ...cardA, id: "dimension-a", tags: ["week6", "topic_home", "core"] },
    { ...cardB, id: "dimension-b", tags: ["week6", "topic_home", "extra"] },
  ];
  const result = filterAnswerLearningCards(
    dimensionCards,
    { ...filters, tag: "core", selectedTags: ["core"], selectedWeeks: ["week6"], selectedTopics: ["topic_home"] },
    {},
    {},
  );
  assert.deepEqual(result.map((card) => card.id), ["dimension-a"]);
});
test("v2 기타 태그는 학습 세트와 AND", () => {
  const learningSetCards = [
    { ...cardA, id: "level-1-v2", tags: ["level_1", "v2"] },
    { ...cardB, id: "level-2-v2", tags: ["level_2", "v2"] },
    { ...cardB, id: "level-1-v1", tags: ["level_1"] },
  ];
  const result = filterAnswerLearningCards(
    learningSetCards,
    { ...filters, tag: "v2", selectedTags: ["v2"], selectedWeeks: ["level_1"] },
    {},
    {},
  );
  assert.deepEqual(result.map((card) => card.id), ["level-1-v2"]);
});
test("상태 있음 필터는 다른 필터와 AND", () => {
  const deckACard = { ...cardA, id: "deck-a-card", deck: "deck-a" };
  const deckBCard = { ...cardB, id: "deck-b-card", deck: "deck-b" };
  const result = filterAnswerLearningCards(
    [deckACard, deckBCard],
    { ...filters, deck: "deck-b", status: "with-status" },
    { [deckACard.id]: "hard" },
    {},
  );
  assert.deepEqual(result, []);
});
test("내 답변 없음 필터", () => assert.ok(filterAnswerLearningCards(cards, { ...filters, answerPresence: "without" }, {}, { [cardA.id]: "answer" }).every((card) => card.id !== cardA.id)));
test("전체 필터는 카드 수 유지", () => assert.equal(filterAnswerLearningCards(cards, filters, {}, {}).length, cards.length));
test("필터 계산은 상태 map과 storage를 변경하거나 상태를 생성하지 않음", () => {
  const statuses = { [cardA.id]: "learning" };
  const statusesBefore = structuredClone(statuses);
  const storageBefore = new Map(localStorage.values);
  filterAnswerLearningCards([cardA, cardB], { ...filters, status: "with-status" }, statuses, {});
  filterAnswerLearningCards([cardA, cardB], { ...filters, status: "unlearned" }, statuses, {});
  assert.deepEqual(statuses, statusesBefore);
  assert.equal(Object.hasOwn(statuses, cardB.id), false);
  assert.deepEqual(localStorage.values, storageBefore);
});
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
