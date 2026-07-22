import type { ThemeMode } from "../types";
import { activateButton } from "../utils/buttonFocus";

type AppHeaderProps = {
  theme: ThemeMode;
  studyTitle?: string;
  mobileSticky?: boolean;
  currentPosition?: number;
  totalCards?: number;
  onBack?: () => void;
  onHome: () => void;
  onToggleTheme: () => void;
};

export function AppHeader({
  theme,
  studyTitle,
  mobileSticky = false,
  currentPosition = 0,
  totalCards = 0,
  onBack,
  onHome,
  onToggleTheme,
}: AppHeaderProps) {
  const isDark = theme === "dark";
  const safeTotal = Math.max(totalCards, 0);
  const safePosition =
    safeTotal === 0 ? 0 : Math.min(Math.max(currentPosition, 1), safeTotal);
  const progressPercentage =
    safeTotal === 0 ? 0 : Math.round((safePosition / safeTotal) * 100);

  return (
    <header
      className={`app-header ${studyTitle ? "is-study-header" : ""} ${
        mobileSticky ? "is-mobile-sticky" : ""
      }`}
    >
      {onBack ? (
        <button
          className="study-header-back"
          type="button"
          aria-label={`${studyTitle ?? "학습 화면"}에서 뒤로가기`}
          onClick={(event) => activateButton(event, onBack)}
        >
          <span aria-hidden="true">←</span>
        </button>
      ) : null}
      <button
        className="brand-home"
        type="button"
        aria-label="홈으로 이동"
        onClick={(event) => activateButton(event, onHome)}
      >
        <span className="brand-mark" aria-hidden="true">O</span>
        <span className="brand-copy">
          <span>YOUR DAILY SPEAKING ROUTINE</span>
          <strong>OPIc Speaking Trainer</strong>
        </span>
      </button>
      {studyTitle ? <strong className="compact-header-title">{studyTitle}</strong> : null}
      {mobileSticky ? (
        <span
          className="compact-header-position"
          role="status"
          aria-label={`현재 카드 ${safePosition}, 전체 카드 ${safeTotal}`}
        >
          {safePosition} / {safeTotal}
        </span>
      ) : null}
      <button
        className="theme-toggle"
        type="button"
        aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
        aria-pressed={isDark}
        onClick={onToggleTheme}
      >
        <span className="theme-toggle-icon" aria-hidden="true">
          {isDark ? "☀" : "☾"}
        </span>
        <span>{isDark ? "라이트 모드" : "다크 모드"}</span>
      </button>
      {mobileSticky ? (
        <span className="mobile-header-progress" aria-hidden="true">
          <span style={{ width: `${progressPercentage}%` }} />
        </span>
      ) : null}
    </header>
  );
}
