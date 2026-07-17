import type { DailyStudyStats } from "../types";

type TodayStatsProps = {
  stats: DailyStudyStats;
};

export function TodayStats({ stats }: TodayStatsProps) {
  return (
    <section className="today-stats" aria-labelledby="today-stats-title">
      <div className="today-stats-heading">
        <div>
          <p className="eyebrow">TODAY'S PRACTICE</p>
          <h2 id="today-stats-title">오늘 학습 기록</h2>
        </div>
        <time dateTime={stats.date}>{stats.date}</time>
      </div>

      <div className="today-stats-grid">
        <div className="today-stat-card">
          <div className="today-stat-label">
            <span className="today-stat-icon" aria-hidden="true">
              01
            </span>
            <span>오늘 연습한 카드</span>
          </div>
          <strong>{stats.practicedCardCount}</strong>
          <small>고유 카드 수</small>
        </div>
        <div className="today-stat-card">
          <div className="today-stat-label">
            <span className="today-stat-icon" aria-hidden="true">
              02
            </span>
            <span>오늘 시도 횟수</span>
          </div>
          <strong>{stats.attemptCount}</strong>
          <small>전체 상태 선택</small>
        </div>
        <div className="today-stat-card today-stat-highlight">
          <div className="today-stat-label">
            <span className="today-stat-icon" aria-hidden="true">
              %
            </span>
            <span>첫 문장 성공률</span>
          </div>
          <strong>{stats.successRate}%</strong>
          <small>
            성공 {stats.successCount}회 / 시도 {stats.attemptCount}회
          </small>
        </div>
      </div>
    </section>
  );
}
