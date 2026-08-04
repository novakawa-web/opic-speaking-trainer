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
import { formatHomeFilterSummary } from "../src/utils/homeFilterSummary.ts";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const quickStart = await readFile(new URL("../src/components/HomeQuickStart.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/HomeCardDashboard.tsx", import.meta.url), "utf8");
const personalMemos = await readFile(new URL("../src/components/PersonalMemoManager.tsx", import.meta.url), "utf8");
const answerLearning = await readFile(new URL("../src/components/AnswerLearning.tsx", import.meta.url), "utf8");
const answerLearningSpeech = await readFile(new URL("../src/hooks/useAnswerLearningSpeech.ts", import.meta.url), "utf8");
const firstLineDrill = await readFile(new URL("../src/components/FirstLineDrill.tsx", import.meta.url), "utf8");
const firstLineSetup = await readFile(new URL("../src/components/FirstLineSetup.tsx", import.meta.url), "utf8");
const answerLearningSetup = await readFile(new URL("../src/components/AnswerLearningSetup.tsx", import.meta.url), "utf8");
const cardLibrary = await readFile(new URL("../src/components/CardLibrary.tsx", import.meta.url), "utf8");
const studyScopeSummary = await readFile(new URL("../src/components/StudyScopeSummary.tsx", import.meta.url), "utf8");
const tagFilter = await readFile(new URL("../src/components/TagFilter.tsx", import.meta.url), "utf8");
const cardTagDimensionFilters = await readFile(new URL("../src/components/CardTagDimensionFilters.tsx", import.meta.url), "utf8");
const appHeader = await readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8");
const backupManager = await readFile(new URL("../src/components/BackupManager.tsx", import.meta.url), "utf8");
const cardDataManager = await readFile(new URL("../src/components/CardDataManager.tsx", import.meta.url), "utf8");
const homeManagement = await readFile(new URL("../src/components/HomeManagement.tsx", import.meta.url), "utf8");
const directTextPractice = await readFile(new URL("../src/components/DirectTextPractice.tsx", import.meta.url), "utf8");

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

function extractCssAtRuleBlocks(source, marker) {
  const blocks = [];
  let searchFrom = 0;

  while (true) {
    const start = source.indexOf(marker, searchFrom);
    if (start === -1) return blocks;

    const bodyStart = source.indexOf("{", start + marker.length);
    assert.notEqual(bodyStart, -1, `${marker} block must open`);

    let depth = 0;
    let closed = false;
    for (let index = bodyStart; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) {
        blocks.push(source.slice(bodyStart + 1, index));
        searchFrom = index + 1;
        closed = true;
        break;
      }
    }
    assert.ok(closed, `${marker} block must close`);
  }
}

function extractExactCssRuleBodies(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(`(?:^|\\n)[\\t ]*${escapedSelector}[\\t ]*\\{`, "g");
  const bodies = [];

  for (const match of source.matchAll(marker)) {
    const precedingSource = source.slice(0, match.index).trimEnd();
    const precedingCharacter = precedingSource.at(-1);
    if (precedingCharacter && precedingCharacter !== "{" && precedingCharacter !== "}") continue;

    const bodyStart = match.index + match[0].lastIndexOf("{");
    let depth = 0;
    let closed = false;
    for (let index = bodyStart; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) {
        bodies.push(source.slice(bodyStart + 1, index));
        closed = true;
        break;
      }
    }
    assert.ok(closed, `${selector} rule must close`);
  }

  return bodies;
}

