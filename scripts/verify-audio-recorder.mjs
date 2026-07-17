import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AUDIO_MIME_TYPE_PRIORITY,
  GET_USER_MEDIA_TIMEOUT_MS,
  INITIAL_RECORDING_STATE,
  MAX_RECORDING_DURATION_MS,
  MEDIA_RECORDER_START_TIMEOUT_MS,
  RECORDING_INITIALIZATION_TIMEOUT_MESSAGE,
  RecorderRequestCancelledError,
  RecorderTimeoutError,
  chooseAudioRecorderMimeType,
  formatRecordingTime,
  getAudioRecorderSupport,
  getAudioRecorderErrorMessage,
  hasMediaRecorderStarted,
  isConstraintCompatibilityError,
  isCurrentRecorderRequest,
  isLocalMicrophoneHost,
  isRecordingBusy,
  isRecorderRequestCancelledError,
  recordingStateReducer,
  shouldStopRecorderWhenHidden,
} from "../src/utils/audioRecorder.ts";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const blob = new Blob(["voice"], { type: "audio/webm" });

test("initial state is idle", () => {
  assert.equal(INITIAL_RECORDING_STATE.recordingStatus, "idle");
  assert.equal(INITIAL_RECORDING_STATE.audioBlob, null);
});
test("permission request state", () => {
  assert.equal(recordingStateReducer(INITIAL_RECORDING_STATE, { type: "request" }).recordingStatus, "requesting");
});
test("recording state", () => {
  const state = recordingStateReducer(INITIAL_RECORDING_STATE, { type: "record", mimeType: "audio/webm" });
  assert.equal(state.recordingStatus, "recording");
  assert.equal(state.mimeType, "audio/webm");
});
test("elapsed timer tick", () => {
  const state = recordingStateReducer(INITIAL_RECORDING_STATE, { type: "tick", elapsedMs: 12_345 });
  assert.equal(state.elapsedMs, 12_345);
});
test("stop stores memory blob and url", () => {
  const state = recordingStateReducer(INITIAL_RECORDING_STATE, {
    type: "stop", audioBlob: blob, audioUrl: "blob:test", elapsedMs: 1_000, mimeType: blob.type,
  });
  assert.equal(state.recordingStatus, "stopped");
  assert.equal(state.audioBlob, blob);
  assert.equal(state.audioUrl, "blob:test");
});
test("playback starts", () => {
  const stopped = recordingStateReducer(INITIAL_RECORDING_STATE, {
    type: "stop", audioBlob: blob, audioUrl: "blob:test", elapsedMs: 1_000, mimeType: blob.type,
  });
  assert.equal(recordingStateReducer(stopped, { type: "play" }).recordingStatus, "playing");
});
test("playback end returns to stopped", () => {
  const playing = { ...INITIAL_RECORDING_STATE, recordingStatus: "playing", audioBlob: blob };
  assert.equal(recordingStateReducer(playing, { type: "playback-stop" }).recordingStatus, "stopped");
});
test("playback stop without audio returns idle", () => {
  const playing = { ...INITIAL_RECORDING_STATE, recordingStatus: "playing" };
  assert.equal(recordingStateReducer(playing, { type: "playback-stop" }).recordingStatus, "idle");
});
test("clear deletes current in-memory recording", () => {
  const state = recordingStateReducer({ ...INITIAL_RECORDING_STATE, recordingStatus: "stopped", audioBlob: blob, audioUrl: "blob:test" }, { type: "clear" });
  assert.deepEqual(state, INITIAL_RECORDING_STATE);
});
test("error state keeps a friendly message", () => {
  const state = recordingStateReducer(INITIAL_RECORDING_STATE, { type: "error", message: "error" });
  assert.equal(state.recordingStatus, "error");
  assert.equal(state.errorMessage, "error");
});
test("maximum recording duration is three minutes", () => assert.equal(MAX_RECORDING_DURATION_MS, 180_000));
test("getUserMedia timeout is fifteen seconds", () => assert.equal(GET_USER_MEDIA_TIMEOUT_MS, 15_000));
test("MediaRecorder start timeout is five seconds", () => assert.equal(MEDIA_RECORDER_START_TIMEOUT_MS, 5_000));
test("initialization timeout has a retryable user message", () => {
  assert.match(RECORDING_INITIALIZATION_TIMEOUT_MESSAGE, /다시 시도/);
  const timeout = new RecorderTimeoutError("GET_USER_MEDIA_TIMEOUT");
  assert.equal(timeout.code, "GET_USER_MEDIA_TIMEOUT");
  assert.equal(
    getAudioRecorderErrorMessage(timeout),
    RECORDING_INITIALIZATION_TIMEOUT_MESSAGE,
  );
});
test("requesting rerender keeps the current request token", () => {
  const requestId = 3;
  assert.equal(isCurrentRecorderRequest(requestId, requestId, true), true);
  assert.equal(isCurrentRecorderRequest(requestId, requestId, true), true);
});
test("a fast getUserMedia-like resolve keeps the latest request", async () => {
  const requestId = 7;
  const streamResult = await Promise.resolve({ audioTracks: 1, readyState: "live" });
  assert.equal(isCurrentRecorderRequest(requestId, 7, true), true);
  assert.deepEqual(streamResult, { audioTracks: 1, readyState: "live" });
});
test("StrictMode remount permits a later user request", () => {
  const currentRequestId = 4;
  assert.equal(isCurrentRecorderRequest(4, currentRequestId, true), true);
});
test("only a stale previous request is rejected", () => {
  assert.equal(isCurrentRecorderRequest(3, 4, true), false);
  assert.equal(isCurrentRecorderRequest(4, 4, true), true);
});
test("actual unmount invalidates a late stream", () => {
  assert.equal(isCurrentRecorderRequest(4, 4, false), false);
});
test("timeout and stale cancellation are distinct errors", () => {
  const stale = new RecorderRequestCancelledError("superseded");
  const timeout = new RecorderTimeoutError("GET_USER_MEDIA_TIMEOUT");
  assert.equal(isRecorderRequestCancelledError(stale), true);
  assert.equal(isRecorderRequestCancelledError(timeout), false);
});
test("an error can retry through requesting to recording", () => {
  const failed = recordingStateReducer(INITIAL_RECORDING_STATE, {
    type: "error",
    message: "failed",
  });
  const retrying = recordingStateReducer(failed, { type: "request" });
  const recording = recordingStateReducer(retrying, {
    type: "record",
    mimeType: "audio/webm",
  });
  assert.equal(retrying.recordingStatus, "requesting");
  assert.equal(recording.recordingStatus, "recording");
});
test("recording time formats minutes", () => assert.equal(formatRecordingTime(63_900), "01:03"));
test("negative recording time is clamped", () => assert.equal(formatRecordingTime(-1), "00:00"));
test("requesting is busy", () => assert.equal(isRecordingBusy("requesting"), true));
test("recording is busy", () => assert.equal(isRecordingBusy("recording"), true));
test("recorded playback is not microphone busy", () => assert.equal(isRecordingBusy("playing"), false));
test("hidden recording must stop", () => assert.equal(shouldStopRecorderWhenHidden("recording", "hidden"), true));
test("hidden requesting must cancel", () => assert.equal(shouldStopRecorderWhenHidden("requesting", "hidden"), true));
test("hidden playback must pause", () => assert.equal(shouldStopRecorderWhenHidden("playing", "hidden"), true));
test("visible recording remains active", () => assert.equal(shouldStopRecorderWhenHidden("recording", "visible"), false));
test("opus mime type has first priority", () => {
  assert.equal(chooseAudioRecorderMimeType({ isTypeSupported: () => true }), AUDIO_MIME_TYPE_PRIORITY[0]);
});
test("webm mime type is fallback", () => {
  assert.equal(chooseAudioRecorderMimeType({ isTypeSupported: (value) => value === "audio/webm" }), "audio/webm");
});
test("mp4 mime type supports Safari fallback", () => {
  assert.equal(chooseAudioRecorderMimeType({ isTypeSupported: (value) => value === "audio/mp4" }), "audio/mp4");
});
test("browser default mime type is final fallback", () => {
  assert.equal(chooseAudioRecorderMimeType({ isTypeSupported: () => false }), "");
});
test("LAN HTTP is reported as an insecure context", () => {
  const support = getAudioRecorderSupport({
    isSecureContext: false,
    hostname: "172.30.1.7",
    protocol: "http:",
    hasGetUserMedia: false,
    hasMediaRecorder: true,
  });
  assert.equal(support.reason, "insecure-context");
  assert.match(support.message, /HTTPS 주소/);
});
test("HTTP localhost is accepted as a trusted local environment", () => {
  const support = getAudioRecorderSupport({
    isSecureContext: false,
    hostname: "localhost",
    protocol: "http:",
    hasGetUserMedia: true,
    hasMediaRecorder: true,
  });
  assert.equal(support.reason, "supported");
});
test("HTTP 127.0.0.1 is accepted as a trusted local environment", () => {
  const support = getAudioRecorderSupport({
    isSecureContext: false,
    hostname: "127.0.0.1",
    protocol: "http:",
    hasGetUserMedia: true,
    hasMediaRecorder: true,
  });
  assert.equal(support.reason, "supported");
});
test("secure context without getUserMedia reports media access unavailable", () => {
  const support = getAudioRecorderSupport({
    isSecureContext: true,
    hostname: "example.test",
    protocol: "https:",
    hasGetUserMedia: false,
    hasMediaRecorder: true,
  });
  assert.equal(support.reason, "media-devices-unavailable");
  assert.match(support.message, /마이크 접근 기능/);
});
test("MediaRecorder absence uses the browser recording message only", () => {
  const support = getAudioRecorderSupport({
    isSecureContext: true,
    hostname: "example.test",
    protocol: "https:",
    hasGetUserMedia: true,
    hasMediaRecorder: false,
  });
  assert.equal(support.reason, "media-recorder-unavailable");
  assert.match(support.message, /음성 녹음/);
});
test("local microphone host detection includes loopback only", () => {
  assert.equal(isLocalMicrophoneHost("localhost"), true);
  assert.equal(isLocalMicrophoneHost("127.0.0.1"), true);
  assert.equal(isLocalMicrophoneHost("[::1]"), true);
  assert.equal(isLocalMicrophoneHost("172.30.1.7"), false);
});
test("constraint compatibility errors permit one simple fallback", () => {
  assert.equal(isConstraintCompatibilityError({ name: "OverconstrainedError" }), true);
  assert.equal(isConstraintCompatibilityError({ name: "ConstraintNotSatisfiedError" }), true);
  assert.equal(isConstraintCompatibilityError({ name: "NotSupportedError" }), true);
  assert.equal(isConstraintCompatibilityError({ name: "TypeError" }), true);
});
test("permission denial never uses the constraint fallback", () => {
  assert.equal(isConstraintCompatibilityError({ name: "NotAllowedError" }), false);
});
test("recorder state can confirm start before onstart arrives", () => {
  assert.equal(hasMediaRecorderStarted("recording", false), true);
  assert.equal(hasMediaRecorderStarted("inactive", false), false);
});
test("onstart can confirm start on compatible engines", () => {
  assert.equal(hasMediaRecorderStarted("inactive", true), true);
});
test("permission denial message", () => assert.match(getAudioRecorderErrorMessage({ name: "NotAllowedError" }), /권한/));
test("missing microphone message", () => assert.match(getAudioRecorderErrorMessage({ name: "NotFoundError" }), /마이크/));
test("busy microphone message", () => assert.match(getAudioRecorderErrorMessage({ name: "NotReadableError" }), /다른 앱/));
test("aborted microphone message", () => assert.match(getAudioRecorderErrorMessage({ name: "AbortError" }), /중단/));
test("generic recorder error message", () => assert.match(getAudioRecorderErrorMessage(new Error("x")), /다시 시도/));

