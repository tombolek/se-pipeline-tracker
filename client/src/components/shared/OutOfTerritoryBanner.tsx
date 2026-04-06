export default function OutOfTerritoryBanner({ teams }: { teams: string[] }) {
  if (teams.length === 0) return null;
  const teamList =
    teams.length === 1
      ? teams[0]
      : teams.slice(0, -1).join(', ') + ' and ' + teams[teams.length - 1];
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-status-info/10 border border-status-info/30 rounded-xl text-xs text-brand-navy flex-shrink-0">
      <svg className="w-4 h-4 text-status-info flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>
        Also showing items from <span className="font-semibold">{teamList}</span> — your team is assigned as SE Owner outside your territories
      </span>
    </div>
  );
}
