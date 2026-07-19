import type {
  CloudBackupGateway,
  PreparedCloudBackup,
} from "../cloudBackupTypes.ts";
import {
  MAX_BACKUP_FILE_BYTES,
  serializeAppBackup,
  validateBackup,
  type AppBackupV1,
} from "../utils/appBackup.ts";

export const CLOUD_BACKUP_CONTENT_TYPE = "application/json";
export const CLOUD_BACKUP_LIST_LIMIT = 20;
export const MAX_DEVICE_LABEL_LENGTH = 80;
export const CLOUD_BACKUP_APP_VERSION = "0.1.0";

export type CloudBackupUploadStage =
  | "idle"
  | "preparing"
  | "uploading-storage"
  | "verifying-storage"
  | "writing-metadata"
  | "cleaning-up"
  | "success"
  | "failed"
  | "aborted";

export type CloudBackupFailureCategory =
  | "backup-preparation-failed"
  | "storage-upload-failed"
  | "storage-verification-failed"
  | "metadata-write-failed"
  | "cleanup-failed"
  | "network-offline"
  | "permission-denied"
  | "aborted"
  | "unknown";

export type CloudBackupProgress = {
  stage: Exclude<CloudBackupUploadStage, "idle" | "failed" | "aborted">;
  byteSize?: number;
};

export type CloudBackupFailureDiagnostic = {
  stage: "failed" | "aborted";
  category: CloudBackupFailureCategory;
  occurredAt: string;
  cleanupSucceeded: boolean | null;
  byteSize?: number;
  code?: string;
  retryAllowed: boolean;
};

export type CloudBackupProgressReporter = (progress: CloudBackupProgress) => void;

const STAGE_MESSAGES: Record<CloudBackupUploadStage, string> = {
  idle: "",
  preparing: "백업 데이터를 준비하고 있습니다.",
  "uploading-storage": "백업 파일을 저장하고 있습니다.",
  "verifying-storage": "저장된 파일을 확인하고 있습니다.",
  "writing-metadata": "백업 목록을 기록하고 있습니다.",
  "cleaning-up": "실패한 업로드를 정리하고 있습니다.",
  success: "클라우드 백업이 완료되었습니다.",
  failed: "클라우드 백업에 실패했습니다.",
  aborted: "백업 작업이 중단되었습니다.",
};

export function getCloudBackupStageMessage(stage: CloudBackupUploadStage) {
  return STAGE_MESSAGES[stage];
}

export type CloudBackupErrorCode =
  | "BACKUP_CREATION_FAILED"
  | "BACKUP_INVALID"
  | "BACKUP_TOO_LARGE"
  | "SHA256_UNAVAILABLE"
  | "UPLOAD_FAILED"
  | "UPLOAD_METADATA_MISMATCH"
  | "METADATA_FAILED"
  | "METADATA_AND_CLEANUP_FAILED"
  | "REQUEST_CANCELLED";

export class CloudBackupError extends Error {
  code: CloudBackupErrorCode;
  causeValue?: unknown;
  orphanStoragePath?: string;

  constructor(
    code: CloudBackupErrorCode,
    message: string,
    options: { cause?: unknown; orphanStoragePath?: string } = {},
  ) {
    super(message);
    this.name = "CloudBackupError";
    this.code = code;
    this.causeValue = options.cause;
    this.orphanStoragePath = options.orphanStoragePath;
  }
}

function readErrorCode(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== "object" || depth > 3) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("causeValue" in error) return readErrorCode(error.causeValue, depth + 1);
  if ("cause" in error) return readErrorCode(error.cause, depth + 1);
  return undefined;
}

function sanitizeDiagnosticCode(value: string | undefined) {
  if (!value) return undefined;
  const safe = value.trim().slice(0, 80);
  if (/^[1-5]\d{2}$/.test(safe)) return safe;
  if (/^(?:auth|storage|firestore)\/[a-z0-9-]+$/i.test(safe)) return safe;
  if (/^[A-Z][A-Z0-9_]+$/.test(safe)) return safe;
  return undefined;
}

