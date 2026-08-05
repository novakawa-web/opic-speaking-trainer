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

export type AnswerLearningSentencePressAction = "select" | "play" | "stop";
export type AnswerLearningSentenceSelection = {
  index: number;
  phase: "armed" | "playing";
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

export function shouldStopAnswerLearningSentencePlayback(
  state: AnswerLearningPlaybackState,
  requestedIndex: number,
) {
  return (
    state.mode === "single" &&
    (state.status === "loading" ||
      state.status === "playing" ||
      state.status === "paused") &&
    state.currentIndex === requestedIndex
  );
}

export function resolveAnswerLearningSentencePress(
  state: AnswerLearningPlaybackState,
  selectedIndex: number | null,
  requestedIndex: number,
): AnswerLearningSentencePressAction {
  if (isAnswerLearningPlaybackActive(state.status)) {
    return shouldStopAnswerLearningSentencePlayback(state, requestedIndex)
      ? "stop"
      : "play";
  }
  return selectedIndex === requestedIndex ? "play" : "select";
}

export function resolveAnswerLearningSentenceSelection(
  state: AnswerLearningPlaybackState,
  action: AnswerLearningSentencePressAction,
  requestedIndex: number,
): AnswerLearningSentenceSelection | null {
  if (action === "select") {
    return { index: requestedIndex, phase: "armed" };
  }
  if (action === "stop") return null;
  if (
    state.mode === "continuous" &&
    isAnswerLearningPlaybackActive(state.status)
  ) {
    return null;
  }
  return { index: requestedIndex, phase: "playing" };
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

export function shouldShowAnswerLearningStopControl(
  state: AnswerLearningPlaybackState,
) {
  return state.mode === "continuous" && isAnswerLearningPlaybackActive(state.status);
}
