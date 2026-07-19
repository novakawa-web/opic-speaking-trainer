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

export type CloudBackupErrorCode =
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
) {
  throwIfAborted(signal);
  let uploaded = false;
  try {
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
    await gateway.createMetadata(
      uid,
      prepared.backupId,
      prepared.metadata,
    );
    return prepared.metadata;
  } catch (error) {
    if (!uploaded) {
      if (error instanceof CloudBackupError) throw error;
      throw new CloudBackupError("UPLOAD_FAILED", "클라우드 파일 업로드에 실패했습니다.", {
        cause: error,
      });
    }

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
  options: Parameters<typeof prepareCloudBackup>[3] & { signal?: AbortSignal } = {},
) {
  const prepared = await prepareCloudBackup(uid, backup, deviceLabel, options);
  await uploadPreparedCloudBackup(gateway, uid, prepared, options.signal);
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
