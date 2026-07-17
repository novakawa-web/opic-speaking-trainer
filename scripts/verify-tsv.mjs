import assert from "node:assert/strict";
import {
  CARD_TSV_HEADERS,
  createSampleCards,
  exportCardsToTsv,
  parseCardTsv,
} from "../src/utils/cardTsv.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  CARD_IMPORT_BACKUP_KEY,
  applyCardImport,
  clearImportBackup,
  createCardDataset,
  readActiveCards,
  readImportBackup,
  resolveStoredCards,
  saveActiveCards,
  saveImportBackup,
} from "../src/utils/cardStorage.ts";

const baseCard = {
  id: "verify-card-001",
  deck: "OPIc 03_주제별답변",
  tags: ["home", "test", "final_rep"],
  front: "Q: Tell me about your home.",
  frontKo: "당신의 집에 대해 말해 주세요.",
  firstLine: "I live in an apartment.",
  hint: {
    title: "검증 카드",
    memoryTip: "집 → 느낌",
    subjectTip: "I = 나",
    minimum: "I live in an apartment.",
    flow: ["아파트", "아늑함"],
  },
  back: [
    "I live in an apartment.",
    "It is clean and cozy.",
    "So I like my home.",
  ],
};

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

function replaceCell(tsv, header, nextValue) {
  const parsed = parseSimpleExport(tsv);
  const index = parsed.headers.indexOf(header);
  assert.notEqual(index, -1);
  parsed.cells[index] = nextValue;
  return `${parsed.headers.join("\t")}\n${parsed.cells.join("\t")}`;
}

function parseSimpleExport(tsv) {
  const lines = tsv.replace(/^\uFEFF/, "").split("\r\n");
  return {
    headers: lines[0].split("\t"),
    cells: lines.slice(1).join("\n").split("\t"),
  };
}

test("기본 단일 행", () => {
  const parsed = parseCardTsv(exportCardsToTsv([baseCard]));
  assert.equal(parsed.totalRows, 1);
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.validCards[0].id, baseCard.id);
});

test("한글과 UTF-8 BOM", () => {
  const tsv = exportCardsToTsv([baseCard]);
  assert.equal(tsv.charCodeAt(0), 0xfeff);
  const parsed = parseCardTsv(tsv);
  assert.equal(parsed.validCards[0].frontKo, baseCard.frontKo);
  assert.equal(parsed.validCards[0].hint.title, "검증 카드");
});

test("Windows CRLF", () => {
  const tsv = exportCardsToTsv([baseCard]);
  assert.match(tsv, /\r\n/);
  assert.equal(parseCardTsv(tsv).errorCount, 0);
});

test("multiline answer", () => {
  const parsed = parseCardTsv(exportCardsToTsv([baseCard]));
  assert.deepEqual(parsed.validCards[0].back, baseCard.back);
});

test("literal \\n answer 구분", () => {
  const escaped = exportCardsToTsv([baseCard])
    .replace("I live in an apartment.\nIt is clean and cozy.", "I live in an apartment.\\nIt is clean and cozy.");
  const parsed = parseCardTsv(escaped);
  assert.deepEqual(parsed.validCards[0].back, baseCard.back);
});

test("탭과 따옴표 포함 셀", () => {
  const card = {
    ...baseCard,
    id: "verify-special-001",
    frontKo: "탭\t포함",
    hint: { ...baseCard.hint, title: '그가 "좋아요"라고 말함' },
  };
  const parsed = parseCardTsv(exportCardsToTsv([card]));
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.validCards[0].frontKo, "탭\t포함");
  assert.equal(parsed.validCards[0].hint.title, card.hint.title);
});

test("빈 행 무시", () => {
  const tsv = `${exportCardsToTsv([baseCard])}\r\n\r\n\t\t\t\r\n`;
  assert.equal(parseCardTsv(tsv).totalRows, 1);
});

test("파일 내부 중복 id", () => {
  const parsed = parseCardTsv(exportCardsToTsv([baseCard, baseCard]));
  assert.equal(parsed.duplicateIdCount, 2);
  assert.equal(parsed.validCards.length, 0);
  assert.equal(parsed.errorRowCount, 2);
});

test("필수 header 누락", () => {
  const headers = CARD_TSV_HEADERS.filter((header) => header !== "answer");
  const parsed = parseCardTsv(`${headers.join("\t")}\n`);
  assert.ok(parsed.issues.some((issue) => issue.field === "answer"));
  assert.ok(parsed.errorCount > 0);
});

test("필수 필드 누락", () => {
  const tsv = exportCardsToTsv([baseCard]);
  const withoutId = replaceCell(tsv, "id", "");
  const parsed = parseCardTsv(withoutId);
  assert.equal(parsed.validCards.length, 0);
  assert.ok(parsed.issues.some((issue) => issue.field === "id"));
});

test("잘못된 final_rep", () => {
  const tsv = exportCardsToTsv([baseCard]).replace(/true\s*$/, "yes");
  const parsed = parseCardTsv(tsv);
  assert.ok(parsed.issues.some((issue) => issue.field === "final_rep"));
});

