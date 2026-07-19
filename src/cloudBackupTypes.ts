export type CloudBackupSummary = {
  cardCount: number;
  archivedCardCount: number;
  firstLineAttemptCount: number;
  answerLearningAttemptCount: number;
  cardMemoCount: number;
  personalMemoCount: number;
  savedPassageCount: number;
};

export type CloudBackupMetadata = {
  backupId: string;
  schemaVersion: 1;
  exportedAt: string;
  uploadedAt: string;
  byteSize: number;
  sha256: string;
  appVersion: string;
  deviceLabel?: string;
  storagePath: string;
  summary: CloudBackupSummary;
};

export type CloudBackupMetadataInput = Omit<CloudBackupMetadata, "uploadedAt">;

export type CloudBackupUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

export type CloudBackupAccess = {
  allowed: boolean;
  label?: string;
};

export type PreparedCloudBackup = {
  backupId: string;
  json: string;
  bytes: Uint8Array;
  byteSize: number;
  sha256: string;
  storagePath: string;
  metadata: CloudBackupMetadataInput;
};

export type CloudStorageUploadResult = {
  byteSize: number;
  contentType: string | null;
  sha256: string | null;
};

export type CloudBackupGateway = {
  uploadJson(
    storagePath: string,
    bytes: Uint8Array,
    customMetadata: Record<string, string>,
  ): Promise<void>;
  getStorageMetadata(storagePath: string): Promise<CloudStorageUploadResult>;
  createMetadata(
    uid: string,
    backupId: string,
    metadata: CloudBackupMetadataInput,
  ): Promise<void>;
  deleteStorageObject(storagePath: string): Promise<void>;
  listMetadata(uid: string, maximum: number): Promise<CloudBackupMetadata[]>;
};
