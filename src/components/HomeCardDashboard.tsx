type HomeCardDashboardProps = {
  totalCount: number;
  filteredCount: number;
  filterSummary: string;
  onOpenLibrary: () => void;
  onStartDrill: () => void;
};

export function HomeCardDashboard({
  totalCount,
  filteredCount,
  filterSummary,
  onOpenLibrary,
  onStartDrill,
}: HomeCardDashboardProps) {
  const hasCards = filteredCount > 0;

  return (
    <section className="home-card-dashboard home-material-card material-card-content-stack" aria-labelledby="home-card-dashboard-title">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">STUDY CARDS</p>
          <h2 id="home-card-dashboard-title" className="home-section-title">학습 카드</h2>
          <p className="home-card-description">전체 목록은 카드 라이브러리에서 보고, 현재 조건으로 바로 연습하세요.</p>
        </div>
      </div>

      <div className="home-card-counts summary-chip-row" aria-label="학습 카드 수">
        <span className="summary-chip">전체 <strong>{totalCount}</strong>장</span>
        <span className="summary-chip">현재 <strong>{filteredCount}</strong>장</span>
      </div>

      <p className="home-filter-summary">
        <strong className="home-filter-summary-label">현재 조건</strong>
        <span className="home-filter-summary-separator" aria-hidden="true">·</span>
        <span className="home-filter-summary-value">{filterSummary}</span>
      </p>

      {!hasCards && (
        <p className="home-card-empty" role="status">
          현재 조건에 맞는 카드가 없어요. 카드 라이브러리에서 필터를 바꿔 주세요.
        </p>
      )}

      <div className="home-card-actions">
        <button type="button" className="secondary-button" onClick={onOpenLibrary}>
          카드 라이브러리 열기
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!hasCards}
          aria-describedby={!hasCards ? "home-card-empty-help" : undefined}
          onClick={onStartDrill}
        >
          첫 문장 연습 시작
        </button>
      </div>
      {!hasCards && (
        <span id="home-card-empty-help" className="visually-hidden">
          현재 조건에 맞는 카드가 없어 연습을 시작할 수 없습니다.
        </span>
      )}
    </section>
  );
}
