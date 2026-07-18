type Props = {
  canStartFirstLine: boolean;
  onStartFirstLine: () => void;
  onStartAnswerLearning: () => void;
  onOpenShadowing: () => void;
};

export function HomeQuickStart({
  canStartFirstLine,
  onStartFirstLine,
  onStartAnswerLearning,
  onOpenShadowing,
}: Props) {
  return (
    <section className="home-quick-start" aria-labelledby="home-quick-start-title">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">QUICK START</p>
          <h2 id="home-quick-start-title" className="home-section-title">빠른 시작</h2>
        </div>
      </div>
      <div className="home-quick-start-grid">
        <button type="button" className="home-learning-action compact-learning-tile" disabled={!canStartFirstLine} onClick={onStartFirstLine}>
          <strong>첫 문장 연습</strong>
          <span className="home-card-description">질문을 듣고 첫 문장을 바로 말해요.</span>
        </button>
        <button type="button" className="home-learning-action compact-learning-tile" onClick={onStartAnswerLearning}>
          <strong>답변 익히기</strong>
          <span className="home-card-description">힌트와 답변을 보며 문장을 익혀요.</span>
        </button>
        <button type="button" className="home-learning-action compact-learning-tile" onClick={onOpenShadowing}>
          <strong>쉐도잉 연습</strong>
          <span className="home-card-description">답변을 듣고 문장별로 따라 말해요.</span>
        </button>
      </div>
    </section>
  );
}
