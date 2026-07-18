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
  getNextSentenceIndex,
  getPreviousSentenceIndex,
  getStatusAfterBackground,
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
test("현재 문장 반복은 같은 index 유지", () => {
  assert.deepEqual(getNextRepeatStep("sentence", 3, 4, 8, 1), {
    completed: false,
    completedRepeats: 2,
    nextIndex: 4,
  });
  assert.equal(getNextRepeatStep("sentence", 3, 4, 8, 2).completed, true);
});
test("무한 반복은 완료되지 않음", () => {
  assert.equal(getNextRepeatStep("full", "infinite", 1, 2, 99).completed, false);
  assert.equal(formatRepeatProgress("full", "infinite", 3, "active"), "전체 반복 4회째 · 무한");
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

console.log(`\n쉐도잉 플레이어 검증 ${passed}/${passed} 통과`);
