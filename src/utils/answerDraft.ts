import {
  MY_ANSWERS_STORAGE_KEY,
  normalizeMyAnswerText,
  normalizeMyAnswers,
  parseMyAnswers,
  type MyAnswers,
} from "./myAnswerStorage.ts";
import {
  runStorageTransaction,
  StorageTransactionError,
  type StorageLike,
  type StorageMutation,
  type StorageTransactionResult,
} from "./storageTransaction.ts";

export type AnswerDraftSaveMode = "replace" | "append";

export type AnswerDraftPlan = {
  answer: string;
  myAnswers: MyAnswers;
  mutations: StorageMutation[];
};

export type AnswerDraftFailureNotice = {
  message: string;
  blockDestructiveActions: boolean;
};

type TransactionRunner = (
  mutations: readonly StorageMutation[],
) => StorageTransactionResult;

export class AnswerDraftError extends Error {
  constructor() {
    super("Answer draft could not be validated.");
    this.name = "AnswerDraftError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function hasSameMyAnswers(left: MyAnswers, right: MyAnswers) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => right[key] === left[key])
  );
}

export function combineAnswerDraft(
  currentAnswer: string,
  draft: string,
  mode: AnswerDraftSaveMode,
) {
  const normalizedDraft = normalizeMyAnswerText(draft);
  if (!normalizedDraft) return "";
  if (mode === "replace") return normalizedDraft;

  const normalizedCurrent = normalizeMyAnswerText(currentAnswer);
  return normalizeMyAnswerText(
    normalizedCurrent
      ? `${normalizedCurrent}\n\n${normalizedDraft}`
      : normalizedDraft,
  );
}

export function createAnswerDraftPlan({
  cardId,
  draft,
  mode,
  currentMyAnswers,
  localStorage,
}: {
  cardId: string;
  draft: string;
  mode: AnswerDraftSaveMode;
  currentMyAnswers: MyAnswers;
  localStorage: StorageLike;
}): AnswerDraftPlan {
  const normalizedCurrent = normalizeMyAnswers(currentMyAnswers);
  const answer = combineAnswerDraft(
    normalizedCurrent[cardId] ?? "",
    draft,
    mode,
  );
  if (!cardId.trim() || !answer) throw new AnswerDraftError();

  const myAnswers = normalizeMyAnswers({
    ...normalizedCurrent,
    [cardId]: answer,
  });
  if (myAnswers[cardId] !== answer) throw new AnswerDraftError();

  const rawMyAnswers = JSON.stringify(myAnswers);
  if (!hasSameMyAnswers(parseMyAnswers(rawMyAnswers), myAnswers)) {
    throw new AnswerDraftError();
  }

  return {
    answer,
    myAnswers,
    mutations: [
      {
        area: "local",
        storage: localStorage,
        key: MY_ANSWERS_STORAGE_KEY,
        value: rawMyAnswers,
      },
    ],
  };
}

export function executeAnswerDraftTransaction({
  plan,
  commit,
  transactionRunner = runStorageTransaction,
}: {
  plan: AnswerDraftPlan;
  commit: (myAnswers: MyAnswers) => void;
  transactionRunner?: TransactionRunner;
}) {
  const transaction = transactionRunner(plan.mutations);
  commit(plan.myAnswers);
  return { transaction, myAnswers: plan.myAnswers, answer: plan.answer };
}

export function describeAnswerDraftFailure(
  error: unknown,
): AnswerDraftFailureNotice {
  if (error instanceof StorageTransactionError) {
    if (!error.rollbackSucceeded || error.rollbackFailureCount > 0) {
      return {
        message:
          "저장 상태를 되돌리는 중 일부 복구에 실패했습니다. 초안은 유지되지만, 앱을 새로고침해 기존 답변을 확인해 주세요.",
        blockDestructiveActions: true,
      };
    }
    if (error.quotaExceeded) {
      return {
        message:
          "브라우저 저장 공간 문제로 나만의 답변에 넣지 못했습니다. 초안은 그대로 유지됩니다.",
        blockDestructiveActions: false,
      };
    }
    return {
      message:
        "나만의 답변에 저장하지 못했습니다. 기존 답변은 유지되며 초안도 그대로 남아 있습니다.",
      blockDestructiveActions: false,
    };
  }

  return {
    message:
      error instanceof AnswerDraftError
        ? "비어 있지 않은 음성 초안을 확인해 주세요."
        : "나만의 답변에 저장하지 못했습니다. 초안은 그대로 유지됩니다.",
    blockDestructiveActions: false,
  };
}
