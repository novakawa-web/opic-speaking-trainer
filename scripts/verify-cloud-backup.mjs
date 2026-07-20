import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cards } from "../src/data/cards.ts";
import {
  DEFAULT_BACKUP_SETTINGS,
  MAX_BACKUP_FILE_BYTES,
  createAppBackup,
  parseAndValidateBackup,
  serializeAppBackup,
} from "../src/utils/appBackup.ts";
import { EMPTY_SAVED_PASSAGE_DATASET } from "../src/utils/savedPassageStorage.ts";
import { EMPTY_PERSONAL_MEMO_DATASET } from "../src/utils/personalMemoStorage.ts";
import { readCloudBackupConfiguration } from "../src/config/cloudBackup.ts";
import { getCloudBackupAccountIdentity } from "../src/utils/cloudBackupAccount.ts";
import {
  CLOUD_BACKUP_ACCESS_DENIED_MESSAGE,
  classifyCloudBackupAccessError,
  getCloudBackupAccessErrorMessage,
  parseCloudBackupAccess,
} from "../src/services/cloudBackupAccess.ts";
import {
  CLOUD_BACKUP_CONTENT_TYPE,
  CloudBackupError,
  advanceCloudBackupAttemptDiagnostic,
  calculateSha256,
  classifyCloudBackupFailure,
  createCloudBackupAttemptDiagnostic,
  createCloudBackupDiagnosticLogEntry,
  createCloudBackupDiagnosticSummary,
  createAndUploadCloudBackup,
  createCloudBackupFailureDiagnostic,
  createCloudBackupId,
  getCloudBackupFailureGuidance,
  getCloudBackupCleanupLabel,
  getCloudBackupStorageCreationLabel,
  getCloudBackupStageMessage,
  listRecentCloudBackups,
  normalizeDeviceLabel,
  prepareCloudBackup,
  uploadPreparedCloudBackup,
} from "../src/services/cloudBackup.ts";

let passed = 0;

