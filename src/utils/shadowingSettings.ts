import type { TtsRate } from "./ttsSettings.ts";

export type RepeatMode = "full" | "paragraph" | "sentence";
export type RepeatCount = 1 | 3 | 5 | 10 | "infinite";
export type RestLevel = "none" | "short" | "medium" | "long" | "extraLong";

export const SHADOWING_REPEAT_MODE_KEY = "opic-shadowing-repeat-mode";
export const SHADOWING_REPEAT_COUNT_KEY = "opic-shadowing-repeat-count";
export const SHADOWING_REST_LEVEL_KEY = "opic-shadowing-rest-level";

export const REPEAT_MODE_OPTIONS: ReadonlyArray<{
  value: RepeatMode;
  label: string;
}> = [
  { value: "full", label: "전체" },
  { value: "paragraph", label: "문단" },
  { value: "sentence", label: "문장" },
];

export const REPEAT_COUNT_OPTIONS: ReadonlyArray<{
  value: RepeatCount;
  label: string;
}> = [
  { value: 1, label: "1회" },
  { value: 3, label: "3회" },
  { value: 5, label: "5회" },
  { value: 10, label: "10회" },
  { value: "infinite", label: "무한" },
];

export const REST_LEVEL_OPTIONS: ReadonlyArray<{
  value: RestLevel;
  label: string;
  description: string;
  ratio: number;
}> = [
  {
    value: "none",
    label: "듣기만",
    description: "휴식 없이 바로 다음 재생",
    ratio: 0,
  },
  {
    value: "short",
    label: "짧게",
    description: "실제 문장 재생 시간의 0.5배",
    ratio: 0.5,
  },
  {
    value: "medium",
    label: "보통",
    description: "실제 문장 재생 시간의 0.8배",
    ratio: 0.8,
  },
  {
    value: "long",
    label: "길게",
    description: "실제 문장 재생 시간과 동일",
    ratio: 1,
  },
  {
    value: "extraLong",
    label: "아주 길게",
    description: "실제 문장 재생 시간의 1.5배",
    ratio: 1.5,
  },
];

export type ShadowingPlaybackSettings = {
  repeatMode: RepeatMode;
  repeatCount: RepeatCount;
  restLevel: RestLevel;
};

export const DEFAULT_SHADOWING_PLAYBACK_SETTINGS: ShadowingPlaybackSettings = {
  repeatMode: "full",
  repeatCount: 1,
  restLevel: "none",
};

const repeatCounts = new Set<RepeatCount>([1, 3, 5, 10, "infinite"]);
const restLevels = new Set<RestLevel>([
  "none",
  "short",
  "medium",
  "long",
  "extraLong",
]);

export function isRepeatMode(value: unknown): value is RepeatMode {
  return value === "full" || value === "paragraph" || value === "sentence";
}

export function isRepeatCount(value: unknown): value is RepeatCount {
  return repeatCounts.has(value as RepeatCount);
}

export function isRestLevel(value: unknown): value is RestLevel {
  return restLevels.has(value as RestLevel);
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Playback continues with the in-memory setting when storage is unavailable.
  }
}

export function parseRepeatCount(value: unknown): RepeatCount | null {
  if (value === "infinite") return "infinite";
  const numeric = typeof value === "number" ? value : Number(value);
  return repeatCounts.has(numeric as RepeatCount) ? (numeric as RepeatCount) : null;
}

export function readShadowingPlaybackSettings(): ShadowingPlaybackSettings {
  const repeatMode = readStorage(SHADOWING_REPEAT_MODE_KEY);
  const repeatCount = parseRepeatCount(readStorage(SHADOWING_REPEAT_COUNT_KEY));
  const restLevel = readStorage(SHADOWING_REST_LEVEL_KEY);
  return {
    repeatMode: isRepeatMode(repeatMode) ? repeatMode : "full",
    repeatCount: repeatCount ?? DEFAULT_SHADOWING_PLAYBACK_SETTINGS.repeatCount,
    restLevel: restLevels.has(restLevel as RestLevel)
      ? (restLevel as RestLevel)
      : DEFAULT_SHADOWING_PLAYBACK_SETTINGS.restLevel,
  };
}

export function saveShadowingPlaybackSettings(settings: ShadowingPlaybackSettings) {
  writeStorage(SHADOWING_REPEAT_MODE_KEY, settings.repeatMode);
  writeStorage(SHADOWING_REPEAT_COUNT_KEY, String(settings.repeatCount));
  writeStorage(SHADOWING_REST_LEVEL_KEY, settings.restLevel);
}

export function estimateSentenceDurationMs(text: string, rate: TtsRate) {
  const wordCount = Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
  const wordsPerMinute = 155 * rate;
  return Math.max(600, (wordCount / wordsPerMinute) * 60_000);
}

export function calculateDynamicRestMs(
  actualPlaybackMs: number,
  text: string,
  rate: TtsRate,
  restLevel: RestLevel,
) {
  const option = REST_LEVEL_OPTIONS.find((item) => item.value === restLevel);
  const ratio = option?.ratio ?? 0;
  if (ratio === 0) return 0;
  const baseDuration =
    Number.isFinite(actualPlaybackMs) && actualPlaybackMs >= 250
      ? actualPlaybackMs
      : estimateSentenceDurationMs(text, rate);
  return Math.round(Math.min(30_000, Math.max(300, baseDuration * ratio)));
}

export type RepeatStep = {
  completed: boolean;
  completedRepeats: number;
  nextIndex: number;
};

export function getNextRepeatStep(
  repeatMode: RepeatMode,
  repeatCount: RepeatCount,
  currentIndex: number,
  sentenceCount: number,
  completedRepeats: number,
  paragraphRange?: {
    startSentenceIndex: number;
    endSentenceIndex: number;
  },
): RepeatStep {
  if (sentenceCount <= 0) {
    return { completed: true, completedRepeats, nextIndex: 0 };
  }

  const rangeStart =
    repeatMode === "paragraph"
      ? Math.min(
          Math.max(paragraphRange?.startSentenceIndex ?? currentIndex, 0),
          sentenceCount - 1,
        )
      : repeatMode === "sentence"
        ? currentIndex
        : 0;
  const rangeEnd =
    repeatMode === "paragraph"
      ? Math.min(
          Math.max(paragraphRange?.endSentenceIndex ?? currentIndex, rangeStart),
          sentenceCount - 1,
        )
      : repeatMode === "sentence"
        ? currentIndex
        : sentenceCount - 1;

  if (currentIndex < rangeEnd) {
    return {
      completed: false,
      completedRepeats,
      nextIndex: currentIndex + 1,
    };
  }

  const nextCompletedRepeats = completedRepeats + 1;
  const completed =
    repeatCount !== "infinite" && nextCompletedRepeats >= repeatCount;
  return {
    completed,
    completedRepeats: nextCompletedRepeats,
    nextIndex: rangeStart,
  };
}

export function formatRepeatProgress(
  repeatMode: RepeatMode,
  repeatCount: RepeatCount,
  completedRepeats: number,
  status: "idle" | "active" | "completed",
) {
  const unit =
    repeatMode === "full" ? "전체" : repeatMode === "paragraph" ? "문단" : "문장";
  const current =
    status === "completed" && repeatCount !== "infinite"
      ? repeatCount
      : completedRepeats + 1;
  return repeatCount === "infinite"
    ? `${unit} 반복 ${current}회째 · 무한`
    : `${unit} 반복 ${Math.min(current, repeatCount)} / ${repeatCount}회`;
}
