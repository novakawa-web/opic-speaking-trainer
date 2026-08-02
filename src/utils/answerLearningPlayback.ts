export type AnswerLearningPlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "completed"
  | "error";

export type AnswerLearningPlaybackMode = "single" | "continuous";

export type AnswerLearningPlaybackState = {
  status: AnswerLearningPlaybackStatus;
  mode: AnswerLearningPlaybackMode;
  currentIndex: number;
};

export function clampAnswerLearningSentenceIndex(
  index: number,
  sentenceCount: number,
) {
  if (sentenceCount <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), sentenceCount - 1);
}

export function createAnswerLearningPlaybackState(): AnswerLearningPlaybackState {
  return {
    status: "idle",
    mode: "single",
    currentIndex: 0,
  };
}

export function startFullAnswerPlayback(
  sentenceCount: number,
): AnswerLearningPlaybackState {
  if (sentenceCount <= 0) return createAnswerLearningPlaybackState();
  return {
    status: "loading",
    mode: "continuous",
    currentIndex: 0,
  };
}

export function startAnswerLearningSentencePlayback(
  state: AnswerLearningPlaybackState,
  requestedIndex: number,
  sentenceCount: number,
): AnswerLearningPlaybackState {
  if (sentenceCount <= 0) return createAnswerLearningPlaybackState();
  const continuesCurrentSequence =
    state.mode === "continuous" &&
    ["loading", "playing", "paused"].includes(state.status);
  return {
    status: "loading",
    mode: continuesCurrentSequence ? "continuous" : "single",
    currentIndex: clampAnswerLearningSentenceIndex(requestedIndex, sentenceCount),
  };
}

export function pauseAnswerLearningPlayback(
  state: AnswerLearningPlaybackState,
): AnswerLearningPlaybackState {
  if (state.status !== "loading" && state.status !== "playing") return state;
  return { ...state, status: "paused" };
}

export function resumeAnswerLearningPlayback(
  state: AnswerLearningPlaybackState,
): AnswerLearningPlaybackState {
  if (state.status !== "paused") return state;
  return { ...state, status: "loading" };
}

export function finishAnswerLearningSentence(
  state: AnswerLearningPlaybackState,
  sentenceCount: number,
): AnswerLearningPlaybackState {
  if (state.mode === "continuous" && state.currentIndex + 1 < sentenceCount) {
    return {
      ...state,
      status: "loading",
      currentIndex: state.currentIndex + 1,
    };
  }
  if (state.mode === "continuous") return { ...state, status: "completed" };
  return createAnswerLearningPlaybackState();
}

export function isAnswerLearningPlaybackActive(
  status: AnswerLearningPlaybackStatus,
) {
  return status === "loading" || status === "playing" || status === "paused";
}