function isAbortFailure(error: unknown) {
  return (
    (error instanceof CloudBackupError && error.code === "REQUEST_CANCELLED") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function classifyCloudBackupFailure(
  error: unknown,
  options: { online?: boolean } = {},
): CloudBackupFailureCategory {
  if (isAbortFailure(error)) return "aborted";
  if (error instanceof CloudBackupError && error.code === "METADATA_AND_CLEANUP_FAILED") {
    return "cleanup-failed";
  }
  if (options.online === false) return "network-offline";

  const externalError =
    error instanceof CloudBackupError ? error.causeValue : error;
  const externalCode = readErrorCode(externalError)?.toLowerCase() ?? "";
  if (
    externalCode.includes("permission-denied") ||
    externalCode.includes("unauthorized") ||
    externalCode.includes("unauthenticated")
  ) {
    return "permission-denied";
  }
  if (
    externalCode.includes("network") ||
    externalCode.includes("unavailable") ||
    externalCode.includes("offline")
  ) {
    return "network-offline";
  }

  if (!(error instanceof CloudBackupError)) return "unknown";
  switch (error.code) {
    case "BACKUP_CREATION_FAILED":
    case "BACKUP_INVALID":
    case "BACKUP_TOO_LARGE":
    case "SHA256_UNAVAILABLE":
      return "backup-preparation-failed";
    case "UPLOAD_FAILED":
      return "storage-upload-failed";
    case "UPLOAD_METADATA_MISMATCH":
      return "storage-verification-failed";
    case "METADATA_FAILED":
      return "metadata-write-failed";
    case "METADATA_AND_CLEANUP_FAILED":
      return "cleanup-failed";
    case "REQUEST_CANCELLED":
      return "aborted";
    default:
      return "unknown";
  }
}

export function createCloudBackupFailureDiagnostic(
  error: unknown,
  options: {
    online?: boolean;
    byteSize?: number;
    now?: Date;
  } = {},
): CloudBackupFailureDiagnostic {
  const category = classifyCloudBackupFailure(error, options);
  const cloudCode = error instanceof CloudBackupError ? error.code : undefined;
  const cleanupSucceeded =
    cloudCode === "METADATA_FAILED" || cloudCode === "UPLOAD_METADATA_MISMATCH"
      ? true
      : cloudCode === "METADATA_AND_CLEANUP_FAILED"
        ? false
        : null;
  const code = sanitizeDiagnosticCode(
    readErrorCode(error instanceof CloudBackupError ? error.causeValue : error) ??
      (error instanceof CloudBackupError ? error.code : undefined),
  );
  return {
    stage: category === "aborted" ? "aborted" : "failed",
    category,
    occurredAt: (options.now ?? new Date()).toISOString(),
    cleanupSucceeded,
    ...(typeof options.byteSize === "number" ? { byteSize: options.byteSize } : {}),
    ...(code ? { code } : {}),
    retryAllowed: category !== "cleanup-failed",
  };
}

export function getCloudBackupFailureGuidance(
  diagnostic: CloudBackupFailureDiagnostic,
) {
  switch (diagnostic.category) {
    case "backup-preparation-failed":
      return "기기 백업 데이터를 준비하거나 검증하지 못했습니다. 기기의 학습 데이터에는 영향이 없습니다.";
    case "storage-upload-failed":
      return "백업 파일을 저장하지 못했습니다. 기기의 학습 데이터에는 영향이 없습니다.";
    case "storage-verification-failed":
      return "저장된 파일을 확인하지 못했습니다. 업로드된 파일은 안전하게 정리되었으며 기기의 학습 데이터에는 영향이 없습니다.";
    case "metadata-write-failed":
      return "백업 목록 기록에 실패했습니다. 업로드된 파일은 안전하게 정리되었으며 기기의 학습 데이터에는 영향이 없습니다.";
    case "cleanup-failed":
      return "업로드 일부를 안전하게 정리하지 못했습니다. 추가 업로드를 시도하지 말고 관리자에게 확인해 주세요.";
    case "network-offline":
      return "인터넷에 연결되어 있지 않습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
    case "permission-denied":
      return "클라우드 접근 권한을 확인하지 못했습니다. 로그인 상태와 인터넷 연결을 확인해 주세요.";
    case "aborted":
      return "화면 이동 또는 앱 상태 변경으로 백업 작업이 중단되었습니다. 자동으로 다시 시도하지 않습니다.";
    default:
      return "백업을 완료하지 못했습니다. 기기의 학습 데이터에는 영향이 없습니다.";
  }
}

export function createCloudBackupDiagnosticLogEntry(
  value: CloudBackupProgress | CloudBackupFailureDiagnostic,
) {
  if ("category" in value) {
    return {
      stage: value.stage,
      category: value.category,
      occurredAt: value.occurredAt,
      cleanupSucceeded: value.cleanupSucceeded,
      ...(typeof value.byteSize === "number" ? { byteSize: value.byteSize } : {}),
      ...(value.code ? { code: value.code } : {}),
    };
  }
  return {
    stage: value.stage,
    occurredAt: new Date().toISOString(),
    ...(typeof value.byteSize === "number" ? { byteSize: value.byteSize } : {}),
  };
}

export function normalizeDeviceLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_DEVICE_LABEL_LENGTH);
}

