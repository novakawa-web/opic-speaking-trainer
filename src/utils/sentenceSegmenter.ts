const PROTECTED_DOT = "\uE000";

const ABBREVIATIONS = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Sr.",
  "Jr.",
  "St.",
  "etc.",
  "e.g.",
  "i.e.",
];

function protectFallbackDots(text: string) {
  let protectedText = text.replace(/(\d)\.(\d)/g, `$1${PROTECTED_DOT}$2`);

  for (const abbreviation of ABBREVIATIONS) {
    const escaped = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    protectedText = protectedText.replace(
      new RegExp(`\\b${escaped}`, "gi"),
      (match) => match.replaceAll(".", PROTECTED_DOT),
    );
  }

  return protectedText;
}

export function fallbackSegmentEnglishText(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sentences: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const protectedLine = protectFallbackDots(line);
    const matches = protectedLine.match(/[^.!?]+(?:[.!?]+["'”’)]*)?|[^.!?]+$/g);

    for (const match of matches ?? []) {
      const sentence = match.replaceAll(PROTECTED_DOT, ".").trim();
      if (sentence) sentences.push(sentence);
    }
  }

  return sentences;
}

export function segmentEnglishText(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
      const sentences: string[] = [];

      for (const rawLine of normalized.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        for (const part of segmenter.segment(line)) {
          const sentence = part.segment.trim();
          if (sentence) sentences.push(sentence);
        }
      }

      if (sentences.length > 0) return sentences;
    } catch {
      // Older browsers can expose Intl.Segmenter without supporting every locale.
    }
  }

  return fallbackSegmentEnglishText(normalized);
}

export function splitSpeechChunks(text: string, maxLength = 420) {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength + 1);
    const breakAt = Math.max(
      candidate.lastIndexOf(", "),
      candidate.lastIndexOf("; "),
      candidate.lastIndexOf(": "),
      candidate.lastIndexOf(" "),
    );
    const safeBreak = breakAt >= Math.floor(maxLength * 0.55) ? breakAt + 1 : maxLength;
    chunks.push(remaining.slice(0, safeBreak).trim());
    remaining = remaining.slice(safeBreak).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
