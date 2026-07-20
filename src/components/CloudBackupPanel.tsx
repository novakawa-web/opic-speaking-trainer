import { useEffect, useRef, useState } from "react";
import type { CloudBackupMetadata, CloudBackupUser } from "../cloudBackupTypes.ts";
import { cloudBackupConfiguration } from "../config/cloudBackup.ts";
import {
  completeCloudLoginRedirect,
  getCloudAuthErrorMessage,
  isCloudLoginCancelledError,
  signInToCloudWithGoogle,
  signOutFromCloud,
  subscribeToCloudUser,
} from "../services/cloudAuth.ts";
import {
  advanceCloudBackupAttemptDiagnostic,
  createCloudBackupDiagnosticLogEntry,
  createCloudBackupDiagnosticSummary,
  createCloudBackupAttemptDiagnostic,
  createAndUploadCloudBackup,
  createCloudBackupFailureDiagnostic,
  CloudBackupError,
  getCloudBackupAttemptStageLabel,
  getCloudBackupCleanupLabel,
  getCloudBackupErrorMessage,
  getCloudBackupFailureCategoryLabel,
  getCloudBackupFailureGuidance,
  getCloudBackupStorageCreationLabel,
  getCloudBackupStageMessage,
  listRecentCloudBackups,
  MAX_DEVICE_LABEL_LENGTH,
  type CloudBackupAttemptDiagnostic,
  type CloudBackupFailureDiagnostic,
  type CloudBackupProgress,
  type CloudBackupUploadStage,
} from "../services/cloudBackup.ts";
import {
  CLOUD_BACKUP_ACCESS_DENIED_MESSAGE,
  classifyCloudBackupAccessError,
  getCloudBackupAccessErrorMessage,
  type CloudBackupAccessStatus,
} from "../services/cloudBackupAccess.ts";
import {
  getFirebaseCloudBackupAccess,
  getFirebaseCloudBackupGateway,
} from "../services/firebaseCloudBackup.ts";
import type { AppBackupV1 } from "../utils/appBackup.ts";
import { getCloudBackupAccountIdentity } from "../utils/cloudBackupAccount.ts";

