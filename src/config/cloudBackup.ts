export const CLOUD_BACKUP_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export type CloudBackupEnvironment = Partial<
  Record<
    | "VITE_CLOUD_BACKUP_ENABLED"
    | "VITE_FIREBASE_MEASUREMENT_ID"
    | "VITE_FIREBASE_USE_EMULATORS"
    | (typeof CLOUD_BACKUP_ENV_KEYS)[number],
    string
  >
>;

export type CloudBackupConfiguration = {
  enabled: boolean;
  useEmulators: boolean;
  missingKeys: string[];
  firebaseOptions: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  } | null;
};

function normalize(value: string | undefined) {
  return value?.trim() ?? "";
}

export function readCloudBackupConfiguration(
  environment: CloudBackupEnvironment,
): CloudBackupConfiguration {
  const enabled = normalize(environment.VITE_CLOUD_BACKUP_ENABLED).toLowerCase() === "true";
  const useEmulators =
    normalize(environment.VITE_FIREBASE_USE_EMULATORS).toLowerCase() !== "false";

  if (!enabled) {
    return {
      enabled: false,
      useEmulators,
      missingKeys: [],
      firebaseOptions: null,
    };
  }

  const missingKeys = CLOUD_BACKUP_ENV_KEYS.filter(
    (key) => normalize(environment[key]) === "",
  );
  if (missingKeys.length > 0) {
    return {
      enabled: true,
      useEmulators,
      missingKeys: [...missingKeys],
      firebaseOptions: null,
    };
  }

  const measurementId = normalize(environment.VITE_FIREBASE_MEASUREMENT_ID);
  return {
    enabled: true,
    useEmulators,
    missingKeys: [],
    firebaseOptions: {
      apiKey: normalize(environment.VITE_FIREBASE_API_KEY),
      authDomain: normalize(environment.VITE_FIREBASE_AUTH_DOMAIN),
      projectId: normalize(environment.VITE_FIREBASE_PROJECT_ID),
      storageBucket: normalize(environment.VITE_FIREBASE_STORAGE_BUCKET),
      messagingSenderId: normalize(environment.VITE_FIREBASE_MESSAGING_SENDER_ID),
      appId: normalize(environment.VITE_FIREBASE_APP_ID),
      ...(measurementId ? { measurementId } : {}),
    },
  };
}

const viteEnvironment = (import.meta as ImportMeta & { env?: CloudBackupEnvironment }).env ?? {};

export const cloudBackupConfiguration = readCloudBackupConfiguration(viteEnvironment);
export const CLOUD_BACKUP_ENABLED = cloudBackupConfiguration.enabled;