async function test(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function createFixtureBackup() {
  return createAppBackup(
    cards,
    {},
    {},
    DEFAULT_BACKUP_SETTINGS,
    new Date("2026-07-20T02:15:00.000Z"),
    {},
    {},
    EMPTY_SAVED_PASSAGE_DATASET,
    EMPTY_PERSONAL_MEMO_DATASET,
    {},
    {},
    [],
  );
}

function createCompleteCloudEnvironment(overrides = {}) {
  return {
    VITE_CLOUD_BACKUP_ENABLED: "true",
    VITE_FIREBASE_API_KEY: "test-api-key",
    VITE_FIREBASE_AUTH_DOMAIN: "auth.example.test",
    VITE_FIREBASE_PROJECT_ID: "test-project",
    VITE_FIREBASE_STORAGE_BUCKET: "test-bucket.example.test",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
    VITE_FIREBASE_APP_ID: "test-app-id",
    VITE_FIREBASE_MEASUREMENT_ID: "test-measurement-id",
    VITE_FIREBASE_USE_EMULATORS: "false",
    ...overrides,
  };
}

const fixedUuid = "550e8400-e29b-41d4-a716-446655440000";
const fixedDigest = async () => new Uint8Array(32).fill(0xab).buffer;

function createGateway(overrides = {}) {
  const calls = {
    upload: [],
    storageMetadata: [],
    metadata: [],
    deleted: [],
    listed: [],
  };
  return {
    calls,
    gateway: {
      async uploadJson(path, bytes, customMetadata) {
        calls.upload.push({ path, bytes: bytes.byteLength, customMetadata });
      },
      async getStorageMetadata(path) {
        calls.storageMetadata.push(path);
        const upload = calls.upload.at(-1);
        return {
          byteSize: upload?.bytes ?? 0,
          contentType: CLOUD_BACKUP_CONTENT_TYPE,
          sha256: upload?.customMetadata.sha256 ?? null,
        };
      },
      async createMetadata(uid, backupId, metadata) {
        calls.metadata.push({ uid, backupId, metadata });
      },
      async deleteStorageObject(path) {
        calls.deleted.push(path);
      },
      async listMetadata(uid, maximum) {
        calls.listed.push({ uid, maximum });
        return [];
      },
      ...overrides,
    },
  };
}

async function runDiagnosticAttempt(overrides = {}, options = {}) {
  const { gateway, calls } = createGateway(overrides);
  let attempt = createCloudBackupAttemptDiagnostic(new Date("2026-07-20T04:00:00Z"));
  let error;
  try {
    await createAndUploadCloudBackup(
      gateway,
      "user-a",
      createFixtureBackup(),
      "test device",
      {
        digest: fixedDigest,
        signal: options.signal,
        onProgress(progress) {
          attempt = advanceCloudBackupAttemptDiagnostic(attempt, progress);
        },
      },
    );
  } catch (caught) {
    error = caught;
  }
  return { gateway, calls, attempt, error };
}

await test("기능 플래그 기본값은 OFF", () => {
  const config = readCloudBackupConfiguration({});
  assert.equal(config.enabled, false);
  assert.equal(config.firebaseOptions, null);
  assert.equal(config.useEmulators, false);
});

await test("OFF에서는 Firebase 설정 누락을 오류로 만들지 않음", () => {
  const config = readCloudBackupConfiguration({ VITE_CLOUD_BACKUP_ENABLED: "false" });
  assert.deepEqual(config.missingKeys, []);
});

await test("ON에서 누락된 공개 Web config를 모두 보고", () => {
  const config = readCloudBackupConfiguration({ VITE_CLOUD_BACKUP_ENABLED: "true" });
  assert.equal(config.enabled, false);
  assert.equal(config.missingKeys.length, 7);
  assert.equal(config.firebaseOptions, null);
});

await test("완전한 공개 Web config를 정규화", () => {
  const config = readCloudBackupConfiguration(
    createCompleteCloudEnvironment({ VITE_FIREBASE_API_KEY: " key " }),
  );
  assert.equal(config.enabled, true);
  assert.equal(config.firebaseOptions?.apiKey, "key");
  assert.equal(config.firebaseOptions?.measurementId, "test-measurement-id");
  assert.equal(config.useEmulators, false);
});

await test("개발 환경은 Emulator를 명시적으로 true일 때만 사용", () => {
  const config = readCloudBackupConfiguration(
    createCompleteCloudEnvironment({ VITE_FIREBASE_USE_EMULATORS: "true" }),
  );
  assert.equal(config.enabled, true);
  assert.equal(config.useEmulators, true);
  assert.ok(config.firebaseOptions);
});

await test("production은 Emulator false가 명시된 완전한 설정만 활성화", () => {
  const config = readCloudBackupConfiguration(
    createCompleteCloudEnvironment({ PROD: true }),
  );
  assert.equal(config.enabled, true);
  assert.equal(config.useEmulators, false);
  assert.ok(config.firebaseOptions);
});

await test("production에서 Emulator true면 클라우드 기능을 차단", () => {
  const config = readCloudBackupConfiguration(
    createCompleteCloudEnvironment({ PROD: true, VITE_FIREBASE_USE_EMULATORS: "true" }),
  );
  assert.equal(config.enabled, false);
  assert.equal(config.useEmulators, true);
  assert.equal(config.firebaseOptions, null);
});

await test("production에서 Emulator 설정이 누락되면 클라우드 기능을 차단", () => {
  const environment = createCompleteCloudEnvironment({ PROD: true });
  delete environment.VITE_FIREBASE_USE_EMULATORS;
  const config = readCloudBackupConfiguration(environment);
  assert.equal(config.enabled, false);
  assert.equal(config.useEmulators, false);
  assert.equal(config.firebaseOptions, null);
});

await test("allowlist 문서가 없거나 enabled가 true가 아니면 미허용", () => {
  assert.deepEqual(parseCloudBackupAccess(undefined), { allowed: false });
  assert.deepEqual(parseCloudBackupAccess({ enabled: false }), { allowed: false });
  assert.deepEqual(parseCloudBackupAccess({ enabled: "true" }), { allowed: false });
});

await test("enabled true allowlist만 허용하고 label을 정규화", () => {
  assert.deepEqual(parseCloudBackupAccess({ enabled: true, label: "  Primary account  " }), {
    allowed: true,
    label: "Primary account",
  });
});

await test("allowlist permission-denied와 네트워크 오류를 구분", () => {
  assert.equal(
    classifyCloudBackupAccessError({ code: "firestore/permission-denied" }),
    "permission-denied",
  );
  assert.equal(
    classifyCloudBackupAccessError({ code: "firestore/unavailable" }),
    "network-error",
  );
});

await test("미허용 안내는 로컬 기능 유지 사실을 포함", () => {
  assert.match(CLOUD_BACKUP_ACCESS_DENIED_MESSAGE, /사용 권한이 없습니다/);
  assert.match(CLOUD_BACKUP_ACCESS_DENIED_MESSAGE, /로컬 학습 기능은 계속 사용할 수 있습니다/);
  assert.match(getCloudBackupAccessErrorMessage("permission-denied"), /권한/);
  assert.match(getCloudBackupAccessErrorMessage("network-error"), /네트워크/);
});

await test("backupId는 UTC 시각과 UUID 조합", () => {
  assert.equal(
    createCloudBackupId(new Date("2026-07-20T02:15:00.000Z"), () => fixedUuid),
    `2026-07-20T021500Z-${fixedUuid}`,
  );
});

await test("매 호출마다 다른 UUID를 사용", () => {
  const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
  assert.notEqual(createCloudBackupId(new Date(), () => ids.shift()), createCloudBackupId(new Date(), () => ids.shift()));
});

await test("기기 이름 공백 정리와 길이 제한", () => {
  assert.equal(normalizeDeviceLabel("  집   PC  "), "집 PC");
  assert.equal(normalizeDeviceLabel("a".repeat(100)).length, 80);
});

await test("AppBackupV1 validator 재사용", async () => {
  const prepared = await prepareCloudBackup("user-a", createFixtureBackup(), "집 PC", {
    now: new Date("2026-07-20T02:15:00Z"),
    randomUuid: () => fixedUuid,
    digest: fixedDigest,
  });
  assert.equal(parseAndValidateBackup(prepared.json, prepared.byteSize).canRestore, true);
});

await test("UTF-8 byteSize는 직렬화 결과와 일치", async () => {
  const backup = createFixtureBackup();
  const prepared = await prepareCloudBackup("user-a", backup, "", { digest: fixedDigest });
  assert.equal(prepared.byteSize, new TextEncoder().encode(serializeAppBackup(backup)).byteLength);
});

await test("SHA-256은 64자리 소문자 hex", async () => {
  const hash = await calculateSha256(new Uint8Array([1, 2, 3]), fixedDigest);
  assert.equal(hash, "ab".repeat(32));
});

await test("Storage와 Firestore 사용자 경로 일치", async () => {
  const prepared = await prepareCloudBackup("user-a", createFixtureBackup(), "", {
    now: new Date("2026-07-20T02:15:00Z"), randomUuid: () => fixedUuid, digest: fixedDigest,
  });
  assert.equal(prepared.storagePath, `users/user-a/backups/${prepared.backupId}.json`);
  assert.equal(prepared.metadata.storagePath, prepared.storagePath);
});

await test("metadata summary는 실제 AppBackupV1 summary에서 계산", async () => {
  const backup = createFixtureBackup();
  const prepared = await prepareCloudBackup("user-a", backup, "", { digest: fixedDigest });
  assert.equal(prepared.metadata.summary.cardCount, backup.summary.cardCount);
  assert.equal(prepared.metadata.summary.firstLineAttemptCount, backup.summary.attemptCount);
  assert.equal(prepared.metadata.summary.cardMemoCount, backup.summary.memoCount);
});

await test("JSON byteSize와 SHA-256은 Storage 및 Firestore metadata에 동일하게 사용", async () => {
  const { gateway, calls } = createGateway();
  const prepared = await createAndUploadCloudBackup(
    gateway,
    "user-a",
    createFixtureBackup(),
    "",
    { digest: fixedDigest },
  );
  assert.equal(calls.upload[0].bytes, prepared.byteSize);
  assert.equal(calls.upload[0].customMetadata.sha256, prepared.sha256);
  assert.equal(calls.metadata[0].metadata.byteSize, prepared.byteSize);
  assert.equal(calls.metadata[0].metadata.sha256, prepared.sha256);
});

await test("검증 실패 백업은 업로드 준비 전에 차단", async () => {
  const invalid = { ...createFixtureBackup(), format: "wrong" };
  await assert.rejects(() => prepareCloudBackup("user-a", invalid, "", { digest: fixedDigest }), (error) => error instanceof CloudBackupError && error.code === "BACKUP_INVALID");
});

await test("10MB 초과는 업로드 전에 차단", async () => {
  const backup = createFixtureBackup();
  backup.data.cardDataset.cards[0].back = ["x".repeat(MAX_BACKUP_FILE_BYTES + 100)];
  backup.data.cardDataset.cards[0].firstLine = backup.data.cardDataset.cards[0].back[0];
  await assert.rejects(() => prepareCloudBackup("user-a", backup, "", { digest: fixedDigest }), (error) => error instanceof CloudBackupError && error.code === "BACKUP_TOO_LARGE");
});

await test("정상 업로드는 Storage 후 metadata 순서", async () => {
  const { gateway, calls } = createGateway();
  const prepared = await createAndUploadCloudBackup(gateway, "user-a", createFixtureBackup(), "PC", { randomUuid: () => fixedUuid, digest: fixedDigest });
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.metadata.length, 1);
  assert.equal(calls.metadata[0].backupId, prepared.backupId);
  assert.equal(calls.upload[0].customMetadata.sha256, prepared.sha256);
});

