import { useCallback, useEffect, useRef, useState } from "react";
import type { TtsRate } from "../utils/ttsSettings";
import {
  chooseEnglishVoice,
  isEnglishVoice,
  requestEnglishVoice,
  type EnglishVoiceRequest,
} from "../utils/englishVoice";

export { chooseEnglishVoice } from "../utils/englishVoice";

export type SpeechTarget =
  | "question"
  | "firstLine"
  | "modelAnswer"
  | "myAnswer"
  | "myFirstLine";
type SpeechSource = "manual" | "autoplay";

type SpeechRequest = {
  id: number;
  text: string;
  target: SpeechTarget;
  source: SpeechSource;
};

type SpeechDiagnosticContext = () => Record<string, unknown>;

export function useSpeechSynthesis(
  rate: TtsRate,
  getDiagnosticContext?: SpeechDiagnosticContext,
) {
  const isSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  const [activeTarget, setActiveTarget] = useState<SpeechTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rateRef = useRef(rate);
  const requestIdRef = useRef(0);
  const voiceRequestRef = useRef<EnglishVoiceRequest | null>(null);
  const diagnosticContextRef = useRef(getDiagnosticContext);

  rateRef.current = rate;
  diagnosticContextRef.current = getDiagnosticContext;

  const cancelVoiceRequest = useCallback(() => {
    voiceRequestRef.current?.cancel();
    voiceRequestRef.current = null;
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    cancelVoiceRequest();
    if (isSupported) window.speechSynthesis.cancel();
    setActiveTarget(null);
  }, [cancelVoiceRequest, isSupported]);
  const clearMessage = useCallback(() => setMessage(null), []);

  const playWithCurrentVoice = useCallback(
    (request: SpeechRequest, resolvedVoice: SpeechSynthesisVoice) => {
      if (!isSupported || request.id !== requestIdRef.current) return false;

      // Never retain a SpeechSynthesisVoice object across playback requests.
      // Resolve the object from the browser's current list immediately before
      // constructing the utterance.
      const currentVoices = window.speechSynthesis.getVoices();
      const voice = chooseEnglishVoice(currentVoices);
      if (!voice || !isEnglishVoice(voice)) {
        if (import.meta.env.DEV) {
          console.debug("[OPIc TTS] voice became unavailable before playback", {
            requestId: request.id,
            totalVoiceCount: currentVoices.length,
            englishVoiceCount: currentVoices.filter(isEnglishVoice).length,
            resolvedVoiceURI: resolvedVoice.voiceURI,
            ...diagnosticContextRef.current?.(),
          });
        }
        return false;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(request.text);
        utterance.voice = voice;
        utterance.lang = "en-US";
        utterance.rate = rateRef.current;
        utterance.pitch = 1;
        utterance.volume = 1;

        if (!isEnglishVoice(utterance.voice)) return false;

        if (import.meta.env.DEV) {
          console.debug("[OPIc TTS] playback ready", {
            requestId: request.id,
            totalVoiceCount: currentVoices.length,
            englishVoiceCount: currentVoices.filter(isEnglishVoice).length,
            voice: {
              name: voice.name,
              lang: voice.lang,
              voiceURI: voice.voiceURI,
            },
            utteranceLang: utterance.lang,
            target: request.target,
            source: request.source,
            ...diagnosticContextRef.current?.(),
          });
        }

        utterance.onstart = () => {
          if (request.id === requestIdRef.current) {
            setMessage(null);
            setActiveTarget(request.target);
          }
        };
        utterance.onend = () => {
          if (request.id === requestIdRef.current) setActiveTarget(null);
        };
        utterance.onerror = (event) => {
          if (request.id !== requestIdRef.current) return;
          setActiveTarget(null);
          if (event.error === "canceled" || event.error === "interrupted") return;

          const wasBlocked =
            event.error === "not-allowed" || event.error === "audio-busy";
          setMessage(
            request.source === "autoplay" && wasBlocked
              ? "자동재생을 시작할 수 없었습니다. 문제 듣기 버튼을 한 번 눌러 주세요."
              : "음성을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
        };

        setMessage(null);
        setActiveTarget(request.target);
        window.speechSynthesis.speak(utterance);
        return true;
      } catch {
        setActiveTarget(null);
        setMessage("음성을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
    },
    [isSupported],
  );

  const speak = useCallback(
    (text: string, target: SpeechTarget, source: SpeechSource = "manual") => {
      if (!isSupported || !text.trim()) return false;

      requestIdRef.current += 1;
      const request: SpeechRequest = {
        id: requestIdRef.current,
        text: text.trim(),
        target,
        source,
      };

      window.speechSynthesis.cancel();
      cancelVoiceRequest();
      setActiveTarget(null);
      setMessage(null);

      if (import.meta.env.DEV) {
        console.debug("[OPIc TTS] playback requested", {
          requestId: request.id,
          target,
          source,
          ...diagnosticContextRef.current?.(),
        });
      }

      const voiceRequest = requestEnglishVoice(window.speechSynthesis, {
        onAttempt: (attempt) => {
          if (import.meta.env.DEV) {
            console.debug("[OPIc TTS] voice lookup", {
              requestId: request.id,
              trigger: attempt.trigger,
              attempt: attempt.attempt,
              totalVoiceCount: attempt.totalVoiceCount,
              englishVoiceCount: attempt.englishVoiceCount,
              voicesChanged: attempt.voicesChanged,
              selectedVoice: attempt.selectedVoice
                ? {
                    name: attempt.selectedVoice.name,
                    lang: attempt.selectedVoice.lang,
                    voiceURI: attempt.selectedVoice.voiceURI,
                  }
                : null,
              elapsedMs: attempt.elapsedMs,
              ...diagnosticContextRef.current?.(),
            });
          }
          if (!attempt.selectedVoice && request.id === requestIdRef.current) {
            setMessage("영어 음성을 준비 중입니다.");
          }
        },
      });
      voiceRequestRef.current = voiceRequest;
      void voiceRequest.promise.then((result) => {
        if (
          result.cancelled ||
          request.id !== requestIdRef.current ||
          voiceRequestRef.current !== voiceRequest
        ) {
          return;
        }
        voiceRequestRef.current = null;
        if (!result.voice) {
          setActiveTarget(null);
          setMessage(
            "이 실행 환경에서는 영어 음성을 사용할 수 없어요. Chrome이나 Edge에서 다시 열어 주세요.",
          );
          return;
        }
        if (!playWithCurrentVoice(request, result.voice)) {
          setActiveTarget(null);
          setMessage(
            "이 실행 환경에서는 영어 음성을 사용할 수 없어요. Chrome이나 Edge에서 다시 열어 주세요.",
          );
        }
      });
      return true;
    },
    [cancelVoiceRequest, isSupported, playWithCurrentVoice],
  );

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      cancelVoiceRequest();
      if (isSupported) window.speechSynthesis.cancel();
    },
    [cancelVoiceRequest, isSupported],
  );

  return {
    isSupported,
    activeTarget,
    message,
    speak,
    stop,
    clearMessage,
  };
}
