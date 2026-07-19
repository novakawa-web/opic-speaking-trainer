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
  createAndUploadCloudBackup,
  getCloudBackupErrorMessage,
  listRecentCloudBackups,
  MAX_DEVICE_LABEL_LENGTH,
} from "../services/cloudBackup.ts";
import { getFirebaseCloudBackupGateway } from "../services/firebaseCloudBackup.ts";
import type { AppBackupV1 } from "../utils/appBackup.ts";

function formatBytes(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(2)} MB`;
}

function displayUser(user: CloudBackupUser) {
  return user.displayName || user.email || "Google 사용자";
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
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const mountedRef = useRef(true);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const listRequestIdRef = useRef(0);

  async function refreshBackups(nextUser: CloudBackupUser) {
    const requestId = ++listRequestIdRef.current;
    setIsLoadingList(true);
    try {
      const gateway = await getFirebaseCloudBackupGateway();
      const result = await listRecentCloudBackups(gateway, nextUser.uid);
      if (!mountedRef.current || requestId !== listRequestIdRef.current) return;
      setBackups(result);
    } catch (error) {
      if (!mountedRef.current || requestId !== listRequestIdRef.current) return;
      setErrorMessage(`백업 목록을 불러오지 못했습니다. ${getCloudBackupErrorMessage(error)}`);
    } finally {
      if (mountedRef.current && requestId === listRequestIdRef.current) {
        setIsLoadingList(false);
      }
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
            if (nextUser) void refreshBackups(nextUser);
            else {
              listRequestIdRef.current += 1;
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
    if (!user || isUploading) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setErrorMessage("오프라인에서는 클라우드 백업을 만들 수 없습니다.");
      return;
    }

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setIsUploading(true);
    setMessage("현재 전체 JSON 백업을 검증하고 업로드하고 있어요.");
    setErrorMessage("");
    try {
      const backup = createBackup();
      const gateway = await getFirebaseCloudBackupGateway();
      const prepared = await createAndUploadCloudBackup(
        gateway,
        user.uid,
        backup,
        deviceLabel,
        { signal: controller.signal },
      );
      if (!mountedRef.current || controller.signal.aborted) return;
      setMessage(
        `새 클라우드 백업을 저장했습니다. ${formatBytes(prepared.byteSize)} · SHA-256 ${prepared.sha256.slice(0, 12)}…`,
      );
      await refreshBackups(user);
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (
        error &&
        typeof error === "object" &&
        "orphanStoragePath" in error &&
        typeof error.orphanStoragePath === "string"
      ) {
        console.error("[OPIc Cloud Backup] orphan storage object", {
          storagePath: error.orphanStoragePath,
        });
      }
      setErrorMessage(getCloudBackupErrorMessage(error));
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
              <strong>{displayUser(user)}</strong>
              {user.email && user.email !== displayUser(user) && <small>{user.email}</small>}
            </div>
            <button type="button" className="secondary-button" onClick={() => void handleLogout()}>
              로그아웃
            </button>
          </div>

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
            aria-describedby="cloud-backup-upload-help"
            onClick={() => void handleUpload()}
          >
            {isUploading ? "새 백업 저장 중…" : "이 기기 데이터를 새 백업으로 저장"}
          </button>
          <p id="cloud-backup-upload-help" className="backup-helper-text">
            버튼을 누를 때마다 기존 백업을 덮어쓰지 않고 새 JSON 파일을 만듭니다.
          </p>

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
      )}

      <p className="cloud-backup-result" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      {errorMessage && <p className="cloud-backup-error" role="alert">{errorMessage}</p>}
    </section>
  );
}
