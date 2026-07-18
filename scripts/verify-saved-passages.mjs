import assert from "node:assert/strict";
import { cards } from "../src/data/cards.ts";
import {
  addSavedPassage,
  deleteSavedPassage,
  isValidSavedPassageInput,
  normalizeSavedPassageDataset,
  parseSavedPassageEditorSession,
  resolveSavedPassageInput,
  restoreSavedPassage,
  sortSavedPassages,
  updateSavedPassage,
} from "../src/utils/savedPassageStorage.ts";
import {
  createPassageParagraphs,
  flattenParagraphSentences,
  getParagraphIndexForSentence,
  getParagraphRangeForSentence,
  splitParagraphTexts,
} from "../src/utils/passageParagraphs.ts";
import {
  createModelAnswerSource,
  createMyAnswerSource,
  createSavedPassageSource,
} from "../src/utils/shadowingPlayer.ts";
import { getNextRepeatStep, isRepeatMode } from "../src/utils/shadowingSettings.ts";
import { parseShadowingPlayerSession } from "../src/utils/uiSessionStorage.ts";

let passed = 0;
function test(name, run) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const now = new Date("2026-07-17T09:00:00.000Z");
const passage = {
  id: "passage-001",
  title: "Hotel role-play",
  text: "I need a room.\n\nCan I check in early?",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const dataset = { version: 1, passages: [passage] };

test("빈 저장소", () => {
  assert.deepEqual(normalizeSavedPassageDataset(null), { version: 1, passages: [] });
});
test("지문 생성과 공백 정리", () => {
  const result = addSavedPassage({ version: 1, passages: [] }, "  Travel  ", "  First.\n\nSecond.  ", now, "travel-001");
  assert.equal(result.passage.title, "Travel");
  assert.equal(result.passage.text, "First.\n\nSecond.");
  assert.equal(result.passage.createdAt, result.passage.updatedAt);
});
test("지문 수정은 createdAt 유지", () => {
  const result = updateSavedPassage(dataset, passage.id, "Updated", "New text.", new Date("2026-07-18T10:00:00.000Z"));
  assert.equal(result.passage.createdAt, passage.createdAt);
  assert.notEqual(result.passage.updatedAt, passage.updatedAt);
});
test("지문 삭제", () => {
  const result = deleteSavedPassage(dataset, passage.id);
  assert.equal(result.deleted?.id, passage.id);
  assert.equal(result.dataset.passages.length, 0);
});
test("삭제 지문 원래 위치 복원", () => {
  const other = { ...passage, id: "passage-002", title: "Other" };
  const restored = restoreSavedPassage({ version: 1, passages: [other] }, passage, 0);
  assert.deepEqual(restored.passages.map((item) => item.id), [passage.id, other.id]);
});
test("공백 제목은 본문 첫 줄로 자동 생성", () => {
  const result = addSavedPassage(
    { version: 1, passages: [] },
    " ",
    "# Travel plan\nI want to visit Jeju.",
    now,
    "auto-title-passage",
  );
  assert.equal(result.passage.title, "Travel plan");
  assert.equal(result.passage.text, "I want to visit Jeju.");
});
test("공백 본문 거부", () => assert.equal(isValidSavedPassageInput("Title", "\n "), false));
test("제목 100자 제한", () => assert.equal(isValidSavedPassageInput("a".repeat(101), "Text."), false));
test("본문 20,000자 제한", () => assert.equal(isValidSavedPassageInput("Title", "a".repeat(20_001)), false));
test("내부 줄바꿈 보존", () => {
  assert.equal(normalizeSavedPassageDataset(dataset).passages[0].text, passage.text);
});
test("저장 지문 직접 제목은 그대로 유지", () => {
  const resolved = resolveSavedPassageInput("직접 제목", "# First line\nSecond line");
  assert.equal(resolved?.title, "직접 제목");
  assert.equal(resolved?.text, "# First line\nSecond line");
});
test("저장 지문 앞 빈 줄과 Markdown 문법 제거", () => {
  const resolved = resolveSavedPassageInput("", "\n\n**Useful phrases**\nFirst.\nSecond.");
  assert.equal(resolved?.title, "Useful phrases");
  assert.equal(resolved?.text, "First.\nSecond.");
});
test("한 줄 저장 지문은 자동 제목 생성 후 본문 유지", () => {
  const resolved = resolveSavedPassageInput("", "A short passage.");
  assert.equal(resolved?.title, "A short passage.");
  assert.equal(resolved?.text, "A short passage.");
});
test("저장 지문 자동 제목은 100자로 제한", () => {
  const resolved = resolveSavedPassageInput("", `${"a".repeat(130)}\nBody.`);
  assert.equal(resolved?.title.length, 100);
  assert.equal(resolved?.text, "Body.");
});
test("잘못된 데이터셋 fallback", () => {
  assert.deepEqual(normalizeSavedPassageDataset({ version: 2, passages: [] }).passages, []);
});
test("유효 항목만 복구", () => {
  const normalized = normalizeSavedPassageDataset({ version: 1, passages: [passage, { broken: true }] });
  assert.equal(normalized.passages.length, 1);
});
test("중복 id 제외", () => {
  assert.equal(normalizeSavedPassageDataset({ version: 1, passages: [passage, passage] }).passages.length, 1);
});
test("최신 수정순 정렬", () => {
  const newer = { ...passage, id: "passage-new", updatedAt: "2026-07-19T09:00:00.000Z" };
  assert.equal(sortSavedPassages([passage, newer])[0].id, newer.id);
});
test("편집 초안 serialize/restore", () => {
  const raw = JSON.stringify({ mode: "edit", passageId: passage.id, titleDraft: "Draft", textDraft: "First.\n\nSecond.", dirty: true });
  assert.equal(parseSavedPassageEditorSession(raw)?.textDraft, "First.\n\nSecond.");
});
test("위험 id 초안 차단", () => {
  const raw = JSON.stringify({ mode: "edit", passageId: "__proto__", titleDraft: "Draft", textDraft: "Text.", dirty: true });
  assert.equal(parseSavedPassageEditorSession(raw), null);
});

test("빈 줄로 문단 분리", () => {
  assert.deepEqual(splitParagraphTexts("First line.\n\nSecond line."), ["First line.", "Second line."]);
});
test("연속 빈 줄은 하나의 구분", () => {
  assert.equal(splitParagraphTexts("One.\n\n\n\nTwo.").length, 2);
});
test("CRLF 문단", () => {
  assert.equal(splitParagraphTexts("One.\r\n\r\nTwo.").length, 2);
});
test("일반 줄바꿈은 같은 문단의 공백", () => {
  assert.deepEqual(splitParagraphTexts("One line\ncontinues here."), ["One line continues here."]);
});
test("단일 문단", () => assert.equal(createPassageParagraphs("One. Two.").length, 1));
test("빈 문단 제거", () => assert.equal(createPassageParagraphs("\n\nOne.\n\n").length, 1));
test("문장 인덱스 범위 일치", () => {
  const paragraphs = createPassageParagraphs("One. Two.\n\nThree.");
  assert.deepEqual([paragraphs[0].startSentenceIndex, paragraphs[0].endSentenceIndex], [0, 1]);
  assert.deepEqual([paragraphs[1].startSentenceIndex, paragraphs[1].endSentenceIndex], [2, 2]);
  assert.equal(flattenParagraphSentences(paragraphs).length, 3);
});
test("현재 문장의 문단과 범위", () => {
  const paragraphs = createPassageParagraphs("One. Two.\n\nThree. Four.");
  assert.equal(getParagraphIndexForSentence(paragraphs, 3), 1);
  assert.deepEqual(getParagraphRangeForSentence(paragraphs, 3), { startSentenceIndex: 2, endSentenceIndex: 3 });
});
test("카드 back 배열의 한 줄 구분은 같은 문단", () => {
  const source = createModelAnswerSource(cards[0]);
  assert.deepEqual(source.paragraphTexts, [cards[0].back.join("\n")]);
  const paragraphs = createPassageParagraphs(source.paragraphTexts);
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].sentences.length, cards[0].back.length);
});
test("카드 back 내부의 실제 빈 줄만 새 문단", () => {
  const cardWithBlankLine = {
    ...cards[0],
    id: "paragraph-gap-test",
    back: ["Sentence one.", "Sentence two.\n\nSentence three."],
  };
  const source = createModelAnswerSource(cardWithBlankLine);
  const paragraphs = createPassageParagraphs(source.paragraphTexts);
  assert.equal(paragraphs.length, 2);
  assert.deepEqual(paragraphs.map((paragraph) => paragraph.sentences.length), [2, 1]);
});
test("나만의 답변은 빈 줄 기준 문단", () => {
  const source = createMyAnswerSource(cards[0], "Mine one.\n\nMine two.");
  assert.equal(createPassageParagraphs(source.sourceText).length, 2);
});
test("저장 지문 source 생성", () => {
  const source = createSavedPassageSource(passage);
  assert.equal(source.sourceType, "savedPassage");
  assert.equal(source.savedPassageId, passage.id);
  assert.equal(source.sourceText, passage.text);
});

