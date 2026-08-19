import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useSpeechDraft } from "../hooks/useSpeechDraft";
import type { AnswerDraftSaveMode } from "../utils/answerDraft";
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

export type SpeechDraftApplyResult = {
  ok: boolean;
  message: string;
};

export type AudioRecorderSpeechDraftConfig = {
  existingAnswer?: string;
  disabled?: boolean;
  onApply: (
    draft: string,
    mode: AnswerDraftSaveMode,
  ) => SpeechDraftApplyResult;
};

type AudioRecorderProps = {
  className?: string;
  eyebrow?: string;
  title?: string;
  scopeLabel: string;
  onBeforeRecord?: () => void;
  onPrepareRecord?: (signal: AbortSignal) => Promise<void>;
  preparationStatus?: string | null;
  onPreparingChange?: (preparing: boolean) => void;
  onBeforePlayback?: () => void;
  onStatusChange?: (status: RecordingStatus) => void;
  speechDraft?: AudioRecorderSpeechDraftConfig;
  onSpeechDraftDirtyChange?: (dirty: boolean) => void;
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
    {
      className = "",
      eyebrow = "VOICE CHECK",
      title = "녹음 후 바로 듣기",
      scopeLabel,
      onBeforeRecord,
      onPrepareRecord,
      preparationStatus,
      onPreparingChange,
      onBeforePlayback,
      onStatusChange,
      speechDraft: speechDraftConfig,
      onSpeechDraftDirtyChange,
    },
    ref,
  ) {
    const recorder = useAudioRecorder();
    const speechDraft = useSpeechDraft();
    const [message, setMessage] = useState("");
    const [isPreparing, setIsPreparing] = useState(false);
    const [speechDraftEnabled, setSpeechDraftEnabled] = useState(false);
    const [savedSpeechDraft, setSavedSpeechDraft] = useState("");
    const preparationControllerRef = useRef<AbortController | null>(null);
    const speechDraftRequestedRef = useRef(false);
    const speechDraftStartedRef = useRef(false);
    const busy = isPreparing || isRecordingBusy(recorder.recordingStatus);

    function stopRecording() {
      preparationControllerRef.current?.abort();
      preparationControllerRef.current = null;
      setIsPreparing(false);
      speechDraft.stop();
      speechDraftStartedRef.current = false;
      recorder.stopRecording();
    }

    function clearRecording() {
      preparationControllerRef.current?.abort();
      preparationControllerRef.current = null;
      setIsPreparing(false);
      speechDraftRequestedRef.current = false;
      speechDraftStartedRef.current = false;
      speechDraft.clear();
      setSavedSpeechDraft("");
      recorder.clearRecording();
    }

    useImperativeHandle(
      ref,
      () => ({
        stopPlayback: recorder.stopPlayback,
        stopRecording,
        clearRecording,
        getStatus: () => recorder.recordingStatus,
      }),
      [
        recorder.recordingStatus,
        recorder.stopPlayback,
        speechDraft.clear,
        speechDraft.stop,
      ],
    );

    useEffect(() => {
      onStatusChange?.(recorder.recordingStatus);
    }, [onStatusChange, recorder.recordingStatus]);

    useEffect(() => {
      onPreparingChange?.(isPreparing);
    }, [isPreparing, onPreparingChange]);

    useEffect(() => {
      const draft = speechDraft.draftText.trim();
      onSpeechDraftDirtyChange?.(
        Boolean(draft) && draft !== savedSpeechDraft.trim(),
      );
    }, [onSpeechDraftDirtyChange, savedSpeechDraft, speechDraft.draftText]);

    useEffect(() => {
      if (
        recorder.recordingStatus === "recording" &&
        speechDraftRequestedRef.current &&
        !speechDraftStartedRef.current
      ) {
        speechDraftStartedRef.current = speechDraft.start();
        return;
      }

      if (
        recorder.recordingStatus !== "recording" &&
        speechDraftStartedRef.current
      ) {
        speechDraft.stop();
        speechDraftStartedRef.current = false;
      }
    }, [recorder.recordingStatus, speechDraft.start, speechDraft.stop]);

    useEffect(() => () => preparationControllerRef.current?.abort(), []);

    async function start() {
      if (isPreparing) return;
      onBeforeRecord?.();
      setMessage("");
      speechDraft.clear();
      setSavedSpeechDraft("");
      speechDraftStartedRef.current = false;
      speechDraftRequestedRef.current = Boolean(
        speechDraftConfig &&
        speechDraftEnabled &&
        speechDraft.isSupported &&
        !speechDraftConfig.disabled,
      );
      try {
        if (onPrepareRecord) {
          const controller = new AbortController();
          preparationControllerRef.current?.abort();
          preparationControllerRef.current = controller;
          setIsPreparing(true);
          await onPrepareRecord(controller.signal);
          if (controller.signal.aborted) return;
          preparationControllerRef.current = null;
        }
        await recorder.startRecording();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("녹음 준비를 완료하지 못했습니다. 다시 시도해 주세요.");
        }
      } finally {
        setIsPreparing(false);
      }
    }

    async function play() {
      onBeforePlayback?.();
      setMessage("");
      await recorder.playRecording();
    }

    function remove() {
      clearRecording();
      setMessage("현재 녹음을 삭제했습니다.");
    }

    function applySpeechDraft(mode: AnswerDraftSaveMode) {
      if (!speechDraftConfig || !speechDraft.draftText.trim()) return;
      const result = speechDraftConfig.onApply(speechDraft.draftText, mode);
      if (result.ok) setSavedSpeechDraft(speechDraft.draftText);
      setMessage(result.message);
    }

    return (
      <section
        className={`audio-recorder ${className}`.trim()}
        aria-label="내 목소리 녹음"
      >
        <div className="audio-recorder-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <strong
            className={recorder.recordingStatus === "recording" ? "is-recording" : ""}
            aria-live="polite"
          >
            {isPreparing ? preparationStatus || "녹음 준비 중" : statusLabels[recorder.recordingStatus]}
          </strong>
        </div>

        <p className="audio-recorder-scope">{scopeLabel}</p>

        <div className="audio-recorder-controls">
          {isPreparing ? (
            <button type="button" disabled aria-label="질문 재생과 녹음 시작 준비 중">
              {preparationStatus || "녹음 준비 중…"}
            </button>
          ) : (recorder.recordingStatus === "idle" ||
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
                onClick={stopRecording}
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

        {speechDraftConfig && (
          <div className="audio-recorder-speech-draft">
            <label className="audio-recorder-speech-option">
              <input
                type="checkbox"
                checked={speechDraftEnabled}
                disabled={
                  busy ||
                  speechDraftConfig.disabled ||
                  !speechDraft.isSupported
                }
                onChange={(event) => setSpeechDraftEnabled(event.target.checked)}
              />
              <span>녹음하면서 영어 음성 초안 만들기</span>
            </label>
            {!speechDraft.isSupported && (
              <p className="audio-recorder-speech-help">
                이 브라우저는 음성 초안을 지원하지 않아요. 녹음과 다시 듣기는 그대로 사용할 수 있습니다.
              </p>
            )}
            {speechDraft.isSupported && (
              <p className="audio-recorder-speech-help">
                선택한 경우 브라우저 음성 인식이 네트워크를 사용하거나 음성을 인식 서비스로 전송할 수 있습니다.
              </p>
            )}

            {(speechDraft.status !== "idle" || speechDraft.draftText || speechDraft.errorMessage) && (
              <div className="audio-recorder-speech-editor">
                <label htmlFor={`speech-draft-${scopeLabel}`}>음성 초안</label>
                <textarea
                  id={`speech-draft-${scopeLabel}`}
                  value={speechDraft.draftText}
                  disabled={speechDraft.status === "starting" || speechDraft.status === "listening"}
                  rows={5}
                  placeholder="녹음이 끝나면 인식된 영어를 바로 수정할 수 있어요."
                  onChange={(event) => speechDraft.setDraftText(event.target.value)}
                />
                {(speechDraft.status === "starting" || speechDraft.status === "listening") && (
                  <p className="audio-recorder-speech-status" aria-live="polite">
                    영어 음성을 받아 적는 중입니다…
                  </p>
                )}
                {speechDraft.errorMessage && (
                  <p className="audio-recorder-error" role="alert">
                    {speechDraft.errorMessage}
                  </p>
                )}
                <div className="audio-recorder-speech-actions">
                  {speechDraftConfig.existingAnswer?.trim() ? (
                    <>
                      <button
                        type="button"
                        disabled={!speechDraft.draftText.trim() || busy || speechDraftConfig.disabled}
                        onClick={() => applySpeechDraft("replace")}
                      >
                        기존 답변 바꾸기
                      </button>
                      <button
                        type="button"
                        disabled={!speechDraft.draftText.trim() || busy || speechDraftConfig.disabled}
                        onClick={() => applySpeechDraft("append")}
                      >
                        기존 답변 뒤에 추가
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!speechDraft.draftText.trim() || busy || speechDraftConfig.disabled}
                      onClick={() => applySpeechDraft("replace")}
                    >
                      나만의 답변에 넣기
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    disabled={!speechDraft.draftText && !speechDraft.errorMessage}
                    onClick={() => {
                      speechDraft.clear();
                      setSavedSpeechDraft("");
                      setMessage("");
                    }}
                  >
                    초안 지우기
                  </button>
                </div>
              </div>
            )}
          </div>
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
