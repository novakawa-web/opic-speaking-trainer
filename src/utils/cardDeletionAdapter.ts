import type { MyAnswers } from "./myAnswerStorage.ts";
import {
  parseCardDetailUiSession,
  parseShadowingPlayerSession,
  CARD_DETAIL_UI_SESSION_KEY,
  SHADOWING_PLAYER_SESSION_KEY,
  type CardDetailUiSession,
  type ShadowingPlayerSession,
} from "./uiSessionStorage.ts";
import {
  validateCardDeletionPlan,
  type CardDeletionPlan,
  type CardDeletionState,
} from "./cardDeletionPlan.ts";
import {
  isStorageQuotaExceededError,
  runStorageTransaction,
  StorageTransactionError,
  type StorageLike,
  type StorageMutation,
  type StorageSnapshot,
  type StorageTransactionResult,
} from "./storageTransaction.ts";

export type CardDeletionIntegrationErrorCode =
  | "invalid-session"
  | "invalid-plan-targets"
  | "invalid-undo-snapshot";

export class CardDeletionIntegrationError extends Error {
  readonly code: CardDeletionIntegrationErrorCode;
  readonly dataKind?: string;

  constructor(
    code: CardDeletionIntegrationErrorCode,
    options: { dataKind?: string } = {},
  ) {
    super(`Card deletion integration failed: ${code}.`);
    this.name = "CardDeletionIntegrationError";
    this.code = code;
    this.dataKind = options.dataKind;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CardDeletionStateAdapterInput = Omit<
  CardDeletionState,
  "cardDetailSession" | "shadowingSession"
> & {
  sessionStorage: StorageLike;
};

export type DeletedCardUndoSnapshot = {
  cardId: string;
  previousState: CardDeletionState;
  deletionPlan: CardDeletionPlan;
  rawStorageSnapshot: StorageSnapshot;
};

export type CardDeletionTransactionExecution = {
  plan: CardDeletionPlan;
  transaction: StorageTransactionResult;
  undoSnapshot: DeletedCardUndoSnapshot;
};

export type CardDeletionUndoExecution = {
  transaction: StorageTransactionResult;
  restoredState: CardDeletionState;
};

export type CardDeletionFailureNotice = {
  message: string;
  highRisk: boolean;
  blockDestructiveActions: boolean;
};

type TransactionRunner = (
  mutations: readonly StorageMutation[],
) => StorageTransactionResult;

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function parseRawSession(raw: string, dataKind: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CardDeletionIntegrationError("invalid-session", { dataKind });
  }
}

function readSessionRaw(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch (error) {
    throw new StorageTransactionError({
      phase: "snapshot",
      rollbackSucceeded: true,
      rollbackFailureCount: 0,
      quotaExceeded: isStorageQuotaExceededError(error),
      area: "session",
      key,
    });
  }
}

function readStrictCardDetailSession(
  storage: StorageLike,
  cardIds: readonly string[],
  myAnswers: MyAnswers,
): CardDetailUiSession | null {
  const raw = readSessionRaw(storage, CARD_DETAIL_UI_SESSION_KEY);
  if (raw === null) return null;
  const value = parseRawSession(raw, "card-detail-session");
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("cardId" in value) ||
    typeof value.cardId !== "string" ||
    !cardIds.includes(value.cardId)
  ) {
    throw new CardDeletionIntegrationError("invalid-session", {
      dataKind: "card-detail-session",
    });
  }
  const parsed = parseCardDetailUiSession(
    raw,
    value.cardId,
    Boolean(myAnswers[value.cardId]),
  );
  if (!sameJson(parsed, value)) {
    throw new CardDeletionIntegrationError("invalid-session", {
      dataKind: "card-detail-session",
    });
  }
  return parsed;
}

function readStrictShadowingSession(
  storage: StorageLike,
  cardIds: readonly string[],
): ShadowingPlayerSession | null {
  const raw = readSessionRaw(storage, SHADOWING_PLAYER_SESSION_KEY);
  if (raw === null) return null;
  const value = parseRawSession(raw, "shadowing-session");
  const parsed = parseShadowingPlayerSession(raw);
  if (
    !parsed ||
    !sameJson(parsed, value) ||
    (parsed.sourceType !== "savedPassage" && !cardIds.includes(parsed.cardId))
  ) {
    throw new CardDeletionIntegrationError("invalid-session", {
      dataKind: "shadowing-session",
    });
  }
  return parsed;
}

/**
 * Assembles the current deletion state without writing storage. Optional UI
 * sessions are read strictly so damaged raw values cannot be normalized away
 * before a destructive operation.
 */
