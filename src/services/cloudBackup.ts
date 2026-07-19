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
  | "calculating-sha"
  | "uploading-storage"
  | "verifying-storage"
  | "writing-metadata"
  | "cleaning-up"
  | "refreshing-list"
  | "success"
  | "failed"
  | "aborted";

export type CloudBackupAttemptStage =
  | "backup-preparation"
  | "sha-calculation"
  | "storage-upload"
  | "storage-verification"
  | "firestore-metadata-write"
  | "storage-cleanup"
  | "list-refresh"
  | "abort";

export type CloudBackupFailureCategory =
  | "backup-preparation-failed"
  | "sha-calculation-failed"
  | "storage-unauthorized"
  | "storage-forbidden"
  | "storage-network"
  | "storage-upload-failed"
  | "storage-verification-failed"
  | "firestore-permission-denied"
  | "firestore-network"
  | "metadata-validation-failed"
  | "metadata-write-failed"
  | "cleanup-failed"
  | "list-refresh-failed"
  | "network-offline"
  | "unauthenticated"
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
  attempt: CloudBackupAttemptDiagnostic;
  byteSize?: number;
  safeProviderCode?: string;
  retryAllowed: boolean;
};

export type CloudBackupAttemptDiagnostic = {
  currentStage: CloudBackupAttemptStage;
  lastCompletedStage?: CloudBackupAttemptStage;
  failedStage?: CloudBackupAttemptStage;
  errorCategory?: CloudBackupFailureCategory;
  safeProviderCode?: string;
  storageUploadStarted: boolean;
  storageUploadCompleted: boolean;
  storageVerificationCompleted: boolean;
  metadataWriteStarted: boolean;
  metadataWriteCompleted: boolean;
  cleanupAttempted: boolean;
  cleanupSucceeded?: boolean;
  aborted: boolean;
  occurredAt: string;
};

export type CloudBackupProgressReporter = (progress: CloudBackupProgress) => void;

const STAGE_MESSAGES: Record<CloudBackupUploadStage, string> = {
  idle: "",
  preparing: "백업 데이터를 준비하고 있습니다.",
  "calculating-sha": "백업 무결성 값을 계산하고 있습니다.",
  "uploading-storage": "백업 파일을 저장하고 있습니다.",
  "verifying-storage": "저장된 파일을 확인하고 있습니다.",
  "writing-metadata": "백업 목록을 기록하고 있습니다.",
  "cleaning-up": "실패한 업로드를 정리하고 있습니다.",
  "refreshing-list": "최근 백업 목록을 갱신하고 있습니다.",
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
  | "STORAGE_METADATA_FAILED"
  | "UPLOAD_METADATA_MISMATCH"
  | "METADATA_FAILED"
  | "METADATA_AND_CLEANUP_FAILED"
  | "LIST_REFRESH_FAILED"
  | "REQUEST_CANCELLED";

export class CloudBackupError extends Error {
  code: CloudBackupErrorCode;
  causeValue?: unknown;
  orphanStoragePath?: string;
  operation?: CloudBackupAttemptStage;

  constructor(
    code: CloudBackupErrorCode,
    message: string,
    options: {
      cause?: unknown;
      orphanStoragePath?: string;
      operation?: CloudBackupAttemptStage;
    } = {},
  ) {
    super(message);
    this.name = "CloudBackupError";
    this.code = code;
    this.causeValue = options.cause;
    this.orphanStoragePath = options.orphanStoragePath;
    this.operation = options.operation;
  }
}

function readErrorCode(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== "object" || depth > 3) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("causeValue" in error) return readErrorCode(error.causeValue, depth + 1);
  if ("cause" in error) return readErrorCode(error.cause, depth + 1);
  return undefined;
}

const SAFE_PROVIDER_CODES = new Set([
  "storage/unauthorized",
  "storage/retry-limit-exceeded",
  "storage/unknown",
  "permission-denied",
  "unauthenticated",
  "unavailable",
  "aborted",
]);

