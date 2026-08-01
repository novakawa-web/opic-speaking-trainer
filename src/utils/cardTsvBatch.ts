import type { OpicCard } from "../types.ts";
import {
  parseCardTsv,
  type CardTsvIssue,
  type CardTsvPreviewRow,
} from "./cardTsv.ts";

export type CardTsvBatchFileInput = {
  fileKey: string;
  fileName: string;
  text?: string;
  readError?: true;
};

export type CardTsvBatchIssue = CardTsvIssue & {
  fileKey: string;
  fileName: string;
  fileIndex: number;
};

export type CardTsvBatchPreviewRow = Omit<CardTsvPreviewRow, "issues"> & {
  fileKey: string;
  fileName: string;
  fileIndex: number;
  issues: CardTsvBatchIssue[];
};

export type CardTsvBatchFileSummary = {
  fileKey: string;
  fileName: string;
  fileIndex: number;
  totalRows: number;
  validCardCount: number;
  errorCount: number;
  errorRowCount: number;
  warningCount: number;
  duplicateIdCount: number;
  existingConflictCount: number;
  unknownHeaders: string[];
  readError: boolean;
};

export type CardTsvBatchUnknownHeader = {
  fileKey: string;
  fileName: string;
  header: string;
};

export type CardTsvBatchParseResult = {
  totalFiles: number;
  readableFiles: number;
  files: CardTsvBatchFileSummary[];
  totalRows: number;
  validCards: OpicCard[];
  rows: CardTsvBatchPreviewRow[];
  issues: CardTsvBatchIssue[];
  errorCount: number;
  errorRowCount: number;
  warningCount: number;
  duplicateIdCount: number;
  existingConflictCount: number;
  unknownHeaders: CardTsvBatchUnknownHeader[];
};

export type CardTsvReadRequestGuard = {
  begin: () => number;
  isCurrent: (requestId: number) => boolean;
  cancel: () => void;
};

export function createCardTsvReadRequestGuard(): CardTsvReadRequestGuard {
  let currentRequestId = 0;

  return {
    begin() {
      currentRequestId += 1;
      return currentRequestId;
    },
    isCurrent(requestId) {
      return requestId === currentRequestId;
    },
    cancel() {
      currentRequestId += 1;
    },
  };
}

function withFileContext(
  issue: CardTsvIssue,
  input: CardTsvBatchFileInput,
  fileIndex: number,
): CardTsvBatchIssue {
  return {
    ...issue,
    fileKey: input.fileKey,
    fileName: input.fileName,
    fileIndex,
  };
}

function rowKey(row: Pick<CardTsvBatchPreviewRow, "fileKey" | "rowNumber">) {
  return `${row.fileKey}\u0000${row.rowNumber}`;
}

function issueRowKey(issue: Pick<CardTsvBatchIssue, "fileKey" | "rowNumber">) {
  return `${issue.fileKey}\u0000${issue.rowNumber}`;
}

