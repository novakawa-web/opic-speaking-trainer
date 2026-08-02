import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseEnglishVoice,
  isEnglishVoice,
  requestEnglishVoice,
  type EnglishVoiceRequest,
} from "../utils/englishVoice";
import { splitSpeechChunks } from "../utils/sentenceSegmenter";
import {
  createAnswerLearningPlaybackState,
  finishAnswerLearningSentence,
  isAnswerLearningPlaybackActive,
  pauseAnswerLearningPlayback,
  resumeAnswerLearningPlayback,
  startAnswerLearningSentencePlayback,
  startFullAnswerPlayback,
  type AnswerLearningPlaybackMode,
  type AnswerLearningPlaybackState,
} from "../utils/answerLearningPlayback";
import type { TtsRate } from "../utils/ttsSettings";

type BeforePlayback = () => void;

export function useAnswerLearningSpeech(
  sentences: string[],
  rate: TtsRate,
  onBeforePlayback?: BeforePlayback,
) {
  const isSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  const [playback, setPlaybackState] = useState<AnswerLearningPlaybackState>(
    createAnswerLearningPlaybackState,
  );
  const [message, setMessage] = useState<string | null>(null);
  const playbackRef = useRef(playback);
  const sentencesRef = useRef(sentences);
  const rateRef = useRef(rate);
  const beforePlaybackRef = useRef(onBeforePlayback);
  const requestIdRef = useRef(0);
  const voiceRequestRef = useRef<EnglishVoiceRequest | null>(null);
  const playSentenceRef = useRef<
    (index: number, mode: AnswerLearningPlaybackMode) => void
  >(() => undefined);

  playbackRef.current = playback;
  sentencesRef.current = sentences;
  rateRef.current = rate;
  beforePlaybackRef.current = onBeforePlayback;

  const setPlayback = useCallback((next: AnswerLearningPlaybackState) => {
    playbackRef.current = next;
    setPlaybackState(next);
  }, []);

  const cancelSpeech = useCallback(() => {
    requestIdRef.current += 1;
    voiceRequestRef.current?.cancel();
    voiceRequestRef.current = null;
    if (isSupported) window.speechSynthesis.cancel();
  }, [isSupported]);

  const stop = useCallback(() => {
    cancelSpeech();
    setPlayback(createAnswerLearningPlaybackState());
    setMessage(null);
  }, [cancelSpeech, setPlayback]);

  const playWithVoice = useCallback(
    (
      index: number,
      mode: AnswerLearningPlaybackMode,
      chunks: string[],
      chunkIndex: number,
      requestId: number,
    ) => {
      if (!isSupported || requestId !== requestIdRef.current) return;
      const currentVoices = window.speechSynthesis.getVoices();
      const voice = chooseEnglishVoice(currentVoices);
      if (!voice || !isEnglishVoice(voice)) {
        setPlayback({ status: "error", mode, currentIndex: index });
        setMessage(
          "이 실행 환경에서는 영어 음성을 사용할 수 없어요. Chrome이나 Edge에서 다시 열어 주세요.",
        );
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.voice = voice;
      utterance.lang = "en-US";
      utterance.rate = rateRef.current;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => {
        if (requestId !== requestIdRef.current) return;
        setPlayback({ status: "playing", mode, currentIndex: index });
        setMessage(null);
      };
      utterance.onend = () => {
        if (requestId !== requestIdRef.current) return;
        if (chunkIndex + 1 < chunks.length) {
          playWithVoice(index, mode, chunks, chunkIndex + 1, requestId);
          return;
        }
        const next = finishAnswerLearningSentence(
          { status: "playing", mode, currentIndex: index },
          sentencesRef.current.length,
        );
        if (next.status === "loading") {
          playSentenceRef.current(next.currentIndex, next.mode);
          return;
        }
        setPlayback(next);
      };
      utterance.onerror = (event) => {
        if (requestId !== requestIdRef.current) return;
        if (event.error === "canceled" || event.error === "interrupted") return;
        setPlayback({ status: "error", mode, currentIndex: index });
        setMessage("음성을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        setPlayback({ status: "error", mode, currentIndex: index });
        setMessage("음성을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    },
    [isSupported, setPlayback],
  );

  const playSentence = useCallback(
    (index: number, mode: AnswerLearningPlaybackMode) => {
      const sentence = sentencesRef.current[index];
      if (!isSupported || !sentence) {
        setPlayback({ status: "error", mode, currentIndex: index });
        setMessage(
          isSupported
            ? "재생할 영어 문장이 없습니다."
            : "이 브라우저는 음성 재생을 지원하지 않습니다.",
        );
        return;
      }
      const chunks = splitSpeechChunks(sentence);
      if (chunks.length === 0) return;

      cancelSpeech();
      beforePlaybackRef.current?.();
      const requestId = requestIdRef.current;
      setPlayback({ status: "loading", mode, currentIndex: index });
      setMessage("영어 음성을 준비 중입니다.");

      const voiceRequest = requestEnglishVoice(window.speechSynthesis);
      voiceRequestRef.current = voiceRequest;
      void voiceRequest.promise.then((result) => {
        if (
          result.cancelled ||
          requestId !== requestIdRef.current ||
          voiceRequestRef.current !== voiceRequest
        ) {
          return;
        }
        voiceRequestRef.current = null;
        if (!result.voice) {
          setPlayback({ status: "error", mode, currentIndex: index });
          setMessage(
            "이 실행 환경에서는 영어 음성을 사용할 수 없어요. Chrome이나 Edge에서 다시 열어 주세요.",
          );
          return;
        }
        playWithVoice(index, mode, chunks, 0, requestId);
      });
    },
    [cancelSpeech, isSupported, playWithVoice, setPlayback],
  );

  playSentenceRef.current = playSentence;

  const playAll = useCallback(() => {
    const next = startFullAnswerPlayback(sentencesRef.current.length);
    if (next.status === "idle") return;
    playSentence(next.currentIndex, next.mode);
  }, [playSentence]);

  const playFromSentence = useCallback(
    (index: number) => {
      const next = startAnswerLearningSentencePlayback(
        playbackRef.current,
        index,
        sentencesRef.current.length,
      );
      if (next.status === "idle") return;
      playSentence(next.currentIndex, next.mode);
    },
    [playSentence],
  );

  const pause = useCallback(() => {
    const next = pauseAnswerLearningPlayback(playbackRef.current);
    if (next === playbackRef.current) return;
    cancelSpeech();
    setPlayback(next);
    setMessage(`${next.currentIndex + 1}번째 문장부터 이어 들을 수 있습니다.`);
  }, [cancelSpeech, setPlayback]);

  const resume = useCallback(() => {
    const next = resumeAnswerLearningPlayback(playbackRef.current);
    if (next === playbackRef.current) return;
    playSentence(next.currentIndex, next.mode);
  }, [playSentence]);

  useEffect(() => {
    stop();
  }, [sentences, stop]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pause]);

  useEffect(() => () => cancelSpeech(), [cancelSpeech]);

  return {
    isSupported,
    playback,
    message,
    isActive: isAnswerLearningPlaybackActive(playback.status),
    playAll,
    playFromSentence,
    pause,
    resume,
    stop,
  };
}
