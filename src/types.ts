export type DeckName =
  | "OPIc 03_주제별답변"
  | "OPIc 04_롤플레이"
  | "OPIc 05_문제해결"
  | "OPIc 06_변화질문";

export type OpicCard = {
  id: string;
  deck: DeckName;
  front: string;
  frontKo?: string;
  firstLine: string;
  hint: {
    title: string;
    memoryTip: string;
    subjectTip?: string;
    minimum: string;
    flow: string[];
  };
  back: string[];
  tags: string[];
};

export type FirstLineStatus = "success" | "again" | "hard" | null;

export type FirstLineStatusMap = Record<string, FirstLineStatus>;

export type FirstLineResult = Exclude<FirstLineStatus, null>;

export type ThemeMode = "light" | "dark";

export type StudyAttempt = {
  id?: string;
  date: string;
  cardId: string;
  status: FirstLineResult;
  timestamp: string;
};

export type StatusUndoEntry = {
  cardId: string;
  previousStatus: FirstLineStatus;
  newStatus: FirstLineResult;
  attemptId: string;
  attemptDate: string;
  attemptTimestamp: string;
};

export type StudyAttemptsByDate = Record<string, StudyAttempt[]>;

export type DailyStudyStats = {
  date: string;
  practicedCardCount: number;
  attemptCount: number;
  successCount: number;
  successRate: number;
};

export type AnswerLearningStatus = "hard" | "learning" | "speakable";

export type AnswerLearningStatuses = Record<string, AnswerLearningStatus>;

export type AnswerLearningAnswerSource = "default" | "my-answer";

export type AnswerLearningAttempt = {
  id: string;
  date: string;
  cardId: string;
  status: AnswerLearningStatus;
  timestamp: string;
  answerSource: AnswerLearningAnswerSource;
};

export type AnswerLearningAttemptsByDate = Record<
  string,
  AnswerLearningAttempt[]
>;

export type AnswerLearningUndoEntry = {
  cardId: string;
  previousStatus: AnswerLearningStatus | null;
  newStatus: AnswerLearningStatus;
  attemptId: string;
  attemptDate: string;
  answerSource: AnswerLearningAnswerSource;
};

export type AnswerLearningDailyStats = {
  date: string;
  attemptCount: number;
  speakableCardCount: number;
};
