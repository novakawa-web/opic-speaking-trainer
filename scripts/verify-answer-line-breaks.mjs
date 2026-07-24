import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAnswerDisplayRows,
  joinAnswerLines,
  normalizeAnswerLineBreaks,
  normalizeAnswerLines,
  splitAnswerText,
} from "../src/utils/answerText.ts";
import {
  createCardEditorDraft,
  createEmptyCardEditorDraft,
  validateCardEditorDraft,
} from "../src/utils/cardEditor.ts";
import {
  createCardCreationPlan,
  executeCardCreationTransaction,
} from "../src/utils/cardCreation.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  isOpicCard,
  parseCardDataset,
} from "../src/utils/cardStorage.ts";
import {
  createAppBackup,
  parseAndValidateBackup,
  serializeAppBackup,
} from "../src/utils/appBackup.ts";
import {
  CARD_TSV_HEADERS,
  exportCardsToTsv,
  parseCardTsv,
} from "../src/utils/cardTsv.ts";
import {
  normalizeMyAnswerText,
  normalizeMyAnswers,
} from "../src/utils/myAnswerStorage.ts";
import {
  createModelAnswerSource,
  createMyAnswerSource,
  createShadowingSourceFingerprint,
} from "../src/utils/shadowingPlayer.ts";
import { getNextRepeatStep } from "../src/utils/shadowingSettings.ts";
import {
  createPassageParagraphs,
  flattenParagraphSentences,
} from "../src/utils/passageParagraphs.ts";
import { matchesCardSearch } from "../src/utils/cardSearch.ts";

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

const SAMPLE_TEXT = [
  "Okay, let me tell you about my home.",
  "I live in an apartment.",
  "",
  "My favorite place is my bedroom.",
  "It is small, but it is clean and cozy.",
  "",
  "I usually watch YouTube there.",
  "So I feel relaxed in my room.",
].join("\n");

const card = {
  id: "line-break-card",
  deck: "OPIc 03_주제별답변",
  tags: ["home", "line-break"],
  front: "Tell me about your home.",
  frontKo: "집에 대해 말해 주세요.",
  firstLine: "Okay, let me tell you about my home.",
  hint: {
    title: "Home",
    memoryTip: "집 → 방 → 휴식",
    subjectTip: "I",
    minimum: "I live in an apartment.",
    flow: ["집", "방", "휴식"],
  },
  back: splitAnswerText(SAMPLE_TEXT),
};

const settings = {
  theme: "light",
  studyDayStartTime: "04:00",
  ttsRate: 1,
  questionAutoplay: false,
  autoAdvance: false,
  cardScope: "all",
  studyOrder: "default",
  shadowingRepeatMode: "sentence",
  shadowingRepeatCount: 3,
  shadowingRestLevel: "normal",
};

