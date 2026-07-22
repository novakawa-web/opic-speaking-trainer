import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseEnglishVoice,
  isEnglishVoice,
  requestEnglishVoice,
  type EnglishVoiceRequest,
} from "../utils/englishVoice";
import { splitSpeechChunks } from "../utils/sentenceSegmenter";
import {
  getParagraphRangeForSentence,
  type PassageParagraph,
} from "../utils/passageParagraphs";
import {
  clampSentenceIndex,
  createSentenceSelectionPlaybackState,
  getNextSentenceIndex,
  getPreviousSentenceIndex,
  getStatusAfterBackground,
  supportsScreenWakeLock,
  type PlayerStatus,
} from "../utils/shadowingPlayer";
import {
  calculateDynamicRestMs,
  DEFAULT_SHADOWING_PLAYBACK_SETTINGS,
  getNextRepeatStep,
  type ShadowingPlaybackSettings,
} from "../utils/shadowingSettings";
import type { TtsRate } from "../utils/ttsSettings";

export function useShadowingPlayer(
  sentences: string[],
  rate: TtsRate,
  initialIndex = 0,
  initialStatus: PlayerStatus = "idle",
  initialCompletedRepeats = 0,
  playbackSettings: ShadowingPlaybackSettings =
    DEFAULT_SHADOWING_PLAYBACK_SETTINGS,
  paragraphs: PassageParagraph[] = [],
  recorderStatus = "idle",
) {
  const initialSafeIndex = clampSentenceIndex(initialIndex, sentences.length);
  const isSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  const [currentIndex, setCurrentIndexState] = useState(initialSafeIndex);
  const [status, setStatusState] = useState<PlayerStatus>(initialStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [completedRepeats, setCompletedRepeatsState] = useState(initialCompletedRepeats);
  const [currentRestMs, setCurrentRestMs] = useState(0);
  const currentIndexRef = useRef(initialSafeIndex);
  const statusRef = useRef<PlayerStatus>(initialStatus);
  const completedRepeatsRef = useRef(initialCompletedRepeats);
  const rateRef = useRef(rate);
  const sentencesRef = useRef(sentences);
  const settingsRef = useRef(playbackSettings);
  const paragraphsRef = useRef(paragraphs);
  const previousSettingsRef = useRef(playbackSettings);
  const requestIdRef = useRef(0);
  const voiceRequestRef = useRef<EnglishVoiceRequest | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const sentenceStartedAtRef = useRef<number | null>(null);
  const playSentenceRef = useRef<(index: number) => void>(() => undefined);
  const finishSentenceRef = useRef<
    (index: number, requestId: number, actualPlaybackMs: number) => void
  >(() => undefined);
  const backgroundInterruptedRef = useRef(false);
  const recorderStatusRef = useRef(recorderStatus);
  const resumeFromSentenceStartRef = useRef(false);
  const pendingStepRef = useRef<ReturnType<typeof getNextRepeatStep> | null>(null);

  rateRef.current = rate;
  sentencesRef.current = sentences;
  settingsRef.current = playbackSettings;
  paragraphsRef.current = paragraphs;
  recorderStatusRef.current = recorderStatus;

  const setCurrentIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
    setCurrentIndexState(index);
  }, []);

  const setStatus = useCallback((nextStatus: PlayerStatus) => {
    statusRef.current = nextStatus;
    setStatusState(nextStatus);
  }, []);

  const setCompletedRepeats = useCallback((value: number) => {
    completedRepeatsRef.current = value;
    setCompletedRepeatsState(value);
  }, []);

  const clearTimers = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (restTimerRef.current !== null) {
      window.clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    requestIdRef.current += 1;
    voiceRequestRef.current?.cancel();
    voiceRequestRef.current = null;
    sentenceStartedAtRef.current = null;
    clearTimers();
    if (isSupported) window.speechSynthesis.cancel();
  }, [clearTimers, isSupported]);

  const resetProgress = useCallback(() => {
    pendingStepRef.current = null;
    setCompletedRepeats(0);
    setCurrentRestMs(0);
  }, [setCompletedRepeats]);

  const playWithVoice = useCallback(
    (
      index: number,
      chunks: string[],
      chunkIndex: number,
      voice: SpeechSynthesisVoice,
      requestId: number,
    ) => {
      if (!isSupported || requestId !== requestIdRef.current) return;
      const currentVoices = window.speechSynthesis.getVoices();
      const currentVoice = chooseEnglishVoice(currentVoices);
      if (!currentVoice || !isEnglishVoice(currentVoice)) {
        setStatus("error");
        setErrorMessage(
          "이 실행 환경에서는 영어 음성을 사용할 수 없어요. Chrome이나 Edge에서 다시 열어 주세요.",
        );
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.voice = currentVoice;
      utterance.lang = "en-US";
      utterance.rate = rateRef.current;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => {
        if (requestId !== requestIdRef.current) return;
        if (chunkIndex === 0) sentenceStartedAtRef.current = performance.now();
        setStatus("playing");
      };
      utterance.onend = () => {
        if (requestId !== requestIdRef.current) return;
        if (chunkIndex + 1 < chunks.length) {
          const nextVoices = window.speechSynthesis.getVoices();
          const nextVoice = chooseEnglishVoice(nextVoices);
          if (nextVoice) {
            playWithVoice(index, chunks, chunkIndex + 1, nextVoice, requestId);
          } else {
            setStatus("error");
            setErrorMessage(
              "영어 음성을 다시 준비하지 못했습니다. 재생 버튼을 눌러 다시 시도해 주세요.",
            );
          }
          return;
        }
        const actualPlaybackMs = sentenceStartedAtRef.current
          ? performance.now() - sentenceStartedAtRef.current
          : 0;
        sentenceStartedAtRef.current = null;
        finishSentenceRef.current(index, requestId, actualPlaybackMs);
      };
      utterance.onerror = (event) => {
        if (requestId !== requestIdRef.current) return;
        if (event.error === "canceled" || event.error === "interrupted") return;
        setStatus("error");
        setErrorMessage("음성을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      };

      try {
        if (import.meta.env.DEV) {
          console.debug("[OPIc TTS] shadowing playback ready", {
            requestId,
            playerStatus: statusRef.current,
            recorderStatus: recorderStatusRef.current,
            sentenceIndex: index,
            chunkIndex,
            totalVoiceCount: currentVoices.length,
            englishVoiceCount: currentVoices.filter(isEnglishVoice).length,
            voice: {
              name: currentVoice.name,
              lang: currentVoice.lang,
              voiceURI: currentVoice.voiceURI,
            },
            resolvedVoiceURI: voice.voiceURI,
            utteranceLang: utterance.lang,
          });
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        setStatus("error");
        setErrorMessage("음성을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    },
    [isSupported, setStatus],
  );

  const playSentence = useCallback(
    (requestedIndex: number) => {
      if (!isSupported) {
        setStatus("error");
        setErrorMessage("이 브라우저는 음성 재생을 지원하지 않습니다.");
        return;
      }
      if (sentencesRef.current.length === 0) {
        setStatus("error");
        setErrorMessage("재생할 영어 문장이 없습니다.");
        return;
      }

      const index = clampSentenceIndex(requestedIndex, sentencesRef.current.length);
      const chunks = splitSpeechChunks(sentencesRef.current[index]);
      if (chunks.length === 0) return;
      cancelSpeech();
      const requestId = requestIdRef.current;
      setCurrentRestMs(0);
      setCurrentIndex(index);
      setErrorMessage(null);
      setStatus("loading");
      resumeFromSentenceStartRef.current = false;

      if (import.meta.env.DEV) {
        console.debug("[OPIc TTS] shadowing playback requested", {
          requestId,
          playerStatus: statusRef.current,
          recorderStatus: recorderStatusRef.current,
          sentenceIndex: index,
        });
      }

      const voiceRequest = requestEnglishVoice(window.speechSynthesis, {
        onAttempt: (attempt) => {
          if (requestId !== requestIdRef.current) return;
          if (import.meta.env.DEV) {
            console.debug("[OPIc TTS] shadowing voice lookup", {
              requestId,
              playerStatus: statusRef.current,
              recorderStatus: recorderStatusRef.current,
              sentenceIndex: index,
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
            });
          }
        },
      });
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
          setStatus("error");
          setErrorMessage(
            "이 실행 환경에서는 영어 음성을 사용할 수 없어요. Chrome이나 Edge에서 다시 열어 주세요.",
          );
          return;
        }
        playWithVoice(index, chunks, 0, result.voice, requestId);
      });
    },
    [cancelSpeech, isSupported, playWithVoice, setCurrentIndex, setStatus],
  );

  playSentenceRef.current = playSentence;

  const finishSentence = useCallback(
    (index: number, requestId: number, actualPlaybackMs: number) => {
      if (requestId !== requestIdRef.current) return;
      const settings = settingsRef.current;
      const step = getNextRepeatStep(
        settings.repeatMode,
        settings.repeatCount,
        index,
        sentencesRef.current.length,
        completedRepeatsRef.current,
        getParagraphRangeForSentence(paragraphsRef.current, index),
      );

      // The final repetition finishes immediately; a rest is only useful when
      // another sentence or repetition will actually follow.
      if (step.completed) {
        pendingStepRef.current = null;
        setCompletedRepeats(step.completedRepeats);
        setCurrentRestMs(0);
        setStatus("completed");
        return;
      }
      const restMs = calculateDynamicRestMs(
        actualPlaybackMs,
        sentencesRef.current[index] ?? "",
        rateRef.current,
        settings.restLevel,
      );

      const continuePlayback = () => {
        if (requestId !== requestIdRef.current) return;
        restTimerRef.current = null;
        pendingStepRef.current = null;
        setCurrentRestMs(0);
        setCompletedRepeats(step.completedRepeats);
        setCurrentIndex(step.nextIndex);
        playSentenceRef.current(step.nextIndex);
      };

      if (restMs <= 0) {
        continuePlayback();
        return;
      }
      pendingStepRef.current = step;
      setCompletedRepeats(step.completedRepeats);
      setCurrentIndex(step.nextIndex);
      setCurrentRestMs(restMs);
      setStatus("resting");
      restTimerRef.current = window.setTimeout(continuePlayback, restMs);
    },
    [setCompletedRepeats, setCurrentIndex, setStatus],
  );

  finishSentenceRef.current = finishSentence;

  const play = useCallback(() => {
    if (statusRef.current === "completed") {
      resetProgress();
      const repeatMode = settingsRef.current.repeatMode;
      const restartIndex =
        repeatMode === "sentence"
          ? currentIndexRef.current
          : repeatMode === "paragraph"
            ? getParagraphRangeForSentence(
                paragraphsRef.current,
                currentIndexRef.current,
              ).startSentenceIndex
            : 0;
      playSentence(restartIndex);
      return;
    }
    playSentence(currentIndexRef.current);
  }, [playSentence, resetProgress]);

  const pause = useCallback(() => {
    if (
      !isSupported ||
      !["playing", "loading", "resting"].includes(statusRef.current)
    ) {
      return;
    }
    if (statusRef.current === "resting") {
      cancelSpeech();
      setCurrentRestMs(0);
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
    setStatus("paused");
  }, [cancelSpeech, isSupported, setStatus]);

  const resume = useCallback(() => {
    if (!isSupported || statusRef.current !== "paused") return;
    if (pendingStepRef.current) {
      const pendingStep = pendingStepRef.current;
      pendingStepRef.current = null;
      setCurrentIndex(pendingStep.nextIndex);
      playSentence(pendingStep.nextIndex);
      return;
    }
    if (resumeFromSentenceStartRef.current) {
      resumeFromSentenceStartRef.current = false;
      playSentence(currentIndexRef.current);
      return;
    }
    if (window.speechSynthesis.paused || window.speechSynthesis.speaking) {
      window.speechSynthesis.resume();
      setStatus("playing");
      resumeTimerRef.current = window.setTimeout(() => {
        resumeTimerRef.current = null;
        if (window.speechSynthesis.paused && statusRef.current === "playing") {
          playSentence(currentIndexRef.current);
        }
      }, 300);
      return;
    }
    playSentence(currentIndexRef.current);
  }, [isSupported, playSentence, setCurrentIndex, setStatus]);

  const stop = useCallback(() => {
    cancelSpeech();
    resetProgress();
    setStatus("idle");
    setErrorMessage(null);
  }, [cancelSpeech, resetProgress, setStatus]);

  const interruptForExternalSpeech = useCallback(() => {
    const shouldPause = ["playing", "loading", "resting", "paused"].includes(
      statusRef.current,
    );
    cancelSpeech();
    resumeFromSentenceStartRef.current = true;
    setCurrentRestMs(0);
    if (shouldPause) setStatus("paused");
  }, [cancelSpeech, setStatus]);

  const restart = useCallback(() => {
    cancelSpeech();
    resetProgress();
    playSentence(0);
  }, [cancelSpeech, playSentence, resetProgress]);

  const seekToSentence = useCallback(
    (requestedIndex: number) => {
      if (sentencesRef.current.length === 0) return;
      const nextIndex = clampSentenceIndex(requestedIndex, sentencesRef.current.length);
      const wasActive = ["playing", "loading", "resting"].includes(statusRef.current);
      const wasPaused = statusRef.current === "paused";
      cancelSpeech();
      resetProgress();
      setCurrentIndex(nextIndex);
      setErrorMessage(null);
      if (wasActive) playSentence(nextIndex);
      else setStatus(wasPaused ? "paused" : "idle");
    },
    [cancelSpeech, playSentence, resetProgress, setCurrentIndex, setStatus],
  );

  const playFromSentence = useCallback(
    (requestedIndex: number) => {
      if (sentencesRef.current.length === 0) return;
      const selection = createSentenceSelectionPlaybackState(
        requestedIndex,
        sentencesRef.current.length,
      );
      cancelSpeech();
      resetProgress();
      setCurrentIndex(selection.currentIndex);
      setErrorMessage(null);
      playSentence(selection.currentIndex);
    },
    [cancelSpeech, playSentence, resetProgress, setCurrentIndex],
  );

  const previousSentence = useCallback(() => {
    seekToSentence(
      getPreviousSentenceIndex(currentIndexRef.current, sentencesRef.current.length),
    );
  }, [seekToSentence]);

  const nextSentence = useCallback(() => {
    seekToSentence(
      getNextSentenceIndex(currentIndexRef.current, sentencesRef.current.length),
    );
  }, [seekToSentence]);

  useEffect(() => {
    cancelSpeech();
    pendingStepRef.current = null;
    setCompletedRepeats(initialCompletedRepeats);
    setCurrentRestMs(0);
    setCurrentIndex(clampSentenceIndex(initialIndex, sentences.length));
    setErrorMessage(null);
    setStatus(sentences.length > 0 ? initialStatus : "error");
    if (sentences.length === 0) setErrorMessage("재생할 영어 문장이 없습니다.");
  }, [
    cancelSpeech,
    initialIndex,
    initialCompletedRepeats,
    initialStatus,
    sentences,
    setCompletedRepeats,
    setCurrentIndex,
    setStatus,
  ]);

  useEffect(() => {
    const previous = previousSettingsRef.current;
    if (
      previous.repeatMode === playbackSettings.repeatMode &&
      previous.repeatCount === playbackSettings.repeatCount &&
      previous.restLevel === playbackSettings.restLevel
    ) {
      return;
    }
    previousSettingsRef.current = playbackSettings;
    cancelSpeech();
    resetProgress();
    setErrorMessage(null);
    setStatus("idle");
  }, [cancelSpeech, playbackSettings, resetProgress, setStatus]);

  useEffect(() => {
    const pauseForBackground = () => {
      const synchronizedStatus = getStatusAfterBackground(statusRef.current);
      if (synchronizedStatus === statusRef.current) return;
      backgroundInterruptedRef.current = true;
      cancelSpeech();
      setCurrentRestMs(0);
      setStatus(synchronizedStatus);
    };
    const synchronizeAfterReturn = () => {
      if (
        document.visibilityState !== "visible" ||
        (!backgroundInterruptedRef.current &&
          statusRef.current !== "playing" &&
          statusRef.current !== "loading" &&
          statusRef.current !== "resting")
      ) {
        return;
      }
      backgroundInterruptedRef.current = false;
      cancelSpeech();
      setCurrentRestMs(0);
      setStatus("paused");
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") pauseForBackground();
      else synchronizeAfterReturn();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", pauseForBackground);
    window.addEventListener("pageshow", synchronizeAfterReturn);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", pauseForBackground);
      window.removeEventListener("pageshow", synchronizeAfterReturn);
    };
  }, [cancelSpeech, setStatus]);

  useEffect(() => {
    if (status !== "playing" || !supportsScreenWakeLock(navigator)) {
      setWakeLockActive(false);
      return;
    }

    let released = false;
    let sentinel: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      if (released || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (!released) setWakeLockActive(true);
        sentinel.addEventListener("release", () => setWakeLockActive(false), {
          once: true,
        });
      } catch {
        setWakeLockActive(false);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && statusRef.current === "playing") {
        void requestWakeLock();
      }
    };
    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      setWakeLockActive(false);
      void sentinel?.release().catch(() => undefined);
    };
  }, [status]);

  useEffect(
    () => () => {
      cancelSpeech();
    },
    [cancelSpeech],
  );

  return {
    isSupported,
    currentIndex,
    status,
    errorMessage,
    wakeLockActive,
    completedRepeats,
    currentRestMs,
    play,
    pause,
    resume,
    stop,
    interruptForExternalSpeech,
    restart,
    previousSentence,
    nextSentence,
    seekToSentence,
    playFromSentence,
  };
}
