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
  const { seIds, teamName, isFiltered, isManager } = useTeamScope();

  if (!isManager) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wide">Scope:</span>
      <div className="flex rounded-lg border border-brand-navy-30 overflow-hidden text-xs">
        <button
          onClick={() => setTeamScopeManagerId(user!.id)}
          className={`px-3 py-1.5 font-medium transition-colors ${
            isFiltered
              ? 'bg-brand-purple text-white'
              : 'bg-white text-brand-navy-70 hover:bg-gray-50'
          }`}
        >
          My Team{isFiltered ? (teamName ? ` · ${teamName}` : seIds.size > 0 ? ` (${seIds.size})` : '') : ''}
        </button>
        <button
          onClick={() => setTeamScopeManagerId(null)}
          className={`px-3 py-1.5 font-medium border-l border-brand-navy-30 transition-colors ${
            !isFiltered
              ? 'bg-brand-purple text-white'
              : 'bg-white text-brand-navy-70 hover:bg-gray-50'
          }`}
        >
          Full View
        </button>
      </div>
    </div>
  );
}
