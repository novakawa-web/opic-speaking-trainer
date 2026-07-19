import type { CloudBackupAccess } from "../cloudBackupTypes.ts";

export type CloudBackupAccessStatus =
  | "idle"
  | "checking"
  | "allowed"
  | "denied"
  | "network-error"
  | "permission-denied";

export const CLOUD_BACKUP_ACCESS_DENIED_MESSAGE =
  "이 계정은 클라우드 백업 사용 권한이 없습니다. 로컬 학습 기능은 계속 사용할 수 있습니다.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCloudBackupAccess(value: unknown): CloudBackupAccess {
  if (!isRecord(value) || value.enabled !== true) return { allowed: false };
  const label =
    typeof value.label === "string" && value.label.trim()
      ? value.label.trim().slice(0, 80)
      : undefined;
  return {
    allowed: true,
    ...(label ? { label } : {}),
  };
}

function firebaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code.toLowerCase() : "";
}

export function classifyCloudBackupAccessError(
  error: unknown,
): "network-error" | "permission-denied" {
  const code = firebaseErrorCode(error);
  if (code.includes("permission-denied") || code.includes("unauthorized")) {
    return "permission-denied";
  }
  return "network-error";
}

export function getCloudBackupAccessErrorMessage(
  status: "network-error" | "permission-denied",
) {
  return status === "permission-denied"
    ? "클라우드 백업 사용 권한을 확인하지 못했습니다. 이 계정에 사용 권한이 없거나 접근이 제한되어 있을 수 있습니다. 로컬 학습 기능은 계속 사용할 수 있습니다."
    : "네트워크 문제로 클라우드 백업 사용 권한을 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요. 로컬 학습 기능은 계속 사용할 수 있습니다.";
}