class MockStorage {
  values = new Map();
  setCalls = 0;
  failSet = false;

  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.setCalls += 1;
    if (this.failSet) throw new Error("injected storage failure");
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

function createDraft(answer = SAMPLE_TEXT.replace(/\n\n/g, "\n\n\n\n")) {
  const draft = createEmptyCardEditorDraft();
  draft.deck = card.deck;
  draft.front = card.front;
  draft.frontKo = card.frontKo;
  draft.firstLine = card.firstLine;
  draft.hintTitle = card.hint.title;
  draft.memoryTip = card.hint.memoryTip;
  draft.subjectTip = card.hint.subjectTip;
  draft.minimum = card.hint.minimum;
  draft.flow = card.hint.flow.join("\n");
  draft.answer = answer;
  draft.tags = card.tags.join(" | ");
  return draft;
}

test("1. LF 한 번 유지", () => assert.equal(normalizeAnswerLineBreaks("One.\nTwo."), "One.\nTwo."));
test("2. CRLF를 LF로 통일", () => assert.equal(normalizeAnswerLineBreaks("One.\r\nTwo."), "One.\nTwo."));
test("3. CR을 LF로 통일", () => assert.equal(normalizeAnswerLineBreaks("One.\rTwo."), "One.\nTwo."));
test("4. 두 개행 유지", () => assert.equal(normalizeAnswerLineBreaks("One.\n\nTwo."), "One.\n\nTwo."));
test("5. 세 개행을 두 개행으로 축약", () => assert.equal(normalizeAnswerLineBreaks("One.\n\n\nTwo."), "One.\n\nTwo."));
test("6. 네 개 이상도 두 개행으로 축약", () => assert.equal(normalizeAnswerLineBreaks("One.\n\n\n\n\nTwo."), "One.\n\nTwo."));
test("7. 공백과 탭뿐인 빈 줄 정규화", () => assert.equal(normalizeAnswerLineBreaks("One.\n \t\n\t\nTwo."), "One.\n\nTwo."));
test("8. 문장 내용과 문장부호 불변", () => assert.equal(normalizeAnswerLineBreaks("  Wait,  really?!\nYes.  "), "Wait,  really?!\nYes."));
test("9. 빈 문자열", () => assert.equal(normalizeAnswerLineBreaks(""), ""));
test("10. 한 줄 문자열", () => assert.equal(normalizeAnswerLineBreaks("  One line.  "), "One line."));
test("11. 한글과 영어 혼합", () => assert.equal(normalizeAnswerLineBreaks("집 설명.\nHome description."), "집 설명.\nHome description."));
test("12. idempotent", () => {
  const once = normalizeAnswerLineBreaks("One.\r\n \t\r\n\r\nTwo.");
  assert.equal(normalizeAnswerLineBreaks(once), once);
});

test("13. 새 카드 저장 후보가 개행을 보존", () => {
  const validation = validateCardEditorDraft(createDraft());
  assert.ok(validation.card);
  assert.equal(joinAnswerLines(validation.card.back), SAMPLE_TEXT);
  const paragraphAfterFirstLine = splitAnswerText("First line.\n\nSecond paragraph.");
  assert.deepEqual(paragraphAfterFirstLine, ["First line.", "\nSecond paragraph."]);
  assert.equal(
    isOpicCard({ ...card, firstLine: "First line.", back: paragraphAfterFirstLine }),
    true,
  );
});
test("14. 기존 카드 수정 draft가 같은 개행 구조를 유지", () => {
  const draft = createCardEditorDraft(card);
  assert.equal(draft.answer, SAMPLE_TEXT);
  draft.answer = draft.answer.replace("clean and cozy", "quiet and cozy");
  const validation = validateCardEditorDraft(draft);
  assert.equal(joinAnswerLines(validation.card.back), SAMPLE_TEXT.replace("clean and cozy", "quiet and cozy"));
});
test("15. transaction 저장 실패 시 caller draft와 commit 불변", () => {
  const draft = createDraft();
  const validation = validateCardEditorDraft(draft);
  const storage = new MockStorage();
  const plan = createCardCreationPlan({
    card: validation.card,
    currentCards: [],
    archivedCardIds: [],
    localStorage: storage,
    now: new Date("2026-07-24T00:00:00.000Z"),
    createId: () => "custom-line-break",
  });
  storage.failSet = true;
  let commits = 0;
  assert.throws(() => executeCardCreationTransaction({ plan, commit: () => { commits += 1; } }));
  assert.equal(draft.answer.includes("\n\n\n\n"), true);
  assert.equal(commits, 0);
});
test("16. 카드 상세 표시 row는 한 줄과 문단 구분을 구별", () => {
  const rows = createAnswerDisplayRows(SAMPLE_TEXT);
  assert.equal(rows.filter((row) => row.kind === "line").length, 6);
  assert.equal(rows.filter((row) => row.kind === "paragraph-break").length, 2);
});
test("17. 카드 상세 CSS가 원문 개행과 긴 단어를 안전하게 표시", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.answer-line-text[\s\S]*white-space:\s*pre-wrap/);
  assert.match(css, /\.answer-line-text[\s\S]*overflow-wrap:\s*anywhere/);
});
test("18. 답변 익히기는 paragraph helper 결과를 렌더링", () => {
  const source = readFileSync("src/components/AnswerLearning.tsx", "utf8");
  assert.match(source, /createPassageParagraphs\(answerText\)/);
  assert.match(source, /answer-learning-paragraph/);
});
test("19. 쉐도잉 입력은 canonical answer text", () => {
  assert.equal(createModelAnswerSource(card).sourceText, SAMPLE_TEXT);
  assert.equal(createMyAnswerSource(card, SAMPLE_TEXT.replace(/\n\n/g, "\n\n\n")).sourceText, SAMPLE_TEXT);
});

test("20. 나만의 답변 저장 정규화", () => assert.equal(normalizeMyAnswerText(SAMPLE_TEXT.replace(/\n\n/g, "\r\n\r\n\r\n")), SAMPLE_TEXT));
test("21. 나만의 답변 카드 상세 표시가 pre-wrap", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.my-answer-text[\s\S]*white-space:\s*pre-wrap/);
});
test("22. 검색 helper가 여러 줄 나만의 답변을 검색", () => {
  assert.equal(matchesCardSearch(card, "favorite place", { cardMemos: {}, myAnswers: { [card.id]: SAMPLE_TEXT } }), true);
});
test("23. JSON 백업 복구가 나만의 답변 개행을 canonicalize", () => {
  const backup = createAppBackup([card], {}, {}, settings, new Date("2026-07-24T00:00:00.000Z"), {
    [card.id]: SAMPLE_TEXT.replace(/\n\n/g, "\n\n\n\n"),
  });
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(parsed.backup.data.myAnswers[card.id], SAMPLE_TEXT);
});

