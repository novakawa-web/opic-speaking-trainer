import { useEffect } from "react";

type TransientToastProps = {
  message: string;
  noticeId: number;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  durationMs?: number;
};

export function TransientToast({
  message,
  noticeId,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 3_500,
}: TransientToastProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, noticeId]);

  return (
    <div
      className="transient-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
