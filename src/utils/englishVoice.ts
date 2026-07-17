export const ENGLISH_VOICE_RETRY_DELAYS_MS = [100, 300, 700, 1500] as const;

type SpeechSynthesisVoiceSource = Pick<
  SpeechSynthesis,
  "getVoices" | "addEventListener" | "removeEventListener"
>;

export type EnglishVoiceAttempt = {
  trigger: "initial" | "retry" | "voiceschanged" | "final";
  attempt: number;
  totalVoiceCount: number;
  englishVoiceCount: number;
  selectedVoice: SpeechSynthesisVoice | null;
  voicesChanged: boolean;
  elapsedMs: number;
};

export type EnglishVoiceResolution = {
  voice: SpeechSynthesisVoice | null;
  cancelled: boolean;
  attempts: number;
  voicesChanged: boolean;
  elapsedMs: number;
};

export type EnglishVoiceRequest = {
  promise: Promise<EnglishVoiceResolution>;
  cancel: () => void;
};

export function isEnglishVoice(voice: Pick<SpeechSynthesisVoice, "lang">) {
  return voice.lang.toLowerCase().startsWith("en");
}

export function chooseEnglishVoice(voices: SpeechSynthesisVoice[]) {
  const language = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase();

  return (
    voices.find((voice) => language(voice).startsWith("en-us")) ??
    voices.find((voice) => language(voice).startsWith("en-gb")) ??
    voices.find((voice) => language(voice).startsWith("en")) ??
    null
  );
}

export function isVoiceStillAvailable(
  voice: Pick<SpeechSynthesisVoice, "voiceURI" | "name" | "lang">,
  voices: SpeechSynthesisVoice[],
) {
  return voices.some(
    (candidate) =>
      isEnglishVoice(candidate) &&
      (candidate.voiceURI === voice.voiceURI ||
        (candidate.name === voice.name && candidate.lang === voice.lang)),
  );
}

/**
 * Resolves a fresh SpeechSynthesisVoice from the browser's current list.
 * A non-empty list without an English voice is treated as transient too: some
 * mobile/desktop engines rebuild their voice list after microphone activity.
 */
export function requestEnglishVoice(
  synthesis: SpeechSynthesisVoiceSource,
  options: {
    retryDelaysMs?: readonly number[];
    onAttempt?: (attempt: EnglishVoiceAttempt) => void;
  } = {},
): EnglishVoiceRequest {
  const retryDelaysMs =
    options.retryDelaysMs ?? ENGLISH_VOICE_RETRY_DELAYS_MS;
  const startedAt = Date.now();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  let settled = false;
  let attempts = 0;
  let voicesChanged = false;
  let settlePromise: (result: EnglishVoiceResolution) => void = () => undefined;

  const cleanup = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
    synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
  };

  const finish = (
    voice: SpeechSynthesisVoice | null,
    cancelled: boolean,
  ) => {
    if (settled) return;
    settled = true;
    cleanup();
    settlePromise({
      voice,
      cancelled,
      attempts,
      voicesChanged,
      elapsedMs: Date.now() - startedAt,
    });
  };

  const inspect = (
    trigger: EnglishVoiceAttempt["trigger"],
    isFinal = false,
  ) => {
    if (settled) return;
    attempts += 1;
    const voices = synthesis.getVoices();
    const englishVoices = voices.filter(isEnglishVoice);
    const selectedVoice = chooseEnglishVoice(voices);
    options.onAttempt?.({
      trigger,
      attempt: attempts,
      totalVoiceCount: voices.length,
      englishVoiceCount: englishVoices.length,
      selectedVoice,
      voicesChanged,
      elapsedMs: Date.now() - startedAt,
    });
    if (selectedVoice) finish(selectedVoice, false);
    else if (isFinal) finish(null, false);
  };

  function handleVoicesChanged() {
    voicesChanged = true;
    inspect("voiceschanged");
  }

  const promise = new Promise<EnglishVoiceResolution>((resolve) => {
    settlePromise = resolve;
    synthesis.addEventListener("voiceschanged", handleVoicesChanged);
    inspect("initial");
    if (settled) return;
    retryDelaysMs.forEach((delay, index) => {
      const isFinal = index === retryDelaysMs.length - 1;
      timers.push(
        setTimeout(
          () => inspect(isFinal ? "final" : "retry", isFinal),
          delay,
        ),
      );
    });
  });

  return {
    promise,
    cancel: () => finish(null, true),
  };
}