await test("Storage 실패 시 Firestore metadata를 만들지 않음", async () => {
  const { gateway, calls } = createGateway({ uploadJson: async () => { throw new Error("storage"); } });
  await assert.rejects(() => createAndUploadCloudBackup(gateway, "user-a", createFixtureBackup(), "", { digest: fixedDigest }), (error) => error instanceof CloudBackupError && error.code === "UPLOAD_FAILED");
  assert.equal(calls.metadata.length, 0);
  assert.equal(calls.deleted.length, 0);
});

await test("Storage metadata 불일치는 파일을 정리", async () => {
  const { gateway, calls } = createGateway({ getStorageMetadata: async () => ({ byteSize: 1, contentType: "text/plain", sha256: null }) });
  await assert.rejects(() => createAndUploadCloudBackup(gateway, "user-a", createFixtureBackup(), "", { digest: fixedDigest }), (error) => error instanceof CloudBackupError && error.code === "UPLOAD_METADATA_MISMATCH");
  assert.equal(calls.deleted.length, 1);
});

await test("Firestore metadata 실패 후 Storage 파일 정리", async () => {
  const { gateway, calls } = createGateway({ createMetadata: async () => { throw new Error("firestore"); } });
  await assert.rejects(() => createAndUploadCloudBackup(gateway, "user-a", createFixtureBackup(), "", { digest: fixedDigest }), (error) => error instanceof CloudBackupError && error.code === "METADATA_FAILED");
  assert.equal(calls.deleted.length, 1);
});

await test("정리도 실패하면 고아 Storage 경로 보존", async () => {
  const { gateway } = createGateway({
    createMetadata: async () => { throw new Error("firestore"); },
    deleteStorageObject: async () => { throw new Error("cleanup"); },
  });
  await assert.rejects(() => createAndUploadCloudBackup(gateway, "user-a", createFixtureBackup(), "", { digest: fixedDigest }), (error) => error instanceof CloudBackupError && error.code === "METADATA_AND_CLEANUP_FAILED" && error.orphanStoragePath?.startsWith("users/user-a/backups/"));
});

await test("시작 전 취소는 네트워크 호출 없음", async () => {
  const { gateway, calls } = createGateway();
  const prepared = await prepareCloudBackup("user-a", createFixtureBackup(), "", { digest: fixedDigest });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => uploadPreparedCloudBackup(gateway, "user-a", prepared, controller.signal), (error) => error instanceof CloudBackupError && error.code === "REQUEST_CANCELLED");
  assert.equal(calls.upload.length, 0);
});

