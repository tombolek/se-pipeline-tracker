import { useState } from 'react';

interface OutOfTerritoryItem {
  id: number;
  name: string;
  team: string;
}

export default function OutOfTerritoryBanner({
  teams,
  items,
}: {
  teams: string[];
  items?: OutOfTerritoryItem[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (teams.length === 0) return null;

  const teamList =
    teams.length === 1
      ? teams[0]
      : teams.slice(0, -1).join(', ') + ' and ' + teams[teams.length - 1];

  return (
    <div className="bg-status-info/10 dark:bg-status-d-info-soft border border-status-info/30 rounded-xl text-xs text-brand-navy dark:text-fg-1 flex-shrink-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <svg className="w-4 h-4 text-status-info dark:text-status-d-info flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="flex-1">
          Also showing items from <span className="font-semibold">{teamList}</span> — your team is assigned as SE Owner outside your territories
        </span>
        {items && items.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-2 flex items-center gap-1 text-status-info dark:text-status-d-info font-semibold hover:opacity-80 transition-opacity flex-shrink-0"
          >
            {expanded ? 'Hide' : `${items.length} opportunit${items.length !== 1 ? 'ies' : 'y'}`}
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {expanded && items && items.length > 0 && (
        <div className="border-t border-status-info/20 px-3 py-2 space-y-1.5">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="font-medium text-brand-navy dark:text-fg-1 truncate">{item.name}</span>
              <span className="flex-shrink-0 px-1.5 py-px rounded-full bg-status-info/15 text-status-info dark:text-status-d-info text-[10px] font-semibold">
                {item.team}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