function formatBytes(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(2)} MB`;
}

function CloudBackupAccountIdentity({ user }: { user: CloudBackupUser }) {
  const identity = getCloudBackupAccountIdentity(user);

  return (
    <>
      <strong>{identity.primary}</strong>
      {identity.secondary && (
        <small className="cloud-backup-account-email">{identity.secondary}</small>
      )}
    </>
  );
}

type UploadSuccessSummary = {
  createdAt: string;
  cardCount: number;
  byteSize: number;
  deviceLabel: string;
};

type UploadFeedback = {
  stage: CloudBackupUploadStage;
  byteSize?: number;
  failure?: CloudBackupFailureDiagnostic;
  listRefreshFailure?: CloudBackupFailureDiagnostic;
  success?: UploadSuccessSummary;
};

const INITIAL_UPLOAD_FEEDBACK: UploadFeedback = { stage: "idle" };

function logCloudBackupDiagnostic(
  value: CloudBackupProgress | CloudBackupFailureDiagnostic,
) {
  if (!import.meta.env.DEV) return;
  console.info(
    "[OPIc Cloud Backup]",
    createCloudBackupDiagnosticLogEntry(value),
  );
}

function CloudBackupFailureDetails({
  failure,
  copyMessage,
  onCopy,
}: {
  failure: CloudBackupFailureDiagnostic;
  copyMessage: string;
  onCopy: () => void;
}) {
  const diagnostic = failure.attempt;
  return (
    <>
      <dl className="cloud-backup-failure-summary">
        <div>
          <dt>실패 지점</dt>
          <dd>{getCloudBackupAttemptStageLabel(diagnostic.failedStage ?? diagnostic.currentStage)}</dd>
        </div>
        <div>
          <dt>마지막 완료 단계</dt>
          <dd>
            {diagnostic.lastCompletedStage
              ? getCloudBackupAttemptStageLabel(diagnostic.lastCompletedStage)
              : "없음"}
          </dd>
        </div>
        <div>
          <dt>오류 분류</dt>
          <dd>{getCloudBackupFailureCategoryLabel(failure.category)}</dd>
        </div>
        {failure.safeProviderCode && (
          <div>
            <dt>안전 오류 코드</dt>
            <dd><code>{failure.safeProviderCode}</code></dd>
          </div>
        )}
        <div>
          <dt>Storage 파일 생성</dt>
          <dd>{getCloudBackupStorageCreationLabel(diagnostic)}</dd>
        </div>
        <div>
          <dt>실패 파일 정리</dt>
          <dd>{getCloudBackupCleanupLabel(diagnostic)}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="secondary-button cloud-backup-copy-diagnostic-button"
        onClick={onCopy}
      >
        진단 정보 복사
      </button>
      {copyMessage && (
        <p className="cloud-backup-copy-result" role="status" aria-live="polite">
          {copyMessage}
        </p>
      )}
    </>
  );
}

export default function CloudBackupPanel({
  createBackup,
}: {
  createBackup: () => AppBackupV1;
}) {
  const [user, setUser] = useState<CloudBackupUser | null>(null);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [backups, setBackups] = useState<CloudBackupMetadata[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [accessStatus, setAccessStatus] = useState<CloudBackupAccessStatus>("idle");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [diagnosticCopyMessage, setDiagnosticCopyMessage] = useState("");
  const [uploadFeedback, setUploadFeedback] = useState<UploadFeedback>(
    INITIAL_UPLOAD_FEEDBACK,
  );
  const mountedRef = useRef(true);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadAttemptRef = useRef<CloudBackupAttemptDiagnostic | null>(null);
  const listRequestIdRef = useRef(0);
  const accessRequestIdRef = useRef(0);

  async function refreshBackups(
    nextUser: CloudBackupUser,
    options: { showError?: boolean } = {},
  ): Promise<{ ok: true } | { ok: false; error: unknown }> {
    const requestId = ++listRequestIdRef.current;
    setIsLoadingList(true);
    try {
      const gateway = await getFirebaseCloudBackupGateway();
      const result = await listRecentCloudBackups(gateway, nextUser.uid);
      if (!mountedRef.current || requestId !== listRequestIdRef.current) {
        return { ok: false, error: new Error("stale-list-request") };
      }
      setBackups(result);
      return { ok: true };
    } catch (error) {
      if (!mountedRef.current || requestId !== listRequestIdRef.current) {
        return { ok: false, error };
      }
      if (options.showError !== false) {
        setErrorMessage(`백업 목록을 불러오지 못했습니다. ${getCloudBackupErrorMessage(error)}`);
      }
      return { ok: false, error };
    } finally {
      if (mountedRef.current && requestId === listRequestIdRef.current) {
        setIsLoadingList(false);
      }
    }
  }

  async function copyDiagnostic(diagnostic: CloudBackupAttemptDiagnostic) {
    setDiagnosticCopyMessage("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(createCloudBackupDiagnosticSummary(diagnostic));
      if (mountedRef.current) setDiagnosticCopyMessage("진단 정보를 복사했습니다.");
    } catch {
      if (mountedRef.current) {
        setDiagnosticCopyMessage(
          "진단 정보를 복사하지 못했습니다. 화면의 진단 내용을 직접 전달해 주세요.",
        );
      }
    }
  }

  async function checkAccess(nextUser: CloudBackupUser) {
    const requestId = ++accessRequestIdRef.current;
    listRequestIdRef.current += 1;
    setBackups([]);
    setIsLoadingList(false);
    setAccessStatus("checking");
    try {
      const access = await getFirebaseCloudBackupAccess(nextUser.uid);
      if (!mountedRef.current || requestId !== accessRequestIdRef.current) return;
      if (!access.allowed) {
        setAccessStatus("denied");
        return;
      }
      setAccessStatus("allowed");
      await refreshBackups(nextUser);
    } catch (error) {
      if (!mountedRef.current || requestId !== accessRequestIdRef.current) return;
      setAccessStatus(classifyCloudBackupAccessError(error));
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    if (!cloudBackupConfiguration.firebaseOptions) {
      setIsInitializing(false);
      return () => {
        mountedRef.current = false;
      };
    }

    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        await completeCloudLoginRedirect();
        unsubscribe = await subscribeToCloudUser(
          (nextUser) => {
            if (!mountedRef.current) return;
            setUser(nextUser);
            setErrorMessage("");
            setIsInitializing(false);
            if (nextUser) void checkAccess(nextUser);
            else {
              accessRequestIdRef.current += 1;
              listRequestIdRef.current += 1;
              setAccessStatus("idle");
              setBackups([]);
              setIsLoadingList(false);
            }
          },
          (error) => {
            if (!mountedRef.current) return;
            setIsInitializing(false);
            setErrorMessage(getCloudAuthErrorMessage(error));
          },
        );
      } catch (error) {
        if (!mountedRef.current) return;
        setIsInitializing(false);
        setErrorMessage(getCloudAuthErrorMessage(error));
      }
    })();

    return () => {
      mountedRef.current = false;
      accessRequestIdRef.current += 1;
      listRequestIdRef.current += 1;
      uploadAbortRef.current?.abort();
      unsubscribe?.();
    };
  }, []);

  async function handleLogin() {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setMessage("");
    setErrorMessage("");
    try {
      const mode = await signInToCloudWithGoogle();
      if (mountedRef.current && mode === "popup") {
        setMessage("Google 로그인이 완료되었습니다.");
      }
    } catch (error) {
      if (mountedRef.current) {
        if (isCloudLoginCancelledError(error)) setMessage("Google 로그인을 취소했습니다.");
        else setErrorMessage(getCloudAuthErrorMessage(error));
      }
    } finally {
      if (mountedRef.current) setIsAuthenticating(false);
    }
  }

  async function handleLogout() {
    setMessage("");
    setErrorMessage("");
    try {
      await signOutFromCloud();
      if (mountedRef.current) {
        setMessage("클라우드 계정에서 로그아웃했습니다. 로컬 학습 데이터는 그대로입니다.");
      }
    } catch (error) {
      if (mountedRef.current) setErrorMessage(getCloudAuthErrorMessage(error));
    }
  }

  async function handleUpload() {
    if (
      !user ||
      accessStatus !== "allowed" ||
      isUploading ||
      uploadAbortRef.current
    ) {
      return;
    }
    setDiagnosticCopyMessage("");
    uploadAttemptRef.current = createCloudBackupAttemptDiagnostic();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const failure = createCloudBackupFailureDiagnostic(new Error("offline"), {
        online: false,
        attempt: uploadAttemptRef.current,
      });
      uploadAttemptRef.current = failure.attempt;
      setUploadFeedback({ stage: failure.stage, failure });
      logCloudBackupDiagnostic(failure);
      return;
    }

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setIsUploading(true);
    setUploadFeedback({ stage: "preparing" });
    setErrorMessage("");
    setMessage("");
    logCloudBackupDiagnostic({ stage: "preparing" });
    let byteSize: number | undefined;
    try {
      let backup: AppBackupV1;
      try {
        backup = createBackup();
      } catch (error) {
        throw new CloudBackupError(
          "BACKUP_CREATION_FAILED",
          "기기 백업 데이터를 준비하지 못했습니다.",
          { cause: error, operation: "backup-preparation" },
        );
      }
      const gateway = await getFirebaseCloudBackupGateway();
      const prepared = await createAndUploadCloudBackup(
        gateway,
        user.uid,
        backup,
        deviceLabel,
        {
          signal: controller.signal,
          onProgress(progress) {
            byteSize = progress.byteSize ?? byteSize;
            if (!mountedRef.current || uploadAbortRef.current !== controller) return;
            uploadAttemptRef.current = advanceCloudBackupAttemptDiagnostic(
              uploadAttemptRef.current ?? createCloudBackupAttemptDiagnostic(),
              progress,
            );
            setUploadFeedback({
              stage: progress.stage,
              ...(typeof progress.byteSize === "number"
                ? { byteSize: progress.byteSize }
                : {}),
            });
            logCloudBackupDiagnostic(progress);
          },
        },
      );
      if (!mountedRef.current || controller.signal.aborted) return;
      const success = {
        createdAt: prepared.metadata.exportedAt,
        cardCount: prepared.metadata.summary.cardCount,
        byteSize: prepared.byteSize,
        deviceLabel: prepared.metadata.deviceLabel || "이름 없는 기기",
      };
      const refreshingProgress: CloudBackupProgress = {
        stage: "refreshing-list",
        byteSize: prepared.byteSize,
      };
      uploadAttemptRef.current = advanceCloudBackupAttemptDiagnostic(
        uploadAttemptRef.current ?? createCloudBackupAttemptDiagnostic(),
        refreshingProgress,
      );
      setUploadFeedback({
        stage: "refreshing-list",
        byteSize: prepared.byteSize,
        success,
      });
      logCloudBackupDiagnostic(refreshingProgress);
      const refreshResult = await refreshBackups(user, { showError: false });
      if (!mountedRef.current || controller.signal.aborted) return;
      if (!refreshResult.ok) {
        const listFailure = createCloudBackupFailureDiagnostic(
          new CloudBackupError(
            "LIST_REFRESH_FAILED",
            "최근 백업 목록을 갱신하지 못했습니다.",
            { cause: refreshResult.error, operation: "list-refresh" },
          ),
          {
            online: typeof navigator === "undefined" ? undefined : navigator.onLine,
            byteSize: prepared.byteSize,
            attempt: uploadAttemptRef.current ?? undefined,
          },
        );
        uploadAttemptRef.current = listFailure.attempt;
        setUploadFeedback({
          stage: "success",
          byteSize: prepared.byteSize,
          success,
          listRefreshFailure: listFailure,
        });
        logCloudBackupDiagnostic(listFailure);
      } else {
        const successProgress: CloudBackupProgress = {
          stage: "success",
          byteSize: prepared.byteSize,
        };
        uploadAttemptRef.current = advanceCloudBackupAttemptDiagnostic(
          uploadAttemptRef.current ?? createCloudBackupAttemptDiagnostic(),
          successProgress,
        );
        setUploadFeedback({ stage: "success", byteSize: prepared.byteSize, success });
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const failure = createCloudBackupFailureDiagnostic(error, {
        online: typeof navigator === "undefined" ? undefined : navigator.onLine,
        byteSize,
        attempt: uploadAttemptRef.current ?? undefined,
      });
      uploadAttemptRef.current = failure.attempt;
      setUploadFeedback({
        stage: failure.stage,
        ...(typeof byteSize === "number" ? { byteSize } : {}),
        failure,
      });
      logCloudBackupDiagnostic(failure);
    } finally {
      if (mountedRef.current && uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
        setIsUploading(false);
      }
    }
  }

  const missingConfiguration = cloudBackupConfiguration.missingKeys.length > 0;

  return (
    <section className="cloud-backup-panel" aria-labelledby="cloud-backup-title">
      <div className="section-title-row cloud-backup-heading">
        <div>
          <p className="eyebrow">ACCOUNT &amp; CLOUD BACKUP</p>
          <h2 id="cloud-backup-title">계정 및 클라우드 백업</h2>
          <p>
            현재 데이터는 이 브라우저에 저장되어 있습니다. Google 계정으로 로그인하면
            전체 JSON 백업의 복사본을 클라우드에 수동으로 보관할 수 있습니다.
          </p>
        </div>
        <span className="cloud-backup-mode-badge">
          {cloudBackupConfiguration.useEmulators ? "개발 Emulator" : "수동 백업"}
        </span>
      </div>

      <p className="cloud-backup-safety-note">
        클라우드 백업은 현재 기기 데이터의 복사본입니다. 이 단계에서는 클라우드 데이터가
        앱에 자동 적용되지 않습니다.
      </p>

      {missingConfiguration ? (
        <div className="cloud-backup-config-error" role="alert">
          <strong>Firebase 개발 설정이 완료되지 않았습니다.</strong>
          <p>다음 공개 Web 환경변수를 설정해 주세요.</p>
          <code>{cloudBackupConfiguration.missingKeys.join(", ")}</code>
          <p>기존 학습 기능과 로컬 데이터는 그대로 사용할 수 있습니다.</p>
        </div>
      ) : isInitializing ? (
        <p role="status">클라우드 로그인 상태를 확인하고 있어요.</p>
      ) : !user ? (
        <div className="cloud-backup-account-card">
          <p>로그인 전에는 클라우드 요청이나 백업 업로드를 시작하지 않습니다.</p>
          <button
            type="button"
            className="primary-button"
            disabled={isAuthenticating}
            onClick={() => void handleLogin()}
          >
            {isAuthenticating ? "Google 로그인 중…" : "Google로 로그인"}
          </button>
        </div>
      ) : (
        <>
          <div className="cloud-backup-account-card is-signed-in">
            <div className="cloud-backup-account-copy">
              <span>로그인됨</span>
              <CloudBackupAccountIdentity user={user} />
            </div>
            <button type="button" className="secondary-button" onClick={() => void handleLogout()}>
              로그아웃
            </button>
          </div>

          {accessStatus === "checking" ? (
            <p className="cloud-backup-access-note" role="status" aria-live="polite">
              클라우드 백업 사용 권한을 확인하고 있어요.
            </p>
          ) : accessStatus === "denied" ? (
            <p className="cloud-backup-access-note is-denied" role="status" aria-live="polite">
              {CLOUD_BACKUP_ACCESS_DENIED_MESSAGE}
            </p>
          ) : accessStatus === "network-error" || accessStatus === "permission-denied" ? (
            <div className="cloud-backup-access-note is-error" role="alert">
              <p>{getCloudBackupAccessErrorMessage(accessStatus)}</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void checkAccess(user)}
              >
                권한 다시 확인
              </button>
            </div>
          ) : accessStatus === "allowed" ? (
            <>
          <label className="cloud-backup-device-field">
            <span>기기 이름 (선택)</span>
            <input
              value={deviceLabel}
              maxLength={MAX_DEVICE_LABEL_LENGTH}
              placeholder="예: 갤럭시 S24, 집 PC"
              onChange={(event) => setDeviceLabel(event.target.value)}
            />
            <small>{deviceLabel.length} / {MAX_DEVICE_LABEL_LENGTH}</small>
          </label>

          <button
            type="button"
            className="cloud-backup-upload-button"
            disabled={isUploading}
            aria-describedby={
              uploadFeedback.stage === "idle"
                ? "cloud-backup-upload-help"
                : "cloud-backup-upload-help cloud-backup-upload-status"
            }
            onClick={() => void handleUpload()}
          >
            {isUploading ? "새 백업 저장 중…" : "이 기기 데이터를 새 백업으로 저장"}
          </button>
          <p id="cloud-backup-upload-help" className="backup-helper-text">
            버튼을 누를 때마다 기존 백업을 덮어쓰지 않고 새 JSON 파일을 만듭니다.
          </p>

          {uploadFeedback.stage !== "idle" && (
            <div
              id="cloud-backup-upload-status"
              className={`cloud-backup-upload-status is-${uploadFeedback.stage}`}
              role={uploadFeedback.failure ? "alert" : "status"}
              aria-live={uploadFeedback.failure ? "assertive" : "polite"}
              aria-atomic="true"
            >
              <strong>{getCloudBackupStageMessage(uploadFeedback.stage)}</strong>
              {uploadFeedback.failure && (
                <>
                  <p>{getCloudBackupFailureGuidance(uploadFeedback.failure)}</p>
                  <CloudBackupFailureDetails
                    failure={uploadFeedback.failure}
                    copyMessage={diagnosticCopyMessage}
                    onCopy={() => void copyDiagnostic(uploadFeedback.failure!.attempt)}
                  />
                  {uploadFeedback.failure.retryAllowed && (
                    <button
                      type="button"
                      className="secondary-button cloud-backup-retry-button"
                      disabled={isUploading}
                      aria-label="클라우드 백업 다시 시도"
                      onClick={() => void handleUpload()}
                    >
                      다시 시도
                    </button>
                  )}
                </>
              )}
              {uploadFeedback.success && (
                <>
                  <dl className="cloud-backup-success-summary">
                    <div>
                      <dt>생성 시각</dt>
                      <dd>{new Date(uploadFeedback.success.createdAt).toLocaleString("ko-KR")}</dd>
                    </div>
                    <div>
                      <dt>카드</dt>
                      <dd>{uploadFeedback.success.cardCount}장</dd>
                    </div>
                    <div>
                      <dt>파일 크기</dt>
                      <dd>{formatBytes(uploadFeedback.success.byteSize)}</dd>
                    </div>
                    <div>
                      <dt>기기</dt>
                      <dd>{uploadFeedback.success.deviceLabel}</dd>
                    </div>
                  </dl>
                  {uploadFeedback.listRefreshFailure && (
                    <div className="cloud-backup-list-refresh-warning">
                      <strong>백업은 완료되었지만 최근 목록을 갱신하지 못했습니다.</strong>
                      <p>{getCloudBackupFailureGuidance(uploadFeedback.listRefreshFailure)}</p>
                      <CloudBackupFailureDetails
                        failure={uploadFeedback.listRefreshFailure}
                        copyMessage={diagnosticCopyMessage}
                        onCopy={() =>
                          void copyDiagnostic(uploadFeedback.listRefreshFailure!.attempt)
                        }
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="cloud-backup-list-heading">
            <h3>최근 클라우드 백업</h3>
            {isLoadingList && <span role="status">목록 확인 중…</span>}
          </div>
          {!isLoadingList && backups.length === 0 ? (
            <p className="backup-helper-text">아직 저장한 클라우드 백업이 없습니다.</p>
          ) : (
            <ol className="cloud-backup-list">
              {backups.map((item) => (
                <li key={item.backupId}>
                  <div className="cloud-backup-item-heading">
                    <strong>{item.deviceLabel || "이름 없는 기기"}</strong>
                    <time dateTime={item.uploadedAt}>
                      업로드 {new Date(item.uploadedAt).toLocaleString("ko-KR")}
                    </time>
                  </div>
                  <p>백업 생성 {new Date(item.exportedAt).toLocaleString("ko-KR")}</p>
                  <dl>
                    <div><dt>카드</dt><dd>{item.summary.cardCount}</dd></div>
                    <div><dt>보관</dt><dd>{item.summary.archivedCardCount}</dd></div>
                    <div><dt>메모</dt><dd>{item.summary.cardMemoCount + item.summary.personalMemoCount}</dd></div>
                    <div><dt>저장 지문</dt><dd>{item.summary.savedPassageCount}</dd></div>
                    <div><dt>크기</dt><dd>{formatBytes(item.byteSize)}</dd></div>
                    <div><dt>schema</dt><dd>v{item.schemaVersion}</dd></div>
                  </dl>
                  <p className="cloud-backup-integrity">
                    SHA-256 <code>{item.sha256.slice(0, 12)}…</code>
                  </p>
                </li>
              ))}
            </ol>
          )}
            </>
          ) : null}
        </>
      )}

      <p className="cloud-backup-result" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      {errorMessage && <p className="cloud-backup-error" role="alert">{errorMessage}</p>}
    </section>
  );
}
