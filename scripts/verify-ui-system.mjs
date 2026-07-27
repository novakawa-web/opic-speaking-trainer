import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  POST_RESTORE_NAVIGATION_SESSION_KEY,
  consumePostRestoreNavigation,
  savePostRestoreNavigation,
} from "../src/utils/postRestoreNavigation.ts";
import {
  filterAnswerLearningCards,
} from "../src/utils/answerLearningSelectors.ts";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const quickStart = await readFile(new URL("../src/components/HomeQuickStart.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/HomeCardDashboard.tsx", import.meta.url), "utf8");
const personalMemos = await readFile(new URL("../src/components/PersonalMemoManager.tsx", import.meta.url), "utf8");
const answerLearning = await readFile(new URL("../src/components/AnswerLearning.tsx", import.meta.url), "utf8");
const answerLearningSetup = await readFile(new URL("../src/components/AnswerLearningSetup.tsx", import.meta.url), "utf8");
const backupManager = await readFile(new URL("../src/components/BackupManager.tsx", import.meta.url), "utf8");
const cardDataManager = await readFile(new URL("../src/components/CardDataManager.tsx", import.meta.url), "utf8");
const homeManagement = await readFile(new URL("../src/components/HomeManagement.tsx", import.meta.url), "utf8");

function extractExportedFunction(source, name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} helper must exist`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `${name} helper body must exist`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} helper body must close`);
}

const selectionStateFunctionSource = extractExportedFunction(
  answerLearningSetup,
  "getAnswerLearningSelectionState",
);
const selectionStateModuleSource = selectionStateFunctionSource.replace(
  /\(\s*visibleCards:\s*readonly Pick<OpicCard,\s*"id">\[\],\s*selectedCardIds:\s*readonly string\[\],\s*\)/,
  "(visibleCards, selectedCardIds)",
);
assert.notEqual(
  selectionStateModuleSource,
  selectionStateFunctionSource,
  "selection state helper parameter types must be stripped for runtime verification",
);
const selectionStateModuleUrl = `data:text/javascript;base64,${Buffer.from(selectionStateModuleSource).toString("base64")}`;
const { getAnswerLearningSelectionState } = await import(selectionStateModuleUrl);

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
  removeItem(key) { this.values.delete(key); }
}