await test("Storage 완료 직후 취소되면 업로드 파일 정리", async () => {
  const controller = new AbortController();
  let uploadedBytes = 0;
  const { gateway, calls } = createGateway({
    async uploadJson(_path, bytes) {
      uploadedBytes = bytes.byteLength;
      controller.abort();
    },
    async getStorageMetadata() {
      return {
        byteSize: uploadedBytes,
        contentType: CLOUD_BACKUP_CONTENT_TYPE,
        sha256: "ab".repeat(32),
      };
    },
  });
  const prepared = await prepareCloudBackup("user-a", createFixtureBackup(), "", { digest: fixedDigest });
  await assert.rejects(() => uploadPreparedCloudBackup(gateway, "user-a", prepared, controller.signal), (error) => error instanceof CloudBackupError && error.code === "REQUEST_CANCELLED");
  assert.equal(calls.deleted.length, 1);
});

await test("정상 업로드 단계가 준비부터 성공까지 순서대로 보고됨", async () => {
  const { gateway } = createGateway();
  const stages = [];
  await createAndUploadCloudBackup(
    gateway,
    "user-a",
    createFixtureBackup(),
    "PC",
    {
      digest: fixedDigest,
      onProgress: (progress) => stages.push(progress.stage),
    },
  );
  assert.deepEqual(stages, [
    "preparing",
    "calculating-sha",
    "uploading-storage",
    "verifying-storage",
    "writing-metadata",
    "success",
  ]);
});

await test("Storage 검증 실패는 정리 단계를 보고하고 안전 정리됨", async () => {
  const stages = [];
  const { gateway, calls } = createGateway({
    getStorageMetadata: async () => ({ byteSize: 1, contentType: "text/plain", sha256: null }),
  });
  await assert.rejects(() => createAndUploadCloudBackup(
    gateway,
    "user-a",
    createFixtureBackup(),
    "",
    { digest: fixedDigest, onProgress: (progress) => stages.push(progress.stage) },
  ));
  assert.deepEqual(stages, [
    "preparing",
    "calculating-sha",
    "uploading-storage",
    "verifying-storage",
    "cleaning-up",
  ]);
  assert.equal(calls.deleted.length, 1);
});

await test("백업 생성·검증과 SHA 실패 지점을 구분", async () => {
  assert.equal(
    classifyCloudBackupFailure(new CloudBackupError("BACKUP_CREATION_FAILED", "create")),
    "backup-preparation-failed",
  );
  assert.equal(
    classifyCloudBackupFailure(new CloudBackupError("BACKUP_INVALID", "validate")),
    "backup-preparation-failed",
  );
  let shaError;
  try {
    await calculateSha256(new Uint8Array([1]), async () => { throw new Error("digest"); });
  } catch (error) {
    shaError = error;
  }
  assert.equal(classifyCloudBackupFailure(shaError), "sha-calculation-failed");
});

await test("Storage 업로드와 검증 오류를 서로 구분", () => {
  assert.equal(
    classifyCloudBackupFailure(new CloudBackupError("UPLOAD_FAILED", "upload")),
    "storage-upload-failed",
  );
  assert.equal(
    classifyCloudBackupFailure(new CloudBackupError("UPLOAD_METADATA_MISMATCH", "verify")),
    "storage-verification-failed",
  );
});

await test("Firestore 기록 실패는 정리 성공을 함께 보고", () => {
  const result = createCloudBackupFailureDiagnostic(
    new CloudBackupError("METADATA_FAILED", "metadata"),
    { byteSize: 123, now: new Date("2026-07-20T03:00:00Z") },
  );
  assert.equal(result.category, "metadata-write-failed");
  assert.equal(result.cleanupSucceeded, true);
  assert.equal(result.byteSize, 123);
  assert.match(getCloudBackupFailureGuidance(result), /안전하게 정리/);
});

await test("정리 실패는 추가 업로드 금지 안내와 재시도 차단", () => {
  const result = createCloudBackupFailureDiagnostic(
    new CloudBackupError("METADATA_AND_CLEANUP_FAILED", "cleanup", {
      orphanStoragePath: "users/private/backups/private.json",
    }),
  );
  assert.equal(result.category, "cleanup-failed");
  assert.equal(result.cleanupSucceeded, false);
  assert.equal(result.retryAllowed, false);
  assert.match(getCloudBackupFailureGuidance(result), /추가 업로드를 시도하지 말고/);
});

await test("오프라인과 권한 오류를 사용자 원인으로 구분", () => {
  assert.equal(
    classifyCloudBackupFailure(new Error("offline"), { online: false }),
    "network-offline",
  );
  assert.equal(
    classifyCloudBackupFailure(
      new CloudBackupError("UPLOAD_FAILED", "upload", {
        cause: { code: "storage/unauthorized" },
        operation: "storage-upload",
      }),
    ),
    "storage-unauthorized",
  );
});

await test("중단은 Firebase 실패와 다른 aborted 상태로 분류", () => {
  const result = createCloudBackupFailureDiagnostic(
    new CloudBackupError("REQUEST_CANCELLED", "cancelled"),
  );
  assert.equal(result.stage, "aborted");
  assert.equal(result.category, "aborted");
  assert.match(getCloudBackupFailureGuidance(result), /화면 이동/);
});

