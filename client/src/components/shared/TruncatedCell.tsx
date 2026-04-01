/**
 * TruncatedCell — renders long text in a table cell with truncation + tooltip.
 *
 * Used for MEDDPICC fields, SE Comments, Next Step, etc. when shown as columns.
 * The tooltip appears on hover via the native `title` attribute (zero-dependency).
 *
 * Usage:
 *   <TruncatedCell value={opp.decision_process} maxChars={60} />
 */

interface Props {
  value: string | null | undefined;
  /** Max characters before truncation. Default: 60 */
  maxChars?: number;
  /** Optional className for the outer span */
  className?: string;
}

export default function TruncatedCell({ value, maxChars = 60, className = '' }: Props) {
  if (!value) {
    return <span className={`text-brand-navy-30 ${className}`}>—</span>;
  }

  const truncated = value.length > maxChars;
  const display = truncated ? value.slice(0, maxChars).trimEnd() + '…' : value;

  return (
    <span
      className={`block leading-tight ${truncated ? 'cursor-help' : ''} ${className}`}
      title={truncated ? value : undefined}
    >
      {display}
    </span>
  );
}