test("24. 한 개행은 같은 문단", () => assert.equal(createPassageParagraphs("One.\nTwo.").length, 1));
test("25. 두 개행은 문단 분리", () => assert.equal(createPassageParagraphs("One.\n\nTwo.").length, 2));
test("26. 세 개행 이상도 문단 두 개만 생성", () => assert.equal(createPassageParagraphs("One.\n\n\n\nTwo.").length, 2));
test("27. 문장 반복 sentence 순서 회귀 없음", () => {
  const sentences = flattenParagraphSentences(createPassageParagraphs(SAMPLE_TEXT));
  assert.equal(sentences.length, 6);
  assert.equal(getNextRepeatStep("sentence", 3, 1, sentences.length, 2).nextIndex, 2);
});
test("28. 문단 반복 범위 회귀 없음", () => {
  const paragraphs = createPassageParagraphs(SAMPLE_TEXT);
  assert.deepEqual(paragraphs.map((paragraph) => paragraph.sentences.length), [2, 2, 2]);
});
test("29. 전체 반복 완료 정책 회귀 없음", () => {
  assert.equal(getNextRepeatStep("all", 1, 1, 2, 0).completed, true);
});
test("30. 같은 sentence sequence는 fingerprint 유지", () => {
  const canonical = flattenParagraphSentences(createPassageParagraphs(SAMPLE_TEXT));
  const excessive = flattenParagraphSentences(createPassageParagraphs(SAMPLE_TEXT.replace(/\n\n/g, "\n\n\n\n")));
  assert.equal(createShadowingSourceFingerprint(canonical), createShadowingSourceFingerprint(excessive));
});

test("31. JSON round-trip에서 기본 답변 LF와 문단 유지", () => {
  const backup = createAppBackup([card], {}, {}, settings, new Date("2026-07-24T00:00:00.000Z"), {});
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.equal(joinAnswerLines(parsed.backup.data.cardDataset.cards[0].back), SAMPLE_TEXT);
});
test("32. TSV round-trip에서 multiline 답변 유지", () => {
  const parsed = parseCardTsv(exportCardsToTsv([card]));
  assert.equal(parsed.errorCount, 0);
  assert.equal(joinAnswerLines(parsed.validCards[0].back), SAMPLE_TEXT);
});
test("33. 반복 JSON/TSV round-trip 후 개행 불변", () => {
  const first = parseCardTsv(exportCardsToTsv([card])).validCards[0];
  const second = parseCardTsv(exportCardsToTsv([first])).validCards[0];
  assert.equal(joinAnswerLines(second.back), SAMPLE_TEXT);
});
test("34. TSV 헤더와 열 수 13개 유지", () => {
  assert.equal(CARD_TSV_HEADERS.length, 13);
  assert.equal(exportCardsToTsv([card]).replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].split("\t").length, 13);
});
test("35. AppBackupV1 표식과 schema version 불변", () => {
  const backup = createAppBackup([card], {}, {}, settings, new Date("2026-07-24T00:00:00.000Z"), {});
  assert.equal(backup.format, "opic-trainer-backup");
  assert.equal(backup.version, 1);
  assert.equal(backup.app.schemaVersion, 1);
});

test("36. 카드 생성 plan dataset parser 통과", () => {
  const storage = new MockStorage();
  const plan = createCardCreationPlan({
    card,
    currentCards: [],
    archivedCardIds: [],
    localStorage: storage,
    now: new Date("2026-07-24T00:00:00.000Z"),
    createId: () => "custom-line-break-plan",
  });
  assert.ok(parseCardDataset(plan.mutations.find((mutation) => mutation.key === CARD_DATASET_STORAGE_KEY).value));
});
test("37. 카드 수정 validation 결과는 OpicCard 계약 유지", () => assert.equal(isOpicCard(validateCardEditorDraft(createDraft()).card), true));
test("38. 카드 삭제 transaction과 plan 테스트가 test:all에 유지", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts["test:all"], /test:card-deletion-transaction/);
  assert.match(packageJson.scripts["test:all"], /test:card-deletion-plan/);
});
test("39. 기본 답변 검색은 정규화 후에도 동작", () => {
  assert.equal(matchesCardSearch(card, "favorite place is my bedroom", { cardMemos: {}, myAnswers: {} }), true);
});
test("40. 클라우드 백업 공개 스키마를 추가하지 않음", () => {
  const helperSource = readFileSync("src/utils/answerText.ts", "utf8");
  assert.doesNotMatch(helperSource, /firebase|cloudBackup/i);
});
test("41. 전용 검증은 주입 MockStorage만 사용", () => {
  const storage = new MockStorage();
  assert.equal(storage.setCalls, 0);
  assert.equal(typeof globalThis.localStorage, "undefined");
});
test("42. 줄바꿈 helper는 Firebase 호출을 포함하지 않음", () => {
  const helperSource = readFileSync("src/utils/answerText.ts", "utf8");
  assert.doesNotMatch(helperSource, /fetch\(|XMLHttpRequest|firebase/i);
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

if (passed !== tests.length) {
  console.error(`\nAnswer line break verification: ${passed}/${tests.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`\nAnswer line break verification: ${passed}/${tests.length} passed`);
}
