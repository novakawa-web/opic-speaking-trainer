import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_TSV_HEADERS,
  createSampleCards,
  exportCardsToTsv,
  parseCardTsv,
} from "../src/utils/cardTsv.ts";

const cardDetailSource = readFileSync("./src/components/CardDetail.tsx", "utf8");
const answerLearningSource = readFileSync("./src/components/AnswerLearning.tsx", "utf8");
const shadowingSource = readFileSync("./src/components/ShadowingPlayer.tsx", "utf8");
const tagFilterSource = readFileSync("./src/components/TagFilter.tsx", "utf8");
const cardLibrarySource = readFileSync("./src/components/CardLibrary.tsx", "utf8");
const appSource = readFileSync("./src/App.tsx", "utf8");
const cardSearchSource = readFileSync("./src/utils/cardSearch.ts", "utf8");
const backupSource = readFileSync("./src/components/BackupManager.tsx", "utf8");
const toastSource = readFileSync("./src/components/TransientToast.tsx", "utf8");
const stylesSource = readFileSync("./src/styles.css", "utf8");

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("카드 상세 한글 흐름은 ordered list를 사용하지 않음", () => {
  const flow = cardDetailSource.slice(
    cardDetailSource.indexOf('<div className="flow-box">'),
    cardDetailSource.indexOf("</section>", cardDetailSource.indexOf('<div className="flow-box">')),
  );
  assert.doesNotMatch(flow, /<ol>|<li/);
  assert.match(flow, /className="hint-flow-lines" role="list"/);
});
test("답변 익히기 한글 흐름도 같은 표시 정책 사용", () => {
  assert.match(answerLearningSource, /className="hint-flow-lines" role="list"/);
  assert.doesNotMatch(answerLearningSource, /card\.hint\.flow\.length > 0 && <ol>/);
});
test("힌트 원문 문자열을 그대로 표시", () => {
  assert.match(cardDetailSource, /role="listitem">\{step\}<\/p>/);
  assert.match(answerLearningSource, /role="listitem">\{step\}<\/p>/);
});
test("여러 줄 힌트 순서는 map 순서를 유지", () => {
  assert.match(cardDetailSource, /card\.hint\.flow\.map\(\(step, index\)/);
});
test("원본 번호를 제거하는 문자열 치환이 없음", () => {
  assert.doesNotMatch(cardDetailSource + answerLearningSource, /replace\([^)]*(?:\\d|1\\\.)/);
});
test("다른 카드 상세 힌트 항목은 유지", () => {
  for (const label of ["암기 흐름", "주어 · 문장 팁", "최소 암기"]) {
    assert.ok(cardDetailSource.includes(label));
  }
});
test("카드 관리 패널은 상세 공통 폭 전체를 사용", () => {
  assert.match(stylesSource, /\.card-management-panel\s*\{[^}]*width:\s*100%/s);
});
test("카드 관리 패널의 중첩 max-width 제거", () => {
  const rule = stylesSource.match(/\.card-management-panel\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(rule, /max-width|width:\s*min\(/);
});
test("모바일에서 카드 관리 패널을 다시 좁히지 않음", () => {
  assert.doesNotMatch(stylesSource, /\.card-management-panel\s*\{\s*width:\s*calc\(100% - 32px\)/);
});
test("카드 관리 수정·보관·삭제 조작 유지", () => {
  for (const label of ["수정", "복원", "보관", "카드 완전 삭제"]) {
    assert.ok(cardDetailSource.includes(label));
  }
});
test("연습 답변 선택은 대칭 3열 중심축 사용", () => {
  assert.match(stylesSource, /\.shadowing-source-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto minmax\(0,\s*1fr\)/s);
});
test("실제 두 선택 버튼 그룹을 중앙 배치", () => {
  assert.match(shadowingSource, /className="shadowing-source-control"[\s\S]*?role="group"[\s\S]*?aria-label="연습 답변 선택"/);
  assert.match(stylesSource, /\.shadowing-source-control\s*\{[^}]*grid-column:\s*2/s);
  assert.match(stylesSource, /\.shadowing-source-control\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});
test("연습 답변 제목 없이 두 버튼을 바로 제공", () => {
  const sourceControl = shadowingSource.slice(
    shadowingSource.indexOf('className="shadowing-source-control"'),
    shadowingSource.indexOf("</div>", shadowingSource.indexOf('className="shadowing-source-control"')),
  );
  assert.doesNotMatch(sourceControl, />연습 답변</);
  assert.equal((sourceControl.match(/<button/g) ?? []).length, 2);
  assert.equal((sourceControl.match(/aria-pressed=/g) ?? []).length, 2);
  assert.match(sourceControl, /disabled=\{!myAnswer\}/);
  assert.match(stylesSource, /\.shadowing-source-control button\s*\{[^}]*position:\s*relative[^}]*justify-content:\s*center/s);
  assert.match(stylesSource, /\.shadowing-source-selection-mark\s*\{[^}]*position:\s*absolute[^}]*inset-inline-end:\s*12px/s);
});
test("카드 라이브러리 필터 제목은 찾기와 선택 목적을 설명", () => {
  assert.match(tagFilterSource, />Filter and select cards</);
  assert.match(tagFilterSource, />카드 찾기 및 선택</);
  assert.doesNotMatch(tagFilterSource, /오늘 연습할 카드 고르기|STUDY FILTER/);
  assert.match(tagFilterSource, />카드 내용 검색</);
  assert.match(tagFilterSource, /aria-describedby="card-library-content-search-help"/);
  assert.match(cardLibrarySource, /일치하는 카드를 찾지 못했습니다\./);
  assert.match(appSource, /matchesCardSearch\(card, cardSearchQuery/);
  assert.doesNotMatch(cardSearchSource, /localStorage|sessionStorage|JSON\.stringify/);
});
test("카드 라이브러리는 통합 검색 하나만 제공", () => {
  assert.doesNotMatch(cardLibrarySource, /카드 메모 검색|card-library-tabs|<MemoSearch/);
  assert.doesNotMatch(stylesSource, /\.card-library-tabs/);
  assert.match(appSource, /matchesCardSearch\(card, cardSearchQuery/);
});
test("답변 듣기 버튼은 사용 가능 상태와 실제 비활성 상태를 구분", () => {
  assert.equal((cardDetailSource.match(/className=\{`speech-button answer-listen-button/g) ?? []).length, 3);
  assert.equal((cardDetailSource.match(/aria-pressed=\{activeTarget === "(?:modelAnswer|myAnswer|myFirstLine)"\}/g) ?? []).length, 3);
  assert.match(stylesSource, /\.answer-listen-button:not\(:disabled\)\s*\{[^}]*color:\s*var\(--blue\)[^}]*background:\s*var\(--surface\)/s);
  assert.match(stylesSource, /\.answer-listen-button\.is-playing\s*\{[^}]*background:\s*var\(--blue-soft\)/s);
  assert.match(stylesSource, /\.speech-button:disabled[\s\S]*?opacity:\s*0\.48/s);
});
test("나의 첫 문장 듣기는 공통 상태 스타일과 기존 동작을 유지", () => {
  const firstLineTargetIndex = cardDetailSource.indexOf('activeTarget === "myFirstLine"');
  const firstLineButton = cardDetailSource.slice(
    cardDetailSource.lastIndexOf("<button", firstLineTargetIndex),
    cardDetailSource.indexOf("</button>", firstLineTargetIndex),
  );
  assert.match(firstLineButton, /speech-button answer-listen-button/);
  assert.match(firstLineButton, /aria-pressed=\{activeTarget === "myFirstLine"\}/);
  assert.match(firstLineButton, /disabled=\{!isSupported \|\| !myFirstLine\}/);
  assert.match(firstLineButton, /onClick=\{\(\) => toggleSpeech\(myFirstLine, "myFirstLine"\)\}/);
  assert.match(firstLineButton, /"나의 첫 문장 듣기"/);
});
test("나만의 답변 수정과 삭제는 같은 2열 action row 사용", () => {
  const toolbar = cardDetailSource.slice(
    cardDetailSource.indexOf('className="my-answer-toolbar"'),
    cardDetailSource.indexOf('<div className="my-first-line-box">'),
  );
  assert.match(toolbar, /className="my-answer-management-actions"/);
  assert.match(toolbar, />\s*수정\s*<\/button>[\s\S]*?>\s*삭제\s*<\/button>/);
  assert.match(stylesSource, /\.my-answer-management-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(stylesSource, /\.my-answer-management-actions button\s*\{[^}]*min-height:\s*44px/s);
});
test("연습 답변 그룹은 전체 폭 wrapper를 사용", () => {
  assert.match(stylesSource, /\.shadowing-source-row\s*\{[^}]*width:\s*100%/s);
});
test("기존 답변 선택 handler 유지", () => {
  assert.equal((shadowingSource.match(/onSourceTypeChange\?\.\(/g) ?? []).length, 2);
});
test("전체 백업 내보내기는 예외 경계 안에서 실행", () => {
  const handler = backupSource.slice(
    backupSource.indexOf("function handleExport()"),
    backupSource.indexOf("async function handleFileChange"),
  );
  assert.match(handler, /try\s*\{/);
  assert.match(handler, /catch\s*\{/);
});
test("백업 직렬화 후 다운로드 요청", () => {
  const serializeIndex = backupSource.indexOf("serializeAppBackup(currentBackup)");
  const downloadIndex = backupSource.indexOf("downloadJson(contents, fileName)");
  assert.ok(serializeIndex >= 0 && serializeIndex < downloadIndex);
});
test("다운로드 요청 뒤에만 성공 toast 설정", () => {
  const downloadIndex = backupSource.indexOf("downloadJson(contents, fileName)");
  const noticeIndex = backupSource.indexOf("setExportNotice((current)");
  assert.ok(downloadIndex >= 0 && downloadIndex < noticeIndex);
});
test("다운로드 안내는 완료가 아닌 시작 표현", () => {
  assert.match(backupSource, /다운로드를 시작했습니다/);
  assert.doesNotMatch(backupSource, /다운로드가 완료되었습니다/);
});
test("기존 전체 백업 파일명 규칙 유지", () => {
  assert.match(backupSource, /opic-trainer-backup-\$\{year\}-\$\{month\}-\$\{day\}-\$\{hours\}\$\{minutes\}\.json/);
});
test("내보내기 실패 시 성공 toast 없음", () => {
  const catchBlock = backupSource.slice(
    backupSource.indexOf("} catch {", backupSource.indexOf("function handleExport()")),
    backupSource.indexOf("async function handleFileChange"),
  );
  assert.match(catchBlock, /setExportNotice\(null\)/);
  assert.doesNotMatch(catchBlock, /다운로드를 시작했습니다/);
});
test("내보내기 오류는 저장 내용을 노출하지 않는 안전 문구", () => {
  assert.match(backupSource, /전체 백업 파일을 만들거나 다운로드를 시작하지 못했습니다/);
});
test("공통 TransientToast를 재사용", () => {
  assert.match(backupSource, /import \{ TransientToast \}/);
  assert.match(backupSource, /<TransientToast/);
});
test("toast는 polite live region과 3.5초 기본값 사용", () => {
  assert.match(toastSource, /durationMs = 3_500/);
  assert.match(toastSource, /aria-live="polite"/);
});
test("연속 내보내기는 단일 최신 notice를 교체", () => {
  assert.match(backupSource, /const \[exportNotice, setExportNotice\] = useState/);
  assert.equal((backupSource.match(/<TransientToast/g) ?? []).length, 1);
});
test("샘플 카드에 유효한 type_ 태그 포함", () => {
  assert.ok(createSampleCards().some((card) => card.tags.includes("type_description")));
});
test("샘플 카드에 유효한 topic_ 태그 포함", () => {
  assert.ok(createSampleCards().some((card) => card.tags.includes("topic_home")));
});
test("샘플 TSV를 현재 parser로 다시 읽을 수 있음", () => {
  const sampleCards = createSampleCards();
  const parsed = parseCardTsv(exportCardsToTsv(sampleCards));
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.validCards.length, sampleCards.length);
});
test("샘플 TSV 헤더는 기존 13열 유지", () => {
  assert.equal(CARD_TSV_HEADERS.length, 13);
  assert.equal(exportCardsToTsv(createSampleCards()).replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].split("\t").length, 13);
});
test("type/topic 태그는 tags 한 셀에서 파이프로 구분", () => {
  const firstDataRecord = exportCardsToTsv(createSampleCards())
    .replace(/^\uFEFF/, "")
    .split("\r\n")[1]
    .split("\t");
  assert.match(firstDataRecord[2], /topic_home/);
  assert.match(firstDataRecord[2], /type_description/);
  assert.match(firstDataRecord[2], /\|/);
});
test("샘플 태그에 replaced_by를 예시로 사용하지 않음", () => {
  assert.equal(createSampleCards().some((card) => card.tags.some((tag) => tag.startsWith("replaced_by"))), false);
});
test("변경은 저장 키나 AppBackup 스키마를 새로 만들지 않음", () => {
  const combined = cardDetailSource + answerLearningSource + shadowingSource + backupSource;
  assert.doesNotMatch(combined, /localStorage\.setItem|sessionStorage\.setItem|format:\s*"opic-trainer-backup"|version:\s*2/);
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

console.log(`\nMinor UI feedback polish verification: ${passed}/${tests.length} passed`);