await test("진단 로그에는 허용된 비민감 필드만 포함", () => {
  const diagnostic = createCloudBackupFailureDiagnostic(
    new CloudBackupError("METADATA_AND_CLEANUP_FAILED", "cleanup", {
      cause: { code: "storage/unknown" },
      orphanStoragePath: "users/private/backups/private.json",
    }),
    { byteSize: 456, now: new Date("2026-07-20T03:00:00Z") },
  );
  const entry = createCloudBackupDiagnosticLogEntry(diagnostic);
  assert.deepEqual(Object.keys(entry).sort(), [
    "byteSize",
    "category",
    "cleanupAttempted",
    "cleanupSucceeded",
    "failedStage",
    "lastCompletedStage",
    "metadataWriteCompleted",
    "metadataWriteStarted",
    "occurredAt",
    "safeProviderCode",
    "stage",
    "storageUploadCompleted",
    "storageUploadStarted",
    "storageVerificationCompleted",
  ]);
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /private|users\//);
});

await test("모든 단계에 사용자 상태 문구가 있음", () => {
  for (const stage of [
    "preparing",
    "calculating-sha",
    "uploading-storage",
    "verifying-storage",
    "writing-metadata",
    "cleaning-up",
    "refreshing-list",
    "success",
    "failed",
    "aborted",
  ]) {
    assert.ok(getCloudBackupStageMessage(stage).length > 0);
  }
});

