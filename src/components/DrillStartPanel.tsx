import { activateButton } from "../utils/buttonFocus";

type DrillStartPanelProps = {
  cardCount: number;
  onStart: () => void;
};

export function DrillStartPanel({ cardCount, onStart }: DrillStartPanelProps) {
  const isEmpty = cardCount === 0;

  return (
    <section className="drill-start-panel" aria-labelledby="drill-start-title">
      <div className="drill-start-copy">
        <span className="drill-start-eyebrow">FIRST LINE DRILL</span>
        <h2 id="drill-start-title">첫 문장 연습</h2>
        <p>
          {isEmpty
            ? "필터 조건을 바꾸면 첫 문장 연습을 시작할 수 있어요."
            : "현재 필터에 보이는 카드를 처음부터 연속해서 연습해요."}
        </p>
      </div>

      <div className="drill-start-actions">
        <span className="drill-start-count" aria-live="polite">
          연습할 카드 {cardCount}개
        </span>
        <button
          className="drill-start-button"
          type="button"
          disabled={isEmpty}
          aria-describedby={isEmpty ? "drill-start-empty-help" : undefined}
          onClick={(event) => activateButton(event, onStart)}
        >
          첫 문장 연습 시작
        </button>
        {isEmpty && (
          <span id="drill-start-empty-help" className="drill-start-empty-help">
            연습할 카드가 없어 버튼을 사용할 수 없습니다.
          </span>
        )}
      </div>
    </section>
  );
}
