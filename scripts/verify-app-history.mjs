import assert from "node:assert/strict";
import {
  APP_HISTORY_STATE_KEY,
  createAppHistoryState,
  getAppBackView,
  getNextAppHistoryDepth,
  isCurrentAppHistoryView,
  pushAppHistoryView,
  readAppHistoryEntry,
  replaceAppHistoryView,
  shouldCheckHomeNavigationGuard,
} from "../src/utils/appHistory.ts";

let passed = 0;

function test(name, run) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const baseContext = {
  detailReturnView: "home",
  drillReturnView: "list",
  answerLearningReturnView: "setup",
  shadowingReturnView: "direct",
};

test("홈은 앱 내부 뒤로가기 목표가 없음", () => {
  assert.equal(getAppBackView("list", baseContext), null);
});

test("홈 직속 화면은 홈으로 복귀", () => {
  for (const view of ["library", "drillSetup", "answerSetup", "personalMemos"]) {
    assert.equal(getAppBackView(view, baseContext), "list");
  }
});

test("새 카드 작성은 카드 라이브러리로 복귀", () => {
  assert.equal(getAppBackView("createCard", baseContext), "library");
});

test("카드 상세는 진입 출처로 복귀", () => {
  assert.equal(getAppBackView("detail", baseContext), "list");
  assert.equal(getAppBackView("detail", { ...baseContext, detailReturnView: "library" }), "library");
});

test("첫 문장 훈련은 진입 출처로 복귀", () => {
  assert.equal(getAppBackView("drill", baseContext), "list");
  assert.equal(getAppBackView("drill", { ...baseContext, drillReturnView: "detail" }), "detail");
});

test("답변 익히기는 준비 또는 카드 상세로 복귀", () => {
  assert.equal(getAppBackView("answerLearning", baseContext), "answerSetup");
  assert.equal(
    getAppBackView("answerLearning", { ...baseContext, answerLearningReturnView: "detail" }),
    "detail",
  );
});

test("쉐도잉은 세 가지 진입 출처로 복귀", () => {
  assert.equal(getAppBackView("shadowing", baseContext), "list");
  assert.equal(
    getAppBackView("shadowing", { ...baseContext, shadowingReturnView: "detail" }),
    "detail",
  );
  assert.equal(
    getAppBackView("shadowing", { ...baseContext, shadowingReturnView: "answerLearning" }),
    "answerLearning",
  );
});

test("history state는 외부 필드를 보존하고 legacy marker를 제거", () => {
  const state = createAppHistoryState(
    { external: "keep", opicView: "detail", opicShadowing: true },
    "answerSetup",
    2,
  );
  assert.equal(state.external, "keep");
  assert.equal("opicView" in state, false);
  assert.equal("opicShadowing" in state, false);
  assert.deepEqual(state[APP_HISTORY_STATE_KEY], {
    version: 1,
    view: "answerSetup",
    depth: 2,
  });
});

test("history state 정규화는 음수 깊이를 0으로 제한", () => {
  const state = createAppHistoryState(null, "list", -3.8);
  assert.deepEqual(readAppHistoryEntry(state), { version: 1, view: "list", depth: 0 });
});

test("손상된 history state는 거부", () => {
  assert.equal(readAppHistoryEntry(null), null);
  assert.equal(readAppHistoryEntry({ [APP_HISTORY_STATE_KEY]: { version: 2, view: "list", depth: 0 } }), null);
  assert.equal(readAppHistoryEntry({ [APP_HISTORY_STATE_KEY]: { version: 1, view: "missing", depth: 0 } }), null);
  assert.equal(readAppHistoryEntry({ [APP_HISTORY_STATE_KEY]: { version: 1, view: "list", depth: -1 } }), null);
});

test("다음 history 깊이는 현재 앱 entry 기준", () => {
  assert.equal(getNextAppHistoryDepth(null), 1);
  assert.equal(getNextAppHistoryDepth(createAppHistoryState({}, "detail", 4)), 5);
});

test("push helper는 현재 깊이 다음 entry를 생성", () => {
  const history = {
    state: createAppHistoryState({}, "list", 0),
    pushState(state) {
      this.state = state;
    },
    replaceState(state) {
      this.state = state;
    },
  };
  pushAppHistoryView(history, "answerSetup");
  assert.deepEqual(readAppHistoryEntry(history.state), {
    version: 1,
    view: "answerSetup",
    depth: 1,
  });
  assert.equal(isCurrentAppHistoryView(history.state, "answerSetup"), true);
});

test("replace helper는 현재 깊이를 유지", () => {
  const history = {
    state: createAppHistoryState({}, "drillSetup", 3),
    pushState(state) {
      this.state = state;
    },
    replaceState(state) {
      this.state = state;
    },
  };
  replaceAppHistoryView(history, "drill");
  assert.deepEqual(readAppHistoryEntry(history.state), {
    version: 1,
    view: "drill",
    depth: 3,
  });
});

test("홈 화면 이탈은 편집 초안 가드를 확인", () => {
  assert.equal(shouldCheckHomeNavigationGuard("list"), true);
  assert.equal(shouldCheckHomeNavigationGuard("library"), false);
});

test("저장하지 않고 연습은 편집 초안을 보존", () => {
  assert.equal(shouldCheckHomeNavigationGuard("list", true), false);
});

console.log(`App history verification passed: ${passed}/${passed}`);
