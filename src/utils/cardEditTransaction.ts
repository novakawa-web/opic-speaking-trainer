import type { AnswerLearningAnswerSource, OpicCard } from "../types.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  CARD_DATASET_VERSION,
  isOpicCard,
  parseCardDataset,
  type CardDataset,
} from "./cardStorage.ts";
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

export type CardEditErrorCode =
  | "missing-card"
  | "changed-card-id"
  | "invalid-card"
  | "invalid-dataset"
  | "invalid-my-answers";

export class CardEditError extends Error {
  readonly code: CardEditErrorCode;

  constructor(code: CardEditErrorCode) {
    super(`Card edit failed: ${code}.`);
    this.name = "CardEditError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CardEditState = {
  cards: OpicCard[];
  myAnswers: MyAnswers;
};

export type CardEditPlan = CardEditState & {
  card: OpicCard;
  myAnswer: string;
  dataset: CardDataset;
  mutations: StorageMutation[];
};

export type CardEditFailureNotice = {
  message: string;
  highRisk: boolean;
  blockDestructiveActions: boolean;
};

type TransactionRunner = (
  mutations: readonly StorageMutation[],
) => StorageTransactionResult;

function cloneCard(card: OpicCard): OpicCard {
  return {
    ...card,
    tags: [...card.tags],
    hint: { ...card.hint, flow: [...card.hint.flow] },
    back: [...card.back],
  };
}

function hasSameCards(left: readonly OpicCard[], right: readonly OpicCard[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasSameMyAnswers(left: MyAnswers, right: MyAnswers) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => right[key] === left[key])
  );
}

export function isMyAnswerDeletion(currentAnswer: string, nextAnswer: string) {
  return Boolean(normalizeMyAnswerText(currentAnswer)) && !normalizeMyAnswerText(nextAnswer);
}

export function resolveAnswerSourceAfterCardEdit(
  currentSource: AnswerLearningAnswerSource,
  nextMyAnswer: string,
): AnswerLearningAnswerSource {
  return currentSource === "my-answer" && !normalizeMyAnswerText(nextMyAnswer)
    ? "default"
    : currentSource;
}

export function createCardEditPlan({
  cardId,
  card,
  myAnswer,
  currentCards,
  currentMyAnswers,
  localStorage,
  now,
}: {
  cardId: string;
  card: OpicCard;
  myAnswer: string;
  currentCards: readonly OpicCard[];
  currentMyAnswers: MyAnswers;
  localStorage: StorageLike;
  now: Date;
}): CardEditPlan {
  const cardIndex = currentCards.findIndex((candidate) => candidate.id === cardId);
  if (cardIndex < 0) throw new CardEditError("missing-card");
  if (card.id !== cardId) throw new CardEditError("changed-card-id");
  if (!isOpicCard(card)) throw new CardEditError("invalid-card");

  const normalizedCard = cloneCard(card);
  const nextCards = currentCards.map((candidate, index) =>
    index === cardIndex ? normalizedCard : cloneCard(candidate),
  );
  const dataset: CardDataset = {
    version: CARD_DATASET_VERSION,
    updatedAt: now.toISOString(),
    cards: nextCards,
  };
  const rawDataset = JSON.stringify(dataset);
  const parsedDataset = parseCardDataset(rawDataset);
  if (
    !parsedDataset ||
    !hasSameCards(parsedDataset.cards, nextCards) ||
    parsedDataset.cards[cardIndex]?.id !== cardId
  ) {
    throw new CardEditError("invalid-dataset");
  }

  const normalizedCurrentAnswers = normalizeMyAnswers(currentMyAnswers);
  const normalizedMyAnswer = normalizeMyAnswerText(myAnswer);
  const answerCandidate = { ...normalizedCurrentAnswers };
  if (normalizedMyAnswer) answerCandidate[cardId] = normalizedMyAnswer;
  else delete answerCandidate[cardId];
  const nextMyAnswers = normalizeMyAnswers(answerCandidate);
  const rawMyAnswers = Object.keys(nextMyAnswers).length > 0
    ? JSON.stringify(nextMyAnswers)
    : null;
  if (!hasSameMyAnswers(parseMyAnswers(rawMyAnswers), nextMyAnswers)) {
    throw new CardEditError("invalid-my-answers");
  }

  return {
    card: normalizedCard,
    myAnswer: normalizedMyAnswer,
    cards: nextCards,
    myAnswers: nextMyAnswers,
    dataset,
    mutations: [
      {
        area: "local",
        storage: localStorage,
        key: MY_ANSWERS_STORAGE_KEY,
        value: rawMyAnswers,
      },
      {
        area: "local",
        storage: localStorage,
        key: CARD_DATASET_STORAGE_KEY,
        value: rawDataset,
      },
    ],
  };
}

export function executeCardEditTransaction({
  plan,
  commit,
  transactionRunner = runStorageTransaction,
}: {
  plan: CardEditPlan;
  commit: (state: CardEditState) => void;
  transactionRunner?: TransactionRunner;
}) {
  const transaction = transactionRunner(plan.mutations);
  const state = { cards: plan.cards, myAnswers: plan.myAnswers };
  commit(state);
  return { transaction, state, card: plan.card, myAnswer: plan.myAnswer };
}

export function describeCardEditFailure(error: unknown): CardEditFailureNotice {
  if (error instanceof StorageTransactionError) {
    if (!error.rollbackSucceeded || error.rollbackFailureCount > 0) {
      return {
        message:
          "카드 수정을 되돌리는 중 일부 데이터 복구에 실패했습니다. 추가 카드 변경을 중단하고 앱을 새로고침해 현재 저장 상태를 확인해 주세요.",
        highRisk: true,
        blockDestructiveActions: true,
      };
    }
    if (error.quotaExceeded) {
      return {
        message:
          "브라우저 저장 공간 문제로 카드와 나만의 답변을 저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.",
        highRisk: false,
        blockDestructiveActions: false,
      };
    }
    if (error.phase === "snapshot") {
      return {
        message:
          "현재 저장 상태를 확인하지 못해 카드와 나만의 답변을 저장하지 않았습니다. 입력 내용은 그대로 유지됩니다.",
        highRisk: false,
        blockDestructiveActions: false,
      };
    }
    return {
      message:
        "카드와 나만의 답변을 저장하지 못했습니다. 기존 데이터는 복구되었고 입력 내용은 그대로 유지됩니다.",
      highRisk: false,
      blockDestructiveActions: false,
    };
  }

  return {
    message:
      error instanceof CardEditError
        ? "카드와 나만의 답변 내용을 검증하지 못했습니다. 입력 내용을 확인해 주세요."
        : "카드와 나만의 답변을 저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.",
    highRisk: false,
    blockDestructiveActions: false,
  };
}
