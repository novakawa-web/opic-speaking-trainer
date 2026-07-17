import type { OpicCard } from "../types.ts";
import type { SavedPassage } from "./savedPassageStorage.ts";
import { segmentEnglishText } from "./sentenceSegmenter.ts";

export const MAX_DIRECT_PRACTICE_LENGTH = 20_000;

export type PlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "resting"
  | "paused"
  | "completed"
  | "error";

export type ShadowingSourceType =
  | "modelAnswer"
  | "myAnswer"
  | "custom"
  | "savedPassage";

export type ShadowingSource = {
  sourceType: ShadowingSourceType;
  sourceTitle: string;
  sourceText: string;
  cardId?: string;
  savedPassageId?: string;
  paragraphTexts?: string[];
};

export type ShadowingPlayerState = {
  sentences: string[];
  currentIndex: number;
  status: PlayerStatus;
  sourceType: ShadowingSourceType;
  sourceTitle: string;
  sourceText: string;
  errorMessage: string | null;
};

export function createModelAnswerSource(card: OpicCard): ShadowingSource {
  const sourceText = card.back.join("\n");
  return {
    sourceType: "modelAnswer",
    sourceTitle: `${card.hint.title} · 기본 답변`,
    sourceText,
    cardId: card.id,
    paragraphTexts: [sourceText],
  };
}

export function createMyAnswerSource(
  card: OpicCard,
  myAnswer: string,
): ShadowingSource {
  return {
    sourceType: "myAnswer",
    sourceTitle: `${card.hint.title} · 나만의 답변`,
    sourceText: myAnswer.trim(),
    cardId: card.id,
  };
}

export function createCustomTextSource(title: string, text: string): ShadowingSource {
  return {
    sourceType: "custom",
    sourceTitle: title.trim() || "직접 지문",
    sourceText: text.trim(),
  };
}

export function createSavedPassageSource(
  passage: SavedPassage,
): ShadowingSource {
  return {
    sourceType: "savedPassage",
    sourceTitle: passage.title,
    sourceText: passage.text,
    savedPassageId: passage.id,
  };
}

export function createShadowingPlayerState(
  source: ShadowingSource,
): ShadowingPlayerState {
  const sentences = segmentEnglishText(source.sourceText);
  return {
    ...source,
    sentences,
    currentIndex: 0,
    status: sentences.length > 0 ? "idle" : "error",
    errorMessage: sentences.length > 0 ? null : "재생할 영어 문장을 찾지 못했습니다.",
  };
}

export function clampSentenceIndex(index: number, sentenceCount: number) {
  if (sentenceCount <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), sentenceCount - 1);
}

export function getPreviousSentenceIndex(index: number, sentenceCount: number) {
  return clampSentenceIndex(index - 1, sentenceCount);
}

export function getNextSentenceIndex(index: number, sentenceCount: number) {
  return clampSentenceIndex(index + 1, sentenceCount);
}

export function isValidDirectPracticeText(text: string) {
  const trimmed = text.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_DIRECT_PRACTICE_LENGTH &&
    segmentEnglishText(trimmed).length > 0
  );
}

export function supportsScreenWakeLock(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "wakeLock" in value &&
      (value as { wakeLock?: { request?: unknown } }).wakeLock &&
      typeof (value as { wakeLock: { request?: unknown } }).wakeLock.request === "function",
  );
}

export function getStatusAfterBackground(status: PlayerStatus): PlayerStatus {
  return status === "playing" || status === "loading" || status === "resting"
    ? "paused"
    : status;
}
