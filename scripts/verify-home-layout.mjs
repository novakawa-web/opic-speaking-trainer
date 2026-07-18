import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

let passed = 0;

function test(name, assertion) {
  assertion();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("홈 주요 섹션이 공통 콘텐츠 레일 안에 있다", () => {
  assert.match(app, /<main className="home-page">\s*<div className="home-content-rail">/);
  assert.match(app, /<HomeQuickStart[\s\S]*?<TodayStats[\s\S]*?className="home-learning-materials"[\s\S]*?<HomeManagement\b/);
});

test("홈 레일 최대 폭이 1200px이다", () => {
  assert.match(css, /--home-content-max:\s*1200px/);
  assert.match(css, /max-width:\s*var\(--home-content-max\)/);
});

test("홈 섹션은 공통 레일 너비를 모두 사용한다", () => {
  assert.match(css, /\.home-content-rail\s*>\s*\*\s*{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.home-management\s*{[\s\S]*?width:\s*100%/);
});

test("좌우 여백은 데스크톱 32px, 태블릿 24px, 모바일 16px이다", () => {
  assert.match(css, /--home-inline-padding:\s*32px/);
  assert.match(css, /@media \(max-width:\s*960px\)[\s\S]*?--home-inline-padding:\s*24px/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?--home-inline-padding:\s*16px/);
});

test("홈 레일은 safe area를 포함한 공통 좌우 padding을 사용한다", () => {
  assert.match(css, /\.home-layout-shell[\s\S]*?env\(safe-area-inset-left\)[\s\S]*?env\(safe-area-inset-right\)/);
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