test("paragraph repeat mode 허용", () => assert.equal(isRepeatMode("paragraph"), true));
test("문단 범위 안에서 다음 문장", () => {
  assert.deepEqual(getNextRepeatStep("paragraph", 3, 2, 5, 0, { startSentenceIndex: 1, endSentenceIndex: 3 }), {
    completed: false,
    completedRepeats: 0,
    nextIndex: 3,
  });
});
test("문단 끝에서 첫 문장으로 반복", () => {
  assert.deepEqual(getNextRepeatStep("paragraph", 3, 3, 5, 0, { startSentenceIndex: 1, endSentenceIndex: 3 }), {
    completed: false,
    completedRepeats: 1,
    nextIndex: 1,
  });
});
test("문단 최종 반복 완료", () => {
  assert.equal(getNextRepeatStep("paragraph", 3, 3, 5, 2, { startSentenceIndex: 1, endSentenceIndex: 3 }).completed, true);
});
test("문단 무한 반복", () => {
  assert.equal(getNextRepeatStep("paragraph", "infinite", 3, 5, 99, { startSentenceIndex: 1, endSentenceIndex: 3 }).completed, false);
});
test("문단 하나인 지문", () => {
  const paragraphs = createPassageParagraphs("One. Two.");
  const range = getParagraphRangeForSentence(paragraphs, 1);
  assert.deepEqual(range, { startSentenceIndex: 0, endSentenceIndex: 1 });
});
test("저장 지문 player session 복원", () => {
  const restored = parseShadowingPlayerSession(JSON.stringify({ active: true, sourceType: "savedPassage", savedPassageId: passage.id, currentIndex: 1, status: "paused", questionExpanded: false, showFrontKo: false }));
  assert.equal(restored?.savedPassageId, passage.id);
});
test("삭제된 지문 identity가 없는 session 거부", () => {
  assert.equal(parseShadowingPlayerSession(JSON.stringify({ active: true, sourceType: "savedPassage", currentIndex: 0 })), null);
});
test("기존 카드 데이터 무변경", () => {
  const before = JSON.stringify(cards);
  createModelAnswerSource(cards[0]);
  createPassageParagraphs(cards[0].back);
  assert.equal(JSON.stringify(cards), before);
});

console.log(`\n저장 지문·문단 반복 검증 ${passed}/${passed} 통과`);
