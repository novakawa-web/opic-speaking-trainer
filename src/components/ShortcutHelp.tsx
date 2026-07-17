import { useId, useState } from "react";
import { activateButton } from "../utils/buttonFocus";

export type ShortcutHelpItem = {
  keyLabel: string;
  description: string;
};

type ShortcutHelpProps = {
  items: ShortcutHelpItem[];
  defaultExpanded?: boolean;
};

function shouldExpandByDefault() {
  return window.matchMedia("(min-width: 701px)").matches;
}

export function ShortcutHelp({
  items,
  defaultExpanded,
}: ShortcutHelpProps) {
  const [isExpanded, setIsExpanded] = useState(
    () => defaultExpanded ?? shouldExpandByDefault(),
  );
  const panelId = useId();

  return (
    <aside className="shortcut-help" aria-label="키보드 단축키 안내">
      <button
        className="shortcut-help-toggle"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label={`키보드 단축키 안내 ${isExpanded ? "접기" : "펼치기"}`}
        onClick={(event) =>
          activateButton(event, () =>
            setIsExpanded((current) => !current),
          )
        }
      >
        <span className="shortcut-help-title">
          <span className="shortcut-icon" aria-hidden="true">
            ⌨
          </span>
          키보드 단축키
        </span>
        <span className="shortcut-toggle-state" aria-hidden="true">
          {isExpanded ? "접기 −" : "펼치기 +"}
        </span>
      </button>

      {isExpanded && (
        <div id={panelId} className="shortcut-help-content">
          <p className="sr-only">
            아래 키를 누르면 해당 학습 기능을 실행할 수 있습니다.
          </p>
          <ul>
            {items.map((item) => (
              <li key={`${item.keyLabel}-${item.description}`}>
                <kbd>{item.keyLabel}</kbd>
                <span>{item.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
