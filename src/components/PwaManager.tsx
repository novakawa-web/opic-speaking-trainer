import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

export function PwaManager() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [registrationError, setRegistrationError] = useState(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("[OPIc PWA] 서비스 워커 등록 실패", error);
      setRegistrationError(true);
    },
  });

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallDismissed(false);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") setInstallDismissed(true);
  }

  if (needRefresh) {
    return (
      <aside className="pwa-notice" role="status" aria-live="polite">
        <strong>새 버전을 사용할 수 있어요.</strong>
        <p>작성 중인 내용을 저장한 뒤 업데이트해 주세요.</p>
        <div className="pwa-notice-actions">
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            지금 업데이트
          </button>
          <button type="button" className="secondary" onClick={() => setNeedRefresh(false)}>
            나중에
          </button>
        </div>
      </aside>
    );
  }

  if (installPrompt && !installDismissed) {
    return (
      <aside className="pwa-notice" role="status" aria-live="polite">
        <strong>홈 화면에 앱을 설치할 수 있어요.</strong>
        <p>설치 후에도 같은 브라우저 저장 공간을 사용합니다.</p>
        <div className="pwa-notice-actions">
          <button type="button" onClick={() => void installApp()}>
            앱 설치
          </button>
          <button type="button" className="secondary" onClick={() => setInstallDismissed(true)}>
            나중에
          </button>
        </div>
      </aside>
    );
  }

  if (offlineReady) {
    return (
      <aside className="pwa-notice" role="status" aria-live="polite">
        <strong>오프라인에서도 열 수 있어요.</strong>
        <p>카드와 앱 화면이 이 기기에 준비됐습니다.</p>
        <button type="button" className="secondary" onClick={() => setOfflineReady(false)}>
          확인
        </button>
      </aside>
    );
  }

  if (registrationError) {
    return (
      <aside className="pwa-notice is-error" role="alert">
        <strong>오프라인 기능을 준비하지 못했어요.</strong>
        <p>온라인 학습 기능은 그대로 사용할 수 있습니다.</p>
        <button type="button" className="secondary" onClick={() => setRegistrationError(false)}>
          확인
        </button>
      </aside>
    );
  }

  return null;
}
