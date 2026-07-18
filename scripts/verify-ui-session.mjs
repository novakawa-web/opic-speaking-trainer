import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_LIBRARY_PAGE_SIZE,
  getNextCardLibraryVisibleCount,
  readCardLibrarySession,
  resolveCardLibraryVisibleCount,
  saveCardLibrarySession,
} from "../src/utils/cardLibrarySession.ts";
import {
  DEFAULT_NAVIGATION_SESSION,
  resolveNavigationSession,
} from "../src/utils/navigationSession.ts";
import { cards } from "../src/data/cards.ts";
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

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test("카드 라이브러리는 처음 20장만 표시", () => {
  assert.equal(CARD_LIBRARY_PAGE_SIZE, 20);
  assert.equal(resolveCardLibraryVisibleCount({ filterSignature: "a", visibleCount: 60, scrollY: 0 }, "b"), 20);
});

test("카드 더 보기는 20장씩 증가", () => {
  assert.equal(getNextCardLibraryVisibleCount(20), 40);
  assert.equal(getNextCardLibraryVisibleCount(40), 60);
});

test("카드 라이브러리 표시 개수와 스크롤 세션 복원", () => {
  const storage = new MemoryStorage();
  saveCardLibrarySession({ filterSignature: "filters", visibleCount: 60, scrollY: 720 }, storage);
  assert.deepEqual(readCardLibrarySession(storage), {
    filterSignature: "filters",
    visibleCount: 60,
    scrollY: 720,
  });
});

test("카드 라이브러리 내비게이션 세션 복원", () => {
  const resolved = resolveNavigationSession(
    { ...DEFAULT_NAVIGATION_SESSION, currentView: "library", detailSource: "library" },
    cards,
  );
  assert.equal(resolved.currentView, "library");
  assert.equal(resolved.detailSource, "library");
});

test("홈은 전체 CardList 대신 compact 카드 대시보드 사용", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('import { CardList }'), false);
  assert.ok(source.includes("<HomeCardDashboard"));
  assert.ok(source.includes("<CardLibrary"));
});

test("카드 라이브러리는 렌더링 목록 자체를 slice로 제한", () => {
  const source = readFileSync(new URL("../src/components/CardLibrary.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("cards.slice(0, visibleCount)"));
  assert.ok(source.includes("총 {cards.length}장 중 {shownCards.length}장 표시"));
  assert.ok(source.includes("카드 더 보기"));
});

test("개인 메모 모바일 액션은 360px에서 4열", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.ok(styles.includes("grid-template-columns: repeat(4, minmax(0, 1fr))"));
  assert.ok(styles.includes("@media (max-width: 339px)"));
});

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
