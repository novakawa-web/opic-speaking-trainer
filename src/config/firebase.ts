import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore/lite";
import type { FirebaseStorage } from "firebase/storage";
import { cloudBackupConfiguration } from "./cloudBackup.ts";

export type FirebaseCloudClient = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
};

export class CloudBackupConfigurationError extends Error {
  missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(
      missingKeys.length > 0
        ? `Firebase 공개 Web 설정이 부족합니다: ${missingKeys.join(", ")}`
        : "클라우드 백업 기능이 비활성화되어 있습니다.",
    );
    this.name = "CloudBackupConfigurationError";
    this.missingKeys = missingKeys;
  }
}

let clientPromise: Promise<FirebaseCloudClient> | null = null;
let emulatorsConnected = false;

async function initializeFirebaseClient(): Promise<FirebaseCloudClient> {
  if (!cloudBackupConfiguration.enabled) {
    throw new CloudBackupConfigurationError([]);
  }
  if (!cloudBackupConfiguration.firebaseOptions) {
    throw new CloudBackupConfigurationError(cloudBackupConfiguration.missingKeys);
  }

  const [appModule, authModule, firestoreModule, storageModule] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore/lite"),
    import("firebase/storage"),
  ]);
  const appName = "opic-cloud-backup";
  const existing = appModule.getApps().find((app) => app.name === appName);
  const app =
    existing ?? appModule.initializeApp(cloudBackupConfiguration.firebaseOptions, appName);
  const auth = authModule.getAuth(app);
  const firestore = firestoreModule.getFirestore(app);
  const storage = storageModule.getStorage(app);

  if (cloudBackupConfiguration.useEmulators && !emulatorsConnected) {
    authModule.connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    firestoreModule.connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    storageModule.connectStorageEmulator(storage, "127.0.0.1", 9199);
    emulatorsConnected = true;
  }

  return { app, auth, firestore, storage };
}

export function getFirebaseCloudClient() {
  clientPromise ??= initializeFirebaseClient().catch((error) => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}