function sanitizeDiagnosticCode(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return SAFE_PROVIDER_CODES.has(normalized) ? normalized : undefined;
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
  options: { online?: boolean; failedStage?: CloudBackupAttemptStage } = {},
): CloudBackupFailureCategory {
  if (isAbortFailure(error)) return "aborted";
  if (error instanceof CloudBackupError && error.code === "METADATA_AND_CLEANUP_FAILED") {
    return "cleanup-failed";
  }

  const externalError =
    error instanceof CloudBackupError ? error.causeValue : error;
  const externalCode = readErrorCode(externalError)?.toLowerCase() ?? "";
  const operation =
    (error instanceof CloudBackupError ? error.operation : undefined) ??
    options.failedStage;
  const isPermissionError =
    externalCode.includes("permission-denied") ||
    externalCode.includes("unauthorized") ||
    externalCode.includes("forbidden");
  const isNetworkError =
    options.online === false ||
    externalCode.includes("network") ||
    externalCode.includes("unavailable") ||
    externalCode.includes("offline") ||
    externalCode.includes("retry-limit-exceeded");

  if (externalCode.includes("unauthenticated")) return "unauthenticated";
  if (operation === "storage-upload" || operation === "storage-verification") {
    if (externalCode.includes("unauthorized")) return "storage-unauthorized";
    if (externalCode.includes("forbidden")) return "storage-forbidden";
    if (isNetworkError) return "storage-network";
  }
  if (operation === "firestore-metadata-write") {
    if (isPermissionError) return "firestore-permission-denied";
    if (isNetworkError) return "firestore-network";
    if (
      externalCode.includes("invalid-argument") ||
      externalCode.includes("failed-precondition")
    ) {
      return "metadata-validation-failed";
    }
  }
  if (operation === "storage-cleanup") return "cleanup-failed";
  if (operation === "list-refresh") return "list-refresh-failed";
  if (options.online === false) return "network-offline";
  if (isPermissionError) return "permission-denied";
  if (isNetworkError) return "network-offline";

  if (operation === "sha-calculation") return "sha-calculation-failed";
  if (operation === "storage-upload") return "storage-upload-failed";
  if (operation === "storage-verification") return "storage-verification-failed";
  if (operation === "firestore-metadata-write") return "metadata-write-failed";
  if (operation === "backup-preparation") return "backup-preparation-failed";

  if (!(error instanceof CloudBackupError)) return "unknown";
  switch (error.code) {
    case "BACKUP_CREATION_FAILED":
    case "BACKUP_INVALID":
    case "BACKUP_TOO_LARGE":
      return "backup-preparation-failed";
    case "SHA256_UNAVAILABLE":
      return "sha-calculation-failed";
    case "UPLOAD_FAILED":
      return "storage-upload-failed";
    case "STORAGE_METADATA_FAILED":
    case "UPLOAD_METADATA_MISMATCH":
      return "storage-verification-failed";
    case "METADATA_FAILED":
      return "metadata-write-failed";
    case "METADATA_AND_CLEANUP_FAILED":
      return "cleanup-failed";
    case "LIST_REFRESH_FAILED":
      return "list-refresh-failed";
    case "REQUEST_CANCELLED":
      return "aborted";
    default:
      return "unknown";
  }
}

function operationForError(
  error: unknown,
  fallback: CloudBackupAttemptStage,
): CloudBackupAttemptStage {
  if (isAbortFailure(error)) return "abort";
  if (error instanceof CloudBackupError && error.operation) return error.operation;
  if (!(error instanceof CloudBackupError)) return fallback;
  switch (error.code) {
    case "BACKUP_CREATION_FAILED":
    case "BACKUP_INVALID":
    case "BACKUP_TOO_LARGE":
      return "backup-preparation";
    case "SHA256_UNAVAILABLE":
      return "sha-calculation";
    case "UPLOAD_FAILED":
      return "storage-upload";
    case "STORAGE_METADATA_FAILED":
    case "UPLOAD_METADATA_MISMATCH":
      return "storage-verification";
    case "METADATA_FAILED":
      return "firestore-metadata-write";
    case "METADATA_AND_CLEANUP_FAILED":
      return "storage-cleanup";
    case "LIST_REFRESH_FAILED":
      return "list-refresh";
    case "REQUEST_CANCELLED":
      return "abort";
    default:
      return fallback;
  }
}

