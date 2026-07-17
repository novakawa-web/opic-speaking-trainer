import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  INITIAL_RECORDING_STATE,
  GET_USER_MEDIA_TIMEOUT_MS,
  MAX_RECORDING_DURATION_MS,
  MEDIA_RECORDER_START_TIMEOUT_MS,
  RecorderRequestCancelledError,
  RecorderTimeoutError,
  chooseAudioRecorderMimeType,
  getAudioRecorderSupport,
  getAudioRecorderErrorMessage,
  hasMediaRecorderStarted,
  isConstraintCompatibilityError,
  isCurrentRecorderRequest,
  isRecorderRequestCancelledError,
  recordingStateReducer,
  type RecordingStatus,
} from "../utils/audioRecorder";
import { supportsScreenWakeLock } from "../utils/shadowingPlayer";

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getErrorDetails(error: unknown) {
  return {
    name:
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name)
        : "Error",
    message:
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error),
    code:
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : undefined,
  };
}

function getTrackDiagnostics(stream: MediaStream | null) {
  return (stream?.getAudioTracks() ?? []).map((track) => ({
    readyState: track.readyState,
    enabled: track.enabled,
    muted: track.muted,
  }));
}

function debugRecorderStep(step: string, details?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.debug(`[OPIc Recorder] ${step}`, details ?? {});
}

function debugRecorderFailure(
  step: string,
  error: unknown,
  recorder: MediaRecorder | null,
  stream: MediaStream | null,
) {
  if (!import.meta.env.DEV) return;
  console.error(`[OPIc Recorder] ${step} 실패`, {
    ...getErrorDetails(error),
    recorderState: recorder?.state ?? "not-created",
    audioTracks: getTrackDiagnostics(stream),
  });
}