export function parseCardTsvBatch(
  inputs: CardTsvBatchFileInput[],
  existingCards: OpicCard[] = [],
): CardTsvBatchParseResult {
  const rows: CardTsvBatchPreviewRow[] = [];
  const issues: CardTsvBatchIssue[] = [];
  const unknownHeaders: CardTsvBatchUnknownHeader[] = [];
  const duplicateRowKeys = new Set<string>();
  const parsedFileMetadata = new Map<
    string,
    { totalRows: number; unknownHeaders: string[]; readError: boolean }
  >();

  inputs.forEach((input, fileIndex) => {
    if (input.readError || input.text === undefined) {
      const issue: CardTsvBatchIssue = {
        severity: "error",
        rowNumber: 1,
        message: "파일 내용을 읽을 수 없습니다.",
        fileKey: input.fileKey,
        fileName: input.fileName,
        fileIndex,
      };
      issues.push(issue);
      parsedFileMetadata.set(input.fileKey, {
        totalRows: 0,
        unknownHeaders: [],
        readError: true,
      });
      return;
    }

    const parsed = parseCardTsv(input.text, existingCards);
    const batchRows = parsed.rows.map<CardTsvBatchPreviewRow>((row) => {
      const batchIssues = row.issues.map((issue) =>
        withFileContext(issue, input, fileIndex),
      );
      const batchRow = {
        ...row,
        fileKey: input.fileKey,
        fileName: input.fileName,
        fileIndex,
        issues: batchIssues,
      };
      if (
        batchIssues.some(
          (issue) => issue.message === "파일 안에서 id가 중복되었습니다.",
        )
      ) {
        duplicateRowKeys.add(rowKey(batchRow));
      }
      return batchRow;
    });

    rows.push(...batchRows);
    issues.push(
      ...parsed.issues.map((issue) =>
        withFileContext(issue, input, fileIndex),
      ),
    );
    unknownHeaders.push(
      ...parsed.unknownHeaders.map((header) => ({
        fileKey: input.fileKey,
        fileName: input.fileName,
        header,
      })),
    );
    parsedFileMetadata.set(input.fileKey, {
      totalRows: parsed.totalRows,
      unknownHeaders: parsed.unknownHeaders,
      readError: false,
    });
  });

  const rowsById = new Map<string, CardTsvBatchPreviewRow[]>();
  rows.forEach((row) => {
    if (!row.id) return;
    rowsById.set(row.id, [...(rowsById.get(row.id) ?? []), row]);
  });

  for (const idRows of rowsById.values()) {
    if (new Set(idRows.map((row) => row.fileKey)).size < 2) continue;

    idRows.forEach((row) => {
      const issue: CardTsvBatchIssue = {
        severity: "error",
        rowNumber: row.rowNumber,
        cardId: row.id,
        field: "id",
        message: "선택한 다른 파일과 id가 중복되었습니다.",
        fileKey: row.fileKey,
        fileName: row.fileName,
        fileIndex: row.fileIndex,
      };
      row.issues.push(issue);
      row.status = "error";
      row.card = undefined;
      issues.push(issue);
      duplicateRowKeys.add(rowKey(row));
    });
  }

  const errorIssues = issues.filter((issue) => issue.severity === "error");
  const warningIssues = issues.filter((issue) => issue.severity === "warning");
  const existingIds = new Set(existingCards.map((card) => card.id));
  const files = inputs.map<CardTsvBatchFileSummary>((input, fileIndex) => {
    const metadata = parsedFileMetadata.get(input.fileKey) ?? {
      totalRows: 0,
      unknownHeaders: [],
      readError: true,
    };
    const fileRows = rows.filter((row) => row.fileKey === input.fileKey);
    const fileIssues = issues.filter((issue) => issue.fileKey === input.fileKey);
    const fileErrorIssues = fileIssues.filter(
      (issue) => issue.severity === "error",
    );

    return {
      fileKey: input.fileKey,
      fileName: input.fileName,
      fileIndex,
      totalRows: metadata.totalRows,
      validCardCount: fileRows.filter((row) => Boolean(row.card)).length,
      errorCount: fileErrorIssues.length,
      errorRowCount: new Set(fileErrorIssues.map(issueRowKey)).size,
      warningCount: fileIssues.length - fileErrorIssues.length,
      duplicateIdCount: fileRows.filter((row) =>
        duplicateRowKeys.has(rowKey(row)),
      ).length,
      existingConflictCount: fileRows.filter(
        (row) => Boolean(row.id) && existingIds.has(row.id),
      ).length,
      unknownHeaders: metadata.unknownHeaders,
      readError: metadata.readError,
    };
  });

  return {
    totalFiles: inputs.length,
    readableFiles: files.filter((file) => !file.readError).length,
    files,
    totalRows: rows.length,
    validCards: rows.flatMap((row) => (row.card ? [row.card] : [])),
    rows,
    issues,
    errorCount: errorIssues.length,
    errorRowCount: new Set(errorIssues.map(issueRowKey)).size,
    warningCount: warningIssues.length,
    duplicateIdCount: duplicateRowKeys.size,
    existingConflictCount: rows.filter(
      (row) => Boolean(row.id) && existingIds.has(row.id),
    ).length,
    unknownHeaders,
  };
}
