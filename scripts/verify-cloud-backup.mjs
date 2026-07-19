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
import {
  CLOUD_BACKUP_ACCESS_DENIED_MESSAGE,
  classifyCloudBackupAccessError,
  getCloudBackupAccessErrorMessage,
  parseCloudBackupAccess,
} from "../src/services/cloudBackupAccess.ts";
import {
  CLOUD_BACKUP_CONTENT_TYPE,
  CloudBackupError,
  calculateSha256,
  createAndUploadCloudBackup,
  createCloudBackupId,
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
    metadata: [],
    deleted: [],
    listed: [],
  };
  return {
    calls,
    gateway: {
      async uploadJson(path, bytes, customMetadata) {
        calls.upload.push({ path, bytes: bytes.byteLength, customMetadata });
        return {
          byteSize: bytes.byteLength,
          contentType: CLOUD_BACKUP_CONTENT_TYPE,
          sha256: customMetadata.sha256,
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
  const { gateway, calls } = createGateway({ uploadJson: async () => ({ byteSize: 1, contentType: "text/plain", sha256: null }) });
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
  const { gateway, calls } = createGateway({
    async uploadJson(_path, bytes) {
      controller.abort();
      return { byteSize: bytes.byteLength, contentType: CLOUD_BACKUP_CONTENT_TYPE, sha256: "ab".repeat(32) };
    },
  });
  const prepared = await prepareCloudBackup("user-a", createFixtureBackup(), "", { digest: fixedDigest });
  await assert.rejects(() => uploadPreparedCloudBackup(gateway, "user-a", prepared, controller.signal), (error) => error instanceof CloudBackupError && error.code === "REQUEST_CANCELLED");
  assert.equal(calls.deleted.length, 1);
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
]);

await test("OFF일 때 lazy 패널을 렌더링하지 않음", () => {
  assert.match(featureSource, /if \(!CLOUD_BACKUP_ENABLED\) return null/);
});

await test("서비스에 localStorage/sessionStorage 쓰기 없음", () => {
  assert.doesNotMatch(serviceSource, /localStorage|sessionStorage|setItem|removeItem/);
  assert.doesNotMatch(accessServiceSource, /localStorage|sessionStorage|setItem|removeItem/);
  assert.doesNotMatch(firebaseServiceSource, /localStorage|sessionStorage|setItem|removeItem/);
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
  assert.doesNotMatch(panelSource, /<button[^>]*>[\s\S]*?(다운로드|복원|병합|적용|백업 삭제)[\s\S]*?<\/button>/);
});

await test("업로드 중 중복 클릭은 handler와 disabled 상태에서 이중 차단", () => {
  assert.match(panelSource, /if \(!user \|\| accessStatus !== "allowed" \|\| isUploading\) return/);
  assert.match(panelSource, /disabled=\{isUploading\}/);
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
