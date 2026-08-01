import type {
  AnswerLearningStatus,
  FirstLineResult,
} from "../types";

export const FIRST_LINE_STATUS_OPTIONS = [
  { value: "success", label: "성공", symbol: "✓", shortcut: "A" },
  { value: "again", label: "연습 필요", symbol: "↻", shortcut: "S" },
  { value: "hard", label: "어려움", symbol: "!", shortcut: "D" },
] as const satisfies readonly {
  value: FirstLineResult;
  label: string;
  symbol: string;
  shortcut: string;
}[];

export const ANSWER_LEARNING_STATUS_OPTIONS = [
  { value: "speakable", label: "말할 수 있음", symbol: "✓" },
  { value: "learning", label: "익히는 중", symbol: "↻" },
  { value: "hard", label: "어려움", symbol: "!" },
] as const satisfies readonly {
  value: AnswerLearningStatus;
  label: string;
  symbol: string;
}[];
