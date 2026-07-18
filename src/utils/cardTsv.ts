import type { DeckName, OpicCard } from "../types.ts";
import { DECK_NAMES } from "./cardStorage.ts";

export const CARD_TSV_HEADERS = [
  "id",
  "deck",
  "tags",
  "front",
  "frontKo",
  "firstLine",
  "hintTitle",
  "memoryTip",
  "subjectTip",
  "minimum",
  "flow",
  "answer",
  "final_rep",
] as const;

const REQUIRED_HEADERS = ["id", "deck", "front", "firstLine", "answer"];
const FORMULA_GUARD_PREFIX = "'\u200B";

export type CardTsvIssue = {
  severity: "error" | "warning";
  rowNumber: number;
  cardId?: string;
  field?: string;
  message: string;
};

export type CardTsvPreviewRow = {
  rowNumber: number;
  id: string;
  deck: string;
  front: string;
  status: "new" | "existing" | "error";
  issues: CardTsvIssue[];
  card?: OpicCard;
};

export type CardTsvParseResult = {
  totalRows: number;
  validCards: OpicCard[];
  rows: CardTsvPreviewRow[];
  issues: CardTsvIssue[];
  errorCount: number;
  errorRowCount: number;
  warningCount: number;
  duplicateIdCount: number;
  existingConflictCount: number;
  unknownHeaders: string[];
};

type ParsedRecord = { rowNumber: number; fields: string[] };
type ParsedTsvRecords = {
  records: ParsedRecord[];
  unterminatedQuoteLine: number | null;
};

