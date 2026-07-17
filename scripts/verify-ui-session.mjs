import assert from "node:assert/strict";
import {
  defaultCardDetailUiSession,
  parseCardDetailUiSession,
  parseShadowingPlayerSession,
} from "../src/utils/uiSessionStorage.ts";

let passed = 0;
function test(name, run) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("card detail session state serialize/restore", () => {
  const raw = JSON.stringify({
    cardId: "home-001",
    showHint: true,
    showAnswer: true,
    answerTab: "mine",
    myAnswerEditing: false,
    myAnswerDraft: "",
    memoExpanded: true,
    memoEditor: null,
  });
  const restored = parseCardDetailUiSession(raw, "home-001", true);
  assert.equal(restored.showHint, true);
  assert.equal(restored.showAnswer, true);
  assert.equal(restored.answerTab, "mine");
  assert.equal(restored.memoExpanded, true);
});

test("memo draft restore", () => {
  const raw = JSON.stringify({
    cardId: "home-001",
    memoExpanded: true,
    memoEditor: { mode: "new", memoId: null, draft: "cozy 발음 주의\n두 번째 줄" },
  });
  const restored = parseCardDetailUiSession(raw, "home-001", false);
  assert.equal(restored.memoEditor?.draft, "cozy 발음 주의\n두 번째 줄");
});

test("memo edit id restore", () => {
  const raw = JSON.stringify({
    cardId: "home-001",
    memoExpanded: true,
    memoEditor: { mode: "edit", memoId: "memo-1", draft: "수정 중" },
  });
  const restored = parseCardDetailUiSession(raw, "home-001", false);
  assert.equal(restored.memoEditor?.mode, "edit");
  assert.equal(restored.memoEditor?.memoId, "memo-1");
});

test("my answer draft restore", () => {
  const raw = JSON.stringify({
    cardId: "home-001",
    showAnswer: true,
    answerTab: "mine",
    myAnswerEditing: true,
    myAnswerDraft: "My draft answer.\nSecond line.",
  });
  const restored = parseCardDetailUiSession(raw, "home-001", true);
  assert.equal(restored.myAnswerEditing, true);
  assert.equal(restored.myAnswerDraft, "My draft answer.\nSecond line.");
});

test("new my answer draft keeps mine tab before first save", () => {
  const raw = JSON.stringify({
    cardId: "home-001",
    showAnswer: true,
    answerTab: "mine",
    myAnswerEditing: true,
    myAnswerDraft: "Unsaved first answer.",
  });
  const restored = parseCardDetailUiSession(raw, "home-001", false);
  assert.equal(restored.answerTab, "mine");
  assert.equal(restored.myAnswerEditing, true);
});

test("카드 불일치 시 초기화", () => {
  const raw = JSON.stringify({ cardId: "old-card", showAnswer: true });
  assert.deepEqual(
    parseCardDetailUiSession(raw, "new-card", false),
    defaultCardDetailUiSession("new-card", false),
  );
});

test("잘못된 JSON fallback", () => {
  assert.deepEqual(
    parseCardDetailUiSession("{bad", "home-001", false),
    defaultCardDetailUiSession("home-001", false),
  );
});

test("prototype pollution card id 차단", () => {
  const raw = JSON.stringify({ cardId: "__proto__", showAnswer: true });
  assert.equal(parseCardDetailUiSession(raw, "__proto__", false).showAnswer, false);
});

test("shadowing player session restore", () => {
  const restored = parseShadowingPlayerSession(JSON.stringify({
    active: true,
    cardId: "home-001",
    sourceType: "myAnswer",
    currentIndex: 4,
    status: "paused",
    questionExpanded: true,
    showFrontKo: true,
  }));
  assert.equal(restored?.currentIndex, 4);
  assert.equal(restored?.status, "paused");
  assert.equal(restored?.questionExpanded, true);
});

test("구버전 player session은 안전하게 paused", () => {
  const restored = parseShadowingPlayerSession(JSON.stringify({
    active: true,
    cardId: "home-001",
    sourceType: "modelAnswer",
    currentIndex: 1,
  }));
  assert.equal(restored?.status, "paused");
});

test("잘못된 player index 거부", () => {
  assert.equal(parseShadowingPlayerSession(JSON.stringify({
    active: true,
    cardId: "home-001",
    sourceType: "modelAnswer",
    currentIndex: -1,
  })), null);
});

test("저장 지문 player session restore", () => {
  const restored = parseShadowingPlayerSession(JSON.stringify({
    active: true,
    savedPassageId: "passage-001",
    sourceType: "savedPassage",
    currentIndex: 2,
    status: "paused",
    questionExpanded: false,
    showFrontKo: false,
  }));
  assert.equal(restored?.sourceType, "savedPassage");
  assert.equal(restored?.savedPassageId, "passage-001");
  assert.equal(restored?.currentIndex, 2);
});

test("저장 지문 id 없는 session 거부", () => {
  assert.equal(parseShadowingPlayerSession(JSON.stringify({
    active: true,
    sourceType: "savedPassage",
    currentIndex: 0,
  })), null);
});

console.log(`\nUI 세션 검증 ${passed}/${passed} 통과`);
