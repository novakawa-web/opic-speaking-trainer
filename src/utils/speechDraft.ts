export type SpeechDraftStatus =
  | "idle"
  | "starting"
  | "listening"
  | "stopped"
  | "error";

// Browser speech recognition is retained for a future compatibility review,
// but the user-facing control stays locked until target Galaxy browsers and
// long-form recognition are reliable enough for normal study use.
export const SPEECH_DRAFT_FEATURE_ENABLED = false;

export type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

export type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

export function collectSpeechRecognitionText(
  results: SpeechRecognitionResultListLike,
  resultIndex: number,
) {
  const finalParts: string[] = [];
  const interimParts: string[] = [];

  for (let index = Math.max(0, resultIndex); index < results.length; index += 1) {
    const result = results[index];
    const transcript = result?.[0]?.transcript?.trim();
    if (!transcript) continue;
    if (result.isFinal) finalParts.push(transcript);
    else interimParts.push(transcript);
  }

  return {
    finalText: finalParts.join(" "),
    interimText: interimParts.join(" "),
  };
}

export function appendSpeechDraftText(current: string, addition: string) {
  const left = current.trim();
  const right = addition.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

export function getSpeechDraftErrorMessage(errorCode: string) {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "음성 인식 권한을 사용할 수 없어요. 녹음은 그대로 다시 들을 수 있습니다.";
    case "no-speech":
      return "인식된 음성이 없어요. 녹음은 그대로 다시 들을 수 있습니다.";
    case "audio-capture":
      return "음성 인식이 마이크를 함께 사용하지 못했어요. 녹음은 그대로 다시 들을 수 있습니다.";
    case "network":
      return "음성 인식 네트워크에 연결하지 못했어요. 녹음은 그대로 다시 들을 수 있습니다.";
    default:
      return "음성 초안을 만들지 못했어요. 녹음은 그대로 다시 들을 수 있습니다.";
  }
}