export function createCloudBackupAttemptDiagnostic(
  now = new Date(),
): CloudBackupAttemptDiagnostic {
  return {
    currentStage: "backup-preparation",
    storageUploadStarted: false,
    storageUploadCompleted: false,
    storageVerificationCompleted: false,
    metadataWriteStarted: false,
    metadataWriteCompleted: false,
    cleanupAttempted: false,
    aborted: false,
    occurredAt: now.toISOString(),
  };
}

export function advanceCloudBackupAttemptDiagnostic(
  diagnostic: CloudBackupAttemptDiagnostic,
  progress: CloudBackupProgress,
): CloudBackupAttemptDiagnostic {
  switch (progress.stage) {
    case "preparing":
      return { ...diagnostic, currentStage: "backup-preparation" };
    case "calculating-sha":
      return {
        ...diagnostic,
        currentStage: "sha-calculation",
        lastCompletedStage: "backup-preparation",
      };
    case "uploading-storage":
      return {
        ...diagnostic,
        currentStage: "storage-upload",
        lastCompletedStage: "sha-calculation",
        storageUploadStarted: true,
      };
    case "verifying-storage":
      return {
        ...diagnostic,
        currentStage: "storage-verification",
        lastCompletedStage: "storage-upload",
        storageUploadStarted: true,
        storageUploadCompleted: true,
      };
    case "writing-metadata":
      return {
        ...diagnostic,
        currentStage: "firestore-metadata-write",
        lastCompletedStage: "storage-verification",
        storageUploadStarted: true,
        storageUploadCompleted: true,
        storageVerificationCompleted: true,
        metadataWriteStarted: true,
      };
    case "cleaning-up":
      return {
        ...diagnostic,
        currentStage: "storage-cleanup",
        cleanupAttempted: true,
      };
    case "refreshing-list":
      return {
        ...diagnostic,
        currentStage: "list-refresh",
        lastCompletedStage: "firestore-metadata-write",
        metadataWriteStarted: true,
        metadataWriteCompleted: true,
      };
    case "success":
      return {
        ...diagnostic,
        lastCompletedStage:
          diagnostic.currentStage === "list-refresh"
            ? "list-refresh"
            : "firestore-metadata-write",
        metadataWriteStarted: true,
        metadataWriteCompleted: true,
      };
  }
}

function retryAllowedForCategory(category: CloudBackupFailureCategory) {
  return (
    category === "network-offline" ||
    category === "storage-network" ||
    category === "firestore-network"
  );
}

