export function runGuardedNavigation(
  guard: (() => boolean) | null | undefined,
  navigate: () => void,
): boolean {
  if (guard && !guard()) return false;
  navigate();
  return true;
}
