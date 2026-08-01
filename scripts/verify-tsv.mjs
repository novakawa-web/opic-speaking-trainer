import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_TSV_HEADERS,
  createSampleCards,
  exportCardsToTsv,
  parseCardTsv,
} from "../src/utils/cardTsv.ts";
import {
  createCardTsvReadRequestGuard,
  parseCardTsvBatch,
} from "../src/utils/cardTsvBatch.ts";
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
import { isFirstLineOnlyCard } from "../src/utils/cardContent.ts";

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

test("첫 문장 전용 TSV 카드는 빈 힌트와 한 줄 답변을 보존", () => {
  const card = {
    ...baseCard,
    id: "firstline-only-001",
    tags: ["firstline_only", "mock"],
    hint: { title: "", memoryTip: "", subjectTip: "", minimum: "", flow: [] },
    back: [baseCard.firstLine],
  };
  const parsed = parseCardTsv(exportCardsToTsv([card]));
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.validCards[0].hint.title, "");
  assert.equal(isFirstLineOnlyCard(parsed.validCards[0]), true);
});

test("완성 카드는 첫 문장 전용으로 분류하지 않음", () => {
  assert.equal(isFirstLineOnlyCard(baseCard), false);
});

test("같은 ID 덮어쓰기는 카드 내용만 교체하고 별도 기록 객체를 건드리지 않음", () => {
  const firstOnly = { ...baseCard, hint: { title: "", memoryTip: "", minimum: "", flow: [] }, back: [baseCard.firstLine] };
  const statuses = { [baseCard.id]: "success" };
  const answerStatuses = { [baseCard.id]: "learning" };
  const result = applyCardImport([firstOnly], [baseCard], "overwrite");
  assert.deepEqual(result.cards, [baseCard]);
  assert.equal(statuses[baseCard.id], "success");
  assert.equal(answerStatuses[baseCard.id], "learning");
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

test("복수 TSV 단일 파일 결과는 기존 파서와 같다", () => {
  const text = exportCardsToTsv([baseCard]);
  const single = parseCardTsv(text);
  const batch = parseCardTsvBatch([
    { fileKey: "0:single.tsv", fileName: "single.tsv", text },
  ]);

  assert.equal(batch.totalFiles, 1);
  assert.equal(batch.readableFiles, 1);
  assert.equal(batch.totalRows, single.totalRows);
  assert.equal(batch.errorCount, single.errorCount);
  assert.deepEqual(batch.validCards, single.validCards);
});

test("복수 TSV는 파일 선택 순서대로 카드를 합친다", () => {
  const first = { ...baseCard, id: "batch-first-001" };
  const second = { ...baseCard, id: "batch-second-001" };
  const batch = parseCardTsvBatch([
    {
      fileKey: "0:first.tsv",
      fileName: "first.tsv",
      text: exportCardsToTsv([first]),
    },
    {
      fileKey: "1:second.tsv",
      fileName: "second.tsv",
      text: exportCardsToTsv([second]),
    },
  ]);

  assert.equal(batch.totalFiles, 2);
  assert.equal(batch.totalRows, 2);
  assert.equal(batch.errorCount, 0);
  assert.deepEqual(batch.validCards.map((card) => card.id), [first.id, second.id]);
  assert.deepEqual(batch.files.map((file) => file.validCardCount), [1, 1]);
});

test("선택한 파일 사이의 중복 ID는 관련된 모든 행을 차단한다", () => {
  const duplicate = { ...baseCard, id: "batch-duplicate-001" };
  const batch = parseCardTsvBatch([
    {
      fileKey: "0:first.tsv",
      fileName: "first.tsv",
      text: exportCardsToTsv([duplicate]),
    },
    {
      fileKey: "1:second.tsv",
      fileName: "second.tsv",
      text: exportCardsToTsv([duplicate]),
    },
  ]);

  assert.equal(batch.validCards.length, 0);
  assert.equal(batch.duplicateIdCount, 2);
  assert.equal(batch.errorRowCount, 2);
  assert.ok(batch.rows.every((row) => row.status === "error"));
  assert.equal(
    batch.issues.filter((issue) =>
      issue.message.includes("선택한 다른 파일과 id가 중복"),
    ).length,
    2,
  );
});

test("한 파일 안의 중복 ID 오류도 배치 결과에 유지한다", () => {
  const duplicate = { ...baseCard, id: "batch-inside-duplicate" };
  const batch = parseCardTsvBatch([
    {
      fileKey: "0:inside.tsv",
      fileName: "inside.tsv",
      text: exportCardsToTsv([duplicate, duplicate]),
    },
  ]);

  assert.equal(batch.validCards.length, 0);
  assert.equal(batch.duplicateIdCount, 2);
  assert.equal(batch.errorRowCount, 2);
  assert.equal(
    batch.issues.filter((issue) =>
      issue.message.includes("파일 안에서 id가 중복"),
    ).length,
    2,
  );
  assert.equal(
    batch.issues.some((issue) =>
      issue.message.includes("선택한 다른 파일과 id가 중복"),
    ),
    false,
  );
});

test("현재 앱의 기존 ID는 파일 간 중복이 아니라 기존 경고다", () => {
  const batch = parseCardTsvBatch(
    [
      {
        fileKey: "0:existing.tsv",
        fileName: "existing.tsv",
        text: exportCardsToTsv([baseCard]),
      },
    ],
    [baseCard],
  );

  assert.equal(batch.errorCount, 0);
  assert.equal(batch.duplicateIdCount, 0);
  assert.equal(batch.existingConflictCount, 1);
  assert.equal(batch.rows[0].status, "existing");
});

test("읽기 실패 파일 하나가 있어도 전체 배치가 오류 상태다", () => {
  const valid = { ...baseCard, id: "batch-readable-001" };
  const batch = parseCardTsvBatch([
    {
      fileKey: "0:valid.tsv",
      fileName: "valid.tsv",
      text: exportCardsToTsv([valid]),
    },
    {
      fileKey: "1:unreadable.tsv",
      fileName: "unreadable.tsv",
      readError: true,
    },
  ]);

  assert.equal(batch.readableFiles, 1);
  assert.equal(batch.validCards.length, 1);
  assert.equal(batch.errorCount, 1);
  assert.equal(batch.files[1].readError, true);
  assert.ok(batch.issues.some((issue) => issue.fileName === "unreadable.tsv"));
});

test("같은 표시 파일명도 내부 키로 구분한다", () => {
  const first = { ...baseCard, id: "same-name-first" };
  const second = { ...baseCard, id: "same-name-second" };
  const batch = parseCardTsvBatch([
    {
      fileKey: "0:cards.tsv",
      fileName: "cards.tsv",
      text: exportCardsToTsv([first]),
    },
    {
      fileKey: "1:cards.tsv",
      fileName: "cards.tsv",
      text: exportCardsToTsv([second]),
    },
  ]);

  assert.equal(batch.files[0].fileName, batch.files[1].fileName);
  assert.notEqual(batch.files[0].fileKey, batch.files[1].fileKey);
  assert.deepEqual(batch.rows.map((row) => row.fileKey), ["0:cards.tsv", "1:cards.tsv"]);
});

test("여러 파일의 같은 행 번호 오류를 각각 센다", () => {
  const first = replaceCell(exportCardsToTsv([baseCard]), "id", "");
  const second = replaceCell(exportCardsToTsv([baseCard]), "id", "");
  const batch = parseCardTsvBatch([
    { fileKey: "0:first.tsv", fileName: "first.tsv", text: first },
    { fileKey: "1:second.tsv", fileName: "second.tsv", text: second },
  ]);

  assert.equal(batch.rows[0].rowNumber, 2);
  assert.equal(batch.rows[1].rowNumber, 2);
  assert.equal(batch.errorRowCount, 2);
});

test("알 수 없는 header 경고에 파일 정보를 유지한다", () => {
  const text = exportCardsToTsv([{ ...baseCard, id: "batch-header-001" }])
    .replace("final_rep", "final_rep\textraColumn")
    .replace(/true\s*$/, "true\tignored");
  const batch = parseCardTsvBatch([
    { fileKey: "0:headers.tsv", fileName: "headers.tsv", text },
  ]);

  assert.equal(batch.errorCount, 0);
  assert.equal(batch.unknownHeaders[0].fileName, "headers.tsv");
  assert.equal(batch.unknownHeaders[0].header, "extraColumn");
  assert.ok(batch.issues.some((issue) => issue.fileName === "headers.tsv"));
});

test("복수 TSV 결과는 기존 세 가지 가져오기 정책에 그대로 적용된다", () => {
  const updated = { ...baseCard, front: "Q: Batch updated question?" };
  const added = { ...baseCard, id: "batch-policy-new-001" };
  const batch = parseCardTsvBatch(
    [
      {
        fileKey: "0:updated.tsv",
        fileName: "updated.tsv",
        text: exportCardsToTsv([updated]),
      },
      {
        fileKey: "1:added.tsv",
        fileName: "added.tsv",
        text: exportCardsToTsv([added]),
      },
    ],
    [baseCard],
  );

  assert.equal(batch.errorCount, 0);
  assert.equal(applyCardImport([baseCard], batch.validCards, "new-only").added, 1);
  assert.equal(applyCardImport([baseCard], batch.validCards, "overwrite").updated, 1);
  assert.deepEqual(
    applyCardImport([baseCard], batch.validCards, "replace").cards,
    [updated, added],
  );
});

test("TSV 가져오기 UI는 선택·미리보기·실행 단계를 표시", () => {
  const source = readFileSync(
    new URL("../src/components/CardDataManager.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("TSV 가져오기"));
  assert.ok(source.includes("파일 선택 완료"));
  assert.ok(source.includes("가져오기 미리보기"));
  assert.ok(source.includes("가져오기 실행"));
  assert.ok(source.includes("카드 TSV 파일을 하나 이상 선택한 뒤 내용을 함께 검토하고 가져옵니다."));
});

test("TSV 가져오기 UI는 여러 파일을 한 묶음으로 처리", () => {
  const source = readFileSync(
    new URL("../src/components/CardDataManager.tsx", import.meta.url),
    "utf8",
  );
  const batchSource = readFileSync(
    new URL("../src/utils/cardTsvBatch.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("multiple"));
  assert.ok(source.includes("Array.from(event.target.files ?? [])"));
  assert.ok(source.includes("parseCardTsvBatch(inputs, cards)"));
  assert.ok(source.includes("선택한 파일 전체를 하나의 가져오기로 처리합니다."));
  assert.ok(batchSource.includes("선택한 다른 파일과 id가 중복되었습니다."));
  assert.equal(source.match(/saveImportBackup\(cards\)/g)?.length, 1);
  assert.equal(source.match(/applyCardImport\(cards, preview\.validCards, policy\)/g)?.length, 1);
});

test("TSV 가져오기 UI는 파일 상태와 재선택을 안내", () => {
  const source = readFileSync(
    new URL("../src/components/CardDataManager.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("선택한 카드 파일이 없어요."));
  assert.ok(source.includes("파일을 확인하고 있어요."));
  assert.ok(source.includes("가져오기 준비됨"));
  assert.ok(source.includes("가져오기 완료:"));
  assert.ok(source.includes("파일 다시 선택"));
  assert.ok(source.includes('aria-live="polite"'));
});

test("TSV 가져오기 오류는 실행을 막고 이유를 표시", () => {
  const source = readFileSync(
    new URL("../src/components/CardDataManager.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("hasBlockingErrors"));
  assert.ok(source.includes("importDisabled"));
  assert.ok(source.includes("선택한 파일 중 오류가 하나라도 있으면 전체를 가져올 수 없습니다."));
});

test("TSV 되돌리기는 가져오기 영역에만 조건부 표시", () => {
  const source = readFileSync(
    new URL("../src/components/CardDataManager.tsx", import.meta.url),
    "utf8",
  );
  const exportIndex = source.indexOf('className="data-transfer-section is-export"');
  const importIndex = source.indexOf('className="data-transfer-section is-import"');
  const undoIndex = source.indexOf("직전 TSV 가져오기 되돌리기");
  assert.ok(exportIndex >= 0 && importIndex > exportIndex);
  assert.ok(undoIndex > importIndex);
  assert.ok(source.includes("{backupAvailable ? ("));
  assert.ok(source.includes("되돌릴 TSV 가져오기가 없어요."));
});

test("긴 파일명은 모바일에서 가로 넘침 없이 처리", () => {
  const styles = readFileSync(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  assert.ok(styles.includes(".managed-file-name"));
  assert.ok(styles.includes(".import-file-summary"));
  assert.ok(styles.includes("text-overflow: ellipsis"));
  assert.ok(styles.includes("overflow-wrap: anywhere"));
});

test("TSV file reads only accept the latest selection", () => {
  const guard = createCardTsvReadRequestGuard();
  const firstRequest = guard.begin();
  const secondRequest = guard.begin();

  assert.equal(guard.isCurrent(firstRequest), false);
  assert.equal(guard.isCurrent(secondRequest), true);
});

test("TSV file read cancellation invalidates the active selection", () => {
  const guard = createCardTsvReadRequestGuard();
  const cancelledRequest = guard.begin();
  guard.cancel();

  assert.equal(guard.isCurrent(cancelledRequest), false);
  assert.equal(guard.isCurrent(guard.begin()), true);
});

test("TSV import UI clears stale preview and blocks actions while reading", () => {
  const source = readFileSync(
    new URL("../src/components/CardDataManager.tsx", import.meta.url),
    "utf8",
  );
  const handlerStart = source.indexOf("async function handleFileChange");
  const clearPreview = source.indexOf("setPreview(null);", handlerStart);
  const readFiles = source.indexOf("await Promise.all", handlerStart);

  assert.ok(source.includes("isReading ||"));
  assert.ok(handlerStart >= 0 && clearPreview > handlerStart);
  assert.ok(readFiles > clearPreview);
  assert.ok(source.includes("fileReadGuardRef.current.begin()"));
  assert.ok(source.includes("fileReadGuardRef.current.isCurrent(requestId)"));
  assert.ok(source.includes("fileReadGuardRef.current.cancel()"));
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