function extractOnlyCssRuleBody(source, selector) {
  const bodies = extractExactCssRuleBodies(source, selector);
  assert.equal(bodies.length, 1, `${selector} must have exactly one standalone rule`);
  return bodies[0];
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
  assert.match(directTextPractice, /summary-chip-row/);
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
test("홈 안내 문구는 현재 제공하는 세 학습 흐름과 실제 이동 동작을 설명한다", () => {
  assert.match(app, /OPIc SPEAKING ROUTINE/);
  assert.match(app, /오늘 필요한 방식으로 말하기를 연습해 보세요\./);
  assert.match(app, /첫 문장 연습, 답변 익히기, 쉐도잉 중 지금 필요한 연습을 선택할 수 있어요\./);
  assert.doesNotMatch(app, /WEEK 6|3초 안에 첫 문장|Local MVP/);
  assert.match(quickStart, />질문에 첫 문장을 바로 말해요\.<\/span>/);
  assert.match(quickStart, />쉐도잉 지문 열기<\/strong>/);
  assert.match(quickStart, />지문을 고르거나 작성한 뒤 문장별로 따라 말해요\.<\/span>/);
  assert.match(dashboard, /현재 조건으로 첫 문장 연습하세요\./);
  assert.match(homeManagement, /학습일 · 카드 TSV · 전체 JSON 백업/);
  assert.match(app, /onOpenShadowing=\{\(\) => openSavedPassages\(false\)\}/);
  assert.match(directTextPractice, /<h2 id="direct-practice-title"[^>]*>쉐도잉 지문<\/h2>/);
});
test("홈 현재 조건 요약은 답변 익히기 상태를 실제 필터와 같은 문구로 표시한다", () => {
  const base = {
    selectedDeck: "all",
    selectedTag: "all",
    finalOnly: false,
    hardOnly: false,
    cardScope: "all",
    studyOrder: "default",
    answerContentFilter: "all",
    archiveFilter: "active",
    cardSearchQuery: "",
  };
  assert.equal(
    formatHomeFilterSummary({ ...base, answerLearningStatusFilter: "all" }),
    "필터 없음 · 기본 순서",
  );
  assert.equal(
    formatHomeFilterSummary({ ...base, answerLearningStatusFilter: "unlearned" }),
    "답변 연습 상태 없음",
  );
  assert.equal(
    formatHomeFilterSummary({ ...base, answerLearningStatusFilter: "with-status" }),
    "답변 연습 상태 있음",
  );
  assert.equal(
    formatHomeFilterSummary({ ...base, answerLearningStatusFilter: "hard" }),
    "답변 어려움",
  );
  assert.equal(
    formatHomeFilterSummary({ ...base, answerLearningStatusFilter: "learning" }),
    "답변 익히는 중",
  );
  assert.equal(
    formatHomeFilterSummary({ ...base, answerLearningStatusFilter: "speakable" }),
    "답변 말할 수 있음",
  );
  assert.equal(
    formatHomeFilterSummary({
      ...base,
      selectedDeck: "WEEK 7",
      hardOnly: true,
      answerLearningStatusFilter: "with-status",
      cardScope: "new",
      cardSearchQuery: "  baseball  ",
      studyOrder: "random",
    }),
    "WEEK 7 · 첫 문장 어려움 · 답변 연습 상태 있음 · 새 카드 · 카드 내용 검색 · 랜덤 순서",
  );

  const summaryStart = app.indexOf("const filterSummary = useMemo");
  const summaryEnd = app.indexOf("const drillCards = useMemo", summaryStart);
  assert.notEqual(summaryStart, -1);
  assert.notEqual(summaryEnd, -1);
  const summarySource = app.slice(summaryStart, summaryEnd);
  assert.match(summarySource, /formatHomeFilterSummary\(\{[\s\S]*?answerLearningStatusFilter,[\s\S]*?\}\);/);
  assert.match(summarySource, /\}, \[[^\]]*answerLearningStatusFilter[^\]]*\]\);/);
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
  assert.match(css, /\.answer-learning-setup\s*{[\s\S]*?var\(--app-content-max\)[\s\S]*?var\(--app-inline-padding\)[\s\S]*?gap:\s*var\(--space-2xl\)/);
});
test("답변 익히기 준비와 실제 학습 화면은 같은 outer rail을 사용한다", () => {
  const learningRail = /\.answer-learning-setup-intro,[\s\S]*?\.answer-learning-rating\s*{[\s\S]*?var\(--app-content-max\)[\s\S]*?var\(--app-inline-padding\)/;
  assert.match(css, learningRail);
  assert.match(css, /\.answer-learning-question h1\s*{[^}]*max-width:\s*var\(--learning-text-max\)/);
  assert.match(css, /\.answer-learning-answer\s*{[^}]*max-width:\s*var\(--learning-text-max\)/);
});
test("답변 익히기 전체 답변은 중간 장식 테두리 없이 기능 표면을 유지한다", () => {
  const answerSelectorOccurrences = css.match(
    /(?:^|\n)[\t ]*\.answer-learning-answer(?=[\t ]*(?:,|\{))/g,
  ) ?? [];
  assert.equal(answerSelectorOccurrences.length, 1);
  const answerBody = extractOnlyCssRuleBody(css, ".answer-learning-answer");
  assert.match(answerBody, /max-width:\s*var\(--learning-text-max\)/);
  assert.match(answerBody, /margin:\s*14px auto 0/);
  assert.match(answerBody, /padding:\s*0/);
  assert.doesNotMatch(answerBody, /(?:^|;)\s*(?:border|border-radius|background|box-shadow)\s*:/);

  const revealCard = css.match(
    /\.home-quick-start,[\s\S]*?\.answer-learning-reveal,[\s\S]*?\.answer-learning-rating\s*{([^}]*)\}/,
  );
  assert.ok(revealCard, "answer learning reveal outer card contract must exist");
  assert.match(revealCard[1], /border:\s*1px solid var\(--line\)/);
  assert.match(revealCard[1], /border-radius:\s*18px/);
  assert.match(revealCard[1], /background:\s*var\(--surface\)/);
  assert.match(revealCard[1], /box-shadow:\s*var\(--shadow\)/);

  const sentenceButton = extractOnlyCssRuleBody(css, ".answer-learning-sentences button");
  assert.match(sentenceButton, /padding:\s*12px/);
  assert.match(sentenceButton, /border:\s*0/);
  assert.match(sentenceButton, /border-radius:\s*10px/);
  assert.match(sentenceButton, /background:\s*var\(--surface\)/);

  const currentSentence = extractOnlyCssRuleBody(css, ".answer-learning-sentences button.is-current");
  assert.match(currentSentence, /background:\s*var\(--blue-soft\)/);
  assert.match(currentSentence, /box-shadow:\s*inset 0 0 0 2px var\(--blue\)/);
});
test("답변 익히기 세로 밀도는 설명 범위와 safe-area·터치 계약을 보존한다", () => {
  assert.equal((answerLearning.match(/className="answer-learning-rating-description"/g) ?? []).length, 1);
  assert.ok(
    answerLearning.indexOf('className="answer-learning-rating"')
      < answerLearning.indexOf('className="answer-learning-navigation"'),
  );
  assert.equal((answerLearning.match(/className="answer-learning-navigation"/g) ?? []).length, 1);
  assert.match(answerLearning, /const clearCurrentAudio = useCallback\(\(\) => \{[\s\S]*?stop\(\);[\s\S]*?answerSpeech\.stop\(\);[\s\S]*?clearRecording\(\)/);
  assert.match(answerLearning, /const goPrevious = useCallback\(\(\) => \{[\s\S]*?clearCurrentAudio\(\);[\s\S]*?onPrevious\(\)/);
  assert.match(answerLearning, /const goNext = useCallback\(\(\) => \{[\s\S]*?clearCurrentAudio\(\);[\s\S]*?onNext\(\)/);
  assert.match(answerLearning, /onSwipeLeft:\s*canGoNext \? goNext : undefined/);
  assert.match(answerLearning, /onSwipeRight:\s*canGoPrevious \? goPrevious : undefined/);
  assert.match(answerLearning, /disabled=\{!canGoPrevious\} aria-label="이전 카드" onClick=\{goPrevious\}/);
  assert.match(answerLearning, /disabled=\{!canGoNext\} aria-label="다음 카드" onClick=\{goNext\}/);

  const mobileAnswerLearningBlocks = extractCssAtRuleBlocks(
    css,
    "@media (max-width: 700px)",
  ).filter((block) => block.includes(".answer-learning-page"));
  assert.equal(mobileAnswerLearningBlocks.length, 1);
  assert.match(
    mobileAnswerLearningBlocks[0],
    /\.answer-learning-page\s*\{[\s\S]*?padding-bottom:\s*calc\(var\(--space-md\) \+ env\(safe-area-inset-bottom\)\)[\s\S]*?\.answer-learning-question h1\s*\{[\s\S]*?margin:\s*var\(--space-lg\) auto var\(--space-md\)[\s\S]*?font-size:\s*clamp\(1\.3rem,\s*5\.4vw,\s*1\.6rem\)[\s\S]*?line-height:\s*1\.34[\s\S]*?\.answer-learning-rating > h2\s*\{[\s\S]*?margin:\s*0[\s\S]*?font-size:\s*1\.25rem[\s\S]*?line-height:\s*1\.35[\s\S]*?\.answer-learning-rating-description\s*\{[\s\S]*?margin:\s*var\(--space-xs\) auto 0[\s\S]*?font-size:\s*0\.9rem[\s\S]*?line-height:\s*1\.5[\s\S]*?\.answer-learning-navigation\s*\{[\s\S]*?margin:\s*var\(--space-md\) auto 0/,
  );

  const shortLandscapeAnswerLearningBlocks = extractCssAtRuleBlocks(
    css,
    "@media (orientation: landscape) and (min-width: 800px) and (max-height: 700px)",
  ).filter((block) => block.includes(".answer-learning-page"));
  assert.equal(shortLandscapeAnswerLearningBlocks.length, 1);
  assert.match(
    shortLandscapeAnswerLearningBlocks[0],
    /\.answer-learning-page\s*\{[\s\S]*?padding-bottom:\s*calc\(var\(--space-md\) \+ env\(safe-area-inset-bottom\)\)[\s\S]*?\.answer-learning-question h1\s*\{[\s\S]*?font-size:\s*1\.5rem[\s\S]*?\.answer-learning-rating-description\s*\{[\s\S]*?font-size:\s*0\.9rem[\s\S]*?\.answer-learning-navigation\s*\{[\s\S]*?margin:\s*var\(--space-md\) auto 0/,
  );
  assert.doesNotMatch(css, /\.answer-learning-page\s*\{[^}]*padding-bottom:\s*0/);
  assert.doesNotMatch(css, /\.answer-learning-navigation\s*\{[^}]*margin-bottom:\s*-/);
  assert.doesNotMatch(css, /\.answer-learning-page\s*\{[^}]*height:\s*100vh/);

  assert.match(css, /\.answer-learning-question-actions button,[\s\S]*?\.answer-learning-first-line-content button\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.answer-learning-tabs button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.answer-learning-status-buttons button\s*\{[^}]*min-height:\s*56px/);
  assert.match(css, /\.answer-learning-shadowing\s*\{[^}]*min-height:\s*48px/);
  assert.match(css, /\.answer-learning-navigation button\s*\{[^}]*min-height:\s*48px/);
  assert.match(css, /\.utility-action\s*\{[\s\S]*?min-height:\s*42px/);
});
test("첫 문장과 전체 답변 상태 선택지는 공통 정의를 사용한다", () => {
  assert.match(firstLineDrill, /import \{ FIRST_LINE_STATUS_OPTIONS \} from "\.\.\/utils\/studyStatusOptions"/);
  assert.match(firstLineDrill, /FIRST_LINE_STATUS_OPTIONS\.map\(\(option\) =>/);
  assert.match(answerLearning, /ANSWER_LEARNING_STATUS_OPTIONS\.map\(\(option\) =>/);
  assert.match(answerLearning, /FIRST_LINE_STATUS_OPTIONS\.map\(\(option\) =>/);
});
test("답변 익히기 첫 문장 공개 아래에서 기존 첫 문장 상태를 입력한다", () => {
  const revealIndex = answerLearning.indexOf("{reveal.firstLine && (");
  const statusIndex = answerLearning.indexOf('className="answer-learning-first-line-status"');
  const answerIndex = answerLearning.indexOf("{reveal.answer && (");
  assert.ok(revealIndex >= 0 && revealIndex < statusIndex && statusIndex < answerIndex);
  assert.match(answerLearning, /role="group" aria-label="첫 문장 상태"/);
  assert.match(answerLearning, /aria-pressed=\{firstLineStatus === option\.value\}/);
  assert.match(answerLearning, /onClick=\{\(\) => onFirstLineStatusChange\(option\.value\)\}/);
  assert.match(app, /firstLineStatus=\{statuses\[selectedCard\.id\] \?\? null\}/);
  assert.match(
    app,
    /function updateAnswerLearningFirstLineStatus\(status: FirstLineResult\) \{[\s\S]*?updateStatus\(status, \{ syncMockSession: false \}\);[\s\S]*?\}/,
  );
  assert.match(app, /onFirstLineStatusChange=\{updateAnswerLearningFirstLineStatus\}/);
});
test("답변 익히기 첫 문장 상태는 작은 화면에서도 한 줄 44px 조작을 유지한다", () => {
  assert.match(css, /\.answer-learning-first-line-status\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.answer-learning-first-line-status \.status-button\s*\{[^}]*min-width:\s*0;[^}]*min-height:\s*44px/);
  const mobileAnswerLearningBlocks = extractCssAtRuleBlocks(
    css,
    "@media (max-width: 700px)",
  ).filter((block) => block.includes(".answer-learning-page"));
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-first-line-content\s*\{[^}]*flex-direction:\s*column/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-first-line-status \.status-button\s*\{[^}]*padding-inline:\s*3px/);
});
test("답변 익히기는 현재 학습 위치 안에서 공통 CardEditor를 연다", () => {
  assert.match(answerLearning, /import \{ CardEditor \} from "\.\/CardEditor"/);
  assert.match(answerLearning, />\s*카드 수정\s*</);
  assert.doesNotMatch(answerLearning, /카드와 답변 수정/);
  assert.match(answerLearning, /<CardEditor[\s\S]*?includeMyAnswer[\s\S]*?returnLabel="답변 익히기로 돌아가기"/);
  assert.match(answerLearning, /registerHomeNavigationGuard\(confirmNavigation\)/);
  assert.doesNotMatch(app, /pushHistoryView\("cardEdit"\)/);
  assert.match(app, /onSaveCardEdit=\{saveCardEdit\}/);
});
test("답변 익히기 전체 답변 TTS는 연속 재생 상태와 공통 속도 설정을 제공한다", () => {
  assert.match(answerLearning, /useAnswerLearningSpeech\(answerSentences, ttsRate/);
  assert.match(answerLearning, /답변 익히기 TTS 읽기 속도/);
  assert.match(answerLearning, /TTS_RATE_OPTIONS\.map/);
  assert.match(answerLearning, /saveTtsRate\(nextRate\)/);
  assert.match(answerLearning, /전체 답변 듣기/);
  assert.match(answerLearning, /일시정지/);
  assert.match(answerLearning, /이어 듣기/);
  assert.match(answerLearning, /answerSpeech\.playFromSentence\(sentenceIndex\)/);
  assert.match(answerLearning, /aria-current=/);
  assert.ok(
    answerLearning.indexOf('className="answer-learning-answer-actions"')
      < answerLearning.indexOf('className="answer-learning-tabs"'),
  );
  assert.match(answerLearning, /<span aria-hidden="true">[\s\S]*?🔊/);
});
test("답변 익히기 TTS hook은 최신 영어 voice와 request id로 stale 재생을 차단한다", () => {
  assert.match(answerLearningSpeech, /requestEnglishVoice\(window\.speechSynthesis\)/);
  assert.match(answerLearningSpeech, /window\.speechSynthesis\.getVoices\(\)/);
  assert.match(answerLearningSpeech, /requestIdRef\.current \+= 1/);
  assert.match(answerLearningSpeech, /requestId !== requestIdRef\.current/);
  assert.match(answerLearningSpeech, /finishAnswerLearningSentence/);
  assert.doesNotMatch(answerLearningSpeech, /localStorage|sessionStorage|indexedDB|Firebase/i);
});
test("답변 익히기 녹음기는 평가 아래와 카드 이동 위에 있고 TTS와 상호 중지한다", () => {
  const ratingIndex = answerLearning.indexOf('className="answer-learning-rating"');
  const recorderIndex = answerLearning.indexOf('className="answer-learning-audio-recorder"');
  const navigationIndex = answerLearning.indexOf('className="answer-learning-navigation"');
  assert.ok(ratingIndex >= 0 && ratingIndex < recorderIndex && recorderIndex < navigationIndex);
  assert.match(answerLearning, /onBeforeRecord=\{\(\) => \{[\s\S]*?answerSpeech\.stop\(\)/);
  assert.match(answerLearning, /onBeforePlayback=\{\(\) => \{[\s\S]*?answerSpeech\.stop\(\)/);
  assert.match(answerLearning, /recorderRef\.current\?\.stopPlayback\(\)/);
  assert.match(answerLearning, /recorderRef\.current\?\.clearRecording\(\)/);
});
test("답변 익히기 오디오 조작은 모바일 터치와 현재 문장 표시 계약을 유지한다", () => {
  assert.match(css, /\.answer-learning-tts-rate\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.answer-learning-sentences button\.is-current\s*\{[^}]*var\(--blue-soft\)/);
  assert.match(css, /\.answer-learning-audio-recorder\s*\{[\s\S]*?var\(--app-content-max\)/);
  const mobileAnswerLearningBlocks = extractCssAtRuleBlocks(
    css,
    "@media (max-width: 700px)",
  ).filter((block) => block.includes(".answer-learning-page"));
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-answer-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-question-actions\s*\{[^}]*gap:\s*5px/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-answer-actions > button:nth-of-type\(2\) ~ \.answer-learning-tts-rate\s*\{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-status-buttons button\s*\{[^}]*min-width:\s*0;[^}]*display:\s*inline-flex;[^}]*gap:\s*2px;[^}]*font-size:\s*clamp\(\.75rem,\s*3\.2vw,\s*\.88rem\)/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-status-buttons button span\s*\{[^}]*flex:\s*0 0 auto;[^}]*margin-right:\s*0;[^}]*font-size:\s*\.82em/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-tts-rate\s*\{[^}]*min-width:\s*0;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-tts-rate > span\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-tts-rate select\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*font-size:\s*\.82rem/);
  assert.match(mobileAnswerLearningBlocks[0], /\.answer-learning-page \.answer-learning-sentences button\s*\{[^}]*grid-template-columns:\s*20px minmax\(0, 1fr\)[^}]*gap:\s*6px[^}]*padding:\s*12px 10px/);
  assert.match(answerLearningSpeech, /shouldStopAnswerLearningSentencePlayback\(playbackRef\.current, index\)[\s\S]*?stop\(\)/);
});
test("공통 AppHeader는 내부 rail에서 기존 표시 요소를 유지한다", () => {
  assert.match(appHeader, /<header[\s\S]*?<div className="app-header-rail">[\s\S]*?study-header-back[\s\S]*?brand-home[\s\S]*?compact-header-title[\s\S]*?compact-header-position[\s\S]*?theme-toggle[\s\S]*?mobile-header-progress/);
  assert.match(css, /\.app-header-rail\s*{[\s\S]*?max-width:\s*var\(--app-content-max\)/);
});
test("답변 익히기 학습 범위 조작은 체크 목록보다 앞에 한 번만 배치된다", () => {
  const controlsIndex = answerLearningSetup.indexOf('className="answer-learning-scope"');
  const checklistIndex = answerLearningSetup.indexOf('className="answer-learning-card-checklist"');
  assert.ok(controlsIndex >= 0 && controlsIndex < checklistIndex);
  assert.equal((answerLearningSetup.match(/answer-learning-start/g) ?? []).length, 1);
});
test("세 준비 화면은 공통 학습 범위 표시를 사용하되 화면별 동작을 유지한다", () => {
  for (const source of [answerLearningSetup, firstLineSetup, cardLibrary]) {
    assert.match(source, /<StudyScopeSummary/);
    assert.match(source, /eyebrow="STUDY SCOPE"/);
  }
  assert.match(answerLearningSetup, /description=\{`현재 필터·정렬 결과 \$\{visibleCards\.length\}장 중 학습할 카드를 선택하세요\.`\}/);
  assert.match(firstLineSetup, /description="현재 조건에 맞는 카드를 모두 사용합니다\."/);
  assert.match(cardLibrary, /description="현재 검색·필터 결과 전체를 학습 범위로 사용합니다\."/);
  assert.match(answerLearningSetup, /onClick=\{selectAllVisible\}/);
  assert.match(answerLearningSetup, /onClick=\{clearSelection\}/);
  assert.match(firstLineSetup, /onClick=\{props\.onStart\}/);
  assert.match(cardLibrary, /onClick=\{onStartFirstLine\}/);
  assert.match(cardLibrary, /onClick=\{onStartAnswerLearning\}/);
});
test("공통 학습 범위 표시는 제목 연결과 동적 카드 수 안내를 제공한다", () => {
  assert.match(studyScopeSummary, /role="group" aria-labelledby=\{titleId\}/);
  assert.match(studyScopeSummary, /<Heading id=\{titleId\}>\{title\}<\/Heading>/);
  assert.match(studyScopeSummary, /announceCount = true/);
  assert.match(studyScopeSummary, /aria-live=\{announceCount \? "polite" : undefined\}/);
  assert.match(studyScopeSummary, /className="study-scope-summary-actions"/);
});
test("카드 라이브러리는 기존 상세 결과 수만 live 영역으로 유지한다", () => {
  assert.match(cardLibrary, /announceCount=\{false\}/);
  assert.equal((cardLibrary.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.match(cardLibrary, /className="card-library-result-count" aria-live="polite"/);
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
  assert.match(answerLearningSetup, /filters:\s*\{\s*\.\.\.DEFAULT_ANSWER_LEARNING_FILTERS\s*\}/);
});
test("세 카드 선택 화면은 공통 다중 차원 필터와 동일한 상대 순서를 사용한다", () => {
  assert.match(firstLineSetup, /selectedWeeks=\{props\.selectedWeeks\}[\s\S]*?onTagDimensionsChange=\{props\.onTagDimensionsChange\}/);
  assert.match(cardLibrary, /selectedWeeks=\{selectedWeeks\}[\s\S]*?onTagDimensionsChange=\{onTagDimensionsChange\}/);
  assert.match(answerLearningSetup, /<span>덱<\/span>[\s\S]*?<CardTagDimensionFilters[\s\S]*?<span>기타 태그<\/span>[\s\S]*?<span>나만의 답변<\/span>/);
  assert.match(tagFilter, /<span>덱<\/span>[\s\S]*?<CardTagDimensionFilterFields[\s\S]*?<span>기타 태그<\/span>[\s\S]*?answerContentFilter/);
  assert.match(cardTagDimensionFilters, /label: "학습 세트"[\s\S]*?label: "주제"[\s\S]*?label: "질문 유형"/);
  assert.match(cardTagDimensionFilters, /emptyLabel: "전체 학습 세트"/);
});
test("다중 차원 필터는 disclosure checkbox와 선택 요약을 제공한다", () => {
  assert.match(cardTagDimensionFilters, /<details>/);
  assert.match(cardTagDimensionFilters, /aria-label=\{`\$\{label\}: \$\{selectionSummary\}`\}/);
  assert.match(cardTagDimensionFilters, /aria-describedby=\{`\$\{id\}-label`\}/);
  assert.match(cardTagDimensionFilters, /role="group" aria-labelledby=/);
  assert.match(cardTagDimensionFilters, /type="checkbox"/);
  assert.match(cardTagDimensionFilters, /formatCardTagSelectionSummary/);
  assert.match(css, /\.card-tag-dimension-filter summary\s*\{[\s\S]*?min-height:\s*46px/);
  assert.match(css, /\.card-tag-dimension-options label,[\s\S]*?min-height:\s*44px/);
  assert.match(css, /@media \(max-width:\s*960px\)[\s\S]*?\.card-tag-dimension-options\s*\{[\s\S]*?position:\s*static/);
});
test("차원 필터는 pagination signature와 홈 조건 요약에 포함된다", () => {
  assert.match(app, /const filterSignature = JSON\.stringify\(\[[\s\S]*?selectedWeeks,[\s\S]*?selectedTopics,[\s\S]*?selectedTypes,/);
  assert.match(app, /formatHomeFilterSummary\(\{[\s\S]*?selectedWeeks,[\s\S]*?selectedTopics,[\s\S]*?selectedTypes,/);
  assert.equal(
    formatHomeFilterSummary({
      selectedDeck: "all",
      selectedTag: "all",
      selectedWeeks: ["week6", "week8"],
      selectedTopics: ["topic_home"],
      selectedTypes: ["type_description"],
      finalOnly: false,
      hardOnly: false,
      cardScope: "all",
      studyOrder: "default",
      answerLearningStatusFilter: "all",
      answerContentFilter: "all",
      archiveFilter: "active",
      cardSearchQuery: "",
    }),
    "학습 세트 2개 · home · description",
  );
  assert.equal(
    formatHomeFilterSummary({
      selectedDeck: "all",
      selectedTag: "v2",
      selectedWeeks: ["level_1"],
      selectedTopics: [],
      selectedTypes: [],
      finalOnly: false,
      hardOnly: false,
      cardScope: "all",
      studyOrder: "default",
      answerLearningStatusFilter: "all",
      answerContentFilter: "all",
      archiveFilter: "active",
      cardSearchQuery: "",
    }),
    "Level 1 · #v2",
  );
});
test("카드 라이브러리 답변 상태 select는 presence와 상세 상태 계약을 재사용한다", () => {
  assert.match(tagFilter, /<option value="all">전체<\/option>/);
  assert.match(tagFilter, /<option value="unlearned">답변 연습 상태 없음<\/option>/);
  assert.match(tagFilter, /<option value="with-status">답변 연습 상태 있음<\/option>/);
  assert.match(tagFilter, /<option value="hard">어려움<\/option>/);
  assert.match(tagFilter, /<option value="learning">익히는 중<\/option>/);
  assert.match(tagFilter, /<option value="speakable">말할 수 있음<\/option>/);
  assert.doesNotMatch(tagFilter, /<option value="unlearned">미학습<\/option>/);
  assert.match(cardLibrary, /answerLearningStatusFilter:\s*AnswerLearningStatusFilter/);
  assert.match(
    app,
    /matchesAnswerLearningStatusFilter\(\s*answerLearningStatuses,\s*card\.id,\s*answerLearningStatusFilter,\s*\)/,
  );
  assert.match(
    app,
    /const filterSignature = JSON\.stringify\(\[[\s\S]*?answerLearningStatusFilter,[\s\S]*?\]\)/,
  );
  assert.match(
    app,
    /function resetFilters\(\) \{[\s\S]*?setAnswerLearningStatusFilter\("all"\);[\s\S]*?\}/,
  );
});
test("답변 익히기 시작 후보 수는 현재 결과와 선택의 교집합이다", () => {
  assert.match(answerLearningSetup, /const startCandidateCount = visibleCards\.filter\(\(card\) => selected\.has\(card\.id\)\)\.length/);
  assert.match(answerLearningSetup, /getAnswerLearningSelectionState\(visibleCards, session\.selectedCardIds\)/);
  assert.match(answerLearningSetup, /disabled=\{selectionState\.startDisabled\} onClick=\{onStart\}/);
  assert.match(answerLearningSetup, /disabled=\{visibleCards\.length === 0 \|\| selectionState\.allVisibleSelected\} onClick=\{selectAllVisible\}/);
  assert.match(answerLearningSetup, /disabled=\{selectionState\.clearDisabled\} onClick=\{clearSelection\}/);
});
test("새 답변 익히기 시작은 이전 카드 공개 상태를 재사용하지 않는다", () => {
  assert.match(
    app,
    /function startAnswerLearning\(\) \{[\s\S]*?createStartedAnswerLearningSession\(\s*answerSession,\s*cardOrder,\s*answerSources,\s*\)/,
  );
  assert.match(
    app,
    /function startSingleCardAnswerLearning\(card: OpicCard\) \{[\s\S]*?createStartedAnswerLearningSession\(\s*answerSession,\s*\[card\.id\]/,
  );
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
test("공통 학습 범위는 데스크톱 2열과 모바일 1열 배치를 사용한다", () => {
  assert.match(css, /\.study-scope-summary\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(240px,\s*410px\)/);
  assert.match(css, /\.study-scope-summary-count\s*\{[\s\S]*?font-weight:\s*800/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.study-scope-summary\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
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
