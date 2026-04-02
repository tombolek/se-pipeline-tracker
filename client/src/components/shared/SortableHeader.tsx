/**
 * A <th> element with a sort direction indicator.
 * Clicking cycles: unsorted → asc → desc → unsorted.
 */
import type { SortDir } from '../../utils/sortRows';

interface Props {
  label: string;
  colKey: string;
  currentKey: string | null;
  currentDir: SortDir;
  onSort: (key: string) => void;
  /** className forwarded to the <th> element */
  className?: string;
}

export default function SortableHeader({
  label, colKey, currentKey, currentDir, onSort, className = '',
}: Props) {
  const active = currentKey === colKey;

  return (
    <th
      onClick={() => onSort(colKey)}
      className={`cursor-pointer select-none group ${className}`}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span
          className={`flex-shrink-0 transition-opacity ${
            active ? 'opacity-100 text-brand-purple' : 'opacity-0 group-hover:opacity-40'
          }`}
        >
          {active && currentDir === 'desc' ? (
            // Down chevron
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            // Up chevron (default / asc)
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          )}
        </span>
      </div>
    </th>
  );
}
