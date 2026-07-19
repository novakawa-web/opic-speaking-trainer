import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setLogLevel,
  setDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getMetadata,
  ref,
  uploadBytes,
} from "firebase/storage";

const PROJECT_ID = "demo-opic-cloud-rules";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;
const STORAGE_HOST = "127.0.0.1";
const STORAGE_PORT = 9199;
const MAX_BYTES = 10 * 1024 * 1024;
const SHA256 = "ab".repeat(32);

setLogLevel("silent");

let passed = 0;

async function test(name, run) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

function backupId(sequence) {
  return `2026-07-20T0215${String(sequence).padStart(2, "0")}Z-${randomUUID()}`;
}

function storagePath(uid, id) {
  return `users/${uid}/backups/${id}.json`;
}

function metadata(uid, id) {
  return {
    backupId: id,
    schemaVersion: 1,
    exportedAt: "2026-07-20T02:15:00.000Z",
    uploadedAt: serverTimestamp(),
    byteSize: 128,
    sha256: SHA256,
    appVersion: "0.1.0",
    deviceLabel: "Rules test",
    storagePath: storagePath(uid, id),
    summary: {
      cardCount: 12,
      archivedCardCount: 1,
      firstLineAttemptCount: 3,
      answerLearningAttemptCount: 2,
      cardMemoCount: 1,
      personalMemoCount: 1,
      savedPassageCount: 1,
    },
  };
}

function jsonBytes(size = 128) {
  return new TextEncoder().encode("x".repeat(size));
}

function storageMetadata(id, contentType = "application/json") {
  return {
    contentType,
    customMetadata: {
      backupId: id,
      schemaVersion: "1",
      sha256: SHA256,
    },
  };
}

const [firestoreRules, storageRules] = await Promise.all([
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../storage.rules", import.meta.url), "utf8"),
]);

let testEnvironment;
try {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: firestoreRules,
    },
    storage: {
      host: STORAGE_HOST,
      port: STORAGE_PORT,
      rules: storageRules,
    },
  });
} catch (error) {
  console.error(
    "Cloud Rules Emulator에 연결하지 못했습니다. Firestore 8080과 Storage 9199가 실행 중인지 확인해 주세요.",
  );
  throw error;
}

try {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();

  const anonymous = testEnvironment.unauthenticatedContext();
  const alice = testEnvironment.authenticatedContext("alice", {
    email: "alice@example.test",
  });
  const bob = testEnvironment.authenticatedContext("bob", {
    email: "bob@example.test",
  });

  await test("인증 전 Firestore 백업 metadata 쓰기 거부", async () => {
    const id = backupId(1);
    await assertFails(
      setDoc(doc(anonymous.firestore(), "users", "alice", "backups", id), metadata("alice", id)),
    );
  });

  await test("사용자 A의 자기 Firestore 경로 쓰기와 읽기 허용", async () => {
    const id = backupId(2);
    const target = doc(alice.firestore(), "users", "alice", "backups", id);
    await assertSucceeds(setDoc(target, metadata("alice", id)));
    const snapshot = await assertSucceeds(getDoc(target));
    assert.equal(snapshot.exists(), true);
  });

  await test("사용자 A가 사용자 B Firestore 경로에 쓰기 거부", async () => {
    const id = backupId(3);
    await assertFails(
      setDoc(doc(alice.firestore(), "users", "bob", "backups", id), metadata("bob", id)),
    );
  });

  await test("허용되지 않은 Firestore 컬렉션 쓰기 거부", async () => {
    await assertFails(setDoc(doc(alice.firestore(), "admin", "settings"), { enabled: true }));
  });

  await test("기존 Firestore metadata 덮어쓰기와 삭제 거부", async () => {
    const id = backupId(4);
    const target = doc(alice.firestore(), "users", "alice", "backups", id);
    await assertSucceeds(setDoc(target, metadata("alice", id)));
    await assertFails(setDoc(target, metadata("alice", id)));
    await assertFails(deleteDoc(target));
  });

  await test("인증 전 Storage JSON 업로드 거부", async () => {
    const id = backupId(5);
    await assertFails(
      uploadBytes(
        ref(anonymous.storage(), storagePath("alice", id)),
        jsonBytes(),
        storageMetadata(id),
      ),
    );
  });

  await test("사용자 A의 자기 Storage JSON 업로드와 metadata 읽기 허용", async () => {
    const id = backupId(6);
    const target = ref(alice.storage(), storagePath("alice", id));
    await assertSucceeds(uploadBytes(target, jsonBytes(), storageMetadata(id)));
    const result = await assertSucceeds(getMetadata(target));
    assert.equal(result.contentType, "application/json");
    assert.equal(result.customMetadata?.sha256, SHA256);
  });

  await test("사용자 A가 사용자 B Storage 경로에 업로드 거부", async () => {
    const id = backupId(7);
    await assertFails(
      uploadBytes(
        ref(alice.storage(), storagePath("bob", id)),
        jsonBytes(),
        storageMetadata(id),
      ),
    );
  });

  await test("JSON 이외 Storage content type 거부", async () => {
    const id = backupId(8);
    await assertFails(
      uploadBytes(
        ref(alice.storage(), storagePath("alice", id)),
        jsonBytes(),
        storageMetadata(id, "text/plain"),
      ),
    );
  });

  await test("10MB 초과 Storage 파일 거부", async () => {
    const id = backupId(9);
    await assertFails(
      uploadBytes(
        ref(alice.storage(), storagePath("alice", id)),
        new Uint8Array(MAX_BYTES + 1),
        storageMetadata(id),
      ),
    );
  });

  await test("허용되지 않은 Storage 경로 업로드 거부", async () => {
    const id = backupId(10);
    await assertFails(
      uploadBytes(
        ref(alice.storage(), `public/${id}.json`),
        jsonBytes(),
        storageMetadata(id),
      ),
    );
  });

  await test("Storage 파일 덮어쓰기는 거부하고 부분 실패 정리 삭제는 허용", async () => {
    const id = backupId(11);
    const target = ref(alice.storage(), storagePath("alice", id));
    await assertSucceeds(uploadBytes(target, jsonBytes(), storageMetadata(id)));
    await assertFails(uploadBytes(target, jsonBytes(), storageMetadata(id)));
    await assertSucceeds(deleteObject(target));
  });
} finally {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
  await testEnvironment.cleanup();
}

console.log(`Cloud backup Security Rules verification passed: ${passed}/12`);