export function createCloudBackupFailureDiagnostic(
  error: unknown,
  options: {
    online?: boolean;
    byteSize?: number;
    now?: Date;
    attempt?: CloudBackupAttemptDiagnostic;
  } = {},
): CloudBackupFailureDiagnostic {
  const occurredAt = (options.now ?? new Date()).toISOString();
  const priorAttempt = options.attempt ?? createCloudBackupAttemptDiagnostic(options.now);
  const failedStage = operationForError(error, priorAttempt.currentStage);
  const category = classifyCloudBackupFailure(error, {
    ...options,
    failedStage,
  });
  const cloudCode = error instanceof CloudBackupError ? error.code : undefined;
  const cleanupSucceeded =
    cloudCode === "METADATA_FAILED" ||
    cloudCode === "STORAGE_METADATA_FAILED" ||
    cloudCode === "UPLOAD_METADATA_MISMATCH"
      ? true
      : cloudCode === "METADATA_AND_CLEANUP_FAILED"
        ? false
        : null;
  const safeProviderCode = sanitizeDiagnosticCode(
    readErrorCode(error instanceof CloudBackupError ? error.causeValue : error) ??
      (isAbortFailure(error) ? "aborted" : undefined),
  );
  const attempt: CloudBackupAttemptDiagnostic = {
    ...priorAttempt,
    currentStage: failedStage,
    failedStage,
    errorCategory: category,
    ...(safeProviderCode ? { safeProviderCode } : {}),
    storageUploadStarted:
      priorAttempt.storageUploadStarted ||
      cloudCode === "STORAGE_METADATA_FAILED" ||
      cloudCode === "UPLOAD_METADATA_MISMATCH" ||
      cloudCode === "METADATA_FAILED" ||
      cloudCode === "METADATA_AND_CLEANUP_FAILED",
    storageUploadCompleted:
      priorAttempt.storageUploadCompleted ||
      cloudCode === "STORAGE_METADATA_FAILED" ||
      cloudCode === "UPLOAD_METADATA_MISMATCH" ||
      cloudCode === "METADATA_FAILED" ||
      cloudCode === "METADATA_AND_CLEANUP_FAILED",
    storageVerificationCompleted:
      priorAttempt.storageVerificationCompleted ||
      cloudCode === "METADATA_FAILED" ||
      cloudCode === "METADATA_AND_CLEANUP_FAILED",
    metadataWriteStarted:
      priorAttempt.metadataWriteStarted ||
      cloudCode === "METADATA_FAILED" ||
      cloudCode === "METADATA_AND_CLEANUP_FAILED",
    cleanupAttempted:
      priorAttempt.cleanupAttempted ||
      cloudCode === "STORAGE_METADATA_FAILED" ||
      cloudCode === "UPLOAD_METADATA_MISMATCH" ||
      cloudCode === "METADATA_FAILED" ||
      cloudCode === "METADATA_AND_CLEANUP_FAILED",
    ...(cleanupSucceeded === null ? {} : { cleanupSucceeded }),
    aborted: category === "aborted",
    occurredAt,
  };
  return {
    stage: category === "aborted" ? "aborted" : "failed",
    category,
    occurredAt,
    cleanupSucceeded,
    attempt,
    ...(typeof options.byteSize === "number" ? { byteSize: options.byteSize } : {}),
    ...(safeProviderCode ? { safeProviderCode } : {}),
    retryAllowed: retryAllowedForCategory(category),
  };
}

