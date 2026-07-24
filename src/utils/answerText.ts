export type AnswerDisplayRow =
  | { kind: "line"; number: number; text: string }
  | { kind: "paragraph-break" };

/**
 * Canonicalizes answer line endings while preserving authored line breaks.
 *
 * A single LF remains a line break. Two or more consecutive line breaks,
 * including blank lines that contain only spaces or tabs, become exactly one
 * paragraph break (`\n\n`). Existing leading/trailing trim policy is retained.
 */
export function normalizeAnswerLineBreaks(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)*/g, "\n\n")
    .trim();
}

export function joinAnswerLines(lines: readonly string[]): string {
  return normalizeAnswerLineBreaks(lines.join("\n"));
}

/**
 * Converts canonical answer text to the existing `back: string[]` schema.
 * Paragraph separators stay as a leading LF on the next non-empty entry so the
 * array does not gain empty pseudo-sentences, the first entry remains the
 * dedicated first line, and joining with LF is lossless.
 */
export function splitAnswerText(text: string): string[] {
  const normalized = normalizeAnswerLineBreaks(text);
  if (!normalized) return [];

  const answerLines: string[] = [];
  let pendingParagraphBreak = false;

  for (const line of normalized.split("\n")) {
    if (line === "") {
      pendingParagraphBreak = answerLines.length > 0;
      continue;
    }

    if (pendingParagraphBreak && answerLines.length > 0) {
      answerLines.push(`\n${line}`);
    } else {
      answerLines.push(line);
    }
    pendingParagraphBreak = false;
  }

  return answerLines;
}

export function normalizeAnswerLines(lines: readonly string[]): string[] {
  return splitAnswerText(lines.join("\n"));
}

export function createAnswerDisplayRows(text: string): AnswerDisplayRow[] {
  let lineNumber = 0;
  return normalizeAnswerLineBreaks(text)
    .split("\n")
    .map((line): AnswerDisplayRow => {
      if (line === "") return { kind: "paragraph-break" };
      lineNumber += 1;
      return { kind: "line", number: lineNumber, text: line };
    });
}
