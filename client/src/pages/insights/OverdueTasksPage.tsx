import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import StageBadge from '../../components/shared/StageBadge';
import { formatDate } from '../../utils/formatters';
import { PageHeader, Empty, Loading } from './shared';

interface OverdueTask {
  id: number;
  title: string;
  due_date: string;
  status: string;
  is_next_step: boolean;
  opportunity_name: string;
  opportunity_stage: string;
}

interface OverdueGroup {
  se_id: number;
  se_name: string;
  tasks: OverdueTask[];
}

export default function OverdueTasksPage() {
  const [groups, setGroups] = useState<OverdueGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApiResponse<OverdueGroup[]>>('/insights/overdue-tasks')
      .then(r => setGroups(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  const total = groups.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <div>
      <PageHeader
        title="Overdue Tasks"
        subtitle={loading ? '' : `${total} overdue task${total !== 1 ? 's' : ''} across team`}
      />
      {loading ? <Loading /> : groups.length === 0 ? <Empty /> : (
        <div className="space-y-6">
          {groups.map(g => (
            <div key={g.se_id}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-brand-purple flex items-center justify-center text-[10px] font-semibold text-white">
                  {g.se_name[0]?.toUpperCase()}
                </div>
                <h3 className="text-sm font-semibold text-brand-navy">{g.se_name}</h3>
                <span className="text-[10px] bg-status-overdue/10 text-status-overdue rounded-full px-2 py-px font-semibold">
                  {g.tasks.length} overdue
                </span>
              </div>
              <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
                {g.tasks.map((t, i) => (
                  <div key={t.id} className={`flex items-start gap-3 px-4 py-3 ${i < g.tasks.length - 1 ? 'border-b border-brand-navy-30/20' : ''}`}>
                    <svg className="w-4 h-4 text-status-overdue flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-brand-navy">{t.title}</p>
                        {t.is_next_step && (
                          <span className="text-[9px] font-semibold bg-brand-purple/10 text-brand-purple px-1.5 py-px rounded-full uppercase">Next step</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-brand-navy-70">{t.opportunity_name}</p>
                        <span className="text-brand-navy-30">·</span>
                        <p className="text-xs text-status-overdue font-medium">Due {formatDate(t.due_date)}</p>
                      </div>
                    </div>
                    <StageBadge stage={t.opportunity_stage} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
