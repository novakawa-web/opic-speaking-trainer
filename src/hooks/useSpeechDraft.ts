import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendSpeechDraftText,
  collectSpeechRecognitionText,
  getSpeechDraftErrorMessage,
  type SpeechDraftStatus,
  type SpeechRecognitionResultListLike,
} from "../utils/speechDraft";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function useSpeechDraft() {
  const Constructor = useMemo(getSpeechRecognitionConstructor, []);
  const [status, setStatus] = useState<SpeechDraftStatus>("idle");
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionIdRef = useRef(0);

  const detachAndAbort = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // The browser may already have ended the recognition session.
    }
  }, []);

  const clear = useCallback(() => {
    sessionIdRef.current += 1;
    detachAndAbort();
    setStatus("idle");
    setFinalText("");
    setInterimText("");
    setErrorMessage("");
  }, [detachAndAbort]);

  const start = useCallback(() => {
    if (!Constructor) return false;
    sessionIdRef.current += 1;
    const sessionId = sessionIdRef.current;
    detachAndAbort();
    setStatus("starting");
    setErrorMessage("");
    setInterimText("");

    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (sessionId === sessionIdRef.current) setStatus("listening");
    };
    recognition.onresult = (event) => {
      if (sessionId !== sessionIdRef.current) return;
      const next = collectSpeechRecognitionText(event.results, event.resultIndex);
      if (next.finalText) {
        setFinalText((current) => appendSpeechDraftText(current, next.finalText));
      }
      setInterimText(next.interimText);
    };
    recognition.onerror = (event) => {
      if (sessionId !== sessionIdRef.current) return;
      setErrorMessage(getSpeechDraftErrorMessage(event.error));
      setInterimText("");
      setStatus("error");
    };
    recognition.onend = () => {
      if (sessionId !== sessionIdRef.current) return;
      recognitionRef.current = null;
      setInterimText("");
      setStatus((current) => current === "error" ? current : "stopped");
    };

    try {
      recognition.start();
      return true;
    } catch {
      recognitionRef.current = null;
      setStatus("error");
      setErrorMessage(getSpeechDraftErrorMessage("start-failed"));
      return false;
    }
  }, [Constructor, detachAndAbort]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      recognitionRef.current = null;
      setInterimText("");
      setStatus((current) => current === "error" ? current : "stopped");
    }
  }, []);

  const setDraftText = useCallback((value: string) => {
    setFinalText(value);
    setInterimText("");
    setErrorMessage("");
    setStatus(value.trim() ? "stopped" : "idle");
  }, []);

  useEffect(() => () => {
    sessionIdRef.current += 1;
    detachAndAbort();
  }, [detachAndAbort]);

  return {
    isSupported: Boolean(Constructor),
    status,
    draftText: appendSpeechDraftText(finalText, interimText),
    errorMessage,
    start,
    stop,
    clear,
    setDraftText,
  };
}