export function createCloudBackupId(
  now = new Date(),
  randomUuid: () => string = () => crypto.randomUUID(),
) {
  const timestamp = now
    .toISOString()
    .replace(/:/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${randomUuid()}`;
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function calculateSha256(
  bytes: Uint8Array,
  digest: (data: Uint8Array) => Promise<ArrayBuffer> = async (data) => {
    if (!globalThis.crypto?.subtle) {
      throw new CloudBackupError(
        "SHA256_UNAVAILABLE",
        "이 환경에서는 백업 무결성 계산을 사용할 수 없습니다.",
      );
    }
    const digestInput = new Uint8Array(data).buffer;
    return globalThis.crypto.subtle.digest("SHA-256", digestInput);
  },
) {
  try {
    return toHex(await digest(bytes));
  } catch (error) {
    if (error instanceof CloudBackupError) throw error;
    throw new CloudBackupError(
      "SHA256_UNAVAILABLE",
      "백업 무결성 값을 계산하지 못했습니다.",
      { cause: error },
    );
  }
}

export async function prepareCloudBackup(
  uid: string,
  backup: AppBackupV1,
  deviceLabel = "",
  options: {
    now?: Date;
    randomUuid?: () => string;
    appVersion?: string;
    digest?: (data: Uint8Array) => Promise<ArrayBuffer>;
  } = {},
): Promise<PreparedCloudBackup> {
  const validation = validateBackup(backup);
  if (!validation.canRestore || !validation.backup) {
    throw new CloudBackupError(
      "BACKUP_INVALID",
      "현재 전체 백업 데이터가 검증을 통과하지 못했습니다.",
    );
  }

  const normalizedBackup = validation.backup;
  const json = serializeAppBackup(normalizedBackup);
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > MAX_BACKUP_FILE_BYTES) {
    throw new CloudBackupError(
      "BACKUP_TOO_LARGE",
      "전체 백업이 10MB 제한을 초과하여 업로드하지 않았습니다.",
    );
  }

  const backupId = createCloudBackupId(options.now, options.randomUuid);
  const storagePath = `users/${uid}/backups/${backupId}.json`;
  const sha256 = await calculateSha256(bytes, options.digest);
  const normalizedDeviceLabel = normalizeDeviceLabel(deviceLabel);

  return {
    backupId,
    json,
    bytes,
    byteSize: bytes.byteLength,
    sha256,
    storagePath,
    metadata: {
      backupId,
      schemaVersion: 1,
      exportedAt: normalizedBackup.exportedAt,
      byteSize: bytes.byteLength,
      sha256,
      appVersion: options.appVersion ?? CLOUD_BACKUP_APP_VERSION,
      ...(normalizedDeviceLabel ? { deviceLabel: normalizedDeviceLabel } : {}),
      storagePath,
      summary: {
        cardCount: normalizedBackup.summary.cardCount,
        archivedCardCount: normalizedBackup.summary.archivedCardCount,
        firstLineAttemptCount: normalizedBackup.summary.attemptCount,
        answerLearningAttemptCount:
          normalizedBackup.summary.answerLearningAttemptCount,
        cardMemoCount: normalizedBackup.summary.memoCount,
        personalMemoCount: normalizedBackup.summary.personalMemoCount,
        savedPassageCount: normalizedBackup.summary.savedPassageCount,
      },
    },
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new CloudBackupError("REQUEST_CANCELLED", "클라우드 백업 요청을 중단했습니다.");
  }
}

export async function uploadPreparedCloudBackup(
  gateway: CloudBackupGateway,
  uid: string,
  prepared: PreparedCloudBackup,
  signal?: AbortSignal,
  onProgress?: CloudBackupProgressReporter,
) {
  throwIfAborted(signal);
  let uploaded = false;
  try {
    onProgress?.({ stage: "uploading-storage", byteSize: prepared.byteSize });
    const storageMetadata = await gateway.uploadJson(
      prepared.storagePath,
      prepared.bytes,
      {
        backupId: prepared.backupId,
        schemaVersion: String(prepared.metadata.schemaVersion),
        sha256: prepared.sha256,
      },
    );
    uploaded = true;
    onProgress?.({ stage: "verifying-storage", byteSize: prepared.byteSize });
    if (
      storageMetadata.byteSize !== prepared.byteSize ||
      storageMetadata.contentType !== CLOUD_BACKUP_CONTENT_TYPE ||
      storageMetadata.sha256 !== prepared.sha256
    ) {
      throw new CloudBackupError(
        "UPLOAD_METADATA_MISMATCH",
        "업로드된 파일의 크기 또는 형식이 준비한 백업과 일치하지 않습니다.",
      );
    }
    throwIfAborted(signal);
    onProgress?.({ stage: "writing-metadata", byteSize: prepared.byteSize });
    await gateway.createMetadata(
      uid,
      prepared.backupId,
      prepared.metadata,
    );
    onProgress?.({ stage: "success", byteSize: prepared.byteSize });
    return prepared.metadata;
  } catch (error) {
    if (!uploaded) {
      if (error instanceof CloudBackupError) throw error;
      throw new CloudBackupError("UPLOAD_FAILED", "클라우드 파일 업로드에 실패했습니다.", {
        cause: error,
      });
    }

    onProgress?.({ stage: "cleaning-up", byteSize: prepared.byteSize });
    try {
      await gateway.deleteStorageObject(prepared.storagePath);
    } catch (cleanupError) {
      throw new CloudBackupError(
        "METADATA_AND_CLEANUP_FAILED",
        "백업 목록 저장에 실패했고 업로드 파일 정리도 완료하지 못했습니다.",
        {
          cause: error,
          orphanStoragePath: prepared.storagePath,
        },
      );
    }

    if (error instanceof CloudBackupError) throw error;
    throw new CloudBackupError(
      "METADATA_FAILED",
      "백업 파일은 정리했지만 백업 목록 저장에 실패했습니다.",
      { cause: error },
    );
  }
}

export async function createAndUploadCloudBackup(
  gateway: CloudBackupGateway,
  uid: string,
  backup: AppBackupV1,
  deviceLabel = "",
  options: Parameters<typeof prepareCloudBackup>[3] & {
    signal?: AbortSignal;
    onProgress?: CloudBackupProgressReporter;
  } = {},
) {
  options.onProgress?.({ stage: "preparing" });
  const prepared = await prepareCloudBackup(uid, backup, deviceLabel, options);
  await uploadPreparedCloudBackup(
    gateway,
    uid,
    prepared,
    options.signal,
    options.onProgress,
  );
  return prepared;
}

export async function listRecentCloudBackups(
  gateway: CloudBackupGateway,
  uid: string,
  maximum = CLOUD_BACKUP_LIST_LIMIT,
) {
  const safeMaximum = Math.min(Math.max(Math.trunc(maximum), 1), CLOUD_BACKUP_LIST_LIMIT);
  const backups = await gateway.listMetadata(uid, safeMaximum);
  return [...backups].sort(
    (left, right) => Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt),
  );
}

export function getCloudBackupErrorMessage(error: unknown) {
  if (error instanceof CloudBackupError) return error.message;
  if (error && typeof error === "object" && "code" in error) {
    const code = typeof error.code === "string" ? error.code : "";
    if (code.includes("permission-denied") || code.includes("unauthorized")) {
      return "클라우드 접근 권한이 없습니다. 로그인과 보안 규칙을 확인해 주세요.";
    }
    if (code.includes("unauthenticated")) {
      return "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
    }
    if (code.includes("network") || code.includes("unavailable")) {
      return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
    }
  }
  return error instanceof Error
    ? error.message
    : "클라우드 백업 중 오류가 발생했습니다. 다시 시도해 주세요.";
}