await test("Storage unauthorized는 업로드 실패 지점과 미생성을 보존", async () => {
  const result = await runDiagnosticAttempt({
    uploadJson: async () => { throw { code: "storage/unauthorized" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "storage-unauthorized");
  assert.equal(failure.safeProviderCode, "storage/unauthorized");
  assert.equal(failure.attempt.failedStage, "storage-upload");
  assert.equal(failure.attempt.lastCompletedStage, "sha-calculation");
  assert.equal(failure.attempt.storageUploadStarted, true);
  assert.equal(failure.attempt.storageUploadCompleted, false);
  assert.equal(getCloudBackupStorageCreationLabel(failure.attempt), "완료되지 않음");
  assert.equal(getCloudBackupCleanupLabel(failure.attempt), "필요 없음");
  assert.equal(failure.retryAllowed, false);
});

await test("Storage metadata 조회 실패는 검증 지점과 cleanup 성공을 보존", async () => {
  const result = await runDiagnosticAttempt({
    getStorageMetadata: async () => { throw { code: "storage/unknown" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "storage-verification-failed");
  assert.equal(failure.attempt.failedStage, "storage-verification");
  assert.equal(failure.attempt.storageUploadCompleted, true);
  assert.equal(failure.attempt.storageVerificationCompleted, false);
  assert.equal(failure.attempt.cleanupAttempted, true);
  assert.equal(failure.attempt.cleanupSucceeded, true);
  assert.equal(result.calls.deleted.length, 1);
});

await test("Firestore permission-denied는 목록 기록 실패와 cleanup 성공을 보존", async () => {
  const result = await runDiagnosticAttempt({
    createMetadata: async () => { throw { code: "permission-denied" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "firestore-permission-denied");
  assert.equal(failure.safeProviderCode, "permission-denied");
  assert.equal(failure.attempt.failedStage, "firestore-metadata-write");
  assert.equal(failure.attempt.storageVerificationCompleted, true);
  assert.equal(failure.attempt.metadataWriteStarted, true);
  assert.equal(failure.attempt.metadataWriteCompleted, false);
  assert.equal(failure.attempt.cleanupSucceeded, true);
  assert.equal(result.calls.deleted.length, 1);
  assert.equal(failure.retryAllowed, false);
});

await test("Firestore invalid-argument는 metadata 검증 실패로 구분", async () => {
  const result = await runDiagnosticAttempt({
    createMetadata: async () => { throw { code: "invalid-argument" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "metadata-validation-failed");
  assert.equal(failure.safeProviderCode, undefined);
  assert.equal(failure.retryAllowed, false);
});

await test("Firestore 실패 뒤 cleanup 실패는 별도 실패 지점과 재시도 차단", async () => {
  const result = await runDiagnosticAttempt({
    createMetadata: async () => { throw { code: "permission-denied" }; },
    deleteStorageObject: async () => { throw { code: "storage/unknown" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "cleanup-failed");
  assert.equal(failure.attempt.failedStage, "storage-cleanup");
  assert.equal(failure.attempt.cleanupAttempted, true);
  assert.equal(failure.attempt.cleanupSucceeded, false);
  assert.equal(failure.retryAllowed, false);
});

await test("명백한 Storage 네트워크 오류만 재시도 허용", async () => {
  const result = await runDiagnosticAttempt({
    uploadJson: async () => { throw { code: "storage/retry-limit-exceeded" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "storage-network");
  assert.equal(failure.retryAllowed, true);
});

await test("unauthenticated는 재시도하지 않고 인증 실패로 보존", async () => {
  const result = await runDiagnosticAttempt({
    uploadJson: async () => { throw { code: "unauthenticated" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "unauthenticated");
  assert.equal(failure.safeProviderCode, "unauthenticated");
  assert.equal(failure.retryAllowed, false);
});

await test("시작 전 abort는 Storage 호출 없이 중단 지점을 보존", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runDiagnosticAttempt({}, { signal: controller.signal });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  assert.equal(failure.category, "aborted");
  assert.equal(failure.attempt.failedStage, "abort");
  assert.equal(failure.attempt.aborted, true);
  assert.equal(result.calls.upload.length, 0);
});

await test("성공 진단은 Storage 검증과 Metadata 기록 완료를 보존", async () => {
  const result = await runDiagnosticAttempt();
  assert.equal(result.error, undefined);
  assert.equal(result.attempt.storageUploadCompleted, true);
  assert.equal(result.attempt.storageVerificationCompleted, true);
  assert.equal(result.attempt.metadataWriteCompleted, true);
  assert.equal(result.calls.metadata.length, 1);
});

await test("목록 갱신 실패는 저장 성공과 분리하고 재업로드를 차단", () => {
  let attempt = createCloudBackupAttemptDiagnostic(new Date("2026-07-20T04:00:00Z"));
  for (const stage of [
    "calculating-sha",
    "uploading-storage",
    "verifying-storage",
    "writing-metadata",
    "success",
    "refreshing-list",
  ]) {
    attempt = advanceCloudBackupAttemptDiagnostic(attempt, { stage });
  }
  const failure = createCloudBackupFailureDiagnostic(
    new CloudBackupError("LIST_REFRESH_FAILED", "list", {
      cause: { code: "unavailable" },
      operation: "list-refresh",
    }),
    { attempt },
  );
  assert.equal(failure.category, "list-refresh-failed");
  assert.equal(failure.attempt.failedStage, "list-refresh");
  assert.equal(failure.attempt.metadataWriteCompleted, true);
  assert.equal(failure.retryAllowed, false);
});

await test("진단 복사 요약은 안전 필드만 포함", async () => {
  const result = await runDiagnosticAttempt({
    createMetadata: async () => { throw { code: "permission-denied", message: "users/private/backups/private.json" }; },
  });
  const failure = createCloudBackupFailureDiagnostic(result.error, { attempt: result.attempt });
  const summary = createCloudBackupDiagnosticSummary(failure.attempt);
  assert.match(summary, /실패 지점: firestore-metadata-write/);
  assert.match(summary, /오류 범주: firestore-permission-denied/);
  assert.doesNotMatch(summary, /user-a|private|users\/|backupId|projectId|bucket|api|sha256/i);
});

await test("최근 목록은 uploadedAt 최신순", async () => {
  const { gateway } = createGateway({
    async listMetadata() {
      const base = (uploadedAt) => ({
        backupId: uploadedAt, schemaVersion: 1, exportedAt: uploadedAt, uploadedAt,
        byteSize: 10, sha256: "a".repeat(64), appVersion: "0.1.0",
        storagePath: `users/u/backups/${uploadedAt}.json`,
        summary: { cardCount: 0, archivedCardCount: 0, firstLineAttemptCount: 0, answerLearningAttemptCount: 0, cardMemoCount: 0, personalMemoCount: 0, savedPassageCount: 0 },
      });
      return [base("2026-01-01T00:00:00Z"), base("2026-02-01T00:00:00Z")];
    },
  });
  const result = await listRecentCloudBackups(gateway, "u");
  assert.equal(result[0].uploadedAt, "2026-02-01T00:00:00Z");
});

await test("목록 최대 개수는 20으로 제한", async () => {
  const { gateway, calls } = createGateway();
  await listRecentCloudBackups(gateway, "user-a", 100);
  assert.equal(calls.listed[0].maximum, 20);
});

await test("클라우드 서비스는 localStorage를 조작하지 않음", async () => {
  const before = JSON.stringify({ one: "same", two: "same" });
  const { gateway } = createGateway();
  await createAndUploadCloudBackup(gateway, "user-a", createFixtureBackup(), "", { digest: fixedDigest });
  assert.equal(JSON.stringify({ one: "same", two: "same" }), before);
});

const [
  featureSource,
  serviceSource,
  accessServiceSource,
  firebaseServiceSource,
  panelSource,
  firestoreRules,
  storageRules,
  gitignore,
  workflowSource,
  operationsGuide,
  stylesSource,
] = await Promise.all([
  readFile(new URL("../src/components/CloudBackupFeature.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/services/cloudBackup.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/services/cloudBackupAccess.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/services/firebaseCloudBackup.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/CloudBackupPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../storage.rules", import.meta.url), "utf8"),
  readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
  readFile(new URL("../CLOUD_BACKUP_OPERATIONS.md", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
]);

await test("OFF일 때 lazy 패널을 렌더링하지 않음", () => {
  assert.match(featureSource, /if \(!CLOUD_BACKUP_ENABLED\) return null/);
});

await test("서비스에 localStorage/sessionStorage 쓰기 없음", () => {
  assert.doesNotMatch(serviceSource, /localStorage|sessionStorage|setItem|removeItem/);
  assert.doesNotMatch(accessServiceSource, /localStorage|sessionStorage|setItem|removeItem/);
  assert.doesNotMatch(firebaseServiceSource, /localStorage|sessionStorage|setItem|removeItem/);
  assert.doesNotMatch(panelSource, /localStorage|sessionStorage|setItem|removeItem/);
});

await test("화면 이탈은 현재 요청을 중단하고 늦은 상태 갱신을 차단", () => {
  assert.match(panelSource, /mountedRef\.current = false;[\s\S]*?uploadAbortRef\.current\?\.abort\(\)/);
  assert.match(panelSource, /if \(!mountedRef\.current\) return/);
  assert.match(panelSource, /failure\.stage/);
});

await test("로그인 후 자기 allowlist 문서를 단건 조회", () => {
  assert.match(firebaseServiceSource, /"cloudBackupAllowedUsers",\s*uid/);
  assert.match(firebaseServiceSource, /getDoc\(accessReference\)/);
  assert.doesNotMatch(firebaseServiceSource, /collection\([^)]*cloudBackupAllowedUsers/);
});

await test("허용된 사용자만 목록 조회와 업로드 UI 진입", () => {
  assert.match(panelSource, /if \(!access\.allowed\)/);
  assert.match(panelSource, /setAccessStatus\("allowed"\);\s*await refreshBackups/);
  assert.match(panelSource, /accessStatus !== "allowed"/);
  assert.match(panelSource, /accessStatus === "allowed"/);
});

await test("미허용·확인 중·네트워크·permission-denied UI를 구분", () => {
  assert.match(panelSource, /accessStatus === "checking"/);
  assert.match(panelSource, /accessStatus === "denied"/);
  assert.match(panelSource, /accessStatus === "network-error"/);
  assert.match(panelSource, /accessStatus === "permission-denied"/);
  assert.match(panelSource, /권한 다시 확인/);
});

await test("UI에 다운로드·복원·병합·삭제 버튼 없음", () => {
  assert.doesNotMatch(
    panelSource,
    /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?(다운로드|복원|병합|적용|백업 삭제)(?:(?!<\/button>)[\s\S])*?<\/button>/,
  );
});

await test("업로드 중 중복 클릭은 handler와 disabled 상태에서 이중 차단", () => {
  assert.match(panelSource, /isUploading \|\|\s*uploadAbortRef\.current/);
  assert.match(panelSource, /disabled=\{isUploading\}/);
});

await test("업로드 진단은 버튼 가까이에서 목록보다 먼저 렌더링", () => {
  const statusIndex = panelSource.indexOf('id="cloud-backup-upload-status"');
  const listIndex = panelSource.indexOf('className="cloud-backup-list-heading"');
  assert.ok(statusIndex > panelSource.indexOf('className="cloud-backup-upload-button"'));
  assert.ok(statusIndex < listIndex);
  assert.match(panelSource, /aria-live=\{uploadFeedback\.failure \? "assertive" : "polite"\}/);
});

await test("실패 재시도는 명시적 버튼만 제공하고 자동 재시도 없음", () => {
  assert.match(panelSource, />\s*다시 시도\s*</);
  assert.match(panelSource, /onClick=\{\(\) => void handleUpload\(\)\}/);
  assert.doesNotMatch(panelSource, /setTimeout\([^)]*handleUpload/);
  assert.doesNotMatch(panelSource, /setInterval\([^)]*handleUpload/);
});

await test("성공 뒤 최근 목록은 한 번만 새로고침", () => {
  const handler = panelSource.slice(
    panelSource.indexOf("async function handleUpload"),
    panelSource.indexOf("const missingConfiguration"),
  );
  assert.equal((handler.match(/await refreshBackups\(user, \{ showError: false \}\)/g) ?? []).length, 1);
});

await test("패널 로그에 전체 Storage 경로와 식별자를 출력하지 않음", () => {
  assert.doesNotMatch(panelSource, /console\.(?:error|info|warn)\([^)]*storagePath/s);
  assert.doesNotMatch(panelSource, /console\.(?:error|info|warn)\([^)]*(?:uid|backupId|sha256)/s);
  assert.match(panelSource, /createCloudBackupDiagnosticLogEntry/);
});

await test("계정 카드는 이름과 이메일의 표시 우선순위를 안전하게 적용", () => {
  assert.doesNotMatch(panelSource, />\s*\{user\.uid\}\s*</);
  assert.match(panelSource, /className="cloud-backup-account-email"/);
  assert.deepEqual(
    getCloudBackupAccountIdentity({ uid: "user-a", displayName: "  OPIc User  ", email: "user@example.test" }),
    { primary: "OPIc User", secondary: "user@example.test" },
  );
  assert.deepEqual(
    getCloudBackupAccountIdentity({ uid: "user-a", displayName: null, email: "user@example.test" }),
    { primary: "user@example.test", secondary: null },
  );
  assert.deepEqual(
    getCloudBackupAccountIdentity({ uid: "user-a", displayName: "OPIc User", email: null }),
    { primary: "OPIc User", secondary: null },
  );
  assert.deepEqual(
    getCloudBackupAccountIdentity({ uid: "user-a", displayName: null, email: null }),
    { primary: "Google 사용자", secondary: null },
  );
});

await test("계정 이메일은 표시 전용이며 저장·백업·진단 정보에 포함되지 않음", () => {
  assert.doesNotMatch(panelSource, /(?:localStorage|sessionStorage)\.setItem\([^)]*email/s);
  assert.doesNotMatch(serviceSource, /(?:metadata|diagnostic)[\s\S]{0,100}email/i);
  assert.doesNotMatch(panelSource, /console\.(?:error|info|warn)\([^)]*email/s);
});

await test("진단 UI가 성공 요약과 정리 실패 재시도 차단을 표시", () => {
  assert.match(panelSource, /uploadFeedback\.success/);
  assert.match(panelSource, /생성 시각/);
  assert.match(panelSource, /파일 크기/);
  assert.match(panelSource, /uploadFeedback\.failure\.retryAllowed/);
  assert.match(panelSource, /getCloudBackupFailureGuidance/);
  assert.match(panelSource, /CloudBackupFailureDetails/);
  assert.match(panelSource, /진단 정보 복사/);
  assert.match(panelSource, /실패 지점/);
  assert.match(panelSource, /Storage 파일 생성/);
  assert.match(panelSource, /실패 파일 정리/);
});

await test("진단 상태와 복사 내용은 브라우저 저장소에 기록하지 않음", () => {
  const diagnosticSource = `${panelSource}\n${serviceSource}`;
  assert.doesNotMatch(diagnosticSource, /localStorage\.(?:setItem|removeItem)/);
  assert.doesNotMatch(diagnosticSource, /sessionStorage\.(?:setItem|removeItem)/);
  assert.match(panelSource, /useRef<CloudBackupAttemptDiagnostic \| null>/);
});

await test("권한 오류는 재시도 차단하고 네트워크 오류만 재시도 허용", () => {
  assert.match(serviceSource, /category === "network-offline"[\s\S]*?category === "storage-network"[\s\S]*?category === "firestore-network"/);
  assert.doesNotMatch(serviceSource, /category === "storage-unauthorized"[\s\S]{0,80}return true/);
  assert.doesNotMatch(serviceSource, /category === "firestore-permission-denied"[\s\S]{0,80}return true/);
});

await test("업로드 진단은 모바일 700px 이하에서 2열 요약과 전체 폭 재시도 사용", () => {
  assert.match(stylesSource, /\.cloud-backup-upload-status\s*\{[\s\S]*?overflow-wrap: anywhere/);
  assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]*?\.cloud-backup-success-summary\s*\{\s*grid-template-columns: repeat\(2/);
  assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]*?\.cloud-backup-retry-button,[\s\S]*?\.cloud-backup-copy-diagnostic-button\s*\{\s*width: 100%/);
  assert.match(stylesSource, /@media \(max-width: 380px\)[\s\S]*?\.cloud-backup-failure-summary\s*\{\s*grid-template-columns: 1fr/);
});

await test("업로드 진단은 라이트·다크 공통 상태 토큰을 사용", () => {
  assert.match(stylesSource, /:root\s*\{[\s\S]*?--status-success-bg:[^;]+;[\s\S]*?--status-hard-bg:[^;]+;/);
  assert.match(stylesSource, /:root\[data-theme="dark"\]\s*\{[\s\S]*?--status-success-bg:[^;]+;[\s\S]*?--status-hard-bg:[^;]+;/);
  assert.match(stylesSource, /\.cloud-backup-upload-status\.is-success\s*\{[\s\S]*?var\(--status-success-bg\)/);
  assert.match(stylesSource, /\.cloud-backup-upload-status\.is-failed,[\s\S]*?var\(--status-hard-bg\)/);
});

await test("Firestore 규칙은 로그인 uid와 자기 경로만 허용", () => {
  assert.match(firestoreRules, /request\.auth\.uid == uid/);
  assert.match(firestoreRules, /match \/users\/\{uid\}\/backups\/\{backupId\}/);
  assert.match(firestoreRules, /allow update, delete: if false/);
});

await test("Firestore 규칙은 allowlist를 우회할 넓은 허용 규칙이 없음", () => {
  assert.match(firestoreRules, /cloudBackupAllowed\(uid\)/);
  assert.match(firestoreRules, /match \/cloudBackupAllowedUsers\/\{uid\}/);
  assert.match(firestoreRules, /allow get: if signedInAs\(uid\)/);
  assert.match(firestoreRules, /allow list, create, update, delete: if false/);
  assert.doesNotMatch(firestoreRules, /allow read, write: if true/);
});

await test("Firestore metadata 필드와 server timestamp 검증", () => {
  assert.match(firestoreRules, /data\.uploadedAt == request\.time/);
  assert.match(firestoreRules, /data\.sha256\.matches/);
  assert.match(firestoreRules, /data\.byteSize <= 10 \* 1024 \* 1024/);
});

await test("Storage 규칙은 uid, JSON, 10MB, 불변 생성 검증", () => {
  assert.match(storageRules, /request\.auth\.uid == uid/);
  assert.match(storageRules, /resource == null/);
  assert.match(storageRules, /request\.resource\.contentType == 'application\/json'/);
  assert.match(storageRules, /request\.resource\.size <= 10 \* 1024 \* 1024/);
});

await test("Storage 규칙은 Firestore allowlist enabled true를 요구", () => {
  assert.match(storageRules, /firestore\.exists/);
  assert.match(storageRules, /firestore\.get/);
  assert.match(storageRules, /cloudBackupAllowedUsers\/\$\(uid\)/);
  assert.match(storageRules, /\.data\.enabled == true/);
});

await test("실제 환경 파일은 ignore하고 예제만 추적 가능", () => {
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

await test("Pages build는 Repository Variables 아홉 개만 전달", () => {
  const variableNames = [
    "VITE_CLOUD_BACKUP_ENABLED",
    "VITE_FIREBASE_USE_EMULATORS",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_MEASUREMENT_ID",
  ];
  for (const name of variableNames) {
    assert.match(workflowSource, new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\}\\}`));
  }
  assert.doesNotMatch(workflowSource, /secrets\.VITE_/);
});

await test("Pages 배포 job은 main push에서만 실행", () => {
  assert.match(workflowSource, /branches: \["main"\]/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(
    workflowSource,
    /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/,
  );
});

await test("운영 문서는 공개 Variables와 금지 비밀정보를 구분", () => {
  assert.match(operationsGuide, /Settings > Secrets and variables > Actions > Variables/);
  assert.match(operationsGuide, /Firebase Web config는 브라우저 번들에 포함되는 공개 식별자/);
  assert.match(operationsGuide, /service account JSON/);
  assert.match(operationsGuide, /production 빌드에서 `VITE_FIREBASE_USE_EMULATORS`가 정확히 `false`/);
  assert.match(operationsGuide, /localStorage는 계속 유일한 학습 데이터 원본/);
});

console.log(`\nCloud backup verification: ${passed}/${passed} passed`);
