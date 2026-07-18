import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cards } from "../src/data/cards.ts";
import {
  ARCHIVED_CARD_IDS_STORAGE_KEY,
  matchesArchiveFilter,
  normalizeArchivedCardIds,
  parseArchivedCardIds,
  readArchivedCardIds,
  saveArchivedCardIds,
  setCardArchived,
} from "../src/utils/cardArchiveStorage.ts";
import {
  createCardEditorDraft,
  getChangedCardFields,
  validateCardEditorDraft,
} from "../src/utils/cardEditor.ts";
import {
  hasCardRelatedData,
  removeCardFromAnswerLearningSession,
  removeCardFromAttempts,
  removeCardFromMockSession,
  removeCardFromRecord,
} from "../src/utils/cardDeletion.ts";
import { applyCardImport } from "../src/utils/cardStorage.ts";
import {
  createAppBackup,
  parseAndValidateBackup,
  serializeAppBackup,
} from "../src/utils/appBackup.ts";
import { createEmptyAnswerLearningSession } from "../src/utils/answerLearningSession.ts";
import { createFirstLineMockSession } from "../src/utils/firstLineMockSession.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();

const tests = [];
function test(name, run) { tests.push({ name, run }); }

const base = cards[0];

test("보관 저장소 기본값", () => assert.deepEqual(readArchivedCardIds(), []));
test("보관 ID 저장", () => {
  assert.deepEqual(saveArchivedCardIds([base.id]), [base.id]);
  assert.equal(localStorage.getItem(ARCHIVED_CARD_IDS_STORAGE_KEY), JSON.stringify([base.id]));
});
test("보관 ID 중복과 위험 키 제거", () => assert.deepEqual(normalizeArchivedCardIds([base.id, base.id, "__proto__", ""]), [base.id]));
test("잘못된 보관 저장값 fallback", () => assert.deepEqual(parseArchivedCardIds("{"), []));
test("보관과 복원 toggle", () => {
  const archived = setCardArchived([], base.id, true);
  assert.deepEqual(setCardArchived(archived, base.id, false), []);
});
test("사용 중 필터", () => assert.equal(matchesArchiveFilter(base, [], "active"), true));
test("보관 필터", () => assert.equal(matchesArchiveFilter(base, [base.id], "archived"), true));
test("전체 필터", () => assert.equal(matchesArchiveFilter(base, [base.id], "all"), true));

test("일반 카드 수정 검증", () => {
  const draft = createCardEditorDraft(base);
  draft.front = `${draft.front} Please give details.`;
  const result = validateCardEditorDraft(draft);
  assert.equal(result.card?.id, base.id);
  assert.equal(result.card?.front, draft.front);
  assert.deepEqual(getChangedCardFields(base, draft), ["영어 문제"]);
});
test("ID는 편집 draft에서도 유지", () => assert.equal(createCardEditorDraft(base).id, base.id));
test("필수 질문 검증", () => {
  const draft = createCardEditorDraft(base); draft.front = "";
  assert.ok(validateCardEditorDraft(draft).errors.some((error) => error.includes("영어 문제")));
});
test("필수 첫 문장 검증", () => {
  const draft = createCardEditorDraft(base); draft.firstLine = "";
  assert.ok(validateCardEditorDraft(draft).errors.some((error) => error.includes("첫 문장")));
});
test("필수 답변 검증", () => {
  const draft = createCardEditorDraft(base); draft.answer = "";
  assert.ok(validateCardEditorDraft(draft).errors.some((error) => error.includes("전체 답변")));
});
test("첫 문장 불일치 검증", () => {
  const draft = createCardEditorDraft(base); draft.answer = "A different opening.";
  assert.equal(validateCardEditorDraft(draft).card, null);
});
test("첫 문장 전용 카드 허용", () => {
  const draft = createCardEditorDraft(base);
  draft.firstLine = "Hello."; draft.answer = "Hello."; draft.hintTitle = "";
  draft.memoryTip = ""; draft.subjectTip = ""; draft.minimum = ""; draft.flow = "";
  assert.deepEqual(validateCardEditorDraft(draft).card?.back, ["Hello."]);
});
test("firstline_only 긴 답변 경고", () => {
  const draft = createCardEditorDraft(base); draft.tags = "firstline_only";
  assert.equal(validateCardEditorDraft(draft).warnings.length, 1);
});
test("final_rep는 기존 태그 구조로 저장", () => {
  const draft = createCardEditorDraft(base); draft.finalRep = true;
  assert.equal(validateCardEditorDraft(draft).card?.tags.includes("final_rep"), true);
});