export function useAudioRecorder() {
  const support =
    typeof window !== "undefined" && typeof navigator !== "undefined"
      ? getAudioRecorderSupport({
          isSecureContext: window.isSecureContext,
          hostname: window.location.hostname,
          protocol: window.location.protocol,
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
          hasMediaRecorder: "MediaRecorder" in window,
        })
      : getAudioRecorderSupport({
          isSecureContext: true,
          hostname: "",
          protocol: "",
          hasGetUserMedia: false,
          hasMediaRecorder: false,
        });
  const isSupported = support.isSupported;
  const [state, dispatch] = useReducer(
    recordingStateReducer,
    INITIAL_RECORDING_STATE,
  );
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const stateRef = useRef(state);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const limitTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const requestIdRef = useRef(0);
  const discardOnStopRef = useRef(false);
  const unmountedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const initializationAbortRef = useRef<
    ((reason: "unmount" | "superseded") => void) | null
  >(null);

  stateRef.current = state;

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    if (sentinel) void sentinel.release().catch(() => undefined);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (
      !supportsScreenWakeLock(navigator) ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (
        unmountedRef.current ||
        recorderRef.current?.state !== "recording"
      ) {
        void sentinel.release().catch(() => undefined);
        return;
      }
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener(
        "release",
        () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
          setWakeLockActive(false);
        },
        { once: true },
      );
    } catch {
      setWakeLockActive(false);
    }
  }, []);

  const cancelInitialization = useCallback(
    (reason: "unmount" | "superseded") => {
      const abortInitialization = initializationAbortRef.current;
      initializationAbortRef.current = null;
      abortInitialization?.(reason);
    },
    [],
  );

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (limitTimerRef.current !== null) {
      window.clearTimeout(limitTimerRef.current);
      limitTimerRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Some mobile engines reject seeking before metadata is ready.
      }
    }
    audioRef.current = null;
    if (stateRef.current.recordingStatus === "playing") {
      dispatch({ type: "playback-stop" });
    }
  }, []);

  const revokeAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const wasRequesting = stateRef.current.recordingStatus === "requesting";
    if (wasRequesting) {
      requestIdRef.current += 1;
      cancelInitialization("superseded");
    }
    clearTimers();
    releaseWakeLock();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        dispatch({
          type: "error",
          message: "녹음을 중지하지 못했어요. 다시 시도해 주세요.",
        });
      }
    } else if (wasRequesting) {
      dispatch({ type: "clear" });
    }
    stopTracks(streamRef.current);
    streamRef.current = null;
  }, [cancelInitialization, clearTimers, releaseWakeLock]);

  const clearRecording = useCallback(() => {
    requestIdRef.current += 1;
    cancelInitialization("superseded");
    discardOnStopRef.current = true;
    clearTimers();
    releaseWakeLock();
    stopPlayback();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Resource cleanup continues below.
      }
    }
    recorderRef.current = null;
    stopTracks(streamRef.current);
    streamRef.current = null;
    chunksRef.current = [];
    revokeAudioUrl();
    dispatch({ type: "clear" });
  }, [cancelInitialization, clearTimers, releaseWakeLock, revokeAudioUrl, stopPlayback]);

  const startRecording = useCallback(async () => {
    if (
      stateRef.current.recordingStatus === "requesting" ||
      stateRef.current.recordingStatus === "recording"
    ) {
      return;
    }

    clearRecording();
    discardOnStopRef.current = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestStartedAt = Date.now();
    debugRecorderStep(`request ${requestId} start`, {
      currentRequestId: requestIdRef.current,
      mounted: !unmountedRef.current,
    });
    debugRecorderStep(`request ${requestId} 1. support check 시작`, {
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      isSecureContext: window.isSecureContext,
    });
    debugRecorderStep(`request ${requestId} 1. support check 완료`, {
      supported: isSupported,
      reason: support.reason,
    });
    if (!isSupported) {
      dispatch({ type: "error", message: support.message });
      return;
    }
    if (unmountedRef.current) {
      debugRecorderStep(`request ${requestId} cancelled`, {
        reason: "unmount",
        currentRequestId: requestIdRef.current,
        mounted: false,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return;
    }
    dispatch({ type: "request" });

    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((permission) =>
          debugRecorderStep("권한 상태(보조 진단)", {
            permission: permission.state,
          }),
        )
        .catch((error) =>
          debugRecorderStep("권한 상태 확인 불가", getErrorDetails(error)),
        );
    }

    let currentStage = "getUserMedia 호출 전";
    const getUserMediaWithTimeout = (
      constraints: MediaStreamConstraints,
      requestLabel: "권장 제약" | "단순 제약",
    ) =>
      new Promise<MediaStream>((resolve, reject) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          initializationAbortRef.current = null;
          reject(new RecorderTimeoutError("GET_USER_MEDIA_TIMEOUT"));
        }, GET_USER_MEDIA_TIMEOUT_MS);

        initializationAbortRef.current = (reason) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(new RecorderRequestCancelledError(reason));
        };

        debugRecorderStep(`request ${requestId} 2. getUserMedia 호출 직전`, {
          constraints: requestLabel,
          timeoutMs: GET_USER_MEDIA_TIMEOUT_MS,
        });

        let mediaRequest: Promise<MediaStream>;
        try {
          mediaRequest = navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
          settled = true;
          window.clearTimeout(timeoutId);
          initializationAbortRef.current = null;
          reject(error);
          return;
        }

        mediaRequest.then(
          (stream) => {
            if (
              settled ||
              !isCurrentRecorderRequest(
                requestId,
                requestIdRef.current,
                !unmountedRef.current,
              )
            ) {
              stopTracks(stream);
              const cancellationReason = unmountedRef.current
                ? "unmount"
                : "superseded";
              debugRecorderStep(`request ${requestId} late stream 정리`, {
                reason: cancellationReason,
                currentRequestId: requestIdRef.current,
                mounted: !unmountedRef.current,
                elapsedMs: Date.now() - requestStartedAt,
                constraints: requestLabel,
                audioTrackCount: stream.getAudioTracks().length,
              });
              if (!settled) {
                settled = true;
                window.clearTimeout(timeoutId);
                initializationAbortRef.current = null;
                reject(new RecorderRequestCancelledError(cancellationReason));
              }
              return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            initializationAbortRef.current = null;
            debugRecorderStep(`request ${requestId} getUserMedia resolved`, {
              constraints: requestLabel,
              elapsedMs: Date.now() - requestStartedAt,
            });
            resolve(stream);
          },
          (error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            initializationAbortRef.current = null;
            reject(error);
          },
        );
      });

    let requestStream: MediaStream | null = null;
    let requestRecorder: MediaRecorder | null = null;
    try {
      let stream: MediaStream;
      try {
        currentStage = "권장 제약 getUserMedia";
        stream = await getUserMediaWithTimeout(
          { audio: AUDIO_CONSTRAINTS, video: false },
          "권장 제약",
        );
      } catch (error) {
        if (!isConstraintCompatibilityError(error)) throw error;
        debugRecorderStep("getUserMedia 단순 제약 fallback", {
          ...getErrorDetails(error),
          fallback: "audio: true",
        });
        currentStage = "단순 제약 getUserMedia";
        stream = await getUserMediaWithTimeout(
          { audio: true, video: false },
          "단순 제약",
        );
      }
      if (
        !isCurrentRecorderRequest(
          requestId,
          requestIdRef.current,
          !unmountedRef.current,
        )
      ) {
        stopTracks(stream);
        return;
      }

      streamRef.current = stream;
      requestStream = stream;
      debugRecorderStep(`request ${requestId} stream accepted`, {
        audioTrackCount: stream.getAudioTracks().length,
        audioTracks: getTrackDiagnostics(stream),
        elapsedMs: Date.now() - requestStartedAt,
      });
      if (stream.getAudioTracks().length === 0) {
        throw new DOMException("Audio track is unavailable", "NotFoundError");
      }

      currentStage = "MIME 타입 선택";
      const mimeType = chooseAudioRecorderMimeType(window.MediaRecorder);
      debugRecorderStep(`request ${requestId} 5. MIME 타입 선택`, {
        mimeType: mimeType || "browser-default",
      });
      currentStage = "MediaRecorder constructor";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      requestRecorder = recorder;
      debugRecorderStep(`request ${requestId} recorder created`, {
        recorderState: recorder.state,
      });
      recorderRef.current = recorder;
      const recorderChunks: Blob[] = [];
      chunksRef.current = recorderChunks;
      let rejectRecorderStart: ((reason: unknown) => void) | null = null;
      let startEventReceived = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunks.push(event.data);
      };
      recorder.onerror = (event) => {
        const recorderError = "error" in event ? event.error : event;
        debugRecorderFailure(
          "MediaRecorder error event",
          recorderError,
          recorder,
          streamRef.current,
        );
        if (rejectRecorderStart) {
          rejectRecorderStart(recorderError);
          return;
        }
        clearTimers();
        releaseWakeLock();
        stopTracks(streamRef.current);
        streamRef.current = null;
        dispatch({
          type: "error",
          message: getAudioRecorderErrorMessage(recorderError),
        });
      };
      recorder.onstop = () => {
        if (
          !isCurrentRecorderRequest(
            requestId,
            requestIdRef.current,
            !unmountedRef.current,
          )
        ) {
          stopTracks(stream);
          if (streamRef.current === stream) streamRef.current = null;
          return;
        }
        clearTimers();
        releaseWakeLock();
        stopTracks(streamRef.current);
        streamRef.current = null;
        recorderRef.current = null;
        const chunks = recorderChunks;
        if (chunksRef.current === recorderChunks) chunksRef.current = [];
        if (discardOnStopRef.current || unmountedRef.current) {
          discardOnStopRef.current = false;
          return;
        }
        if (chunks.length === 0) {
          dispatch({
            type: "error",
            message: "녹음 데이터가 만들어지지 않았어요. 다시 시도해 주세요.",
          });
          return;
        }
        const finalMimeType = recorder.mimeType || mimeType || chunks[0].type;
        const audioBlob = new Blob(chunks, {
          type: finalMimeType || "audio/webm",
        });
        if (audioBlob.size === 0) {
          dispatch({
            type: "error",
            message: "녹음 데이터가 만들어지지 않았어요. 다시 시도해 주세요.",
          });
          return;
        }
        revokeAudioUrl();
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;
        dispatch({
          type: "stop",
          audioBlob,
          audioUrl,
          elapsedMs: Math.min(
            MAX_RECORDING_DURATION_MS,
            Math.max(0, Date.now() - startedAtRef.current),
          ),
          mimeType: finalMimeType,
        });
      };
      const recorderStartPromise = new Promise<void>((resolve, reject) => {
        let settled = false;
        const settleResolve = () => {
          if (settled) return;
          settled = true;
          rejectRecorderStart = null;
          initializationAbortRef.current = null;
          window.clearTimeout(startTimeoutId);
          resolve();
        };
        const settleReject = (error: unknown) => {
          if (settled) return;
          settled = true;
          rejectRecorderStart = null;
          initializationAbortRef.current = null;
          window.clearTimeout(startTimeoutId);
          reject(error);
        };
        rejectRecorderStart = settleReject;
        const startTimeoutId = window.setTimeout(() => {
          if (hasMediaRecorderStarted(recorder.state, startEventReceived)) {
            settleResolve();
          } else {
            settleReject(
              new RecorderTimeoutError("MEDIA_RECORDER_START_TIMEOUT"),
            );
          }
        }, MEDIA_RECORDER_START_TIMEOUT_MS);
        initializationAbortRef.current = (reason) =>
          settleReject(new RecorderRequestCancelledError(reason));
        recorder.onstart = () => {
          startEventReceived = true;
          debugRecorderStep(`request ${requestId} 9. recorder start 이벤트`, {
            recorderState: recorder.state,
          });
          if (hasMediaRecorderStarted(recorder.state, startEventReceived)) {
            settleResolve();
          }
        };

        currentStage = "MediaRecorder.start";
        debugRecorderStep(`request ${requestId} 7. event handler 연결`, {
          handlers: ["start", "dataavailable", "stop", "error"],
        });
        debugRecorderStep(`request ${requestId} 8. MediaRecorder.start() 호출`, {
          timesliceMs: 250,
        });
        try {
          recorder.start(250);
          debugRecorderStep(`request ${requestId} 10. recorder.state 확인`, {
            recorderState: recorder.state,
            startEventReceived,
          });
          if (hasMediaRecorderStarted(recorder.state, startEventReceived)) {
            settleResolve();
          }
        } catch (error) {
          settleReject(error);
        }
      });

      await recorderStartPromise;
      if (
        !isCurrentRecorderRequest(
          requestId,
          requestIdRef.current,
          !unmountedRef.current,
        )
      ) {
        discardOnStopRef.current = true;
        if (recorder.state !== "inactive") recorder.stop();
        stopTracks(stream);
        return;
      }

      startedAtRef.current = Date.now();
      dispatch({ type: "record", mimeType: recorder.mimeType || mimeType });
      debugRecorderStep(`request ${requestId} recording`, {
        recorderState: recorder.state,
        mimeType: recorder.mimeType || mimeType || "browser-default",
        elapsedMs: Date.now() - requestStartedAt,
      });
      intervalRef.current = window.setInterval(() => {
        dispatch({
          type: "tick",
          elapsedMs: Math.min(
            MAX_RECORDING_DURATION_MS,
            Date.now() - startedAtRef.current,
          ),
        });
      }, 250);
      limitTimerRef.current = window.setTimeout(
        stopRecording,
        MAX_RECORDING_DURATION_MS,
      );
      void requestWakeLock();
    } catch (error) {
      const isSilentCancellation = isRecorderRequestCancelledError(error);
      if (isSilentCancellation) {
        debugRecorderStep(`request ${requestId} cancelled`, {
          reason: error.reason,
          currentRequestId: requestIdRef.current,
          mounted: !unmountedRef.current,
          elapsedMs: Date.now() - requestStartedAt,
        });
      } else {
        debugRecorderStep(`request ${requestId} failed`, {
          reason: error instanceof RecorderTimeoutError ? "timeout" : "browser-error",
          currentRequestId: requestIdRef.current,
          mounted: !unmountedRef.current,
          elapsedMs: Date.now() - requestStartedAt,
          ...getErrorDetails(error),
        });
        debugRecorderFailure(
          currentStage,
          error,
          requestRecorder,
          requestStream,
        );
      }
      const ownsCurrentRequest = requestId === requestIdRef.current;
      if (!isSilentCancellation || ownsCurrentRequest) {
        clearTimers();
        releaseWakeLock();
        discardOnStopRef.current = true;
      }
      const failedRecorder = requestRecorder;
      if (failedRecorder && failedRecorder.state !== "inactive") {
        try {
          failedRecorder.stop();
        } catch {
          // Track cleanup below is still sufficient.
        }
      }
      stopTracks(requestStream);
      if (streamRef.current === requestStream) streamRef.current = null;
      if (recorderRef.current === requestRecorder) recorderRef.current = null;
      if (ownsCurrentRequest) chunksRef.current = [];
      if (!isSilentCancellation) revokeAudioUrl();
      if (isSilentCancellation) return;
      if (requestId === requestIdRef.current && !unmountedRef.current) {
        dispatch({ type: "error", message: getAudioRecorderErrorMessage(error) });
      }
    }
  }, [
    clearRecording,
    clearTimers,
    isSupported,
    releaseWakeLock,
    requestWakeLock,
    revokeAudioUrl,
    stopRecording,
    support.message,
    support.reason,
  ]);

  const playRecording = useCallback(async () => {
    const url = audioUrlRef.current;
    if (!url || !stateRef.current.audioBlob) return;
    stopPlayback();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      audioRef.current = null;
      dispatch({ type: "playback-stop" });
    };
    audio.onerror = () => {
      audioRef.current = null;
      dispatch({
        type: "error",
        message: "내 녹음을 재생하지 못했어요. 다시 녹음해 주세요.",
      });
    };
    dispatch({ type: "play" });
    try {
      await audio.play();
    } catch {
      audioRef.current = null;
      dispatch({
        type: "error",
        message: "내 녹음을 재생하지 못했어요. 재생 버튼을 다시 눌러 주세요.",
      });
    }
  }, [stopPlayback]);

  useEffect(() => {
    const stopForBackground = () => {
      if (stateRef.current.recordingStatus === "recording") stopRecording();
      else if (stateRef.current.recordingStatus === "requesting") clearRecording();
      else if (stateRef.current.recordingStatus === "playing") stopPlayback();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") stopForBackground();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", stopForBackground);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", stopForBackground);
    };
  }, [clearRecording, stopPlayback, stopRecording]);

  useEffect(() => {
    // StrictMode runs setup -> cleanup -> setup in development. Reset this ref
    // on every setup so the simulated cleanup cannot poison later user requests.
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      requestIdRef.current += 1;
      cancelInitialization("unmount");
      clearTimers();
      discardOnStopRef.current = true;

      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Continue releasing the stream and in-memory URL.
        }
      }
      stopTracks(streamRef.current);
      streamRef.current = null;

      const audio = audioRef.current;
      audioRef.current = null;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }

      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wakeLock) void wakeLock.release().catch(() => undefined);

      chunksRef.current = [];
      revokeAudioUrl();
    };
  }, [cancelInitialization, clearTimers, revokeAudioUrl]);

  return {
    ...state,
    isSupported,
    supportReason: support.reason,
    unsupportedMessage: support.message,
    wakeLockActive,
    startRecording,
    stopRecording,
    playRecording,
    stopPlayback,
    clearRecording,
  };
}

export type AudioRecorderController = ReturnType<typeof useAudioRecorder>;
export type { RecordingStatus };
