import { segmentEnglishText } from "./sentenceSegmenter.ts";

export type PassageParagraph = {
  id: string;
  text: string;
  sentences: string[];
  startSentenceIndex: number;
  endSentenceIndex: number;
};

export function splitParagraphTexts(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[\t ]*\n+/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
}

export function createPassageParagraphs(
  source: string | string[],
): PassageParagraph[] {
  const paragraphTexts = (Array.isArray(source) ? source : [source]).flatMap(
    splitParagraphTexts,
  );
  let sentenceIndex = 0;
  return paragraphTexts.flatMap((text, paragraphIndex) => {
    const sentences = segmentEnglishText(text);
    if (sentences.length === 0) return [];
    const startSentenceIndex = sentenceIndex;
    sentenceIndex += sentences.length;
    return [
      {
        id: `paragraph-${paragraphIndex + 1}`,
        text,
        sentences,
        startSentenceIndex,
        endSentenceIndex: sentenceIndex - 1,
      },
    ];
  });
}

export function flattenParagraphSentences(paragraphs: PassageParagraph[]) {
  return paragraphs.flatMap((paragraph) => paragraph.sentences);
}

export function getParagraphIndexForSentence(
  paragraphs: PassageParagraph[],
  sentenceIndex: number,
) {
  const paragraphIndex = paragraphs.findIndex(
    (paragraph) =>
      sentenceIndex >= paragraph.startSentenceIndex &&
      sentenceIndex <= paragraph.endSentenceIndex,
  );
  return paragraphIndex >= 0 ? paragraphIndex : 0;
}

export function getParagraphRangeForSentence(
  paragraphs: PassageParagraph[],
  sentenceIndex: number,
) {
  const paragraph = paragraphs[getParagraphIndexForSentence(paragraphs, sentenceIndex)];
  return paragraph
    ? {
        startSentenceIndex: paragraph.startSentenceIndex,
        endSentenceIndex: paragraph.endSentenceIndex,
      }
    : { startSentenceIndex: 0, endSentenceIndex: 0 };
}