export function assembleCardDeletionState({
  sessionStorage,
  ...semanticState
}: CardDeletionStateAdapterInput): CardDeletionState {
  const cardIds = semanticState.cards.map((card) => card.id);
  return {
    ...semanticState,
    cardDetailSession: readStrictCardDetailSession(
      sessionStorage,
      cardIds,
      semanticState.myAnswers,
    ),
    shadowingSession: readStrictShadowingSession(sessionStorage, cardIds),
  };
}

function assertPlanTargets(plan: CardDeletionPlan): void {
  if (
    plan.mutations.length !== plan.affectedTargets.length ||
    plan.mutations.some((mutation, index) => {
      const target = plan.affectedTargets[index];
      return (
        target === undefined ||
        mutation.area !== target.area ||
        mutation.storage !== target.storage ||
        mutation.key !== target.key
      );
    })
  ) {
    throw new CardDeletionIntegrationError("invalid-plan-targets");
  }
}

export function executeCardDeletionTransaction({
  plan,
  commit,
  transactionRunner = runStorageTransaction,
}: {
  plan: CardDeletionPlan;
  commit: (state: CardDeletionState) => void;
  transactionRunner?: TransactionRunner;
}): CardDeletionTransactionExecution {
  validateCardDeletionPlan(plan);
  assertPlanTargets(plan);
  const transaction = transactionRunner(plan.mutations);
  commit(plan.nextState);
  return {
    plan,
    transaction,
    undoSnapshot: {
      cardId: plan.cardId,
      previousState: plan.previousState,
      deletionPlan: plan,
      rawStorageSnapshot: transaction.snapshot.map((entry) => ({ ...entry })),
    },
  };
}

export function createCardDeletionRestoreMutations(
  snapshot: DeletedCardUndoSnapshot,
): StorageMutation[] {
  const targets = snapshot.deletionPlan.affectedTargets;
  if (
    snapshot.rawStorageSnapshot.length !== targets.length ||
    snapshot.rawStorageSnapshot.some((entry, index) => {
      const target = targets[index];
      return (
        target === undefined ||
        entry.area !== target.area ||
        entry.storage !== target.storage ||
        entry.key !== target.key
      );
    })
  ) {
    throw new CardDeletionIntegrationError("invalid-undo-snapshot");
  }
  return snapshot.rawStorageSnapshot.map(({ area, storage, key, value }) => ({
    area,
    storage,
    key,
    value,
  }));
}

export function executeCardDeletionUndoTransaction({
  snapshot,
  commit,
  transactionRunner = runStorageTransaction,
}: {
  snapshot: DeletedCardUndoSnapshot;
  commit: (state: CardDeletionState) => void;
  transactionRunner?: TransactionRunner;
}): CardDeletionUndoExecution {
  const restoreMutations = createCardDeletionRestoreMutations(snapshot);
  const transaction = transactionRunner(restoreMutations);
  commit(snapshot.previousState);
  return { transaction, restoredState: snapshot.previousState };
}

export function describeCardDeletionFailure(
  error: unknown,
  operation: "delete" | "undo",
): CardDeletionFailureNotice {
  if (error instanceof StorageTransactionError) {
    if (!error.rollbackSucceeded || error.rollbackFailureCount > 0) {
      return {
        message:
          "삭제 저장을 되돌리는 중 일부 데이터 복구에 실패했습니다. 추가 변경을 중단하고 앱을 새로고침해 현재 저장 상태를 확인해 주세요.",
        highRisk: true,
        blockDestructiveActions: true,
      };
    }
    if (error.quotaExceeded) {
      return {
        message:
          operation === "delete"
            ? "브라우저 저장 공간 문제로 카드를 삭제하지 못했습니다. JSON 전체 백업을 만든 뒤 저장 공간을 확인해 주세요."
            : "브라우저 저장 공간 문제로 삭제 실행 취소를 완료하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.",
        highRisk: false,
        blockDestructiveActions: false,
      };
    }
    if (error.phase === "snapshot") {
      return {
        message:
          operation === "delete"
            ? "현재 저장 상태를 확인하지 못해 카드를 삭제하지 않았습니다."
            : "현재 저장 상태를 확인하지 못해 삭제 실행 취소를 시작하지 않았습니다.",
        highRisk: false,
        blockDestructiveActions: false,
      };
    }
    return {
      message:
        operation === "delete"
          ? "카드를 삭제하지 못했습니다. 기존 데이터는 원래 상태로 복구되었습니다."
          : "삭제 실행 취소를 완료하지 못했습니다. 삭제 완료 상태로 복구되었습니다.",
      highRisk: false,
      blockDestructiveActions: false,
    };
  }

  return {
    message:
      operation === "delete"
        ? "현재 학습 상태를 확인하지 못해 카드를 삭제하지 않았습니다."
        : "복원할 카드 상태를 확인하지 못해 삭제 실행 취소를 시작하지 않았습니다.",
    highRisk: false,
    blockDestructiveActions: false,
  };
}