export function getCloudBackupFailureGuidance(
  diagnostic: CloudBackupFailureDiagnostic,
) {
  switch (diagnostic.category) {
    case "backup-preparation-failed":
      return "기기 백업 데이터를 준비하거나 검증하지 못했습니다. 기기의 학습 데이터에는 영향이 없습니다.";
    case "sha-calculation-failed":
      return "백업 무결성 값을 계산하지 못했습니다. 클라우드 파일은 만들지 않았습니다.";
    case "storage-unauthorized":
    case "storage-forbidden":
      return "Storage 저장 권한을 확인할 수 없습니다. 추가 업로드를 하지 말고 관리자 확인이 필요합니다.";
    case "storage-network":
      return "Storage 연결이 완료되지 않았습니다. 인터넷 연결을 확인한 뒤에만 다시 시도해 주세요.";
    case "storage-upload-failed":
      return "백업 파일을 저장하지 못했습니다. 기기의 학습 데이터에는 영향이 없습니다.";
    case "storage-verification-failed":
      return "저장된 파일을 확인하지 못했습니다. 업로드된 파일은 안전하게 정리되었으며 기기의 학습 데이터에는 영향이 없습니다.";
    case "firestore-permission-denied":
      return "백업 목록 기록 권한을 확인할 수 없습니다. 저장 파일 정리 결과를 확인하고 추가 업로드를 하지 마세요.";
    case "firestore-network":
      return "백업 목록 기록 중 네트워크 연결이 끊겼습니다. 저장 파일 정리 결과를 확인해 주세요.";
    case "metadata-validation-failed":
      return "백업 목록 데이터가 보안 규칙 검증을 통과하지 못했습니다. 추가 업로드를 하지 말고 관리자 확인이 필요합니다.";
    case "metadata-write-failed":
      return "백업 목록 기록에 실패했습니다. 업로드된 파일은 안전하게 정리되었으며 기기의 학습 데이터에는 영향이 없습니다.";
    case "cleanup-failed":
      return "업로드 일부를 안전하게 정리하지 못했습니다. 추가 업로드를 시도하지 말고 관리자에게 확인해 주세요.";
    case "list-refresh-failed":
      return "백업은 저장되었지만 최근 백업 목록을 갱신하지 못했습니다. 새 백업을 추가로 만들지 마세요.";
    case "network-offline":
      return "인터넷에 연결되어 있지 않습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
    case "unauthenticated":
      return "로그인 인증이 만료되었거나 확인되지 않았습니다. 추가 업로드를 하지 말고 다시 로그인해 주세요.";
    case "permission-denied":
      return "클라우드 접근 권한을 확인하지 못했습니다. 추가 업로드를 하지 말고 관리자 확인이 필요합니다.";
    case "aborted":
      return "화면 이동 또는 앱 상태 변경으로 백업 작업이 중단되었습니다. 자동으로 다시 시도하지 않습니다.";
    default:
      return "백업을 완료하지 못했습니다. 기기의 학습 데이터에는 영향이 없습니다.";
  }
}

const ATTEMPT_STAGE_LABELS: Record<CloudBackupAttemptStage, string> = {
  "backup-preparation": "백업 데이터 준비",
  "sha-calculation": "백업 무결성 값 계산",
  "storage-upload": "Storage 파일 업로드",
  "storage-verification": "Storage 파일 검증",
  "firestore-metadata-write": "백업 목록 기록",
  "storage-cleanup": "실패 파일 정리",
  "list-refresh": "최근 백업 목록 갱신",
  abort: "작업 중단",
};

const FAILURE_CATEGORY_LABELS: Record<CloudBackupFailureCategory, string> = {
  "backup-preparation-failed": "백업 데이터 준비 실패",
  "sha-calculation-failed": "무결성 값 계산 실패",
  "storage-unauthorized": "저장 권한을 확인할 수 없음",
  "storage-forbidden": "Storage 접근이 거부됨",
  "storage-network": "Storage 네트워크 오류",
  "storage-upload-failed": "Storage 파일 업로드 실패",
  "storage-verification-failed": "Storage 파일 검증 실패",
  "firestore-permission-denied": "목록 기록 권한을 확인할 수 없음",
  "firestore-network": "Firestore 네트워크 오류",
  "metadata-validation-failed": "백업 목록 데이터 검증 실패",
  "metadata-write-failed": "백업 목록 기록 실패",
  "cleanup-failed": "실패 파일 정리 실패",
  "list-refresh-failed": "최근 백업 목록 갱신 실패",
  "network-offline": "인터넷 연결 없음",
  unauthenticated: "로그인 인증을 확인할 수 없음",
  "permission-denied": "클라우드 접근 권한을 확인할 수 없음",
  aborted: "사용자 또는 화면 전환으로 중단",
  unknown: "알 수 없는 오류",
};

export function getCloudBackupAttemptStageLabel(stage: CloudBackupAttemptStage) {
  return ATTEMPT_STAGE_LABELS[stage];
}

export function getCloudBackupFailureCategoryLabel(
  category: CloudBackupFailureCategory,
) {
  return FAILURE_CATEGORY_LABELS[category];
}

export function getCloudBackupStorageCreationLabel(
  diagnostic: CloudBackupAttemptDiagnostic,
) {
  if (diagnostic.storageUploadCompleted) return "완료";
  if (diagnostic.storageUploadStarted) return "완료되지 않음";
  return "안 됨";
}

