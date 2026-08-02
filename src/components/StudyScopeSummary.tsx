import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  titleId: string;
  description: string;
  countLabel: string;
  actions: ReactNode;
  note?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
  announceCount?: boolean;
};

export function StudyScopeSummary({
  eyebrow,
  title,
  titleId,
  description,
  countLabel,
  actions,
  note,
  headingLevel = "h2",
  className,
  announceCount = true,
}: Props) {
  const Heading = headingLevel;
  const classes = ["study-scope-summary", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role="group" aria-labelledby={titleId}>
      <div className="study-scope-summary-copy">
        <p className="eyebrow">{eyebrow}</p>
        <Heading id={titleId}>{title}</Heading>
        <p className="study-scope-summary-description">{description}</p>
        <p className="study-scope-summary-count" aria-live={announceCount ? "polite" : undefined}>{countLabel}</p>
        {note && <div className="study-scope-summary-note">{note}</div>}
      </div>
      <div className="study-scope-summary-actions">{actions}</div>
    </div>
  );
}
