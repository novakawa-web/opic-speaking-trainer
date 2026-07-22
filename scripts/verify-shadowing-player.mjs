import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cards } from "../src/data/cards.ts";
import {
  fallbackSegmentEnglishText,
  segmentEnglishText,
  splitSpeechChunks,
} from "../src/utils/sentenceSegmenter.ts";
import {
  MAX_DIRECT_PRACTICE_LENGTH,
  clampSentenceIndex,
  createCustomTextSource,
  createModelAnswerSource,
  createMyAnswerSource,
  createShadowingPlayerState,
  createShadowingSourceFingerprint,
  createSentenceSelectionPlaybackState,
  getSentencePressAction,
  getNextSentenceIndex,
  getPreviousSentenceIndex,
  getStatusAfterBackground,
  isPlaybackTargetSufficientlyVisible,
  revealPlaybackTarget,
  shouldHandlePlaybackScrollRequest,
  isValidDirectPracticeText,
  supportsScreenWakeLock,
} from "../src/utils/shadowingPlayer.ts";
import {
  chooseEnglishVoice,
  isVoiceStillAvailable,
  requestEnglishVoice,
} from "../src/utils/englishVoice.ts";
import {
  calculateDynamicRestMs,
  estimateSentenceDurationMs,
  formatRepeatProgress,
  getNextRepeatStep,
  REST_LEVEL_OPTIONS,
} from "../src/utils/shadowingSettings.ts";
import { isTtsRate } from "../src/utils/ttsSettings.ts";
import {
  parseShadowingPlayerSession,
  resolveRestorableShadowingPlayerSession,
} from "../src/utils/uiSessionStorage.ts";

let passed = 0;
function test(name, run) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

