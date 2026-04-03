import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { PageHeader, Empty, Loading } from './shared';

interface WorkloadRow {
  id: number;
  name: string;
  email: string;
  opp_count: string;
  open_tasks: string;
  overdue_tasks: string;
  next_steps: string;
}

function Stat({ label, value, highlight, to }: { label: string; value: string; highlight?: boolean; to?: string }) {
  const inner = (
    <>
      <p className={`text-xl font-semibold ${highlight ? 'text-status-overdue' : 'text-brand-navy'}`}>{value}</p>
      <p className="text-[10px] text-brand-navy-70 uppercase tracking-wide mt-0.5">{label}</p>
    </>
  );
  if (to && parseInt(value) > 0) {
    return (
      <Link to={to} className="bg-[#F5F5F7] rounded-xl p-3 text-center block hover:bg-brand-purple-30/40 transition-colors group">
        {inner}
      </Link>
    );
  }
  return <div className="bg-[#F5F5F7] rounded-xl p-3 text-center">{inner}</div>;
}

export default function TeamWorkloadPage() {
  const [rows, setRows] = useState<WorkloadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApiResponse<WorkloadRow[]>>('/insights/team-workload')
      .then(r => setRows(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Team Workload" subtitle="Open opportunities and tasks per SE" />
      {loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-brand-purple flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                  {r.name[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-navy">{r.name}</p>
                  <p className="text-xs text-brand-navy-70">{r.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Opps"       value={r.opp_count}     to={`/pipeline?se_id=${r.id}`} />
                <Stat label="Open Tasks" value={r.open_tasks}    to={`/pipeline?se_id=${r.id}`} />
                <Stat label="Overdue"    value={r.overdue_tasks} to={`/insights/overdue-tasks?se_id=${r.id}`} highlight={parseInt(r.overdue_tasks) > 0} />
                <Stat label="Next Steps" value={r.next_steps}    to={`/pipeline?se_id=${r.id}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
