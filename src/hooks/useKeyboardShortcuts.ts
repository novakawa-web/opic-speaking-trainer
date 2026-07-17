import { useEffect, useRef } from "react";

export type KeyboardShortcutKey =
  | "Enter"
  | "Space"
  | "q"
  | "w"
  | "a"
  | "s"
  | "d"
  | "z"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "Escape";
export type KeyboardShortcutMap = Partial<
  Record<KeyboardShortcutKey, (() => void) | undefined>
>;

export function normalizeShortcutKey(
  event: Pick<KeyboardEvent, "key">,
): KeyboardShortcutKey | null {
  if (event.key === "Enter") return "Enter";
  if (event.key === " " || event.key === "Spacebar") return "Space";
  if (["ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) {
    return event.key as KeyboardShortcutKey;
  }

  const lowerKey = event.key.toLowerCase();
  return ["q", "w", "a", "s", "d", "z"].includes(lowerKey)
    ? (lowerKey as KeyboardShortcutKey)
    : null;
}

export function isShortcutTargetBlocked(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  const interactiveTarget = target.closest(
    'input, textarea, select, button, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]',
  );
  const isEditable =
    target instanceof HTMLElement && Boolean(target.isContentEditable);

  return Boolean(interactiveTarget) || isEditable;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcutMap,
  enabled = true,
) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isShortcutTargetBlocked(event.target)
      ) {
        return;
      }

      const shortcutKey = normalizeShortcutKey(event);
      if (!shortcutKey) return;

      const shortcutHandler = shortcutsRef.current[shortcutKey];
      if (!shortcutHandler) return;

      // Space 스크롤과 Enter 기본 동작을 막은 뒤 화면별 공통 함수를 실행합니다.
      event.preventDefault();
      shortcutHandler();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
