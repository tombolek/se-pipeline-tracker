import { useState, useEffect, useRef } from 'react';
import type { Opportunity, DealInfoConfig, DealInfoSection, DealInfoFieldDef } from '../../types';
import { getDealInfoConfig } from '../../api/settings';
import { formatDate, formatARR } from '../../utils/formatters';
import { computeHealthScore } from '../../utils/healthScore';
import { computeMeddpicc } from '../../utils/meddpicc';
import type { CoachResult } from '../OpportunityDetail';
import { useAuthStore } from '../../store/auth';
import api from '../../api/client';
import type { ApiResponse } from '../../types';

/* ── Module-level cache ── */
let cachedConfig: DealInfoConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ── Default config (fallback if API fails) ── */
const DEFAULT_CONFIG: DealInfoConfig = {
  sections: [
    { id: 'deal-info-grid', label: 'Deal Info', type: 'grid', defaultOpen: true,
      fields: [
        { key: 'stage', label: 'Stage', source: 'column' },
        { key: 'arr', label: 'ARR', source: 'column', format: 'arr' },
        { key: 'close_date', label: 'Close', source: 'column', format: 'date' },
        { key: 'ae_owner_name', label: 'AE Owner', source: 'column' },
        { key: 'se_owner', label: 'SE Owner', source: 'column', format: 'se_owner' },
        { key: 'se_contributors', label: 'SE Contributors', source: 'column', format: 'se_contributors' },
        { key: 'team', label: 'Team', source: 'column' },
        { key: 'record_type', label: 'Record Type', source: 'column' },
        { key: 'deploy_mode', label: 'Deploy', source: 'column' },
        { key: 'engaged_competitors', label: 'Competitors', source: 'column' },
        { key: 'products', label: 'Products', source: 'column', format: 'products' },
      ] },
    { id: 'poc-rfx', label: 'PoC & RFx', type: 'computed', defaultOpen: true },
    { id: 'sf-next-step', label: 'SF Next Step', type: 'collapsible', defaultOpen: true,
      fields: [{ key: 'next_step_sf', label: 'Next Step', source: 'column' }],
      extras: ['field_history:next_step_sf'] },
    { id: 'se-comments', label: 'SE Comments', type: 'collapsible', defaultOpen: true,
      fields: [{ key: 'se_comments', label: 'SE Comments', source: 'column' }],
      extras: ['freshness:se_comments_updated_at', 'field_history:se_comments'] },
    { id: 'manager-comments', label: 'Manager Comments', type: 'collapsible', defaultOpen: false,
      fields: [{ key: 'manager_comments', label: 'Manager Comments', source: 'column' }],
      visibility: 'manager_or_has_value' },
    { id: 'stage-history', label: 'Stage History', type: 'collapsible', defaultOpen: false,
      fields: [
        { key: 'previous_stage', label: 'Previous', source: 'column' },
        { key: 'stage_changed_at', label: 'Changed', source: 'column', format: 'date' },
      ],
      visibility: 'has_value:previous_stage' },
    { id: 'health-breakdown', label: 'Health Score Breakdown', type: 'computed', defaultOpen: true },
    { id: 'meddpicc', label: 'MEDDPICC', type: 'computed', defaultOpen: true },
    { id: 'see-all-fields', label: 'See All Fields', type: 'computed', defaultOpen: false },
  ],
};

/* ── Helpers ── */
function resolveFieldValue(opp: Opportunity, field: DealInfoFieldDef): string | null | undefined {
  if (field.source === 'sf_raw') {
    const raw = (opp as unknown as Record<string, unknown>).sf_raw_fields as Record<string, unknown> | undefined;
    const val = raw?.[field.key];
    return val === null || val === undefined ? null : String(val);
  }
  // Handle special cases
  if (field.key === 'se_owner') {
    const owner = (opp as unknown as Record<string, unknown>).se_owner as { name: string } | null;
    return owner?.name ?? 'Unassigned';
  }
  if (field.key === 'se_contributors') {
    const list = (opp as unknown as Record<string, unknown>).se_contributors as { name: string }[] | undefined;
    if (!list || list.length === 0) return null; // triggers "—" in formatter
    return list.map(c => c.name).join(', ');
  }
  return (opp as unknown as Record<string, unknown>)[field.key] as string | null | undefined;
}