export function getCloudBackupCleanupLabel(
  diagnostic: CloudBackupAttemptDiagnostic,
) {
  if (!diagnostic.cleanupAttempted) return "필요 없음";
  if (diagnostic.cleanupSucceeded === true) return "완료";
  if (diagnostic.cleanupSucceeded === false) return "실패";
  return "확인되지 않음";
}

export function createCloudBackupDiagnosticSummary(
  diagnostic: CloudBackupAttemptDiagnostic,
) {
  const lines = [
    "클라우드 백업 진단",
    `- 실패 지점: ${diagnostic.failedStage ?? diagnostic.currentStage}`,
    `- 마지막 완료 단계: ${diagnostic.lastCompletedStage ?? "없음"}`,
    `- 오류 범주: ${diagnostic.errorCategory ?? "unknown"}`,
    `- Storage 업로드 시작: ${diagnostic.storageUploadStarted ? "예" : "아니요"}`,
    `- Storage 업로드 완료: ${diagnostic.storageUploadCompleted ? "예" : "아니요"}`,
    `- Storage 검증 완료: ${diagnostic.storageVerificationCompleted ? "예" : "아니요"}`,
    `- Metadata 기록 시작: ${diagnostic.metadataWriteStarted ? "예" : "아니요"}`,
    `- Metadata 기록 완료: ${diagnostic.metadataWriteCompleted ? "예" : "아니요"}`,
    `- Cleanup 시도: ${diagnostic.cleanupAttempted ? "예" : "아니요"}`,
    `- Cleanup 결과: ${getCloudBackupCleanupLabel(diagnostic)}`,
    `- 중단됨: ${diagnostic.aborted ? "예" : "아니요"}`,
    `- 발생 시각: ${diagnostic.occurredAt}`,
  ];
  if (diagnostic.safeProviderCode) {
    lines.splice(4, 0, `- 안전 오류 코드: ${diagnostic.safeProviderCode}`);
  }
  return lines.join("\n");
}