async function testAsync(name, run) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("기본 문장 분리", () => {
  assert.deepEqual(segmentEnglishText("I like it. It is fun!"), ["I like it.", "It is fun!"]);
});
test("여러 문장과 물음표", () => {
  assert.equal(segmentEnglishText("Do you exercise? I walk. I feel good.").length, 3);
});
test("줄바꿈", () => {
  assert.deepEqual(segmentEnglishText("First line.\nSecond line."), ["First line.", "Second line."]);
});
test("문장부호 없는 마지막 문장", () => {
  assert.deepEqual(fallbackSegmentEnglishText("It is nice. I like this place"), ["It is nice.", "I like this place"]);
});
test("빈 줄 제거", () => {
  assert.deepEqual(segmentEnglishText("\n\nHello.\n\nThanks."), ["Hello.", "Thanks."]);
});
test("약어 보호 fallback", () => {
  assert.deepEqual(fallbackSegmentEnglishText("Dr. Kim is here. He is nice."), ["Dr. Kim is here.", "He is nice."]);
});
test("소수점 보호 fallback", () => {
  assert.deepEqual(fallbackSegmentEnglishText("I walked 3.5 miles. It was hard."), ["I walked 3.5 miles.", "It was hard."]);
});
test("따옴표 뒤 문장부호", () => {
  assert.deepEqual(fallbackSegmentEnglishText('She said, "Hello." Then we left.'), ['She said, "Hello."', "Then we left."]);
});
test("한 문장 지문", () => {
  assert.equal(segmentEnglishText("Just one sentence.").length, 1);
});
test("공백 입력 거부", () => {
  assert.equal(isValidDirectPracticeText("   \n"), false);
});
test("20,000자 제한", () => {
  assert.equal(isValidDirectPracticeText("a".repeat(MAX_DIRECT_PRACTICE_LENGTH + 1)), false);
});
test("currentIndex 경계", () => {
  assert.equal(clampSentenceIndex(-10, 3), 0);
  assert.equal(clampSentenceIndex(10, 3), 2);
});
test("이전 문장", () => {
  assert.equal(getPreviousSentenceIndex(2, 4), 1);
  assert.equal(getPreviousSentenceIndex(0, 4), 0);
});
test("다음 문장", () => {
  assert.equal(getNextSentenceIndex(1, 4), 2);
  assert.equal(getNextSentenceIndex(3, 4), 3);
});
test("빈 source는 error 상태", () => {
  assert.equal(createShadowingPlayerState(createCustomTextSource("빈 지문", " ")).status, "error");
});
test("completed 후 재시작 기준 index", () => {
  assert.equal(clampSentenceIndex(0, 5), 0);
});
test("stop 후 위치 유지용 index", () => {
  assert.equal(clampSentenceIndex(3, 5), 3);
});
test("특정 문장 seek", () => {
  assert.equal(clampSentenceIndex(2, 5), 2);
});
test("속도 값 공유", () => {
  assert.deepEqual([0.7, 0.85, 1, 1.15, 1.3].map(isTtsRate), [true, true, true, true, true]);
});
test("영어 음성 없음", () => {
  assert.equal(chooseEnglishVoice([{ lang: "ko-KR" }, { lang: "ja-JP" }]), null);
});
test("Ava en-US 음성을 다른 영어 음성보다 우선한다", () => {
  const regular = { name: "English US", lang: "en-US", voiceURI: "regular-en-us" };
  const ava = { name: "Microsoft Ava Online", lang: "en-US", voiceURI: "ava-online" };
  assert.equal(chooseEnglishVoice([regular, ava]), ava);
});
test("Ava en-GB 음성도 en-US 일반 음성보다 우선한다", () => {
  const regular = { name: "English US", lang: "en-US", voiceURI: "regular-en-us" };
  const ava = { name: "Ava UK", lang: "en-GB", voiceURI: "microsoft-ava-gb" };
  assert.equal(chooseEnglishVoice([regular, ava]), ava);
});
test("Ava 이름의 비영어 음성은 선택하지 않는다", () => {
  const koreanAva = { name: "Ava Korean", lang: "ko-KR", voiceURI: "ava-ko" };
  const english = { name: "English UK", lang: "en-GB", voiceURI: "english-gb" };
  assert.equal(chooseEnglishVoice([koreanAva, english]), english);
});
test("Ava가 없으면 기존 en-US, en-GB, 기타 영어 순서를 유지한다", () => {
  const other = { name: "English AU", lang: "en-AU", voiceURI: "english-au" };
  const british = { name: "English UK", lang: "en-GB", voiceURI: "english-gb" };
  const american = { name: "English US", lang: "en-US", voiceURI: "english-us" };
  assert.equal(chooseEnglishVoice([other, british, american]), american);
  assert.equal(chooseEnglishVoice([other, british]), british);
  assert.equal(chooseEnglishVoice([other]), other);
});
test("stale cached voice is replaced from the current voice list", () => {
  const stale = { name: "Old English", lang: "en-US", voiceURI: "old" };
  const current = { name: "Current English", lang: "en-US", voiceURI: "current" };
  assert.equal(isVoiceStillAvailable(stale, [current]), false);
  assert.equal(chooseEnglishVoice([current]), current);
});
await testAsync("empty voices recover after voiceschanged", async () => {
  let voices = [];
  const listeners = new Set();
  const synthesis = {
    getVoices: () => voices,
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
  };
  const request = requestEnglishVoice(synthesis, { retryDelaysMs: [50] });
  voices = [{ name: "English", lang: "en-US", voiceURI: "english" }];
  for (const listener of listeners) listener();
  const result = await request.promise;
  assert.equal(result.voice, voices[0]);
  assert.equal(result.voicesChanged, true);
  assert.equal(listeners.size, 0);
});
await testAsync("voice retry succeeds after a transient non-English list", async () => {
  const english = { name: "English", lang: "en-GB", voiceURI: "english" };
  let reads = 0;
  const listeners = new Set();
  const synthesis = {
    getVoices: () => (++reads === 1 ? [{ name: "Korean", lang: "ko-KR", voiceURI: "ko" }] : [english]),
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
  };
  const result = await requestEnglishVoice(synthesis, {
    retryDelaysMs: [1, 5],
  }).promise;
  assert.equal(result.voice, english);
  assert.ok(result.attempts >= 2);
});
await testAsync("voice retry reports final failure only after its last attempt", async () => {
  const listeners = new Set();
  const synthesis = {
    getVoices: () => [{ name: "Korean", lang: "ko-KR", voiceURI: "ko" }],
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
  };
  const result = await requestEnglishVoice(synthesis, {
    retryDelaysMs: [1, 3],
  }).promise;
  assert.equal(result.voice, null);
  assert.equal(result.cancelled, false);
  assert.equal(result.attempts, 3);
});
await testAsync("cancelled voice retry clears timers and listeners", async () => {
  const listeners = new Set();
  const synthesis = {
    getVoices: () => [],
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
  };
  const request = requestEnglishVoice(synthesis, { retryDelaysMs: [50, 100] });
  request.cancel();
  const result = await request.promise;
  assert.equal(result.cancelled, true);
  assert.equal(listeners.size, 0);
});
test("Wake Lock 미지원 fallback", () => {
  assert.equal(supportsScreenWakeLock({}), false);
  assert.equal(supportsScreenWakeLock({ wakeLock: { request() {} } }), true);
});
test("visibility hidden: playing은 paused", () => {
  assert.equal(getStatusAfterBackground("playing"), "paused");
  assert.equal(getStatusAfterBackground("loading"), "paused");
  assert.equal(getStatusAfterBackground("resting"), "paused");
});
test("visibility 복귀: paused와 index 정책 유지", () => {
  assert.equal(getStatusAfterBackground("paused"), "paused");
  assert.equal(clampSentenceIndex(4, 7), 4);
});
test("background 복귀 후 자동 재생 금지 상태", () => {
  assert.notEqual(getStatusAfterBackground("playing"), "playing");
});
test("카드 기본 답변 source 생성", () => {
  const source = createModelAnswerSource(cards[0]);
  assert.equal(source.sourceType, "modelAnswer");
  assert.equal(source.sourceText.split("\n")[0], cards[0].back[0]);
});
test("나만의 답변 source 생성", () => {
  const source = createMyAnswerSource(cards[0], "My first line.\nMy second line.");
  assert.equal(source.sourceType, "myAnswer");
  assert.equal(segmentEnglishText(source.sourceText).length, 2);
});
test("직접 지문 source 생성", () => {
  const source = createCustomTextSource("  News  ", "  Hello world.  ");
  assert.equal(source.sourceTitle, "News");
  assert.equal(source.sourceText, "Hello world.");
});
test("긴 utterance 내부 chunk", () => {
  const chunks = splitSpeechChunks("word ".repeat(150), 120);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 121));
});
test("기존 카드 데이터 무변경", () => {
  const before = JSON.stringify(cards[0]);
  createModelAnswerSource(cards[0]);
  assert.equal(JSON.stringify(cards[0]), before);
});

