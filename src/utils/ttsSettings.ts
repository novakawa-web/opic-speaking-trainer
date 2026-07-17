export const QUESTION_TTS_AUTOPLAY_STORAGE_KEY =
  "opic-question-tts-autoplay";
export const TTS_RATE_STORAGE_KEY = "opic-tts-rate";

export const TTS_RATE_OPTIONS = [
  { label: "아주 느리게", value: 0.7 },
  { label: "느리게", value: 0.85 },
  { label: "보통", value: 1 },
  { label: "조금 빠르게", value: 1.15 },
  { label: "빠르게", value: 1.3 },
] as const;

export type TtsRate = (typeof TTS_RATE_OPTIONS)[number]["value"];

export function readQuestionTtsAutoplay() {
  try {
    return localStorage.getItem(QUESTION_TTS_AUTOPLAY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveQuestionTtsAutoplay(enabled: boolean) {
  try {
    localStorage.setItem(QUESTION_TTS_AUTOPLAY_STORAGE_KEY, String(enabled));
  } catch {
    // The setting still works for the current session when storage is unavailable.
  }
}

export function isTtsRate(value: number): value is TtsRate {
  return TTS_RATE_OPTIONS.some((option) => option.value === value);
}

export function readTtsRate(): TtsRate {
  try {
    const parsed = Number(localStorage.getItem(TTS_RATE_STORAGE_KEY));
    return isTtsRate(parsed) ? parsed : 1;
  } catch {
    return 1;
  }
}

export function saveTtsRate(rate: TtsRate) {
  try {
    localStorage.setItem(TTS_RATE_STORAGE_KEY, String(rate));
  } catch {
    // The setting still works for the current session when storage is unavailable.
  }
}

export function stripQuestionPrefix(question: string) {
  return question.replace(/^\s*Q\s*[.:：-]?\s*/i, "").trim();
}
