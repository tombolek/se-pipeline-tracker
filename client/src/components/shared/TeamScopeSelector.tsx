import { useAuthStore } from '../../store/auth';
import { usePipelineStore } from '../../store/pipeline';
import { useTeamScope } from '../../hooks/useTeamScope';

/**
 * Manager-only toggle between "My Team" (scoped) and "Full View" (all SEs).
 * Returns null for non-managers so it can be safely rendered anywhere.
 */
export default function TeamScopeSelector() {
  const { user } = useAuthStore();
  const { setTeamScopeManagerId } = usePipelineStore();
  const { seIds, teamNames, isFiltered, isManager } = useTeamScope();

  if (!isManager) return null;

  function teamLabel() {
    if (!isFiltered) return 'My Team';
    if (teamNames.size === 1) return `My Team · ${[...teamNames][0]}`;
    if (teamNames.size > 1) return `My Team · ${teamNames.size} territories`;
    if (seIds.size > 0) return `My Team (${seIds.size})`;
    return 'My Team';
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Scope:</span>
      <div className="flex rounded-lg border border-brand-navy-30 overflow-hidden text-xs">
        <button
          onClick={() => setTeamScopeManagerId(user!.id)}
          className={`px-3 py-1.5 font-medium transition-colors ${
            isFiltered
              ? 'bg-brand-purple dark:bg-accent-purple text-white'
              : 'bg-white dark:bg-ink-1 text-brand-navy-70 dark:text-fg-2 hover:bg-gray-50 dark:hover:bg-ink-2'
          }`}
        >
          {teamLabel()}
        </button>
        <button
          onClick={() => setTeamScopeManagerId(null)}
          className={`px-3 py-1.5 font-medium border-l border-brand-navy-30 transition-colors ${
            !isFiltered
              ? 'bg-brand-purple dark:bg-accent-purple text-white'
              : 'bg-white dark:bg-ink-1 text-brand-navy-70 dark:text-fg-2 hover:bg-gray-50 dark:hover:bg-ink-2'
          }`}
        >
          Full View
        </button>
      </div>
    </div>
  );
}
