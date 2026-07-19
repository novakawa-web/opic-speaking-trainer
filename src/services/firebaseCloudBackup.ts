import type {
  CloudBackupAccess,
  CloudBackupGateway,
  CloudBackupMetadata,
  CloudBackupMetadataInput,
} from "../cloudBackupTypes.ts";
import { getFirebaseCloudClient } from "../config/firebase.ts";
import { CLOUD_BACKUP_CONTENT_TYPE } from "./cloudBackup.ts";
import { parseCloudBackupAccess } from "./cloudBackupAccess.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function timestampToIso(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toISOString()
      : null;
  }
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function parseCloudBackupMetadata(value: unknown): CloudBackupMetadata | null {
  if (!isRecord(value) || !isRecord(value.summary)) return null;
  const uploadedAt = timestampToIso(value.uploadedAt);
  const byteSize = asNonNegativeInteger(value.byteSize);
  const cardCount = asNonNegativeInteger(value.summary.cardCount);
  const archivedCardCount = asNonNegativeInteger(value.summary.archivedCardCount);
  const firstLineAttemptCount = asNonNegativeInteger(
    value.summary.firstLineAttemptCount,
  );
  const answerLearningAttemptCount = asNonNegativeInteger(
    value.summary.answerLearningAttemptCount,
  );
  const cardMemoCount = asNonNegativeInteger(value.summary.cardMemoCount);
  const personalMemoCount = asNonNegativeInteger(value.summary.personalMemoCount);
  const savedPassageCount = asNonNegativeInteger(value.summary.savedPassageCount);
  if (
    typeof value.backupId !== "string" ||
    value.schemaVersion !== 1 ||
    typeof value.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    !uploadedAt ||
    byteSize === null ||
    typeof value.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    typeof value.appVersion !== "string" ||
    typeof value.storagePath !== "string" ||
    cardCount === null ||
    archivedCardCount === null ||
    firstLineAttemptCount === null ||
    answerLearningAttemptCount === null ||
    cardMemoCount === null ||
    personalMemoCount === null ||
    savedPassageCount === null
  ) {
    return null;
  }
  const deviceLabel =
    typeof value.deviceLabel === "string" && value.deviceLabel.trim()
      ? value.deviceLabel.trim()
      : undefined;
  return {
    backupId: value.backupId,
    schemaVersion: 1,
    exportedAt: new Date(value.exportedAt).toISOString(),
    uploadedAt,
    byteSize,
    sha256: value.sha256,
    appVersion: value.appVersion,
    ...(deviceLabel ? { deviceLabel } : {}),
    storagePath: value.storagePath,
    summary: {
      cardCount,
      archivedCardCount,
      firstLineAttemptCount,
      answerLearningAttemptCount,
      cardMemoCount,
      personalMemoCount,
      savedPassageCount,
    },
  };
}

let gatewayPromise: Promise<CloudBackupGateway> | null = null;

async function createFirebaseCloudBackupGateway(): Promise<CloudBackupGateway> {
  const [client, firestoreModule, storageModule] = await Promise.all([
    getFirebaseCloudClient(),
    import("firebase/firestore/lite"),
    import("firebase/storage"),
  ]);

  return {
    async uploadJson(storagePath, bytes, customMetadata) {
      const storageReference = storageModule.ref(client.storage, storagePath);
      const result = await storageModule.uploadBytes(storageReference, bytes, {
        contentType: CLOUD_BACKUP_CONTENT_TYPE,
        customMetadata,
      });
      const metadata = await storageModule.getMetadata(result.ref);
      return {
        byteSize: metadata.size,
        contentType: metadata.contentType ?? null,
        sha256: metadata.customMetadata?.sha256 ?? null,
      };
    },

    async createMetadata(
      uid: string,
      backupId: string,
      metadata: CloudBackupMetadataInput,
    ) {
      const documentReference = firestoreModule.doc(
        client.firestore,
        "users",
        uid,
        "backups",
        backupId,
      );
      await firestoreModule.setDoc(documentReference, {
        ...metadata,
        uploadedAt: firestoreModule.serverTimestamp(),
      });
    },

    async deleteStorageObject(storagePath) {
      await storageModule.deleteObject(storageModule.ref(client.storage, storagePath));
    },

    async listMetadata(uid, maximum) {
      const backupsCollection = firestoreModule.collection(
        client.firestore,
        "users",
        uid,
        "backups",
      );
      const backupsQuery = firestoreModule.query(
        backupsCollection,
        firestoreModule.orderBy("uploadedAt", "desc"),
        firestoreModule.limit(maximum),
      );
      const result = await firestoreModule.getDocs(backupsQuery);
      return result.docs
        .map((document) => parseCloudBackupMetadata(document.data()))
        .filter((metadata): metadata is CloudBackupMetadata => metadata !== null);
    },
  };
}

export function getFirebaseCloudBackupGateway() {
  gatewayPromise ??= createFirebaseCloudBackupGateway().catch((error) => {
    gatewayPromise = null;
    throw error;
  });
  return gatewayPromise;
}

export async function getFirebaseCloudBackupAccess(
  uid: string,
): Promise<CloudBackupAccess> {
  const [client, firestoreModule] = await Promise.all([
    getFirebaseCloudClient(),
    import("firebase/firestore/lite"),
  ]);
  const accessReference = firestoreModule.doc(
    client.firestore,
    "cloudBackupAllowedUsers",
    uid,
  );
  const snapshot = await firestoreModule.getDoc(accessReference);
  return snapshot.exists()
    ? parseCloudBackupAccess(snapshot.data())
    : { allowed: false };
}