export function createCloudBackupDiagnosticLogEntry(
  value: CloudBackupProgress | CloudBackupFailureDiagnostic,
) {
  if ("category" in value) {
    return {
      stage: value.stage,
      category: value.category,
      failedStage: value.attempt.failedStage,
      lastCompletedStage: value.attempt.lastCompletedStage,
      storageUploadStarted: value.attempt.storageUploadStarted,
      storageUploadCompleted: value.attempt.storageUploadCompleted,
      storageVerificationCompleted: value.attempt.storageVerificationCompleted,
      metadataWriteStarted: value.attempt.metadataWriteStarted,
      metadataWriteCompleted: value.attempt.metadataWriteCompleted,
      cleanupAttempted: value.attempt.cleanupAttempted,
      occurredAt: value.occurredAt,
      cleanupSucceeded: value.cleanupSucceeded,
      ...(typeof value.byteSize === "number" ? { byteSize: value.byteSize } : {}),
      ...(value.safeProviderCode ? { safeProviderCode: value.safeProviderCode } : {}),
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
        { operation: "sha-calculation" },
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
      { cause: error, operation: "sha-calculation" },
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
    onProgress?: CloudBackupProgressReporter;
  } = {},
): Promise<PreparedCloudBackup> {
  const validation = validateBackup(backup);
  if (!validation.canRestore || !validation.backup) {
    throw new CloudBackupError(
      "BACKUP_INVALID",
      "현재 전체 백업 데이터가 검증을 통과하지 못했습니다.",
      { operation: "backup-preparation" },
    );
  }

  const normalizedBackup = validation.backup;
  const json = serializeAppBackup(normalizedBackup);
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > MAX_BACKUP_FILE_BYTES) {
    throw new CloudBackupError(
      "BACKUP_TOO_LARGE",
      "전체 백업이 10MB 제한을 초과하여 업로드하지 않았습니다.",
      { operation: "backup-preparation" },
    );
  }

  const backupId = createCloudBackupId(options.now, options.randomUuid);
  const storagePath = `users/${uid}/backups/${backupId}.json`;
  options.onProgress?.({ stage: "calculating-sha", byteSize: bytes.byteLength });
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

function throwIfAborted(
  signal?: AbortSignal,
  operation: CloudBackupAttemptStage = "backup-preparation",
) {
  if (signal?.aborted) {
    throw new CloudBackupError("REQUEST_CANCELLED", "클라우드 백업 요청을 중단했습니다.", {
      operation,
    });
  }
}

export async function uploadPreparedCloudBackup(
  gateway: CloudBackupGateway,
  uid: string,
  prepared: PreparedCloudBackup,
  signal?: AbortSignal,
  onProgress?: CloudBackupProgressReporter,
) {
  throwIfAborted(signal, "storage-upload");
  let uploaded = false;
  let primaryError: unknown;
  try {
    onProgress?.({ stage: "uploading-storage", byteSize: prepared.byteSize });
    try {
      await gateway.uploadJson(
        prepared.storagePath,
        prepared.bytes,
        {
          backupId: prepared.backupId,
          schemaVersion: String(prepared.metadata.schemaVersion),
          sha256: prepared.sha256,
        },
      );
    } catch (error) {
      throw new CloudBackupError("UPLOAD_FAILED", "클라우드 파일 업로드에 실패했습니다.", {
        cause: error,
        operation: "storage-upload",
      });
    }
    uploaded = true;
    onProgress?.({ stage: "verifying-storage", byteSize: prepared.byteSize });
    let storageMetadata;
    try {
      storageMetadata = await gateway.getStorageMetadata(prepared.storagePath);
    } catch (error) {
      throw new CloudBackupError(
        "STORAGE_METADATA_FAILED",
        "업로드된 파일 정보를 확인하지 못했습니다.",
        { cause: error, operation: "storage-verification" },
      );
    }
    if (
      storageMetadata.byteSize !== prepared.byteSize ||
      storageMetadata.contentType !== CLOUD_BACKUP_CONTENT_TYPE ||
      storageMetadata.sha256 !== prepared.sha256
    ) {
      throw new CloudBackupError(
        "UPLOAD_METADATA_MISMATCH",
        "업로드된 파일의 크기 또는 형식이 준비한 백업과 일치하지 않습니다.",
        { operation: "storage-verification" },
      );
    }
    throwIfAborted(signal, "storage-verification");
    onProgress?.({ stage: "writing-metadata", byteSize: prepared.byteSize });
    try {
      await gateway.createMetadata(
        uid,
        prepared.backupId,
        prepared.metadata,
      );
    } catch (error) {
      throw new CloudBackupError("METADATA_FAILED", "백업 목록 저장에 실패했습니다.", {
        cause: error,
        operation: "firestore-metadata-write",
      });
    }
    onProgress?.({ stage: "success", byteSize: prepared.byteSize });
    return prepared.metadata;
  } catch (error) {
    primaryError = error;
    if (!uploaded) throw error;

    onProgress?.({ stage: "cleaning-up", byteSize: prepared.byteSize });
    try {
      await gateway.deleteStorageObject(prepared.storagePath);
    } catch (cleanupError) {
      throw new CloudBackupError(
        "METADATA_AND_CLEANUP_FAILED",
        "백업 목록 저장에 실패했고 업로드 파일 정리도 완료하지 못했습니다.",
        {
          cause: cleanupError,
          orphanStoragePath: prepared.storagePath,
          operation: "storage-cleanup",
        },
      );
    }

    if (primaryError instanceof CloudBackupError) throw primaryError;
    throw new CloudBackupError("METADATA_FAILED", "백업 파일은 정리했지만 백업 목록 저장에 실패했습니다.", {
      cause: primaryError,
      operation: "firestore-metadata-write",
    });
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
