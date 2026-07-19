import { lazy, Suspense } from "react";
import type { AppBackupV1 } from "../utils/appBackup.ts";
import { CLOUD_BACKUP_ENABLED } from "../config/cloudBackup.ts";

const CloudBackupPanel = lazy(() => import("./CloudBackupPanel"));

export function CloudBackupFeature({
  createBackup,
}: {
  createBackup: () => AppBackupV1;
}) {
  if (!CLOUD_BACKUP_ENABLED) return null;
  return (
    <Suspense
      fallback={
        <section className="cloud-backup-panel" aria-label="계정 및 클라우드 백업">
          <p role="status">클라우드 백업 기능을 준비하고 있어요.</p>
        </section>
      }
    >
      <CloudBackupPanel createBackup={createBackup} />
    </Suspense>
  );
}
