import type { ThemeMode } from "../types.ts";

export const THEME_STORAGE_KEY = "opic-theme-mode";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function readStoredTheme(): ThemeMode {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(storedTheme) ? storedTheme : "light";
  } catch {
    return "light";
  }
}

export function readInitialTheme(): ThemeMode {
  const documentTheme = document.documentElement.dataset.theme;
  return isThemeMode(documentTheme) ? documentTheme : readStoredTheme();
}

export function saveTheme(theme: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 저장 공간을 사용할 수 없어도 현재 화면의 테마 전환은 유지합니다.
  }
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
