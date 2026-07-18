import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  POST_RESTORE_NAVIGATION_SESSION_KEY,
  consumePostRestoreNavigation,
  savePostRestoreNavigation,
} from "../src/utils/postRestoreNavigation.ts";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const quickStart = await readFile(new URL("../src/components/HomeQuickStart.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/HomeCardDashboard.tsx", import.meta.url), "utf8");
const personalMemos = await readFile(new URL("../src/components/PersonalMemoManager.tsx", import.meta.url), "utf8");
const answerLearning = await readFile(new URL("../src/components/AnswerLearning.tsx", import.meta.url), "utf8");
const backupManager = await readFile(new URL("../src/components/BackupManager.tsx", import.meta.url), "utf8");
const cardDataManager = await readFile(new URL("../src/components/CardDataManager.tsx", import.meta.url), "utf8");
const homeManagement = await readFile(new URL("../src/components/HomeManagement.tsx", import.meta.url), "utf8");

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
