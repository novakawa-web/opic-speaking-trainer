import type { OpicCard } from "../types.ts";
import {
  CARD_DATASET_STORAGE_KEY,
  CARD_DATASET_VERSION,
  isOpicCard,
  parseCardDataset,
  type CardDataset,
} from "./cardStorage.ts";
import {
  runStorageTransaction,
  type StorageLike,
  type StorageMutation,
  type StorageTransactionResult,
} from "./storageTransaction.ts";

export const CARD_CREATION_ID_MAX_ATTEMPTS = 32;
const GENERATED_CARD_ID_PREFIX = "custom-";

export type CardCreationErrorCode =
  | "duplicate-card"
  | "id-generation-failed"
  | "invalid-card"
  | "invalid-dataset";

export class CardCreationError extends Error {
  readonly code: CardCreationErrorCode;
  readonly existingCardId?: string;

  constructor(code: CardCreationErrorCode, existingCardId?: string) {
    super(`Card creation failed: ${code}.`);
    this.name = "CardCreationError";
    this.code = code;
    this.existingCardId = existingCardId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CardIdSource = () => string;

export type CardCreationPlan = {
  card: OpicCard;
  nextCards: OpicCard[];
  dataset: CardDataset;
  mutations: StorageMutation[];
};

export type CreateCardCreationPlanOptions = {
  card: OpicCard;
  currentCards: readonly OpicCard[];
  archivedCardIds: readonly string[];
  localStorage: StorageLike;
  now: Date;
  createId?: CardIdSource;
  maxIdAttempts?: number;
};

export type ExecuteCardCreationOptions = {
  plan: CardCreationPlan;
  commit: (cards: OpicCard[]) => void;
};

export type CardCreationExecution = {
  transaction: StorageTransactionResult;
  card: OpicCard;
};

function normalizeComparable(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

function getCrypto(): Crypto | undefined {
  return typeof globalThis.crypto === "object" ? globalThis.crypto : undefined;
}

export function createRandomCardId(): string {
  const crypto = getCrypto();
  if (typeof crypto?.randomUUID === "function") {
    return `${GENERATED_CARD_ID_PREFIX}${crypto.randomUUID()}`;
  }
  if (typeof crypto?.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    return `${GENERATED_CARD_ID_PREFIX}${hex}`;
  }
  throw new CardCreationError("id-generation-failed");
}

export function generateUniqueCardId({
  currentCards,
  archivedCardIds,
  createId = createRandomCardId,
  maxAttempts = CARD_CREATION_ID_MAX_ATTEMPTS,
}: {
  currentCards: readonly OpicCard[];
  archivedCardIds: readonly string[];
  createId?: CardIdSource;
  maxAttempts?: number;
}): string {
  const occupiedIds = new Set([
    ...currentCards.map((card) => card.id),
    ...archivedCardIds,
  ]);
  const attempts = Number.isInteger(maxAttempts) && maxAttempts > 0
    ? maxAttempts
    : CARD_CREATION_ID_MAX_ATTEMPTS;

  for (let index = 0; index < attempts; index += 1) {
    const id = createId().trim();
    if (
      id &&
      id !== "__proto__" &&
      id !== "prototype" &&
      id !== "constructor" &&
      !occupiedIds.has(id)
    ) {
      return id;
    }
  }
  throw new CardCreationError("id-generation-failed");
}

export function findDuplicateCard(
  currentCards: readonly OpicCard[],
  candidate: Pick<OpicCard, "front" | "back">,
): OpicCard | null {
  const normalizedFront = normalizeComparable(candidate.front);
  const normalizedAnswer = normalizeComparable(candidate.back.join("\n"));
  return currentCards.find(
    (card) =>
      normalizeComparable(card.front) === normalizedFront &&
      normalizeComparable(card.back.join("\n")) === normalizedAnswer,
  ) ?? null;
}

export function createCardCreationPlan({
  card,
  currentCards,
  archivedCardIds,
  localStorage,
  now,
  createId,
  maxIdAttempts,
}: CreateCardCreationPlanOptions): CardCreationPlan {
  const duplicate = findDuplicateCard(currentCards, card);
  if (duplicate) {
    throw new CardCreationError("duplicate-card", duplicate.id);
  }

  const id = generateUniqueCardId({
    currentCards,
    archivedCardIds,
    createId,
    maxAttempts: maxIdAttempts,
  });
  const createdCard: OpicCard = {
    ...card,
    id,
    tags: [...card.tags],
    hint: { ...card.hint, flow: [...card.hint.flow] },
    back: [...card.back],
  };
  if (!isOpicCard(createdCard)) {
    throw new CardCreationError("invalid-card");
  }

  const nextCards = [...currentCards, createdCard];
  const dataset: CardDataset = {
    version: CARD_DATASET_VERSION,
    updatedAt: now.toISOString(),
    cards: nextCards,
  };
  const rawDataset = JSON.stringify(dataset);
  const parsedDataset = parseCardDataset(rawDataset);
  if (
    !parsedDataset ||
    parsedDataset.cards.length !== nextCards.length ||
    parsedDataset.cards.at(-1)?.id !== createdCard.id
  ) {
    throw new CardCreationError("invalid-dataset");
  }

  return {
    card: createdCard,
    nextCards,
    dataset,
    mutations: [
      {
        area: "local",
        storage: localStorage,
        key: CARD_DATASET_STORAGE_KEY,
        value: rawDataset,
      },
    ],
  };
}

export function executeCardCreationTransaction({
  plan,
  commit,
}: ExecuteCardCreationOptions): CardCreationExecution {
  const transaction = runStorageTransaction(plan.mutations);
  commit(plan.nextCards);
  return { transaction, card: plan.card };
}

export function describeCardCreationError(error: unknown): string {
  if (error instanceof CardCreationError) {
    if (error.code === "duplicate-card") {
      return "같은 질문과 답변을 가진 카드가 이미 있습니다.";
    }
    if (error.code === "id-generation-failed") {
      return "새 카드 ID를 안전하게 만들지 못했습니다. 저장하지 않았습니다.";
    }
    return "새 카드 내용을 검증하지 못했습니다. 입력 내용을 확인해 주세요.";
  }
  return "새 카드를 저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.";
}