const hookSource = await readFile(new URL("../src/hooks/useAudioRecorder.ts", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../src/components/AudioRecorder.tsx", import.meta.url), "utf8");
const playerSource = await readFile(new URL("../src/components/ShadowingPlayer.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("../src/components/CardDetail.tsx", import.meta.url), "utf8");

test("stream tracks are stopped", () => assert.match(hookSource, /track\.stop\(\)/));
test("object URLs are revoked", () => assert.match(hookSource, /URL\.revokeObjectURL/));
test("recording timers are cleaned", () => {
  assert.match(hookSource, /clearInterval/);
  assert.match(hookSource, /clearTimeout/);
});
test("background visibility and pagehide are handled", () => {
  assert.match(hookSource, /visibilitychange/);
  assert.match(hookSource, /pagehide/);
});
test("development diagnostics cover all recorder initialization stages", () => {
  for (const stage of [
    "support check 시작",
    "getUserMedia 호출 직전",
    "getUserMedia resolved",
    "stream accepted",
    "MIME 타입 선택",
    "recorder created",
    "event handler 연결",
    "MediaRecorder.start() 호출",
    "recorder start 이벤트",
    "recorder.state 확인",
    "recording",
  ]) {
    assert.match(hookSource, new RegExp(stage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(hookSource, /track\.label/);
});
test("late getUserMedia streams are stopped", () => {
  assert.match(hookSource, /late stream 정리/);
  assert.match(hookSource, /stopTracks\(stream\)/);
});
test("StrictMode effect setup resets mounted state", () => {
  assert.match(hookSource, /unmountedRef\.current = false/);
  assert.match(hookSource, /unmountedRef\.current = true/);
  assert.doesNotMatch(hookSource, /Recording initialization cancelled/);
});
test("stale requests stay out of the user error state", () => {
  assert.match(hookSource, /if \(isSilentCancellation\) return/);
  assert.match(hookSource, /reason: error\.reason/);
});
test("stopping an active recorder preserves its request until onstop", () => {
  const stopRecordingBlock = hookSource.slice(
    hookSource.indexOf("const stopRecording = useCallback"),
    hookSource.indexOf("const clearRecording = useCallback"),
  );
  assert.match(stopRecordingBlock, /const wasRequesting/);
  assert.match(
    stopRecordingBlock,
    /if \(wasRequesting\) \{[\s\S]*requestIdRef\.current \+= 1;[\s\S]*cancelInitialization\("superseded"\)/,
  );
  assert.doesNotMatch(
    stopRecordingBlock,
    /const wasRequesting[\s\S]*requestIdRef\.current \+= 1;\s*cancelInitialization\("superseded"\);\s*clearTimers/,
  );
});
test("AudioRecorder remains mounted across status button changes", () => {
  assert.equal((componentSource.match(/useAudioRecorder\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(componentSource, /key=\{recorder\.recordingStatus\}/);
});
test("permission checks are diagnostic only", () => {
  assert.match(hookSource, /permissions\?\.query/);
  assert.match(hookSource, /getUserMediaWithTimeout/);
});
test("wake lock failure cannot block recording", () => assert.match(hookSource, /catch \{/));
test("only microphone audio is requested", () => {
  assert.match(hookSource, /video: false/);
  assert.match(hookSource, /echoCancellation: true/);
});
test("recorder component states that audio is not saved", () => assert.match(componentSource, /저장되지 않습니다/));
test("recorder does not use persistent browser storage", () => {
  const combined = `${hookSource}\n${componentSource}`;
  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|download\s*=|fetch\(/i);
});
test("shadowing player pauses TTS before recording", () => {
  assert.match(playerSource, /interruptForExternalSpeech/);
  assert.match(playerSource, /<AudioRecorder/);
});
test("card detail reuses the common recorder", () => {
  assert.match(detailSource, /<AudioRecorder/);
  assert.match(detailSource, /recorderRef\.current\?\.stopPlayback/);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
console.log(`\nAudio recorder verification passed: ${passed}/${tests.length}`);
