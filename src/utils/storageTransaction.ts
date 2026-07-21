export type StorageArea = "local" | "session";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type StorageTarget = {
  area: StorageArea;
  storage: StorageLike;
  key: string;
};

export type StorageMutation = StorageTarget & {
  value: string | null;
};

export type StorageSnapshotEntry = StorageTarget & {
  value: string | null;
};

export type StorageSnapshot = StorageSnapshotEntry[];

export type StorageTransactionPhase = "snapshot" | "apply" | "rollback";

export type StorageFailureLocation = {
  area: StorageArea;
  key: string;
  quotaExceeded: boolean;
};

type StorageTransactionErrorOptions = {
  phase: StorageTransactionPhase;
  rollbackSucceeded: boolean;
  rollbackFailureCount: number;
  quotaExceeded: boolean;
  area?: StorageArea;
  key?: string;
  appliedMutationCount?: number;
  rollbackFailures?: readonly StorageFailureLocation[];
};

export class StorageTransactionError extends Error {
  readonly phase: StorageTransactionPhase;
  readonly rollbackSucceeded: boolean;
  readonly rollbackFailureCount: number;
  readonly quotaExceeded: boolean;
  readonly area?: StorageArea;
  readonly key?: string;
  readonly appliedMutationCount: number;
  readonly rollbackFailures: readonly StorageFailureLocation[];

  constructor(options: StorageTransactionErrorOptions) {
    super(`Web Storage transaction failed during ${options.phase}.`);
    this.name = "StorageTransactionError";
    this.phase = options.phase;
    this.rollbackSucceeded = options.rollbackSucceeded;
    this.rollbackFailureCount = options.rollbackFailureCount;
    this.quotaExceeded = options.quotaExceeded;
    this.area = options.area;
    this.key = options.key;
    this.appliedMutationCount = options.appliedMutationCount ?? 0;
    this.rollbackFailures = (options.rollbackFailures ?? []).map((failure) => ({ ...failure }));
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type StorageMutationResult = {
  appliedMutationCount: number;
};

export type StorageTransactionResult = StorageMutationResult & {
  snapshot: StorageSnapshot;
};

const QUOTA_ERROR_NAMES = new Set([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED",
]);

const LEGACY_QUOTA_ERROR_CODES = new Set([22, 1014]);

function readErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) return undefined;
  return typeof error.name === "string" ? error.name : undefined;
}

function readErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "number" ? error.code : undefined;
}

export function isStorageQuotaExceededError(error: unknown): boolean {
  const name = readErrorName(error);
  if (name !== undefined && QUOTA_ERROR_NAMES.has(name)) return true;

  const code = readErrorCode(error);
  return name === "DOMException" && code !== undefined && LEGACY_QUOTA_ERROR_CODES.has(code);
}

function createStorageError(
  phase: StorageTransactionPhase,
  target: StorageTarget,
  error: unknown,
  options: Partial<Pick<StorageTransactionErrorOptions,
    "rollbackSucceeded" | "rollbackFailureCount" | "appliedMutationCount"
  >> = {},
): StorageTransactionError {
  return new StorageTransactionError({
    phase,
    rollbackSucceeded: options.rollbackSucceeded ?? phase !== "apply",
    rollbackFailureCount: options.rollbackFailureCount ?? 0,
    quotaExceeded: isStorageQuotaExceededError(error),
    area: target.area,
    key: target.key,
    appliedMutationCount: options.appliedMutationCount,
  });
}

function assertUniqueTargets(
  targets: readonly StorageTarget[],
  phase: StorageTransactionPhase,
): void {
  const keysByStorage = new Map<StorageLike, Set<string>>();

  for (const target of targets) {
    const keys = keysByStorage.get(target.storage) ?? new Set<string>();
    if (keys.has(target.key)) {
      throw new StorageTransactionError({
        phase,
        rollbackSucceeded: true,
        rollbackFailureCount: 0,
        quotaExceeded: false,
        area: target.area,
        key: target.key,
      });
    }
    keys.add(target.key);
    keysByStorage.set(target.storage, keys);
  }
}

