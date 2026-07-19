import type { User } from "firebase/auth";
import type { CloudBackupUser } from "../cloudBackupTypes.ts";
import { getFirebaseCloudClient } from "../config/firebase.ts";

export class CloudLoginCancelledError extends Error {
  constructor() {
    super("Google 로그인을 취소했습니다.");
    this.name = "CloudLoginCancelledError";
  }
}

export function isCloudLoginCancelledError(error: unknown) {
  return error instanceof CloudLoginCancelledError;
}

function firebaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}

function isCancelledCode(code: string) {
  return [
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/redirect-cancelled-by-user",
  ].includes(code);
}

function toCloudUser(user: User | null): CloudBackupUser | null {
  return user
    ? {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
      }
    : null;
}

export async function subscribeToCloudUser(
  onUser: (user: CloudBackupUser | null) => void,
  onError: (error: unknown) => void,
) {
  const [{ auth }, authModule] = await Promise.all([
    getFirebaseCloudClient(),
    import("firebase/auth"),
  ]);
  return authModule.onAuthStateChanged(
    auth,
    (user) => onUser(toCloudUser(user)),
    onError,
  );
}

export async function completeCloudLoginRedirect() {
  const [{ auth }, authModule] = await Promise.all([
    getFirebaseCloudClient(),
    import("firebase/auth"),
  ]);
  try {
    const result = await authModule.getRedirectResult(auth);
    return toCloudUser(result?.user ?? auth.currentUser);
  } catch (error) {
    if (isCancelledCode(firebaseErrorCode(error))) return toCloudUser(auth.currentUser);
    throw error;
  }
}

export async function signInToCloudWithGoogle(): Promise<"popup" | "redirect"> {
  const [{ auth }, authModule] = await Promise.all([
    getFirebaseCloudClient(),
    import("firebase/auth"),
  ]);
  const provider = new authModule.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    await authModule.signInWithPopup(auth, provider);
    return "popup";
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (isCancelledCode(code)) throw new CloudLoginCancelledError();
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await authModule.signInWithRedirect(auth, provider);
      return "redirect";
    }
    throw error;
  }
}

export async function signOutFromCloud() {
  const [{ auth }, authModule] = await Promise.all([
    getFirebaseCloudClient(),
    import("firebase/auth"),
  ]);
  await authModule.signOut(auth);
}

export function getCloudAuthErrorMessage(error: unknown) {
  if (error instanceof CloudLoginCancelledError) return error.message;
  const code = firebaseErrorCode(error);
  if (code === "auth/network-request-failed") {
    return "네트워크에 연결할 수 없어 로그인하지 못했습니다.";
  }
  if (code === "auth/unauthorized-domain") {
    return "현재 주소가 Firebase 인증 허용 도메인에 등록되지 않았습니다.";
  }
  if (code === "auth/user-token-expired" || code === "auth/id-token-expired") {
    return "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
  }
  return error instanceof Error
    ? error.message
    : "Google 로그인 중 오류가 발생했습니다. 다시 시도해 주세요.";
}
