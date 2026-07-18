import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function HomeManagement({
  children,
  initialExpanded = false,
}: {
  children: ReactNode;
  initialExpanded?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (initialExpanded && detailsRef.current) detailsRef.current.open = true;
  }, [initialExpanded]);

  return (
    <details ref={detailsRef} className="home-management">
      <summary>
        <span>
          <small>DATA &amp; BACKUP</small>
          <strong>관리 및 백업</strong>
        </span>
        <span className="home-management-summary">카드 TSV · 전체 JSON 백업 · 업데이트</span>
      </summary>
      <div className="home-management-content">{children}</div>
    </details>
  );
}