test("compact learning tile 공통 class", () => {
  assert.match(quickStart, /compact-learning-tile/g);
  assert.match(app, /hero-rule compact-learning-tile/);
  assert.match(css, /\.compact-learning-tile\s*{[\s\S]*?min-height:\s*112px/);
});
test("summary chip 공통 class", () => {
  assert.match(dashboard, /summary-chip-row/);
  assert.match(personalMemos, /summary-chip-row/);
  assert.match(css, /\.summary-chip[\s\S]*?min-height:\s*32px/);
});
test("utility action variant", () => {
  assert.match(answerLearning, /secondary-button utility-action/);
  assert.match(answerLearning, /text-button utility-action/);
  assert.match(css, /\.utility-action\s*{[\s\S]*?min-height:\s*42px/);
});
test("360px compact tile full width", () => {
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.compact-learning-tile[\s\S]*?width:\s*100%/);
});
test("빠른 시작 카드 동일 폭과 리듬", () => {
  assert.match(css, /\.home-learning-action\.compact-learning-tile[\s\S]*?width:\s*100%[\s\S]*?gap:\s*var\(--space-sm\)/);
});
test("chip row 공통 gap", () => {
  assert.match(css, /\.summary-chip-row[\s\S]*?gap:\s*var\(--space-sm\)[\s\S]*?margin-top:\s*var\(--space-lg\)/);
});
test("badge와 조건 박스 간격", () => {
  assert.match(css, /\.home-filter-summary\s*{[\s\S]*?margin-top:\s*var\(--space-md\)/);
});
test("메모 설명과 badge가 별도 행이다", () => {
  assert.match(personalMemos, /home-card-description[\s\S]*?<\/div>\s*<\/div>\s*<div className="personal-memo-counts summary-chip-row"/);
});
test("설명 텍스트는 제한된 clamp와 keep-all을 사용한다", () => {
  assert.match(css, /\.home-card-description[\s\S]*?font-size:\s*clamp\(0\.95rem,[\s\S]*?1rem\)[\s\S]*?word-break:\s*keep-all/);
});
test("답변 익히기 준비 화면은 공통 rail과 spacing token을 사용한다", () => {
  assert.match(css, /\.answer-learning-setup\s*{[\s\S]*?var\(--home-content-max\)[\s\S]*?gap:\s*var\(--space-2xl\)/);
});
test("답변 익히기 선택 조작은 체크 목록보다 앞에 한 번만 배치된다", () => {
  const controlsIndex = answerLearningSetup.indexOf('className="answer-selection-controls"');
  const checklistIndex = answerLearningSetup.indexOf('className="answer-learning-card-checklist"');
  assert.ok(controlsIndex >= 0 && controlsIndex < checklistIndex);
  assert.equal((answerLearningSetup.match(/answer-learning-start/g) ?? []).length, 1);
});
test("답변 익히기 선택 조작은 정확한 문구와 독립 handler를 사용한다", () => {
  assert.match(answerLearningSetup, /countLabel: `학습할 카드 \$\{startCandidateCount\}장`/);
  assert.doesNotMatch(answerLearningSetup, /선택한 카드/);
  assert.match(answerLearningSetup, />\s*전체 선택\s*</);
  assert.match(answerLearningSetup, />\s*선택 해제\s*</);
  assert.match(answerLearningSetup, /startLabel: `선택한 \$\{startCandidateCount\}장으로 답변 익히기 시작`/);
  assert.match(answerLearningSetup, /onClick=\{selectAllVisible\}/);
  assert.match(answerLearningSetup, /onClick=\{clearSelection\}/);
});
test("답변 익히기 상태 select는 없음 있음과 기존 상세 상태를 제공한다", () => {
  assert.match(answerLearningSetup, /<option value="all">전체<\/option>/);
  assert.match(answerLearningSetup, /<option value="unlearned">답변 연습 상태 없음<\/option>/);
  assert.match(answerLearningSetup, /<option value="with-status">답변 연습 상태 있음<\/option>/);
  assert.match(answerLearningSetup, /<option value="hard">어려움<\/option>/);
  assert.match(answerLearningSetup, /<option value="learning">익히는 중<\/option>/);
  assert.match(answerLearningSetup, /<option value="speakable">말할 수 있음<\/option>/);
  assert.match(answerLearningSetup, /status:\s*"all"/);
});
test("답변 익히기 시작 후보 수는 현재 결과와 선택의 교집합이다", () => {
  assert.match(answerLearningSetup, /const startCandidateCount = visibleCards\.filter\(\(card\) => selected\.has\(card\.id\)\)\.length/);
  assert.match(answerLearningSetup, /getAnswerLearningSelectionState\(visibleCards, session\.selectedCardIds\)/);
  assert.match(answerLearningSetup, /disabled=\{selectionState\.startDisabled\} onClick=\{onStart\}/);
  assert.match(answerLearningSetup, /disabled=\{visibleCards\.length === 0 \|\| selectionState\.allVisibleSelected\} onClick=\{selectAllVisible\}/);
  assert.match(answerLearningSetup, /disabled=\{selectionState\.clearDisabled\} onClick=\{clearSelection\}/);
});
test("답변 익히기 숨겨진 선택 수와 안내 조건은 현재 결과 밖의 선택만 사용한다", () => {
  assert.match(answerLearningSetup, /const visibleCardIds = new Set\(visibleCards\.map\(\(card\) => card\.id\)\)/);
  assert.match(answerLearningSetup, /const hiddenSelectedCount = selectedCardIds\.filter\(\(cardId\) => !visibleCardIds\.has\(cardId\)\)\.length/);
  assert.match(answerLearningSetup, /hiddenSelectionMessage: hiddenSelectedCount > 0/);
  assert.match(answerLearningSetup, /필터 밖에서 선택한 \$\{hiddenSelectedCount\}장은 유지되지만 이번 학습에는 포함되지 않아요\./);
  assert.match(answerLearningSetup, /\{selectionState\.hiddenSelectionMessage && \(/);
});
test("답변 익히기 선택 상태 계약은 필터 전이를 실제 계산한다", () => {
  const visible = [{ id: "card-a" }, { id: "card-b" }];

  const empty = getAnswerLearningSelectionState(visible, []);
  assert.equal(empty.countLabel, "학습할 카드 0장");
  assert.equal(empty.hiddenSelectedCount, 0);
  assert.equal(empty.hiddenSelectionMessage, null);
  assert.equal(empty.startDisabled, true);
  assert.equal(empty.clearDisabled, true);

  const selectedVisible = getAnswerLearningSelectionState(visible, ["card-a"]);
  assert.equal(selectedVisible.countLabel, "학습할 카드 1장");
  assert.equal(selectedVisible.hiddenSelectionMessage, null);
  assert.equal(selectedVisible.startLabel, "선택한 1장으로 답변 익히기 시작");
  assert.equal(selectedVisible.startDisabled, false);

  const hiddenOne = getAnswerLearningSelectionState([{ id: "card-b" }], ["card-a"]);
  assert.equal(hiddenOne.countLabel, "학습할 카드 0장");
  assert.equal(hiddenOne.hiddenSelectedCount, 1);
  assert.equal(hiddenOne.hiddenSelectionMessage, "필터 밖에서 선택한 1장은 유지되지만 이번 학습에는 포함되지 않아요.");
  assert.equal(hiddenOne.startDisabled, true);
  assert.equal(hiddenOne.clearDisabled, false);

  const restored = getAnswerLearningSelectionState(visible, ["card-a"]);
  assert.equal(restored.startCandidateCount, 1);
  assert.equal(restored.hiddenSelectionMessage, null);

  const hiddenTwo = getAnswerLearningSelectionState([{ id: "card-b" }], ["card-a", "card-c"]);
  assert.equal(hiddenTwo.hiddenSelectedCount, 2);
  assert.equal(hiddenTwo.hiddenSelectionMessage, "필터 밖에서 선택한 2장은 유지되지만 이번 학습에는 포함되지 않아요.");
});
test("답변 상태 필터 전환은 선택을 보존하고 N M과 실제 시작 후보를 일치시킨다", () => {
  const candidateCards = [
    { id: "card-a", deck: "deck-a", tags: ["final_rep"] },
    { id: "card-b", deck: "deck-a", tags: [] },
    { id: "card-c", deck: "deck-b", tags: [] },
  ];
  const filters = {
    deck: "all",
    tag: "all",
    finalOnly: false,
    answerPresence: "all",
    status: "all",
    order: "default",
  };
  const statuses = { "card-a": "hard", "card-c": "learning" };
  const statusesBefore = structuredClone(statuses);
  const selectedCardIds = ["card-a", "card-b"];
  const selectedBefore = [...selectedCardIds];

  const allVisible = filterAnswerLearningCards(candidateCards, filters, statuses, {});
  const allState = getAnswerLearningSelectionState(allVisible, selectedCardIds);
  assert.equal(allState.startCandidateCount, 2);
  assert.equal(allState.hiddenSelectedCount, 0);

  const withStatusVisible = filterAnswerLearningCards(
    candidateCards,
    { ...filters, status: "with-status" },
    statuses,
    {},
  );
  const withStatusState = getAnswerLearningSelectionState(withStatusVisible, selectedCardIds);
  const actualStartIds = withStatusVisible
    .map((card) => card.id)
    .filter((cardId) => new Set(selectedCardIds).has(cardId));
  assert.deepEqual(withStatusVisible.map((card) => card.id), ["card-a", "card-c"]);
  assert.equal(withStatusState.startCandidateCount, 1);
  assert.equal(withStatusState.hiddenSelectedCount, 1);
  assert.equal(withStatusState.startDisabled, false);
  assert.equal(actualStartIds.length, withStatusState.startCandidateCount);

  const withoutStatusVisible = filterAnswerLearningCards(
    candidateCards,
    { ...filters, status: "unlearned" },
    statuses,
    {},
  );
  const withoutStatusState = getAnswerLearningSelectionState(withoutStatusVisible, selectedCardIds);
  assert.deepEqual(withoutStatusVisible.map((card) => card.id), ["card-b"]);
  assert.equal(withoutStatusState.startCandidateCount, 1);
  assert.equal(withoutStatusState.hiddenSelectedCount, 1);

  const emptyVisible = filterAnswerLearningCards(
    candidateCards,
    { ...filters, status: "speakable" },
    statuses,
    {},
  );
  const emptyState = getAnswerLearningSelectionState(emptyVisible, selectedCardIds);
  assert.equal(emptyState.startCandidateCount, 0);
  assert.equal(emptyState.hiddenSelectedCount, 2);
  assert.equal(emptyState.startDisabled, true);
  assert.equal(emptyState.clearDisabled, false);

  const restoredState = getAnswerLearningSelectionState(allVisible, selectedCardIds);
  assert.equal(restoredState.startCandidateCount, 2);
  assert.equal(restoredState.hiddenSelectedCount, 0);
  assert.deepEqual(selectedCardIds, selectedBefore);
  assert.deepEqual(statuses, statusesBefore);

  const afterSelectAll = [...new Set([
    ...selectedCardIds,
    ...withStatusVisible.map((card) => card.id),
  ])];
  const selectAllState = getAnswerLearningSelectionState(withStatusVisible, afterSelectAll);
  assert.equal(selectAllState.allVisibleSelected, true);
  assert.ok(afterSelectAll.includes("card-b"));

  const cleared = [];
  const clearedState = getAnswerLearningSelectionState(withStatusVisible, cleared);
  assert.equal(clearedState.startCandidateCount, 0);
  assert.equal(clearedState.hiddenSelectedCount, 0);
  assert.equal(clearedState.clearDisabled, true);
});
test("답변 익히기 상태 select는 46px와 모바일 1열 계약을 유지한다", () => {
  assert.match(css, /\.answer-learning-filter-grid select\s*\{[\s\S]*?min-height:\s*46px/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.answer-learning-filter-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
test("답변 익히기 숨겨진 선택 안내는 강조 박스가 아닌 보조 설명이다", () => {
  const hiddenNoteRule = css.match(/\.answer-selection-hidden-note\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(hiddenNoteRule, /color:\s*var\(--muted\)/);
  assert.match(hiddenNoteRule, /color:\s*color-mix\(in srgb,\s*var\(--muted\) 90%,\s*var\(--ink\)\)/);
  assert.match(hiddenNoteRule, /font-size:\s*0\.[0-9]+rem/);
  assert.match(hiddenNoteRule, /line-height:/);
  assert.doesNotMatch(hiddenNoteRule, /background|border|box-shadow/);
});
test("답변 익히기 모바일 선택 버튼과 시작 버튼은 터치 크기 계약을 지킨다", () => {
  assert.match(css, /\.answer-selection-buttons\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.answer-selection-buttons button\s*{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.answer-learning-start\s*{[\s\S]*?width:\s*100%[\s\S]*?min-height:\s*52px/);
});
test("복구 navigation intent를 저장한다", () => {
  const storage = new MemoryStorage();
  assert.equal(savePostRestoreNavigation("복구 완료", storage), true);
  assert.ok(storage.getItem(POST_RESTORE_NAVIGATION_SESSION_KEY));
});
test("복구 navigation intent는 한 번만 소비한다", () => {
  const storage = new MemoryStorage();
  savePostRestoreNavigation("복구 완료", storage);
  assert.deepEqual(consumePostRestoreNavigation(storage), {
    target: "backup-manager",
    managementExpanded: true,
    message: "복구 완료",
  });
  assert.equal(consumePostRestoreNavigation(storage), null);
});
test("잘못된 navigation intent는 제거하고 무시한다", () => {
  const storage = new MemoryStorage();
  storage.setItem(POST_RESTORE_NAVIGATION_SESSION_KEY, '{"target":"other"}');
  assert.equal(consumePostRestoreNavigation(storage), null);
  assert.equal(storage.getItem(POST_RESTORE_NAVIGATION_SESSION_KEY), null);
});
test("복구와 되돌리기 모두 reload 전에 intent를 저장한다", () => {
  assert.equal((backupManager.match(/savePostRestoreNavigation\(/g) ?? []).length, 2);
  assert.match(backupManager, /savePostRestoreNavigation\("전체 복구가 완료됐어요\."\)/);
  assert.match(backupManager, /savePostRestoreNavigation\("직전 전체 복구 이전 상태로 돌아왔어요\."\)/);
});
test("reload 후 관리 영역을 펼치고 백업 영역으로 이동한다", () => {
  assert.match(homeManagement, /detailsRef\.current\.open = true/);
  assert.match(app, /consumePostRestoreNavigation/);
  assert.match(app, /scrollIntoView/);
  assert.match(backupManager, /id="backup-manager"/);
});
test("복구 완료 메시지는 aria-live로 알리고 제목 자동 focus는 제거한다", () => {
  assert.match(backupManager, /postRestoreMessage/);
  assert.doesNotMatch(backupManager, /headingRef|tabIndex=\{-1\}|\.focus\(\)/);
  assert.match(backupManager, /aria-live="polite"/);
});
test("TSV 완료는 reload 없이 같은 관리 영역에서 결과를 갱신한다", () => {
  assert.doesNotMatch(cardDataManager, /location\.reload/);
  assert.match(cardDataManager, /setMessage\(\s*`가져오기 완료:/);
  assert.match(cardDataManager, /transfer-undo-area/);
});

test("study card blocks use a shared stack gap", () => {
  assert.match(dashboard, /home-material-card material-card-content-stack/);
  assert.match(css, /\.material-card-content-stack\s*\{[\s\S]*?gap:\s*var\(--space-lg\)/);
  assert.match(css, /\.material-card-content-stack\s*>\s*\.summary-chip-row[\s\S]*?margin:\s*0/);
});
test("mobile hero and quick start use a shared inner inset", () => {
  assert.match(css, /--home-inner-card-inset-mobile:\s*var\(--space-xl\)/);
  assert.match(css, /\.hero-panel,\s*\n\s*\.home-quick-start\s*\{[\s\S]*?padding-inline:\s*var\(--home-inner-card-inset-mobile\)/);
});
test("post-restore navigation keeps live messaging and scroll without heading focus", () => {
  assert.match(backupManager, /postRestoreMessage/);
  assert.match(backupManager, /aria-live="polite"/);
  assert.match(app, /scrollIntoView/);
  assert.doesNotMatch(backupManager, /headingRef|tabIndex=\{-1\}|\.focus\(\)/);
});
test("current condition stays inline and only its value may wrap", () => {
  assert.match(dashboard, /home-filter-summary-separator[\s\S]*?aria-hidden="true">·<\/span>/);
  assert.match(dashboard, /home-filter-summary-value/);
  assert.match(css, /\.home-filter-summary\s*\{[\s\S]*?align-items:\s*center[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?word-break:\s*keep-all/);
  assert.doesNotMatch(css, /\.home-filter-summary\s*\{\s*display:\s*grid/);
});

console.log(`UI system verification passed: ${passed} tests`);
