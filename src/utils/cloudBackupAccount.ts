import type { CloudBackupUser } from "../cloudBackupTypes.ts";

export type CloudBackupAccountIdentity = {
  primary: string;
  secondary: string | null;
};

export function getCloudBackupAccountIdentity(
  user: CloudBackupUser,
): CloudBackupAccountIdentity {
  const displayName = user.displayName?.trim() || "";
  const email = user.email?.trim() || "";

  return {
    primary: displayName || email || "Google 사용자",
    secondary: displayName && email ? email : null,
  };
}