test("첫 문장 상태 한 카드만 삭제", () => assert.deepEqual(removeCardFromRecord({ [base.id]: "success", other: "hard" }, base.id), { other: "hard" }));
test("날짜별 시도에서 한 카드만 삭제", () => {
  const attempts = { "2026-07-19": [{ cardId: base.id }, { cardId: "other" }] };
  assert.deepEqual(removeCardFromAttempts(attempts, base.id), { "2026-07-19": [{ cardId: "other" }] });
});
test("답변 익히기 세션에서 카드 제거", () => {
  const session = { ...createEmptyAnswerLearningSession(), screen: "learning", selectedCardIds: [base.id, "other"], cardOrder: [base.id, "other"], answerSources: { [base.id]: "default" }, reveals: { [base.id]: { hint: true, firstLine: true, answer: true, frontKo: true } } };
  const next = removeCardFromAnswerLearningSession(session, base.id);
  assert.deepEqual(next.cardOrder, ["other"]);
  assert.equal(next.answerSources[base.id], undefined);
});
test("모의고사 세션에서 카드 제거", () => {
  const session = createFirstLineMockSession([base.id, "other"], "all", () => 0.5);
  session.answers[base.id] = "success";
  const next = removeCardFromMockSession(session, base.id);
  assert.deepEqual(next?.cardOrder, ["other"]);
  assert.equal(next?.answers[base.id], undefined);
});
test("마지막 모의고사 카드 삭제 시 세션 종료", () => assert.equal(removeCardFromMockSession(createFirstLineMockSession([base.id], "all"), base.id), null));
test("연관 기록 존재 확인", () => assert.equal(hasCardRelatedData(base.id, { statuses: { [base.id]: "success" }, attempts: {}, answerLearningStatuses: {}, answerLearningAttempts: {}, myAnswers: {}, cardMemos: {} }), true));
test("다른 카드 기록은 연관 없음", () => assert.equal(hasCardRelatedData(base.id, { statuses: { other: "success" }, attempts: {}, answerLearningStatuses: {}, answerLearningAttempts: {}, myAnswers: {}, cardMemos: {} }), false));

test("TSV 동일 ID 덮어쓰기 뒤 보관 ID 독립 유지", () => {
  const updated = { ...base, front: "Updated question" };
  assert.equal(applyCardImport(cards, [updated], "overwrite").cards[0].front, "Updated question");
  assert.deepEqual([base.id], [base.id]);
});
test("삭제한 ID 재가져오기는 새 카드", () => {
  const current = cards.filter((card) => card.id !== base.id);
  const result = applyCardImport(current, [base], "new-only");
  assert.equal(result.added, 1);
});
test("JSON 보관 ID round trip", () => {
  const backup = createAppBackup(cards, {}, {}, undefined, new Date("2026-07-19T00:00:00Z"), {}, {}, undefined, undefined, {}, {}, [base.id]);
  const parsed = parseAndValidateBackup(serializeAppBackup(backup));
  assert.deepEqual(parsed.backup?.data.archivedCardIds, [base.id]);
  assert.equal(parsed.backup?.summary.archivedCardCount, 1);
});
test("구버전 JSON은 보관 목록 없이 호환", () => {
  const backup = createAppBackup(cards, {}, {}, undefined, new Date("2026-07-19T00:00:00Z"), {}, {}, undefined, undefined, {}, {}, []);
  delete backup.data.archivedCardIds;
  delete backup.summary.archivedCardCount;
  const parsed = parseAndValidateBackup(JSON.stringify(backup));
  assert.equal(parsed.canRestore, true);
  assert.deepEqual(parsed.backup?.data.archivedCardIds, []);
});
test("카드 관리 UI는 수정 보관 완전 삭제를 제공", () => {
  const source = readFileSync(new URL("../src/components/CardDetail.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("카드 수정" ) || readFileSync(new URL("../src/components/CardEditor.tsx", import.meta.url), "utf8").includes("카드 수정"));
  assert.ok(source.includes("카드 완전 삭제"));
  assert.ok(source.includes("이 카드와 관련 기록을 완전히 삭제할까요?"));
});

test("카드 관리 알림은 3.5초 뒤 사라지는 단일 toast", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const toastSource = readFileSync(new URL("../src/components/TransientToast.tsx", import.meta.url), "utf8");
  assert.ok(appSource.includes("CARD_MANAGEMENT_NOTICE_DURATION_MS = 3_500"));
  assert.ok(toastSource.includes("window.setTimeout(onDismiss, durationMs)"));
  assert.ok(toastSource.includes('role="status"'));
  assert.ok(toastSource.includes('aria-live="polite"'));
  assert.ok(toastSource.includes('aria-atomic="true"'));
});

test("보관 toast 실행 취소는 같은 카드 ID를 사용 중으로 복원", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(appSource.includes('action: "undo-archive"'));
  assert.ok(appSource.includes("setCardArchived(archivedCardIds, cardId, false)"));
  assert.ok(appSource.includes("카드 보관을 취소했습니다."));
});

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log(`Card management verification passed: ${passed}/${tests.length}`);
