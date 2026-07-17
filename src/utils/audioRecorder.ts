export const MAX_RECORDING_DURATION_MS = 3 * 60 * 1000;
export const GET_USER_MEDIA_TIMEOUT_MS = 15_000;
export const MEDIA_RECORDER_START_TIMEOUT_MS = 5_000;
export const RECORDING_INITIALIZATION_TIMEOUT_MESSAGE =
  "마이크 연결이 완료되지 않았어요. 권한과 다른 앱의 마이크 사용 여부를 확인한 뒤 다시 시도해 주세요.";

export type RecorderCancellationReason = "unmount" | "superseded";

export class RecorderTimeoutError extends Error {
  name = "RecorderTimeoutError";
  code: "GET_USER_MEDIA_TIMEOUT" | "MEDIA_RECORDER_START_TIMEOUT";

  constructor(
    code: "GET_USER_MEDIA_TIMEOUT" | "MEDIA_RECORDER_START_TIMEOUT",
  ) {
    super(RECORDING_INITIALIZATION_TIMEOUT_MESSAGE);
    this.code = code;
  }
}

export class RecorderRequestCancelledError extends Error {
  name = "RecorderRequestCancelledError";
  reason: RecorderCancellationReason;

  constructor(reason: RecorderCancellationReason) {
    super(`Recorder request cancelled: ${reason}`);
    this.reason = reason;
  }
}

export function isRecorderRequestCancelledError(
  error: unknown,
): error is RecorderRequestCancelledError {
  return error instanceof RecorderRequestCancelledError;
}

export function isCurrentRecorderRequest(
  requestId: number,
  currentRequestId: number,
  mounted: boolean,
) {
  return mounted && requestId === currentRequestId;
}

export const AUDIO_MIME_TYPE_PRIORITY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export type AudioRecorderSupportReason =
  | "supported"
  | "insecure-context"
  | "media-devices-unavailable"
  | "media-recorder-unavailable";

export type AudioRecorderEnvironment = {
  isSecureContext: boolean;
  hostname: string;
  protocol: string;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
};

export type AudioRecorderSupport = {
  isSupported: boolean;
  reason: AudioRecorderSupportReason;
  message: string;
};

export function isLocalMicrophoneHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

export function getAudioRecorderSupport(
  environment: AudioRecorderEnvironment,
): AudioRecorderSupport {
  const isTrustedLocalHttp =
    environment.protocol === "http:" &&
    isLocalMicrophoneHost(environment.hostname);

  if (!environment.isSecureContext && !isTrustedLocalHttp) {
    return {
      isSupported: false,
      reason: "insecure-context",
      message:
        "현재 HTTP 주소에서는 마이크를 사용할 수 없어요. HTTPS 주소 또는 이 기기의 localhost에서 실행해 주세요.",
    };
  }
  if (!environment.hasGetUserMedia) {
    return {
      isSupported: false,
      reason: "media-devices-unavailable",
      message: "이 환경에서는 마이크 접근 기능을 사용할 수 없어요.",
    };
  }
  if (!environment.hasMediaRecorder) {
    return {
      isSupported: false,
      reason: "media-recorder-unavailable",
      message: "이 브라우저에서는 음성 녹음을 지원하지 않아요.",
    };
  }
  return { isSupported: true, reason: "supported", message: "" };
}

export type RecordingStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "stopped"
  | "playing"
  | "error";

export type RecordingState = {
  recordingStatus: RecordingStatus;
  elapsedMs: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  errorMessage: string | null;
  mimeType: string;
};

export const INITIAL_RECORDING_STATE: RecordingState = {
  recordingStatus: "idle",
  elapsedMs: 0,
  audioBlob: null,
  audioUrl: null,
  errorMessage: null,
  mimeType: "",
};

export type RecordingAction =
  | { type: "request" }
  | { type: "record"; mimeType: string }
  | { type: "tick"; elapsedMs: number }
  | {
      type: "stop";
      audioBlob: Blob;
      audioUrl: string;
      elapsedMs: number;
      mimeType: string;
    }
  | { type: "play" }
  | { type: "playback-stop" }
  | { type: "error"; message: string }
  | { type: "clear" };

export function recordingStateReducer(
  state: RecordingState,
  action: RecordingAction,
): RecordingState {
  switch (action.type) {
    case "request":
      return { ...INITIAL_RECORDING_STATE, recordingStatus: "requesting" };
    case "record":
      return {
        ...INITIAL_RECORDING_STATE,
        recordingStatus: "recording",
        mimeType: action.mimeType,
      };
    case "tick":
      return { ...state, elapsedMs: action.elapsedMs };
    case "stop":
      return {
        recordingStatus: "stopped",
        elapsedMs: action.elapsedMs,
        audioBlob: action.audioBlob,
        audioUrl: action.audioUrl,
        errorMessage: null,
        mimeType: action.mimeType,
      };
    case "play":
      return { ...state, recordingStatus: "playing", errorMessage: null };
    case "playback-stop":
      return {
        ...state,
        recordingStatus: state.audioBlob ? "stopped" : "idle",
      };
    case "error":
      return {
        ...state,
        recordingStatus: "error",
        errorMessage: action.message,
      };
    case "clear":
      return { ...INITIAL_RECORDING_STATE };
  }
}

type MediaRecorderSupport = {
  isTypeSupported?: (mimeType: string) => boolean;
};

export function chooseAudioRecorderMimeType(
  recorder: MediaRecorderSupport | null | undefined,
) {
  if (typeof recorder?.isTypeSupported !== "function") return "";
  return (
    AUDIO_MIME_TYPE_PRIORITY.find((mimeType) =>
      recorder.isTypeSupported?.(mimeType),
    ) ?? ""
  );
}

export function formatRecordingTime(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getAudioRecorderErrorMessage(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (name === "RecorderTimeoutError") {
    return RECORDING_INITIALIZATION_TIMEOUT_MESSAGE;
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "마이크 권한이 필요해요.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "사용할 수 있는 마이크를 찾지 못했어요.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "다른 앱에서 마이크를 사용 중인지 확인해 주세요.";
  }
  if (name === "AbortError") {
    return "마이크 연결이 중단됐어요. 다시 시도해 주세요.";
  }
  return "녹음을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function isConstraintCompatibilityError(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  return (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError" ||
    name === "NotSupportedError" ||
    name === "TypeError"
  );
}

export function hasMediaRecorderStarted(
  recorderState: "inactive" | "recording" | "paused",
  startEventReceived: boolean,
) {
  return startEventReceived || recorderState === "recording";
}

export function isRecordingBusy(status: RecordingStatus) {
  return status === "requesting" || status === "recording";
}

export function shouldStopRecorderWhenHidden(
  status: RecordingStatus,
  visibilityState: DocumentVisibilityState,
) {
  return (
    visibilityState === "hidden" &&
    (status === "requesting" ||
      status === "recording" ||
      status === "playing")
  );
}
