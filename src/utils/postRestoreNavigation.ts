export const POST_RESTORE_NAVIGATION_SESSION_KEY =
  "opic-post-restore-navigation";

export type PostRestoreNavigationIntent = {
  target: "backup-manager";
  managementExpanded: true;
  message: string;
};

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSessionStorage(): SessionStorageLike | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

export function savePostRestoreNavigation(
  message: string,
  storage: SessionStorageLike | undefined = getSessionStorage(),
) {
  if (!storage) return false;
  const intent: PostRestoreNavigationIntent = {
    target: "backup-manager",
    managementExpanded: true,
    message,
  };
  try {
    storage.setItem(POST_RESTORE_NAVIGATION_SESSION_KEY, JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

export function consumePostRestoreNavigation(
  storage: SessionStorageLike | undefined = getSessionStorage(),
): PostRestoreNavigationIntent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(POST_RESTORE_NAVIGATION_SESSION_KEY);
    storage.removeItem(POST_RESTORE_NAVIGATION_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      (parsed as Partial<PostRestoreNavigationIntent>).target !== "backup-manager" ||
      (parsed as Partial<PostRestoreNavigationIntent>).managementExpanded !== true ||
      typeof (parsed as Partial<PostRestoreNavigationIntent>).message !== "string"
    ) {
      return null;
    }
    return {
      target: "backup-manager",
      managementExpanded: true,
      message: (parsed as PostRestoreNavigationIntent).message.slice(0, 240),
    };
  } catch {
    try {
      storage.removeItem(POST_RESTORE_NAVIGATION_SESSION_KEY);
    } catch {
      // A blocked sessionStorage must not affect restored long-term data.
    }
    return null;
  }
}