function startsWithSpreadsheetFormula(value: string) {
  if (/^[=+@]/.test(value)) return true;

  // Preserve ordinary prose such as "- quiet place", while protecting
  // negative values and formula-like expressions such as -1 or -SUM(...).
  return /^-(?=\s*(?:[\d.(=+@-]|[A-Za-z_][A-Za-z0-9_.]*\s*\())/.test(value);
}

function protectFormula(value: string) {
  return startsWithSpreadsheetFormula(value)
    ? `${FORMULA_GUARD_PREFIX}${value}`
    : value;
}

function restoreFormula(value: string) {
  return value.startsWith(FORMULA_GUARD_PREFIX)
    ? value.slice(FORMULA_GUARD_PREFIX.length)
    : value;
}

function encodeTsvCell(value: string) {
  const protectedValue = protectFormula(value);
  if (!/[\t\r\n"]/.test(protectedValue)) return protectedValue;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function decodeEscapedNewlines(value: string) {
  return value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}

function normalizeComparable(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

function parseTsvRecords(rawText: string): ParsedTsvRecords {
  const text = rawText.replace(/^\uFEFF/, "");
  const records: ParsedRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let lineNumber = 1;
  let recordStartLine = 1;

  const pushRecord = () => {
    fields.push(restoreFormula(field));
    if (fields.some((value) => value.trim().length > 0)) {
      records.push({ rowNumber: recordStartLine, fields });
    }
    fields = [];
    field = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
        if (character === "\n") lineNumber += 1;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === "\t") {
      fields.push(restoreFormula(field));
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      pushRecord();
      lineNumber += 1;
      recordStartLine = lineNumber;
    } else {
      field += character;
    }
  }

  if (field.length > 0 || fields.length > 0) pushRecord();
  return {
    records,
    unterminatedQuoteLine: inQuotes ? recordStartLine : null,
  };
}

function splitList(value: string) {
  return [...new Set(value.split(/[|,]/).map((item) => item.trim()).filter(Boolean))];
}

function splitLines(value: string) {
  return decodeEscapedNewlines(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseFinalRep(value: string): boolean | null | "invalid" {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return "invalid";
}

function createIssue(
  severity: CardTsvIssue["severity"],
  rowNumber: number,
  message: string,
  field?: string,
  cardId?: string,
): CardTsvIssue {
  return { severity, rowNumber, cardId, field, message };
}

export function parseCardTsv(
  rawText: string,
  existingCards: OpicCard[] = [],
): CardTsvParseResult {
  const parsedRecords = parseTsvRecords(rawText);
  const records = parsedRecords.records;
  const issues: CardTsvIssue[] = [];
  const headerRecord = records[0];

  if (!headerRecord) {
    const issue = createIssue("error", 1, "TSV 헤더가 없습니다.");
    return {
      totalRows: 0,
      validCards: [],
      rows: [],
      issues: [issue],
      errorCount: 1,
      errorRowCount: 1,
      warningCount: 0,
      duplicateIdCount: 0,
      existingConflictCount: 0,
      unknownHeaders: [],
    };
  }

  const headers = headerRecord.fields.map((header) => header.trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndex.has(header));
  const unknownHeaders = headers.filter(
    (header) => header && !CARD_TSV_HEADERS.includes(header as (typeof CARD_TSV_HEADERS)[number]),
  );

  missingHeaders.forEach((header) => {
    issues.push(createIssue("error", headerRecord.rowNumber, `필수 header '${header}'가 없습니다.`, header));
  });
  unknownHeaders.forEach((header) => {
    issues.push(createIssue("warning", headerRecord.rowNumber, `알 수 없는 header '${header}'는 무시됩니다.`, header));
  });
  if (parsedRecords.unterminatedQuoteLine !== null) {
    issues.push(
      createIssue(
        "error",
        parsedRecords.unterminatedQuoteLine,
        "따옴표로 감싼 셀이 닫히지 않았습니다.",
      ),
    );
  }

  const existingIds = new Set(existingCards.map((card) => card.id));
  const previewRows: CardTsvPreviewRow[] = [];

  for (const record of records.slice(1)) {
    const get = (header: string) => {
      const index = headerIndex.get(header);
      return index === undefined ? "" : decodeEscapedNewlines(record.fields[index] ?? "").trim();
    };
    const id = get("id");
    const deck = get("deck");
    const front = get("front");
    const firstLine = get("firstLine");
    const answerLines = splitLines(get("answer"));
    const rowIssues: CardTsvIssue[] = [];

    if (!id) rowIssues.push(createIssue("error", record.rowNumber, "id는 필수입니다.", "id"));
    if (!deck) rowIssues.push(createIssue("error", record.rowNumber, "deck은 필수입니다.", "deck", id));
    else if (!DECK_NAMES.includes(deck as DeckName)) {
      rowIssues.push(createIssue("error", record.rowNumber, `지원하지 않는 deck '${deck}'입니다.`, "deck", id));
    }
    if (!front) rowIssues.push(createIssue("error", record.rowNumber, "front는 필수입니다.", "front", id));
    if (!firstLine) rowIssues.push(createIssue("error", record.rowNumber, "firstLine은 필수입니다.", "firstLine", id));
    if (answerLines.length === 0) {
      rowIssues.push(createIssue("error", record.rowNumber, "answer는 한 줄 이상 필요합니다.", "answer", id));
    } else if (firstLine && normalizeComparable(firstLine) !== normalizeComparable(answerLines[0])) {
      rowIssues.push(
        createIssue(
          "error",
          record.rowNumber,
          "firstLine이 answer의 첫 줄과 일치하지 않습니다.",
          "firstLine",
          id,
        ),
      );
    }

    const finalRep = parseFinalRep(get("final_rep"));
    if (finalRep === "invalid") {
      rowIssues.push(
        createIssue(
          "error",
          record.rowNumber,
          "final_rep는 true 또는 false만 사용할 수 있습니다.",
          "final_rep",
          id,
        ),
      );
    }

    const parsedTags = splitList(get("tags"));
    const tagsWithoutFinal = parsedTags.filter((tag) => tag !== "final_rep");
    const tags =
      finalRep === true || (finalRep === null && parsedTags.includes("final_rep"))
        ? [...tagsWithoutFinal, "final_rep"]
        : tagsWithoutFinal;

    if (id && existingIds.has(id)) {
      rowIssues.push(
        createIssue("warning", record.rowNumber, "기존 카드 ID와 충돌합니다.", "id", id),
      );
    }

    const hasErrors = rowIssues.some((issue) => issue.severity === "error");
    const frontKo = get("frontKo");
    const subjectTip = get("subjectTip");
    const card: OpicCard | undefined = hasErrors
      ? undefined
      : {
          id,
          deck: deck as DeckName,
          front,
          ...(frontKo ? { frontKo } : {}),
          firstLine,
          hint: {
            // Preserve an intentionally empty title for first-line-only cards.
            // Older complete rows without a title keep the historical id fallback.
            title:
              answerLines.length === 1 &&
              !get("hintTitle") &&
              !get("memoryTip") &&
              !subjectTip &&
              !get("minimum") &&
              splitLines(get("flow")).length === 0
                ? ""
                : get("hintTitle") || id,
            memoryTip: get("memoryTip"),
            ...(subjectTip ? { subjectTip } : {}),
            minimum: get("minimum"),
            flow: splitLines(get("flow")),
          },
          back: answerLines,
          tags,
        };

    previewRows.push({
      rowNumber: record.rowNumber,
      id,
      deck,
      front,
      status: hasErrors ? "error" : existingIds.has(id) ? "existing" : "new",
      issues: rowIssues,
      card,
    });
    issues.push(...rowIssues);
  }

  const rowsById = new Map<string, CardTsvPreviewRow[]>();
  previewRows.forEach((row) => {
    if (!row.id) return;
    rowsById.set(row.id, [...(rowsById.get(row.id) ?? []), row]);
  });
  const duplicateGroups = [...rowsById.values()].filter((rows) => rows.length > 1);
  duplicateGroups.forEach((rows) => {
    rows.forEach((row) => {
      const issue = createIssue(
        "error",
        row.rowNumber,
        "파일 안에서 id가 중복되었습니다.",
        "id",
        row.id,
      );
      row.issues.push(issue);
      row.status = "error";
      row.card = undefined;
      issues.push(issue);
    });
  });

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const errorRowCount = new Set(
    issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.rowNumber),
  ).size;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return {
    totalRows: previewRows.length,
    validCards: previewRows.flatMap((row) => (row.card ? [row.card] : [])),
    rows: previewRows,
    issues,
    errorCount,
    errorRowCount,
    warningCount,
    duplicateIdCount: duplicateGroups.reduce((count, rows) => count + rows.length, 0),
    existingConflictCount: previewRows.filter(
      (row) => Boolean(row.id) && existingIds.has(row.id),
    ).length,
    unknownHeaders,
  };
}

function cardToCells(card: OpicCard) {
  const isFinal = card.tags.includes("final_rep");
  return [
    card.id,
    card.deck,
    card.tags.filter((tag) => tag !== "final_rep").join("|"),
    card.front,
    card.frontKo ?? "",
    card.firstLine,
    card.hint.title,
    card.hint.memoryTip,
    card.hint.subjectTip ?? "",
    card.hint.minimum,
    card.hint.flow.join("\n"),
    card.back.join("\n"),
    String(isFinal),
  ];
}

export function exportCardsToTsv(cards: OpicCard[]) {
  const lines = [
    CARD_TSV_HEADERS.join("\t"),
    ...cards.map((card) => cardToCells(card).map(encodeTsvCell).join("\t")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function createSampleCards(): OpicCard[] {
  return [
    {
      id: "sample-home-001",
      deck: "OPIc 03_주제별답변",
      tags: ["home", "place"],
      front: "Q: Tell me about your home.",
      frontKo: "당신의 집에 대해 말해 주세요.",
      firstLine: "I live in a small apartment.",
      hint: {
        title: "샘플 집 설명",
        memoryTip: "집 종류 → 분위기 → 좋아하는 이유",
        subjectTip: "I = 나 / It = 집",
        minimum: "I live in an apartment → It is cozy.",
        flow: ["아파트", "아늑함", "집을 좋아함"],
      },
      back: [
        "I live in a small apartment.",
        "It is clean and cozy.",
        "So I like spending time at home.",
      ],
    },
    {
      id: "sample-roleplay-001",
      deck: "OPIc 04_롤플레이",
      tags: ["roleplay", "restaurant", "sample"],
      front: "Q: Call a restaurant and ask about a reservation.",
      frontKo: "식당에 전화해 예약에 관해 질문하세요.",
      firstLine: "Hello, I’d like to make a reservation.",
      hint: {
        title: "샘플 식당 예약",
        memoryTip: "인사 → 날짜 → 시간 → 인원",
        subjectTip: "I’d like to = 요청",
        minimum: "I’d like to make a reservation.",
        flow: ["예약 요청", "날짜 질문", "시간 질문"],
      },
      back: [
        "Hello, I’d like to make a reservation.",
        "Do you have a table this Saturday?",
        "Can I book it for seven p.m.?",
      ],
    },
    {
      id: "sample-multiline-001",
      deck: "OPIc 05_문제해결",
      tags: ["sample", "problem"],
      front: "Q: Tell me about a problem you solved.",
      frontKo: "해결했던 문제에 대해 말해 주세요.",
      firstLine: "One day, I had a small problem.",
      hint: {
        title: "샘플 여러 줄 답변",
        memoryTip: "문제 → 행동 → 해결",
        minimum: "I had a problem → I solved it.",
        flow: ["문제 발생", "도움 요청", "해결"],
      },
      back: [
        "One day, I had a small problem.",
        "I asked a staff member for help.",
        "The problem was solved quickly.",
      ],
    },
  ];
}
