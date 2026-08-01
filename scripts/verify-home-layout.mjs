import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runGuardedNavigation } from "../src/utils/navigationGuard.ts";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const appHeader = await readFile(
  new URL("../src/components/AppHeader.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

let passed = 0;

function test(name, assertion) {
  assertion();
  passed += 1;
  console.log(`✓ ${name}`);
}

function extractCssBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} block must exist`);
  const bodyStart = source.indexOf("{", start + marker.length);
  assert.notEqual(bodyStart, -1, `${marker} block must open`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  assert.fail(`${marker} block must close`);
}

function extractCssBlocks(source, marker) {
  const blocks = [];
  let searchFrom = 0;

  while (true) {
    const markerStart = source.indexOf(marker, searchFrom);
    if (markerStart === -1) return blocks;
    const body = extractCssBlock(source.slice(markerStart), marker);
    blocks.push(body);
    searchFrom = markerStart + marker.length + body.length + 2;
  }
}

test("홈 주요 섹션이 공통 콘텐츠 레일 안에 있다", () => {
  assert.match(app, /<main className="home-page">\s*<div className="home-content-rail">/);
  assert.match(app, /<HomeQuickStart[\s\S]*?<TodayStats[\s\S]*?className="home-learning-materials"[\s\S]*?<HomeManagement\b/);
});

test("공통 앱 레일은 1200px이고 홈 변수는 호환 alias를 사용한다", () => {
  assert.match(css, /--app-content-max:\s*1200px/);
  assert.match(css, /--home-content-max:\s*var\(--app-content-max\)/);
  assert.match(css, /max-width:\s*var\(--home-content-max\)/);
});

test("홈 섹션은 공통 레일 너비를 모두 사용한다", () => {
  assert.match(css, /\.home-content-rail\s*>\s*\*\s*{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.home-management\s*{[\s\S]*?width:\s*100%/);
});

test("좌우 여백은 데스크톱 32px, 태블릿 24px, 모바일 16px이다", () => {
  assert.match(css, /--app-inline-padding:\s*32px/);
  assert.match(css, /--home-inline-padding:\s*var\(--app-inline-padding\)/);
  assert.match(css, /@media \(max-width:\s*960px\)[\s\S]*?--app-inline-padding:\s*24px/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?--app-inline-padding:\s*16px/);
});

test("홈 레일은 safe area를 포함한 공통 좌우 padding을 사용한다", () => {
  assert.match(css, /\.home-layout-shell[\s\S]*?env\(safe-area-inset-left\)[\s\S]*?env\(safe-area-inset-right\)/);
});

test("AppHeader는 full-width shell 안의 공통 rail로 본문 기준선에 정렬한다", () => {
  assert.match(appHeader, /<header[\s\S]*?<div className="app-header-rail">/);
  assert.match(css, /\.app-header\s*{[\s\S]*?padding-inline:[\s\S]*?var\(--app-inline-padding\)[\s\S]*?env\(safe-area-inset-left\)[\s\S]*?env\(safe-area-inset-right\)/);
  assert.match(css, /\.app-header-rail\s*{[\s\S]*?max-width:\s*var\(--app-content-max\)[\s\S]*?margin:\s*0 auto/);
  assert.doesNotMatch(css, /\.app-header\s*{[^}]*100vw/);
});

test("공통 AppHeader action은 44px token을 공유한다", () => {
  assert.match(css, /--header-action-size:\s*44px/);
  assert.match(css, /\.brand-home\s*{[\s\S]*?min-height:\s*var\(--header-action-size\)/);
  assert.match(css, /\.theme-toggle\s*{[\s\S]*?min-height:\s*var\(--header-action-size\)/);
});

test("모바일 학습 header action은 실제 44px box를 사용하고 표시 정책을 유지한다", () => {
  const mobileHeaderMatch = css.match(
    /@media \(max-width: 700px\) \{\r?\n  :root \{[\s\S]*?\r?\n  \.detail-page,/,
  );
  assert.ok(mobileHeaderMatch);
  const mobileHeaderCss = mobileHeaderMatch[0];
  assert.match(mobileHeaderCss, /\.app-header\s*{[\s\S]*?height:\s*calc\(54px \+ env\(safe-area-inset-top\)\)/);
  assert.match(mobileHeaderCss, /\.app-header\.is-study-header \.brand-home\s*{[\s\S]*?flex:\s*0 0 var\(--header-action-size\)[\s\S]*?width:\s*var\(--header-action-size\)[\s\S]*?min-height:\s*var\(--header-action-size\)[\s\S]*?padding:\s*3px/);
  assert.match(mobileHeaderCss, /\.app-header\.is-study-header \.brand-mark\s*{[\s\S]*?width:\s*38px[\s\S]*?height:\s*38px/);
  assert.match(mobileHeaderCss, /\.app-header\.is-study-header \.study-header-back\s*{[\s\S]*?width:\s*var\(--header-action-size\)[\s\S]*?min-width:\s*var\(--header-action-size\)[\s\S]*?min-height:\s*var\(--header-action-size\)[\s\S]*?display:\s*inline-grid/);
  assert.match(mobileHeaderCss, /\.app-header\.is-study-header \.theme-toggle\s*{[\s\S]*?width:\s*var\(--header-action-size\)[\s\S]*?min-width:\s*var\(--header-action-size\)[\s\S]*?min-height:\s*var\(--header-action-size\)/);
  assert.match(css, /\.study-header-back\s*{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.(?:study-header-back|brand-home|theme-toggle)::(?:before|after)/);
});

test("모바일 공통 학습 header는 8px 간격과 기준 action 시각 언어를 유지한다", () => {
  const mobileHeaderMatch = css.match(
    /@media \(max-width: 700px\) \{\r?\n  :root \{[\s\S]*?\r?\n  \.detail-page,/,
  );
  assert.ok(mobileHeaderMatch);
  const mobileHeaderCss = mobileHeaderMatch[0];
  assert.match(mobileHeaderCss, /\.app-header-rail\s*{[\s\S]*?gap:\s*8px/);
  assert.match(mobileHeaderCss, /\.app-header\.is-study-header \.brand-mark\s*{[\s\S]*?width:\s*38px[\s\S]*?height:\s*38px/);
  assert.match(mobileHeaderCss, /\.app-header\.is-study-header \.study-header-back\s*{[\s\S]*?border:\s*1px solid var\(--line\)[\s\S]*?border-radius:\s*10px[\s\S]*?background:\s*var\(--surface-soft\)[\s\S]*?font-size:\s*20px/);
  assert.match(css, /\.theme-toggle\s*{[\s\S]*?border:\s*1px solid var\(--line\)[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(mobileHeaderCss, /\.app-header\.is-study-header \.theme-toggle\s*{[\s\S]*?border-radius:\s*10px/);
});

test("짧은 가로 공통 학습 header는 너비와 무관하게 compact하고 문서와 함께 스크롤한다", () => {
  const shortLandscape = extractCssBlock(
    css,
    "@media (orientation: landscape) and (max-height: 700px)",
  );
  assert.match(shortLandscape, /\.app-header\.is-study-header\s*{[\s\S]*?height:\s*calc\(54px \+ env\(safe-area-inset-top\)\)[\s\S]*?padding-top:\s*env\(safe-area-inset-top\)/);
  assert.match(shortLandscape, /\.app-header\.is-study-header\.is-mobile-sticky\s*{[\s\S]*?position:\s*static/);
  assert.match(shortLandscape, /\.app-header\.is-study-header \.app-header-rail\s*{[\s\S]*?gap:\s*8px/);
  assert.match(shortLandscape, /\.app-header\.is-study-header \.brand-copy\s*{\s*display:\s*none/);
  assert.match(shortLandscape, /\.app-header\.is-study-header \.compact-header-title\s*{[\s\S]*?display:\s*block/);
  assert.match(shortLandscape, /\.app-header\.is-study-header \.mobile-header-progress > span\s*{[\s\S]*?height:\s*100%[\s\S]*?display:\s*block[\s\S]*?background:\s*linear-gradient/);
  assert.match(shortLandscape, /\.app-header\.is-study-header \.study-header-back\s*{[\s\S]*?display:\s*inline-grid/);
  assert.match(shortLandscape, /\.app-header\.is-study-header \.theme-toggle > span:last-child\s*{\s*display:\s*none/);
});

test("compact 카드 상세는 header 뒤로가기만 표시하고 본문 중복 조작을 숨긴다", () => {
  assert.match(app, /studyTitle="카드 상세"[\s\S]*?onBack=\{requestCloseCardDetail\}/);
  assert.match(app, /function requestCloseCardDetail\(\)\s*{\s*requestAppBack\(\);\s*}/);
  assert.match(app, /function canLeaveCurrentView\(\)[\s\S]*?homeNavigationGuardRef\.current\(\)/);
  const mobileDetailBlocks = extractCssBlocks(
    css,
    "@media (max-width: 700px)",
  ).filter((block) => block.includes(".detail-page > .study-navigation:not(.is-bottom) .back-button"));
  assert.equal(mobileDetailBlocks.length, 1);
  assert.match(mobileDetailBlocks[0], /\.detail-page > \.study-navigation:not\(\.is-bottom\) \.back-button\s*{\s*display:\s*none/);
  const shortLandscape = extractCssBlock(
    css,
    "@media (orientation: landscape) and (max-height: 700px)",
  );
  assert.match(shortLandscape, /\.detail-page > \.study-navigation:not\(\.is-bottom\) \.back-button\s*{\s*display:\s*none/);
});

test("카드 상세 header 뒤로가기는 이탈 확인을 통과한 경우에만 화면을 닫는다", () => {
  let closeCalls = 0;
  const close = () => {
    closeCalls += 1;
  };

  assert.equal(runGuardedNavigation(() => false, close), false);
  assert.equal(closeCalls, 0);
  assert.equal(runGuardedNavigation(() => true, close), true);
  assert.equal(closeCalls, 1);
});

test("AppHeader action은 native button과 기존 접근성 이름을 유지한다", () => {
  assert.match(appHeader, /<button[\s\S]*?className="study-header-back"[\s\S]*?type="button"[\s\S]*?aria-label=\{`\$\{studyTitle \?\? "학습 화면"\}에서 뒤로가기`\}/);
  assert.match(appHeader, /<button[\s\S]*?className="brand-home"[\s\S]*?type="button"[\s\S]*?aria-label="홈으로 이동"/);
  assert.match(appHeader, /<button[\s\S]*?className="theme-toggle"[\s\S]*?type="button"[\s\S]*?aria-label=\{isDark \? "라이트 모드로 전환" : "다크 모드로 전환"\}[\s\S]*?aria-pressed=\{isDark\}/);
});

test("header action은 전역 규칙을 바꾸지 않고 theme-aware focus ring을 사용한다", () => {
  assert.match(css, /--header-focus-ring:\s*var\(--select-focus-ring\)/);
  assert.match(css, /--select-focus-ring:\s*#2f6fed/);
  assert.match(css, /:root\[data-theme="dark"\]\s*{[\s\S]*?--select-focus-ring:\s*#82a9ff/);

  const globalFocusRule = css.match(
    /button:focus-visible,\r?\nselect:focus-visible,\r?\ninput:focus-visible \+ \.toggle-switch\s*{[^}]*}/,
  );
  assert.ok(globalFocusRule);
  assert.match(globalFocusRule[0], /outline:\s*3px solid rgba\(47,\s*111,\s*237,\s*0\.35\)/);
  assert.match(globalFocusRule[0], /outline-offset:\s*3px/);

  const headerFocusRule = css.match(
    /\.study-header-back:focus-visible,[\s\S]*?\.shadowing-theme:focus-visible\s*{[^}]*}/,
  );
  assert.ok(headerFocusRule);
  assert.match(headerFocusRule[0], /outline:\s*3px solid var\(--header-focus-ring\)/);
  assert.match(headerFocusRule[0], /outline-offset:\s*2px/);
  assert.doesNotMatch(headerFocusRule[0], /rgba\(/);
});

test("홈 섹션 간격은 공통 변수로 관리한다", () => {
  assert.match(css, /--home-section-gap:\s*28px/);
  assert.match(css, /\.home-content-rail[\s\S]*?gap:\s*var\(--home-section-gap\)/);
});

test("오늘 통계는 기본 3열, 태블릿과 모바일은 2열이다", () => {
  assert.match(css, /\.today-stats-grid\s*{\s*grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /@media \(max-width:\s*960px\)[\s\S]*?\.today-stats-grid\s*{[\s\S]*?repeat\(2,/);
});

test("충분히 넓은 화면에서만 통계 5열과 200px 최소 너비를 사용한다", () => {
  assert.match(css, /@media \(min-width:\s*1220px\)[\s\S]*?repeat\(5,\s*minmax\(200px,\s*1fr\)\)/);
});

test("통계 제목은 한글 단어 단위 줄바꿈을 유지한다", () => {
  assert.match(css, /\.today-stat-label\s*>\s*span:last-child[\s\S]*?word-break:\s*keep-all/);
});

test("내 학습 자료는 데스크톱 3열, 태블릿 2열, 모바일 1열이다", () => {
  assert.match(css, /\.home-learning-materials\s*{[\s\S]*?repeat\(3,/);
  assert.match(css, /@media \(max-width:\s*960px\)[\s\S]*?\.home-learning-materials\s*{[\s\S]*?repeat\(2,/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.home-learning-materials\s*{\s*grid-template-columns:\s*1fr/);
});

console.log(`Home layout verification passed: ${passed} tests`);
