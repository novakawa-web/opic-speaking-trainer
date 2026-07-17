import { activateButton } from "../utils/buttonFocus";

type StudyNavigationProps = {
  currentPosition: number;
  totalCards: number;
  backLabel: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  bottom?: boolean;
  mobileSticky?: boolean;
};

export function StudyNavigation({
  currentPosition,
  totalCards,
  backLabel,
  canGoPrevious,
  canGoNext,
  onBack,
  onPrevious,
  onNext,
  bottom = false,
  mobileSticky = false,
}: StudyNavigationProps) {
  const safeTotal = Math.max(totalCards, 0);
  const safePosition =
    safeTotal === 0 ? 0 : Math.min(Math.max(currentPosition, 1), safeTotal);
  const percentage =
    safeTotal === 0 ? 0 : Math.round((safePosition / safeTotal) * 100);

  return (
    <nav
      className={`study-navigation ${bottom ? "is-bottom" : ""} ${
        mobileSticky ? "is-mobile-sticky" : ""
      }`}
      aria-label="학습 카드 이동"
    >
      {!mobileSticky ? (
        <button
          className="back-button"
          type="button"
          onClick={(event) => activateButton(event, onBack)}
        >
          ← {backLabel}
        </button>
      ) : null}

      <div
        className="card-progress"
        aria-label={`현재 카드 ${safePosition}, 전체 카드 ${safeTotal}, 진행률 ${percentage}%`}
      >
        <div className="progress-copy">
          <span className="progress-position">
            <strong>
              {safePosition} / {safeTotal}
            </strong>{" "}
            카드
          </span>
          <span className="progress-percent">{percentage}%</span>
        </div>
        <progress value={safePosition} max={safeTotal || 1}>
          {percentage}%
        </progress>
      </div>

      <div className="navigation-buttons">
        <button
          className="navigation-button"
          type="button"
          disabled={!canGoPrevious}
          onClick={(event) => activateButton(event, onPrevious)}
        >
          <span aria-hidden="true">←</span> 이전
        </button>
        <button
          className="navigation-button"
          type="button"
          aria-keyshortcuts="Enter"
          disabled={!canGoNext}
          onClick={(event) => activateButton(event, onNext)}
        >
          다음 <span aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  );
}
