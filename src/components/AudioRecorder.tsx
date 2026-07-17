import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import {
  formatRecordingTime,
  isRecordingBusy,
  type RecordingStatus,
} from "../utils/audioRecorder";

export type AudioRecorderHandle = {
  stopPlayback: () => void;
  stopRecording: () => void;
  clearRecording: () => void;
  getStatus: () => RecordingStatus;
};

type AudioRecorderProps = {
  className?: string;
  scopeLabel: string;
  onBeforeRecord?: () => void;
  onBeforePlayback?: () => void;
  onStatusChange?: (status: RecordingStatus) => void;
};

const statusLabels: Record<RecordingStatus, string> = {
  idle: "녹음 준비",
  requesting: "마이크 권한 요청 중",
  recording: "녹음 중",
  stopped: "녹음 완료",
  playing: "내 녹음 재생 중",
  error: "녹음 오류",
};

export const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(
  function AudioRecorder(
    { className = "", scopeLabel, onBeforeRecord, onBeforePlayback, onStatusChange },
    ref,
  ) {
    const recorder = useAudioRecorder();
    const [message, setMessage] = useState("");
    const busy = isRecordingBusy(recorder.recordingStatus);

    useImperativeHandle(
      ref,
      () => ({
        stopPlayback: recorder.stopPlayback,
        stopRecording: recorder.stopRecording,
        clearRecording: recorder.clearRecording,
        getStatus: () => recorder.recordingStatus,
      }),
      [
        recorder.clearRecording,
        recorder.recordingStatus,
        recorder.stopPlayback,
        recorder.stopRecording,
      ],
    );

    useEffect(() => {
      onStatusChange?.(recorder.recordingStatus);
    }, [onStatusChange, recorder.recordingStatus]);

    async function start() {
      onBeforeRecord?.();
      setMessage("");
      await recorder.startRecording();
    }

    async function play() {
      onBeforePlayback?.();
      setMessage("");
      await recorder.playRecording();
    }

    function remove() {
      recorder.clearRecording();
      setMessage("현재 녹음을 삭제했습니다.");
    }

    return (
      <section
        className={`audio-recorder ${className}`.trim()}
        aria-label="내 목소리 녹음"
      >
        <div className="audio-recorder-heading">
          <div>
            <p className="eyebrow">VOICE CHECK</p>
            <h2>녹음 후 바로 듣기</h2>
          </div>
          <strong
            className={recorder.recordingStatus === "recording" ? "is-recording" : ""}
            aria-live="polite"
          >
            {statusLabels[recorder.recordingStatus]}
          </strong>
        </div>

        <p className="audio-recorder-scope">{scopeLabel}</p>

        <div className="audio-recorder-controls">
          {(recorder.recordingStatus === "idle" ||
            recorder.recordingStatus === "error") && (
            <button
              type="button"
              className="record-start-button"
              disabled={!recorder.isSupported}
              aria-label={recorder.recordingStatus === "error" ? "녹음 다시 시도" : "녹음 시작"}
              onClick={start}
            >
              ● {recorder.recordingStatus === "error" ? "다시 시도" : "녹음 시작"}
            </button>
          )}

          {recorder.recordingStatus === "requesting" && (
            <button type="button" disabled aria-label="마이크 권한 요청 중">
              마이크 연결 중…
            </button>
          )}

          {recorder.recordingStatus === "recording" && (
            <>
              <button
                type="button"
                className="record-stop-button"
                aria-label="녹음 중지"
                onClick={recorder.stopRecording}
              >
                ■ 녹음 중지
              </button>
              <time className="recording-time" dateTime={`PT${Math.floor(recorder.elapsedMs / 1000)}S`}>
                {formatRecordingTime(recorder.elapsedMs)}
              </time>
            </>
          )}

          {recorder.recordingStatus === "stopped" && (
            <>
              <button type="button" className="record-play-button" onClick={play}>
                ▶ 내 녹음 듣기
              </button>
              <button
                type="button"
                className="secondary-button"
                aria-label="다시 녹음, 현재 녹음 삭제"
                onClick={start}
              >
                ↻ 다시 녹음
              </button>
              <button type="button" className="text-button" onClick={remove}>
                녹음 삭제
              </button>
            </>
          )}

          {recorder.recordingStatus === "playing" && (
            <button
              type="button"
              className="record-stop-button"
              aria-label="내 녹음 재생 정지"
              onClick={recorder.stopPlayback}
            >
              ■ 재생 정지
            </button>
          )}
        </div>

        {busy && recorder.wakeLockActive && (
          <span className="audio-recorder-wake-lock">화면 켜짐 유지 중</span>
        )}
        {recorder.recordingStatus === "stopped" && (
          <p className="audio-recorder-replace-note">
            다시 녹음하면 현재 녹음이 사라져요.
          </p>
        )}
        {!recorder.isSupported && (
          <p className="audio-recorder-error" role="alert">
            {recorder.unsupportedMessage}
          </p>
        )}
        {recorder.errorMessage && (
          <p className="audio-recorder-error" role="alert">
            {recorder.errorMessage}
          </p>
        )}
        <p className="audio-recorder-message" aria-live="polite">
          {message}
        </p>
        <p className="audio-recorder-privacy">
          녹음은 현재 화면에서만 들을 수 있으며 저장되지 않습니다.
        </p>
      </section>
    );
  },
);
