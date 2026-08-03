export type FirstLineRevealStage = "hidden" | "first-line" | "full-answer";

export function toggleFirstLineReveal(
  stage: FirstLineRevealStage,
): FirstLineRevealStage {
  return stage === "hidden" ? "first-line" : "hidden";
}

export function toggleFullAnswerReveal(
  stage: FirstLineRevealStage,
  hasFullAnswer: boolean,
): FirstLineRevealStage {
  if (!hasFullAnswer || stage === "hidden") return stage;
  return stage === "full-answer" ? "first-line" : "full-answer";
}

export function isFirstLineRevealed(stage: FirstLineRevealStage) {
  return stage !== "hidden";
}

export function isFullAnswerRevealed(stage: FirstLineRevealStage) {
  return stage === "full-answer";
}