test("휴식 설정은 듣기만 포함 5단계", () => {
  assert.equal(REST_LEVEL_OPTIONS.length, 5);
  assert.equal(REST_LEVEL_OPTIONS[0].value, "none");
  assert.equal(REST_LEVEL_OPTIONS[0].ratio, 0);
});
test("듣기만은 실제 재생 시간과 무관하게 휴식 없음", () => {
  assert.equal(calculateDynamicRestMs(5000, "This is a sentence.", 1, "none"), 0);
});
test("동적 휴식은 실제 문장 재생 시간 비례", () => {
  assert.equal(calculateDynamicRestMs(4000, "Hello.", 1, "short"), 2000);
  assert.equal(calculateDynamicRestMs(4000, "Hello.", 1, "medium"), 3200);
  assert.equal(calculateDynamicRestMs(4000, "Hello.", 1, "long"), 4000);
  assert.equal(calculateDynamicRestMs(4000, "Hello.", 1, "extraLong"), 6000);
});
test("실측 시간이 없으면 현재 TTS 속도로 휴식 추정", () => {
  const slow = estimateSentenceDurationMs("I usually walk near my home.", 0.7);
  const fast = estimateSentenceDurationMs("I usually walk near my home.", 1.3);
  assert.ok(slow > fast);
});
test("전체 반복은 마지막 문장에서만 반복 횟수 증가", () => {
  assert.deepEqual(getNextRepeatStep("full", 3, 0, 2, 0), {
    completed: false,
    completedRepeats: 0,
    nextIndex: 1,
  });
  assert.deepEqual(getNextRepeatStep("full", 3, 1, 2, 0), {
    completed: false,
    completedRepeats: 1,
    nextIndex: 0,
  });
});
test("문장 반복은 지정 횟수 뒤 다음 문장으로 이동", () => {
  assert.deepEqual(getNextRepeatStep("sentence", 3, 4, 8, 1), {
    completed: false,
    completedRepeats: 2,
    nextIndex: 4,
  });
  assert.deepEqual(getNextRepeatStep("sentence", 3, 4, 8, 2), {
    completed: false,
    completedRepeats: 0,
    nextIndex: 5,
  });
});
function collectSentencePlaybackOrder(sentenceCount, repeatCount) {
  const order = [];
  let index = 0;
  let completedRepeats = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    order.push(index);
    const step = getNextRepeatStep(
      "sentence",
      repeatCount,
      index,
      sentenceCount,
      completedRepeats,
    );
    if (step.completed) return order;
    index = step.nextIndex;
    completedRepeats = step.completedRepeats;
  }
  throw new Error("sentence playback did not complete");
}
test("문장 3개를 각 3회 순서대로 재생", () => {
  assert.deepEqual(collectSentencePlaybackOrder(3, 3), [0, 0, 0, 1, 1, 1, 2, 2, 2]);
});
test("첫 문장 3회 뒤 두 번째 문장 이동", () => {
  assert.equal(getNextRepeatStep("sentence", 3, 0, 3, 2).nextIndex, 1);
});
test("마지막 문장의 마지막 반복에서만 완료", () => {
  assert.equal(getNextRepeatStep("sentence", 3, 1, 3, 2).completed, false);
  assert.equal(getNextRepeatStep("sentence", 3, 2, 3, 2).completed, true);
});
test("두 번째 반복에서 멈춘 진행값을 유지", () => {
  assert.deepEqual(getNextRepeatStep("sentence", 3, 1, 3, 1), {
    completed: false,
    completedRepeats: 2,
    nextIndex: 1,
  });
});
test("이어 듣기 후 남은 반복을 마치고 다음 문장 이동", () => {
  const afterResume = getNextRepeatStep("sentence", 3, 1, 3, 2);
  assert.equal(afterResume.nextIndex, 2);
  assert.equal(afterResume.completedRepeats, 0);
});
test("문장 1회는 각 문장을 한 번씩 재생", () => {
  assert.deepEqual(collectSentencePlaybackOrder(3, 1), [0, 1, 2]);
});
test("문장 5회는 각 문장을 다섯 번씩 재생", () => {
  assert.deepEqual(collectSentencePlaybackOrder(2, 5), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
});
test("문장 무한 반복은 현재 문장을 유지", () => {
  assert.deepEqual(getNextRepeatStep("sentence", "infinite", 1, 3, 20), {
    completed: false,
    completedRepeats: 21,
    nextIndex: 1,
  });
});
test("문단 반복은 기존 문단 범위를 유지", () => {
  assert.deepEqual(getNextRepeatStep("paragraph", 3, 2, 5, 0, {
    startSentenceIndex: 1,
    endSentenceIndex: 3,
  }), { completed: false, completedRepeats: 0, nextIndex: 3 });
  assert.deepEqual(getNextRepeatStep("paragraph", 3, 3, 5, 0, {
    startSentenceIndex: 1,
    endSentenceIndex: 3,
  }), { completed: false, completedRepeats: 1, nextIndex: 1 });
});
test("화면 안 대상은 스크롤하지 않음", () => {
  assert.equal(isPlaybackTargetSufficientlyVisible({ top: 100, bottom: 500 }, 800), true);
  let calls = 0;
  const target = { getBoundingClientRect: () => ({ top: 100, bottom: 500 }), scrollIntoView: () => { calls += 1; } };
  assert.equal(revealPlaybackTarget(target, { viewportHeight: 800, reducedMotion: false }), false);
  assert.equal(calls, 0);
});
test("화면 밖 대상은 재생 시 가운데로 스크롤", () => {
  const calls = [];
  const target = { getBoundingClientRect: () => ({ top: 900, bottom: 980 }), scrollIntoView: (value) => calls.push(value) };
  assert.equal(revealPlaybackTarget(target, { viewportHeight: 800, reducedMotion: false }), true);
  assert.deepEqual(calls, [{ block: "center", behavior: "smooth" }]);
});
test("reduced motion에서는 부드러운 스크롤을 사용하지 않음", () => {
  const calls = [];
  const target = { getBoundingClientRect: () => ({ top: -10, bottom: 40 }), scrollIntoView: (value) => calls.push(value) };
  revealPlaybackTarget(target, { viewportHeight: 800, reducedMotion: true });
  assert.equal(calls[0].behavior, "auto");
});
test("같은 unit의 반복 counter 변경은 새 스크롤 요청이 아님", () => {
  const request = { targetKey: "card:sentence:0", explicitRequestVersion: 1 };
  assert.equal(shouldHandlePlaybackScrollRequest(request, request, null, 100), false);
});
test("다음 unit은 한 번의 새 스크롤 검토 대상", () => {
  assert.equal(shouldHandlePlaybackScrollRequest(
    { targetKey: "card:sentence:0", explicitRequestVersion: 1 },
    { targetKey: "card:sentence:1", explicitRequestVersion: 1 },
    null,
    100,
  ), true);
});
test("이어 듣기와 문장 선택은 같은 unit도 명시적으로 다시 검토", () => {
  assert.equal(shouldHandlePlaybackScrollRequest(
    { targetKey: "card:sentence:1", explicitRequestVersion: 1 },
    { targetKey: "card:sentence:1", explicitRequestVersion: 2 },
    null,
    100,
  ), true);
});
test("진행 중인 같은 대상 smooth scroll은 중복하지 않음", () => {
  assert.equal(shouldHandlePlaybackScrollRequest(
    { targetKey: "card:sentence:0", explicitRequestVersion: 1 },
    { targetKey: "card:sentence:0", explicitRequestVersion: 2 },
    { targetKey: "card:sentence:0", until: 800 },
    100,
  ), false);
  assert.equal(shouldHandlePlaybackScrollRequest(
    { targetKey: "card:sentence:0", explicitRequestVersion: 1 },
    { targetKey: "card:sentence:0", explicitRequestVersion: 2 },
    { targetKey: "card:sentence:0", until: 800 },
    801,
  ), true);
});
test("무한 반복은 완료되지 않음", () => {
  assert.equal(getNextRepeatStep("full", "infinite", 1, 2, 99).completed, false);
  assert.equal(formatRepeatProgress("full", "infinite", 3, "active"), "전체 반복 4회째 · 무한");
});

const resumeSettings = {
  repeatMode: "sentence",
  repeatCount: 3,
  restLevel: "short",
};
const resumeSentences = ["One.", "Two.", "Three.", "Four.", "Five."];
const resumeFingerprint = createShadowingSourceFingerprint(resumeSentences);
function createResumeSession(overrides = {}) {
  return {
    active: true,
    sourceType: "modelAnswer",
    cardId: "card-a",
    currentIndex: 2,
    completedRepeats: 1,
    status: "paused",
    questionExpanded: false,
    showFrontKo: false,
    sourceFingerprint: resumeFingerprint,
    ...resumeSettings,
    ...overrides,
  };
}
function resolveResumeSession(session, overrides = {}) {
  return resolveRestorableShadowingPlayerSession(session, {
    sourceType: "modelAnswer",
    cardId: "card-a",
    sourceFingerprint: resumeFingerprint,
    sentenceCount: resumeSentences.length,
    playbackSettings: resumeSettings,
    ...overrides,
  });
}

test("sentence selection starts at the requested sentence with a fresh repeat counter", () => {
  assert.deepEqual(createSentenceSelectionPlaybackState(2, 5), {
    currentIndex: 2,
    completedRepeats: 0,
    status: "loading",
  });
});
test("sentence selection clamps an out-of-range index safely", () => {
  assert.equal(createSentenceSelectionPlaybackState(99, 5).currentIndex, 4);
});
test("idle sentence press starts the selected sentence", () => {
  assert.equal(getSentencePressAction("idle", 0, 2), "restart");
});
test("pressing a different active sentence restarts from that sentence", () => {
  assert.equal(getSentencePressAction("playing", 1, 4), "restart");
});
test("pressing the current active sentence pauses playback or rest", () => {
  assert.equal(getSentencePressAction("loading", 2, 2), "pause");
  assert.equal(getSentencePressAction("playing", 2, 2), "pause");
  assert.equal(getSentencePressAction("resting", 2, 2), "pause");
});
test("pressing a paused sentence restarts it from its first repeat", () => {
  assert.equal(getSentencePressAction("paused", 2, 2), "restart");
  assert.deepEqual(createSentenceSelectionPlaybackState(2, 5), {
    currentIndex: 2,
    completedRepeats: 0,
    status: "loading",
  });
});
test("pressing a different sentence while paused starts that sentence", () => {
  assert.equal(getSentencePressAction("paused", 2, 3), "restart");
});
test("sentence repeat order continues from a selected sentence", () => {
  const order = [];
  let index = 2;
  let repeats = 0;
  for (let guard = 0; guard < 20; guard += 1) {
    order.push(index);
    const step = getNextRepeatStep("sentence", 3, index, 5, repeats);
    if (step.completed) break;
    index = step.nextIndex;
    repeats = step.completedRepeats;
  }
  assert.deepEqual(order, [2, 2, 2, 3, 3, 3, 4, 4, 4]);
});
test("source fingerprint is deterministic and changes with sentence structure", () => {
  assert.equal(createShadowingSourceFingerprint(resumeSentences), resumeFingerprint);
  assert.notEqual(createShadowingSourceFingerprint(["One.", "Two changed."]), resumeFingerprint);
});
test("valid incomplete same-card session restores exact index and repeat progress", () => {
  const restored = resolveResumeSession(createResumeSession());
  assert.equal(restored?.currentIndex, 2);
  assert.equal(restored?.completedRepeats, 1);
});
test("completed session starts fresh", () => {
  assert.equal(resolveResumeSession(createResumeSession({ status: "completed" })), null);
});
test("idle session starts fresh", () => {
  assert.equal(resolveResumeSession(createResumeSession({ status: "idle" })), null);
});
test("different card session does not restore", () => {
  assert.equal(resolveResumeSession(createResumeSession({ cardId: "card-b" })), null);
});
test("changed answer fingerprint does not restore", () => {
  assert.equal(resolveResumeSession(createResumeSession({ sourceFingerprint: "v1-1-deadbeef" })), null);
});
test("out-of-range sentence index does not restore", () => {
  assert.equal(resolveResumeSession(createResumeSession({ currentIndex: 5 })), null);
});
test("repeat progress outside the current setting does not restore", () => {
  assert.equal(resolveResumeSession(createResumeSession({ completedRepeats: 3 })), null);
});
test("changed playback setting does not restore stale progress", () => {
  assert.equal(resolveResumeSession(createResumeSession({ repeatCount: 5 })), null);
});
test("legacy session without content and repeat metadata starts fresh", () => {
  const legacy = parseShadowingPlayerSession(JSON.stringify({
    active: true,
    sourceType: "modelAnswer",
    cardId: "card-a",
    currentIndex: 2,
    status: "paused",
    questionExpanded: false,
    showFrontKo: false,
  }));
  assert.equal(resolveResumeSession(legacy), null);
});
test("damaged session JSON starts fresh", () => {
  assert.equal(resolveResumeSession(parseShadowingPlayerSession("{bad")), null);
});
test("saved passage session cannot leak into a card", () => {
  assert.equal(resolveResumeSession(createResumeSession({
    sourceType: "savedPassage",
    savedPassageId: "passage-a",
    cardId: undefined,
  })), null);
});
test("card session cannot leak into a saved passage", () => {
  assert.equal(resolveRestorableShadowingPlayerSession(createResumeSession(), {
    sourceType: "savedPassage",
    savedPassageId: "passage-a",
    sourceFingerprint: resumeFingerprint,
    sentenceCount: resumeSentences.length,
    playbackSettings: resumeSettings,
  }), null);
});

const shadowingHookSource = await readFile(
  new URL("../src/hooks/useShadowingPlayer.ts", import.meta.url),
  "utf8",
);
const speechHookSource = await readFile(
  new URL("../src/hooks/useSpeechSynthesis.ts", import.meta.url),
  "utf8",
);
const shadowingComponentSource = await readFile(
  new URL("../src/components/ShadowingPlayer.tsx", import.meta.url),
  "utf8",
);
const appHeaderSource = await readFile(
  new URL("../src/components/AppHeader.tsx", import.meta.url),
  "utf8",
);
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
test("shadowing resolves voices again for every playback request", () => {
  assert.match(shadowingHookSource, /requestEnglishVoice\(window\.speechSynthesis/);
  assert.match(shadowingHookSource, /new SpeechSynthesisUtterance/);
  assert.doesNotMatch(shadowingHookSource, /voices\.length > 0[\s\S]{0,120}setStatus\("error"\)/);
});
test("recording interruption resumes from the current sentence with a fresh voice", () => {
  assert.match(shadowingHookSource, /resumeFromSentenceStartRef\.current = true/);
  assert.match(shadowingHookSource, /playSentence\(currentIndexRef\.current\)/);
});
test("speech hook does not retain a SpeechSynthesisVoice object", () => {
  assert.doesNotMatch(speechHookSource, /useRef<SpeechSynthesisVoice/);
  assert.match(speechHookSource, /const currentVoices = window\.speechSynthesis\.getVoices\(\)/);
  assert.match(speechHookSource, /new SpeechSynthesisUtterance/);
});
test("starting TTS stops recorded-audio playback", () => {
  assert.match(shadowingComponentSource, /recorderRef\.current\?\.stopPlayback\(\)/);
  assert.match(shadowingComponentSource, /interruptForExternalSpeech\(\)/);
});
test("stale TTS callbacks are ignored by request id", () => {
  assert.match(shadowingHookSource, /requestId !== requestIdRef\.current/);
});
test("sentence click uses the dedicated play-from-sentence controller", () => {
  assert.match(shadowingComponentSource, /onClick=\{\(\) => startFromSentence\(index\)\}/);
  assert.match(shadowingHookSource, /const playFromSentence = useCallback/);
});
test("sentence click distinguishes current active pause from a fresh restart", () => {
  const clickHandler = shadowingComponentSource.slice(
    shadowingComponentSource.indexOf("const startFromSentence"),
    shadowingComponentSource.indexOf("useKeyboardShortcuts({"),
  );
  assert.match(clickHandler, /getSentencePressAction\(status, currentIndex, index\)/);
  assert.match(clickHandler, /=== "pause"[\s\S]*?pause\(\);[\s\S]*?return/);
  assert.match(clickHandler, /playFromSentence\(index\)/);
});
test("sentence selection cancels stale speech and rest timers before playback", () => {
  const selectionHandler = shadowingHookSource.slice(
    shadowingHookSource.indexOf("const playFromSentence"),
    shadowingHookSource.indexOf("const previousSentence"),
  );
  assert.match(selectionHandler, /cancelSpeech\(\)/);
  assert.match(selectionHandler, /resetProgress\(\)/);
  assert.match(selectionHandler, /playSentence\(selection\.currentIndex\)/);
});
test("sentence click stops competing recorded and question audio", () => {
  const clickHandler = shadowingComponentSource.slice(
    shadowingComponentSource.indexOf("const startFromSentence"),
    shadowingComponentSource.indexOf("useKeyboardShortcuts({"),
  );
  assert.match(clickHandler, /recorderRef\.current\?\.stopPlayback\(\)/);
  assert.match(clickHandler, /stopQuestion\(\)/);
});
test("only sentence buttons start immediate sentence playback", () => {
  assert.match(shadowingComponentSource, /shadowing-sentence[\s\S]*?startFromSentence\(index\)/);
  assert.match(shadowingComponentSource, /shadowing-paragraph-button[\s\S]*?seekToSentence\(paragraph\.startSentenceIndex\)/);
});
test("sentence buttons expose keyboard-native button semantics without repeated play text", () => {
  assert.match(shadowingComponentSource, /type="button"[\s\S]*?aria-label=\{index === currentIndex && isPlaying/);
  assert.match(shadowingComponentSource, /`\$\{index \+ 1\}번 문장부터 재생`/);
  assert.match(shadowingComponentSource, /shadowing-sentence-action/);
  assert.match(shadowingComponentSource, /문장을 누르면 해당 문장부터 재생됩니다\./);
  assert.doesNotMatch(shadowingComponentSource, /: "▶ 재생"/);
});
test("only the current sentence can show a stable playback status", () => {
  assert.match(shadowingComponentSource, /index === currentIndex[\s\S]*?"재생 중"[\s\S]*?"멈춤"/);
  assert.match(stylesSource, /grid-template-columns: 36px minmax\(0, 1fr\) 3\.4rem/);
  assert.match(stylesSource, /\.shadowing-sentence-action \{[\s\S]*?min-height: 1\.4em/);
  assert.doesNotMatch(stylesSource, /\.shadowing-sentence\.is-current p \{\s*font-size:/);
});
test("sentence selection requests one visibility check", () => {
  const clickHandler = shadowingComponentSource.slice(
    shadowingComponentSource.indexOf("const startFromSentence"),
    shadowingComponentSource.indexOf("useKeyboardShortcuts({"),
  );
  assert.match(clickHandler, /setScrollRequestVersion\(\(value\) => value \+ 1\)/);
});
test("valid paused progress shows resume position and restart choice", () => {
  assert.match(shadowingComponentSource, /status === "paused"[\s\S]*?번째 문장부터 이어집니다/);
  assert.match(shadowingComponentSource, /status === "paused"[\s\S]*?처음부터/);
});
test("five playback controls remain mounted in a stable order", () => {
  const controls = shadowingComponentSource.slice(
    shadowingComponentSource.indexOf('<div className="shadowing-control-grid">'),
    shadowingComponentSource.indexOf('<label className="shadowing-rate-control">'),
  );
  const labels = ["처음부터", "이전 문장", "shadowing-play-button", "다음 문장", "정지"];
  let previousIndex = -1;
  for (const label of labels) {
    const nextIndex = controls.indexOf(label);
    assert.ok(nextIndex > previousIndex, `${label} control should keep its position`);
    previousIndex = nextIndex;
  }
  assert.doesNotMatch(controls, /status === "paused" && \(\s*<button/);
  assert.match(stylesSource, /\.shadowing-control-grid \{[\s\S]*?grid-template-columns: repeat\(5, 1fr\)/);
  assert.doesNotMatch(stylesSource, /shadowing-control-grid:not\(\.has-resume\)/);
});
test("rate control stays centered and shadowing question is slightly larger", () => {
  assert.match(stylesSource, /\.shadowing-rate-control \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(126px, max-content\) minmax\(0, 1fr\)/);
  assert.match(stylesSource, /\.shadowing-rate-control select \{[\s\S]*?grid-column: 2;[\s\S]*?justify-self: center/);
  assert.match(stylesSource, /\.shadowing-question-card h2 \{[\s\S]*?font-size: 1\.08rem/);
});
test("idle and completed states use the truthful start-from-beginning label", () => {
  assert.match(shadowingComponentSource, /status === "paused"[\s\S]*?"이어 듣기"[\s\S]*?: "처음부터 재생"/);
});
test("session persistence includes content identity, repeat progress, and settings", () => {
  assert.match(shadowingComponentSource, /sourceFingerprint/);
  assert.match(shadowingComponentSource, /completedRepeats/);
  assert.match(shadowingComponentSource, /repeatMode: playbackSettings\.repeatMode/);
});
test("leaving persists once before stopping and suppresses later effect writes", () => {
  assert.match(shadowingComponentSource, /persistCurrentSession\(true\);[\s\S]*?stop\(\);[\s\S]*?onHome\(\)/);
  assert.match(shadowingComponentSource, /if \(leavingRef\.current\) return/);
  assert.doesNotMatch(appSource, /handlePopState = \(\) => \{\s*clearShadowingPlayerSession\(\);\s*setShadowingSource/);
});
test("card change and unmount cancel speech and timers", () => {
  assert.match(shadowingHookSource, /useEffect\([\s\S]*?cancelSpeech\(\)[\s\S]*?\[cancelSpeech\]/);
  assert.match(shadowingHookSource, /clearTimers\(\)/);
});
test("same sentence repeats do not change the scroll effect dependency", () => {
  const scrollEffectSource = shadowingComponentSource.slice(
    shadowingComponentSource.indexOf("if (scrollRequestVersion === 0)"),
    shadowingComponentSource.indexOf("if (leavingRef.current) return"),
  );
  assert.match(shadowingComponentSource, /shouldHandlePlaybackScrollRequest/);
  assert.match(shadowingComponentSource, /targetKey = `\$\{sourceFingerprint\}:\$\{playbackSettings\.repeatMode\}:\$\{targetIndex\}`/);
  assert.doesNotMatch(scrollEffectSource, /completedRepeats/);
});
test("same target scroll remains locked while smooth scrolling", () => {
  assert.match(shadowingComponentSource, /inFlightScrollRef\.current = \{[\s\S]*?until: now \+ 700/);
});
test("next sentence index change requests one visibility check", () => {
  assert.match(shadowingComponentSource, /revealPlaybackTarget\(currentElement/);
});
test("pause resume explicitly requests current unit visibility", () => {
  assert.match(shadowingComponentSource, /setScrollRequestVersion\(\(value\) => value \+ 1\)[\s\S]*?status === "paused"/);
});
test("휴식 중 일시정지는 다음 unit과 반복 진행을 보존", () => {
  assert.match(shadowingHookSource, /pendingStepRef\.current = step/);
  assert.match(shadowingHookSource, /if \(pendingStepRef\.current\)[\s\S]*?playSentence\(pendingStep\.nextIndex\)/);
});
test("brand is a semantic home button", () => {
  assert.match(appHeaderSource, /<button[\s\S]*?className="brand-home"[\s\S]*?aria-label="홈으로 이동"/);
});
test("home navigation reuses one App handler", () => {
  assert.match(appSource, /function navigateHome\(\)/);
  assert.ok((appSource.match(/onHome=\{navigateHome\}/g) ?? []).length >= 8);
});
test("card library home keeps its existing filter and scroll session implementation", () => {
  assert.match(appSource, /studyTitle="카드 라이브러리"[\s\S]*?onHome=\{navigateHome\}/);
  const homeHandler = appSource.slice(
    appSource.indexOf("function navigateHome()"),
    appSource.indexOf("function addPersonalMemo"),
  );
  assert.doesNotMatch(homeHandler, /resetFilters\(/);
});

console.log(`\n쉐도잉 플레이어 검증 ${passed}/${passed} 통과`);