function writeRawValue(target: StorageTarget, value: string | null): void {
  if (value === null) target.storage.removeItem(target.key);
  else target.storage.setItem(target.key, value);
}

export function captureStorageSnapshot(
  targets: readonly StorageTarget[],
): StorageSnapshot {
  assertUniqueTargets(targets, "snapshot");
  const snapshot: StorageSnapshot = [];

  for (const target of targets) {
    try {
      snapshot.push({ ...target, value: target.storage.getItem(target.key) });
    } catch (error) {
      throw createStorageError("snapshot", target, error);
    }
  }

  return snapshot;
}

export function applyStorageMutations(
  mutations: readonly StorageMutation[],
): StorageMutationResult {
  assertUniqueTargets(mutations, "apply");
  let appliedMutationCount = 0;

  for (const mutation of mutations) {
    try {
      writeRawValue(mutation, mutation.value);
      appliedMutationCount += 1;
    } catch (error) {
      throw createStorageError("apply", mutation, error, {
        rollbackSucceeded: false,
        appliedMutationCount,
      });
    }
  }

  return { appliedMutationCount };
}

/**
 * Restores raw values in reverse order as an app-level compensating rollback.
 * Web Storage is not an ACID database, so restoration can itself partially fail.
 */
export function restoreStorageSnapshot(snapshot: readonly StorageSnapshotEntry[]): void {
  assertUniqueTargets(snapshot, "rollback");
  const failures: StorageFailureLocation[] = [];

  for (let index = snapshot.length - 1; index >= 0; index -= 1) {
    const entry = snapshot[index];
    try {
      writeRawValue(entry, entry.value);
    } catch (error) {
      failures.push({
        area: entry.area,
        key: entry.key,
        quotaExceeded: isStorageQuotaExceededError(error),
      });
    }
  }

  if (failures.length > 0) {
    const firstFailure = failures[0];
    throw new StorageTransactionError({
      phase: "rollback",
      rollbackSucceeded: false,
      rollbackFailureCount: failures.length,
      quotaExceeded: failures.some((failure) => failure.quotaExceeded),
      area: firstFailure.area,
      key: firstFailure.key,
      rollbackFailures: failures,
    });
  }
}

/**
 * Applies ordered Web Storage mutations with an app-level compensating rollback.
 * It intentionally performs no UI, React, navigation, logging, retry, or network work.
 */
export function runStorageTransaction(
  mutations: readonly StorageMutation[],
): StorageTransactionResult {
  assertUniqueTargets(mutations, "snapshot");
  const snapshot = captureStorageSnapshot(mutations);

  try {
    const result = applyStorageMutations(mutations);
    return { snapshot, appliedMutationCount: result.appliedMutationCount };
  } catch (error) {
    const applyError = error instanceof StorageTransactionError
      ? error
      : new StorageTransactionError({
        phase: "apply",
        rollbackSucceeded: false,
        rollbackFailureCount: 0,
        quotaExceeded: isStorageQuotaExceededError(error),
      });

    let rollbackFailure: StorageTransactionError | undefined;
    try {
      restoreStorageSnapshot(snapshot);
    } catch (error) {
      rollbackFailure = error instanceof StorageTransactionError
        ? error
        : new StorageTransactionError({
          phase: "rollback",
          rollbackSucceeded: false,
          rollbackFailureCount: 1,
          quotaExceeded: isStorageQuotaExceededError(error),
        });
    }

    if (rollbackFailure === undefined) {
      throw new StorageTransactionError({
        phase: "apply",
        rollbackSucceeded: true,
        rollbackFailureCount: 0,
        quotaExceeded: applyError.quotaExceeded,
        area: applyError.area,
        key: applyError.key,
        appliedMutationCount: applyError.appliedMutationCount,
      });
    }

    throw new StorageTransactionError({
      phase: "apply",
      rollbackSucceeded: false,
      rollbackFailureCount: rollbackFailure.rollbackFailureCount,
      quotaExceeded: applyError.quotaExceeded || rollbackFailure.quotaExceeded,
      area: applyError.area,
      key: applyError.key,
      appliedMutationCount: applyError.appliedMutationCount,
      rollbackFailures: rollbackFailure.rollbackFailures,
    });
  }
}