test("tags trim과 중복 제거", () => {
  const plain = {
    ...baseCard,
    id: "verify-tags-001",
    tags: ["home", "final_rep"],
  };
  const tsv = exportCardsToTsv([plain]).replace("home\t", " home | home | test \t");
  const parsed = parseCardTsv(tsv);
  assert.deepEqual(parsed.validCards[0].tags, ["home", "test", "final_rep"]);
});

test("firstLine과 answer 첫 줄 불일치", () => {
  const tsv = exportCardsToTsv([baseCard]).replace(
    "I live in an apartment.",
    "I live in a house.",
  );
  const parsed = parseCardTsv(tsv);
  assert.ok(parsed.issues.some((issue) => issue.field === "firstLine"));
});

test("export/import round trip", () => {
  const source = [baseCard, ...createSampleCards()];
  const parsed = parseCardTsv(exportCardsToTsv(source));
  assert.equal(parsed.errorCount, 0);
  assert.deepEqual(parsed.validCards, source);
});

test("기존 id 충돌 경고", () => {
  const parsed = parseCardTsv(exportCardsToTsv([baseCard]), [baseCard]);
  assert.equal(parsed.existingConflictCount, 1);
  assert.equal(parsed.rows[0].status, "existing");
  assert.equal(parsed.errorCount, 0);
});

test("충돌 정책 3가지", () => {
  const updated = {
    ...baseCard,
    front: "Q: Updated question?",
  };
  const added = { ...baseCard, id: "verify-new-001" };

  const newOnly = applyCardImport([baseCard], [updated, added], "new-only");
  assert.equal(newOnly.cards[0].front, baseCard.front);
  assert.equal(newOnly.added, 1);
  assert.equal(newOnly.skipped, 1);

  const overwrite = applyCardImport([baseCard], [updated, added], "overwrite");
  assert.equal(overwrite.cards[0].front, updated.front);
  assert.equal(overwrite.updated, 1);
  assert.equal(overwrite.added, 1);

  const replace = applyCardImport([baseCard], [added], "replace");
  assert.deepEqual(replace.cards, [added]);
});

test("잘못된 localStorage 데이터 fallback", () => {
  const malformed = resolveStoredCards('{"version":1,"cards":[]}', [baseCard]);
  assert.equal(malformed.source, "default");
  assert.equal(malformed.invalidStoredData, true);
  assert.deepEqual(malformed.cards, [baseCard]);

  const valid = resolveStoredCards(
    JSON.stringify(createCardDataset([baseCard])),
    [],
  );
  assert.equal(valid.source, "stored");
  assert.deepEqual(valid.cards, [baseCard]);
});

test("활성 카드와 직전 가져오기 백업 localStorage", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };

  saveActiveCards([baseCard]);
  assert.ok(values.has(CARD_DATASET_STORAGE_KEY));
  assert.deepEqual(readActiveCards([]).cards, [baseCard]);

  saveImportBackup([baseCard]);
  assert.ok(values.has(CARD_IMPORT_BACKUP_KEY));
  assert.deepEqual(readImportBackup()?.cards, [baseCard]);
  clearImportBackup();
  assert.equal(readImportBackup(), null);
});

test("수식 주입 보호와 원문 복원", () => {
  const cards = [
    { ...baseCard, id: "=SUM(A1:A2)" },
    { ...baseCard, id: "+1" },
    { ...baseCard, id: "-42" },
    { ...baseCard, id: "@command" },
    { ...baseCard, id: "- quiet-place" },
  ];
  const tsv = exportCardsToTsv(cards);
  assert.ok(tsv.includes("'\u200B=SUM(A1:A2)"));
  assert.ok(tsv.includes("'\u200B-42"));
  assert.ok(tsv.includes("- quiet-place"));
  assert.deepEqual(parseCardTsv(tsv).validCards, cards);
});

test("닫히지 않은 따옴표 오류", () => {
  const parsed = parseCardTsv(`${CARD_TSV_HEADERS.join("\t")}\n"broken`);
  assert.ok(parsed.issues.some((issue) => issue.message.includes("닫히지")));
});

test("긴 셀", () => {
  const longText = "A very long but valid question. ".repeat(4000);
  const card = { ...baseCard, id: "verify-long-001", front: longText };
  const parsed = parseCardTsv(exportCardsToTsv([card]));
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.validCards[0].front, longText.trim());
});

test("알 수 없는 header는 경고 후 무시", () => {
  const tsv = exportCardsToTsv([baseCard]);
  const withUnknown = tsv.replace("final_rep", "final_rep\textraColumn").replace(/true\s*$/, "true\tignored");
  const parsed = parseCardTsv(withUnknown);
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.warningCount, 1);
  assert.deepEqual(parsed.unknownHeaders, ["extraColumn"]);
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log(`\nTSV 검증 ${passed}/${tests.length} 통과`);