function formatFieldValue(value: string | null | undefined, format?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'arr': {
      const num = parseFloat(value);
      return isNaN(num) ? value : formatARR(num);
    }
    case 'date': return formatDate(value);
    default: return String(value);
  }
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/* ── Sub-components ── */

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-1 text-xs">
      <span className="text-brand-navy-70 dark:text-fg-2 flex-shrink-0">{label}</span>
      <span className="text-brand-navy dark:text-fg-1 text-right font-medium">{value}</span>
    </div>
  );
}

function FreshnessTag({ updatedAt }: { updatedAt: string | null }) {
  const days = daysSince(updatedAt);
  if (days === null) return <span className="text-[10px] text-brand-navy-30 dark:text-fg-4">never</span>;
  const color = days <= 7 ? 'text-status-success dark:text-status-d-success' : days <= 21 ? 'text-status-warning dark:text-status-d-warning' : 'text-status-overdue dark:text-status-d-overdue';
  return <span className={`text-[10px] font-medium ${color}`}>{days}d ago</span>;
}

function Collapsible({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full py-2.5 text-left">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2">{title}</span>
        <svg className={`w-3.5 h-3.5 text-brand-navy-70 dark:text-fg-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

interface HistoryEntry { id: number; field_name: string; old_value: string | null; new_value: string | null; changed_at: string; }

function FieldHistory({ oppId, field }: { oppId: number; field: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) { setOpen(false); return; }
    if (entries !== null) { setOpen(true); return; }
    setLoading(true);
    try {
      const r = await api.get<ApiResponse<HistoryEntry[]>>(`/opportunities/${oppId}/field-history?field=${field}`);
      setEntries(r.data.data);
      setOpen(true);
    } finally { setLoading(false); }
  }

  return (
    <div className="mt-2">
      <button onClick={toggle} className="text-[10px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors flex items-center gap-1">
        <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {loading ? 'Loading…' : open ? 'Hide history' : 'Show history'}
      </button>
      {open && entries && entries.length > 0 && (
        <div className="mt-1.5 space-y-2 pl-2 border-l-2 border-brand-navy-30/50">
          {entries.map(e => (
            <div key={e.id}>
              <p className="text-[10px] text-brand-navy-70 dark:text-fg-2">{formatDate(e.changed_at)}</p>
              <p className="text-[10px] text-brand-navy dark:text-fg-1 leading-relaxed line-clamp-3">
                {e.new_value || <span className="italic text-brand-navy-30 dark:text-fg-4">cleared</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      {open && entries?.length === 0 && (
        <p className="text-[10px] text-brand-navy-30 dark:text-fg-4 mt-1 italic">No history yet</p>
      )}
    </div>
  );
}

const ALL_PRODUCTS = ['DQ', 'MDM', 'RDM', 'Catalog', 'Lineage', 'Observability', 'DG'];

function ProductsField({ products, oppId, readOnly, onUpdate }: { products: string[]; oppId: number; readOnly: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(products);
  const [saving, setSaving] = useState(false);

  function toggle(p: string) {
    setSelected(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/opportunities/${oppId}/fields`, { products: selected });
      setEditing(false);
      onUpdate();
    } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div className="flex justify-between gap-2 py-1 text-xs">
        <span className="text-brand-navy-70 dark:text-fg-2 flex-shrink-0">Products</span>
        <span className="text-brand-navy dark:text-fg-1 text-right font-medium flex items-center gap-1">
          {products.length > 0 ? products.join(', ') : '—'}
          {!readOnly && (
            <button onClick={() => { setSelected(products); setEditing(true); }} className="text-brand-purple dark:text-accent-purple hover:text-brand-navy dark:text-fg-1 ml-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <span className="text-[10px] text-brand-navy-70 dark:text-fg-2 block mb-1">Products</span>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {ALL_PRODUCTS.map(p => (
          <button key={p} onClick={() => toggle(p)}
            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
              selected.includes(p)
                ? 'bg-brand-purple dark:bg-accent-purple text-white border-brand-purple'
                : 'bg-white dark:bg-ink-1 text-brand-navy-70 dark:text-fg-2 border-brand-navy-30 hover:border-brand-purple'
            }`}
          >{p}</button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button onClick={save} disabled={saving} className="px-2 py-0.5 text-[10px] font-medium bg-brand-purple dark:bg-accent-purple text-white rounded hover:bg-brand-purple-70 dark:hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="px-2 py-0.5 text-[10px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1">Cancel</button>
      </div>
    </div>
  );
}

const HEALTH_PILL_STYLES = {
  green: { dot: 'bg-status-success', text: 'text-emerald-700' },
  amber: { dot: 'bg-status-warning', text: 'text-amber-700' },
  red:   { dot: 'bg-status-overdue', text: 'text-red-700' },
};

const QUALITY_ICON = {
  strong: <span className="text-status-success dark:text-status-d-success font-bold">✓</span>,
  weak:   <span className="text-status-warning dark:text-status-d-warning">◐</span>,
  empty:  <span className="text-brand-navy-30 dark:text-fg-4">○</span>,
};

/* ── Section renderers ── */

function GridSection({ section, opp, oppId, readOnly, onUpdate }: {
  section: DealInfoSection; opp: Opportunity; oppId: number; readOnly: boolean; onUpdate: () => void;
}) {
  return (
    <div className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2 mb-3">{section.label}</p>
      <div className="grid grid-cols-2 gap-x-8">
        {section.fields?.filter(f => f.format !== 'products').map(f => (
          <FieldRow key={f.key} label={f.label} value={formatFieldValue(resolveFieldValue(opp, f), f.format)} />
        ))}
      </div>
      {/* Products field (special interactive widget) */}
      {section.fields?.some(f => f.format === 'products') && (
        <div className="mt-2 pt-2 border-t border-brand-navy-30/30 dark:border-ink-border-soft">
          <ProductsField products={opp.products ?? []} oppId={oppId} readOnly={readOnly} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ section, opp, oppId }: {
  section: DealInfoSection; opp: Opportunity; oppId: number;
}) {
  // Render all fields as one collapsible block with the section label
  const hasHistory = section.extras?.some(e => e.startsWith('field_history:'));
  const historyField = hasHistory ? section.extras!.find(e => e.startsWith('field_history:'))!.split(':')[1] : null;
  const hasFreshness = section.extras?.some(e => e.startsWith('freshness:'));
  const freshnessField = hasFreshness ? section.extras!.find(e => e.startsWith('freshness:'))!.split(':')[1] : null;

  // For multi-field collapsibles (like stage history), show as field rows
  const isMultiField = section.fields && section.fields.length > 1;
  // For single-field collapsibles, show as pre-wrapped text
  const singleField = section.fields && section.fields.length === 1 ? section.fields[0] : null;

  return (
    <div className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30 px-5 py-1">
      <Collapsible title={section.label} defaultOpen={section.defaultOpen}>
        {hasFreshness && freshnessField && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <FreshnessTag updatedAt={(opp as unknown as Record<string, unknown>)[freshnessField] as string | null} />
          </div>
        )}
        {singleField && (
          <p className="text-xs text-brand-navy dark:text-fg-1 leading-relaxed whitespace-pre-wrap">
            {resolveFieldValue(opp, singleField) ?? '—'}
          </p>
        )}
        {isMultiField && section.fields!.map(f => (
          <FieldRow key={f.key} label={f.label} value={formatFieldValue(resolveFieldValue(opp, f), f.format)} />
        ))}
        {historyField && <FieldHistory oppId={oppId} field={historyField} />}
      </Collapsible>
    </div>
  );
}

function HealthBreakdownSection({ opp }: { opp: Opportunity }) {
  const { score, rag, factors } = computeHealthScore(opp);
  const s = HEALTH_PILL_STYLES[rag];
  return (
    <div id="health-breakdown" className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2 mb-3">Health Score Breakdown</p>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full ${s.dot}`} />
        <span className={`text-sm font-semibold ${s.text}`}>{score}/100</span>
        <span className={`text-xs ${s.text}`}>{rag === 'green' ? 'Healthy' : rag === 'amber' ? 'Needs attention' : 'At risk'}</span>
      </div>
      {factors.length === 0 ? (
        <p className="text-xs text-status-success dark:text-status-d-success">No issues detected</p>
      ) : (
        <div className="space-y-1.5">
          {factors.map(f => (
            <div key={f.label} className="flex items-center justify-between text-xs">
              <span className="text-brand-navy-70 dark:text-fg-2">{f.label}</span>
              <span className="font-semibold text-status-overdue dark:text-status-d-overdue">-{f.deduction}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeddpiccSection({ opp, coachResult }: { opp: Opportunity; coachResult?: CoachResult | null }) {
  const { fields } = computeMeddpicc(opp);
  const [showCoachNotes, setShowCoachNotes] = useState(false);

  // Build a lookup map from coach elements by key
  const coachByKey = coachResult?.elements?.reduce<Record<string, typeof coachResult.elements[0]>>((acc, el) => {
    acc[el.key] = el;
    return acc;
  }, {}) ?? {};
  const hasCoach = Object.keys(coachByKey).length > 0;

  return (
    <div id="meddpicc" className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2">MEDDPICC</p>
        {hasCoach && (
          <button
            onClick={() => setShowCoachNotes(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors border ${
              showCoachNotes
                ? 'bg-brand-purple dark:bg-accent-purple text-white border-brand-purple hover:bg-brand-purple-70 dark:hover:opacity-90'
                : 'bg-brand-purple-30/60 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple border-brand-purple/30 dark:border-accent-purple/30 hover:bg-brand-purple-30 hover:border-brand-purple/50'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {showCoachNotes ? 'Hide AI notes' : 'Show AI notes'}
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {fields.map(f => {
          const val = (opp as unknown as Record<string, unknown>)[f.key] as string | null;
          const coach = coachByKey[f.key as string];
          const coachDotColor = coach?.status === 'green' ? 'bg-status-success'
            : coach?.status === 'amber' ? 'bg-status-warning'
            : coach?.status === 'red' ? 'bg-status-overdue' : '';
          return (
            <div key={f.key as string}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px]">{QUALITY_ICON[f.quality]}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2">{f.label}</span>
                {showCoachNotes && coach && (
                  <span className={`w-1.5 h-1.5 rounded-full ${coachDotColor}`} />
                )}
                {f.quality === 'weak' && (
                  <span className="text-[9px] text-status-warning dark:text-status-d-warning font-medium ml-auto">short</span>
                )}
              </div>
              <p className={`text-xs leading-relaxed ${val ? 'text-brand-navy' : 'text-brand-navy-30 dark:text-fg-4 italic'}`}>
                {val ?? 'Not filled'}
              </p>
              {/* Inline coach insight */}
              {showCoachNotes && coach && (coach.gap || coach.evidence || coach.suggested_question) && (
                <div className="mt-1.5 ml-5 pl-3 border-l-2 border-brand-purple/20 space-y-1">
                  {coach.evidence && (
                    <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 leading-relaxed">
                      <span className="font-medium text-brand-navy dark:text-fg-1">Evidence:</span> {coach.evidence}
                    </p>
                  )}
                  {coach.gap && (
                    <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 leading-relaxed">
                      <span className="font-medium text-status-warning dark:text-status-d-warning">Gap:</span> {coach.gap}
                    </p>
                  )}
                  {coach.suggested_question && (
                    <p className="text-[11px] text-brand-purple dark:text-accent-purple italic leading-relaxed">
                      💡 {coach.suggested_question}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PocRfxSection({ opp }: { opp: Opportunity }) {
  const pocFields: { label: string; key: string; format?: string }[] = [
    { label: 'PoC Status', key: 'poc_status' },
    { label: 'PoC Start Date', key: 'poc_start_date', format: 'date' },
    { label: 'PoC End Date', key: 'poc_end_date', format: 'date' },
    { label: 'PoC Type', key: 'poc_type' },
    { label: 'PoC Deploy Type', key: 'poc_deploy_type' },
  ];
  const rfxFields: { label: string; key: string; format?: string }[] = [
    { label: 'RFx Status', key: 'rfx_status' },
    { label: 'RFx Received', key: 'rfx_received_date', format: 'date' },
    { label: 'RFx Deadline', key: 'rfx_submission_date', format: 'date' },
  ];

  function val(key: string, format?: string): string {
    const v = (opp as unknown as Record<string, unknown>)[key] as string | null | undefined;
    if (!v) return '—';
    if (format === 'date') return formatDate(v);
    return v;
  }

  return (
    <div className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2 mb-3">PoC &amp; RFx</p>
      <div className="grid grid-cols-2 gap-x-10">
        {/* PoC column */}
        <div>
          <p className="text-[10px] font-semibold text-brand-purple dark:text-accent-purple mb-1.5">PoC</p>
          {pocFields.map(f => (
            <FieldRow key={f.key} label={f.label} value={val(f.key, f.format)} />
          ))}
        </div>
        {/* RFx column */}
        <div>
          <p className="text-[10px] font-semibold text-brand-purple dark:text-accent-purple mb-1.5">RFx</p>
          {rfxFields.map(f => (
            <FieldRow key={f.key} label={f.label} value={val(f.key, f.format)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SeeAllFieldsSection({ opp }: { opp: Opportunity }) {
  const [open, setOpen] = useState(false);
  const sfRaw = (opp as unknown as Record<string, unknown>).sf_raw_fields as Record<string, unknown> | undefined;
  return (
    <div className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30 px-5 py-4">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-[11px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors">
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {open ? 'Hide all fields' : 'See all fields'}
      </button>
      {open && sfRaw && (
        <div className="mt-2 border border-brand-navy-30/40 dark:border-ink-border-soft rounded-lg overflow-hidden">
          {Object.entries(sfRaw).map(([key, val]) => (
            <div key={key} className="flex justify-between gap-2 px-3 py-1.5 text-xs border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0 even:bg-gray-50 dark:bg-ink-0/60">
              <span className="text-brand-navy-70 dark:text-fg-2 flex-shrink-0 max-w-[45%]">{key}</span>
              <span className="text-brand-navy dark:text-fg-1 font-medium text-right break-words">{val === null || val === undefined || val === '' ? '—' : String(val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Visibility checks ── */
function shouldShowSection(section: DealInfoSection, opp: Opportunity, userRole: string | undefined): boolean {
  if (!section.visibility) return true;
  if (section.visibility === 'manager_or_has_value') {
    if (userRole === 'manager') return true;
    // Check if any field has a value
    return section.fields?.some(f => {
      const val = resolveFieldValue(opp, f);
      return val !== null && val !== undefined && val !== '';
    }) ?? false;
  }
  if (section.visibility.startsWith('has_value:')) {
    const key = section.visibility.split(':')[1];
    const val = (opp as unknown as Record<string, unknown>)[key];
    return val !== null && val !== undefined && val !== '';
  }
  return true;
}

/* ── Ensure computed sections always present ── */
function ensureComputedSections(cfg: DealInfoConfig): DealInfoConfig {
  const sections = [...cfg.sections];
  // Inject poc-rfx if missing — after deal-info-grid
  if (!sections.some(s => s.id === 'poc-rfx')) {
    const gridIdx = sections.findIndex(s => s.id === 'deal-info-grid');
    sections.splice(gridIdx + 1, 0, { id: 'poc-rfx', label: 'PoC & RFx', type: 'computed', defaultOpen: true });
  }
  // Strip poc_status / rfx_status from deal-info grid (now in their own section)
  return {
    sections: sections.map(s =>
      s.id === 'deal-info-grid' && s.fields
        ? { ...s, fields: s.fields.filter(f => f.key !== 'poc_status' && f.key !== 'rfx_status') }
        : s
    ),
  };
}

/* ── Main component ── */

interface DealInfoTabProps {
  opp: Opportunity;
  oppId: number;
  readOnly: boolean;
  onUpdate: () => void;
  scrollToSection: string | null;
  onScrollDone: () => void;
  configOverride?: DealInfoConfig;
  coachResult?: CoachResult | null;
}

export default function DealInfoTab({ opp, oppId, readOnly, onUpdate, scrollToSection, onScrollDone, configOverride, coachResult }: DealInfoTabProps) {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<DealInfoConfig>(ensureComputedSections(configOverride ?? cachedConfig ?? DEFAULT_CONFIG));
  const didFetch = useRef(false);

  // Use configOverride when provided (settings preview mode)
  useEffect(() => {
    if (configOverride) { setConfig(ensureComputedSections(configOverride)); return; }
  }, [configOverride]);

  useEffect(() => {
    if (configOverride) return; // skip fetch when using override
    if (didFetch.current && cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) return;
    didFetch.current = true;
    getDealInfoConfig()
      .then(resp => {
        cachedConfig = resp.config;
        cacheTimestamp = Date.now();
        setConfig(ensureComputedSections(resp.config));
      })
      .catch(() => { /* use default */ });
  }, [configOverride]);

  // Scroll-to-section support
  useEffect(() => {
    if (scrollToSection) {
      const timer = setTimeout(() => {
        const el = document.getElementById(scrollToSection);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        onScrollDone();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scrollToSection, onScrollDone]);

  return (
    <div className="max-w-[700px] mx-auto w-full space-y-4">
      {/* Open in SF */}
      <div className="flex items-center justify-between">
        <a
          href={`https://ataccama.lightning.force.com/lightning/r/Opportunity/${(opp as unknown as Record<string, unknown>).sf_opportunity_id}/view`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-brand-navy-30 text-[11px] font-medium text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 hover:border-brand-navy transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-[#00A1E0]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.8 5.4c-.7-.7-1.6-1.1-2.6-1.1-1.3 0-2.5.7-3.2 1.7C9.4 5.4 8.6 5 7.7 5 5.7 5 4 6.7 4 8.8c0 .4.1.8.2 1.2C3 10.7 2 12 2 13.5 2 15.4 3.6 17 5.5 17c.3 0 .5 0 .8-.1.5 1.4 1.8 2.4 3.4 2.4 1.3 0 2.4-.7 3-1.8.6.4 1.2.6 2 .6 1.3 0 2.4-.7 3-1.8.3.1.7.1 1.1.1C21 16.4 23 14.5 23 12c0-2-1.3-3.7-3.1-4.3-.7-1.3-2.1-2.3-3.6-2.3h-.5z"/>
          </svg>
          Open in Salesforce
          <svg className="w-2.5 h-2.5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>

      {/* Config-driven sections */}
      {config.sections.map(section => {
        if (!shouldShowSection(section, opp, user?.role)) return null;

        switch (section.type) {
          case 'grid':
            return <GridSection key={section.id} section={section} opp={opp} oppId={oppId} readOnly={readOnly} onUpdate={onUpdate} />;
          case 'collapsible':
            return <CollapsibleSection key={section.id} section={section} opp={opp} oppId={oppId} />;
          case 'computed':
            switch (section.id) {
              case 'poc-rfx': return <PocRfxSection key={section.id} opp={opp} />;
              case 'health-breakdown': return <HealthBreakdownSection key={section.id} opp={opp} />;
              case 'meddpicc': return <MeddpiccSection key={section.id} opp={opp} coachResult={coachResult} />;
              case 'see-all-fields': return <SeeAllFieldsSection key={section.id} opp={opp} />;
              default: return null;
            }
          default:
            return null;
        }
      })}
    </div>
  );
}

// Export for cache invalidation from settings page
export function invalidateDealInfoCache() {
  cachedConfig = null;
  cacheTimestamp = 0;
}
