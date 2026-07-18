import type { OpicCard } from "../types";
import { summarizeFirstLineMock, type FirstLineMockSession } from "../utils/firstLineMockSession";

type Props = {
  session: FirstLineMockSession;
  cards: OpicCard[];
  onRetryHard: () => void;
  onRestart: () => void;
  onHome: () => void;
};

export function FirstLineMockResult({ session, cards, onRetryHard, onRestart, onHome }: Props) {
  const summary = summarizeFirstLineMock(session);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const hardCards = session.cardOrder.filter((id) => session.answers[id] === "hard").flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
  return (
    <main className="mock-result-page">
      <section className="mock-result-card" aria-labelledby="mock-result-title">
        <p className="eyebrow">MOCK EXAM COMPLETE</p>
        <h1 id="mock-result-title">첫 문장 모의고사 결과</h1>
        <div className="mock-result-summary">
          <div><span>전체</span><strong>{summary.total}</strong></div>
          <div><span>성공</span><strong>{summary.success}</strong></div>
          <div><span>연습 필요</span><strong>{summary.again}</strong></div>
          <div><span>어려움</span><strong>{summary.hard}</strong></div>
          <div><span>성공률</span><strong>{summary.successRate}%</strong></div>
        </div>
        <section className="mock-hard-list" aria-labelledby="mock-hard-title">
          <h2 id="mock-hard-title">어려웠던 카드</h2>
          {hardCards.length ? <ul>{hardCards.map((card) => <li key={card.id}><strong>{card.hint.title || card.id}</strong><span>{card.front}</span></li>)}</ul> : <p>어려움으로 선택한 카드가 없어요.</p>}
        </section>
        <div className="mock-result-actions">
          <button type="button" className="primary-button" disabled={hardCards.length === 0} onClick={onRetryHard}>어려운 카드만 다시 도전</button>
          <button type="button" className="secondary-button" onClick={onRestart}>같은 조건으로 새 모의고사</button>
          <button type="button" className="text-button" onClick={onHome}>홈으로</button>
        </div>
      </section>
    </main>
  );
}
