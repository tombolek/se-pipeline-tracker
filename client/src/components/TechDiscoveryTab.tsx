/**
 * Tech Discovery tab — structured storage for the technical side of a deal:
 * prose notes, data initiatives checklist, and technology stack multi-select.
 *
 * Backed by `opportunity_tech_discovery` (migration 044). Writes are
 * per-section auto-saved on blur; JSONB sections (initiatives, tech_stack,
 * etc.) send the full object each time.
 *
 * Offline behaviour: network-only reads and writes for v1. No IndexedDB
 * cache. If we later want this viewable off-VPN we can wire it into the
 * existing cacheRead() pattern.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';

// ── Types ───────────────────────────────────────────────────────────────────

interface TechDiscovery {
  opportunity_id: number;
  current_incumbent_solutions: string | null;
  tier1_integrations: string | null;
  data_details_and_users: string | null;
  ingestion_sources: string | null;
  planned_ingestion_sources: string | null;
  data_cleansing_remediation: string | null;
  deployment_preference: string | null;
  technical_constraints: string | null;
  open_technical_requirements: string | null;
  tech_stack: Record<string, string[] | Record<string, string>>;
  enterprise_systems: Record<string, string>;
  existing_dmg: Record<string, string>;
  updated_by_id: number | null;
  created_at: string;
  updated_at: string;
}

// ── Static option definitions (mirror the PPTX template) ────────────────────

const PROSE_SECTIONS: { key: keyof TechDiscovery; label: string; hint: string }[] = [
  { key: 'current_incumbent_solutions', label: 'Current & Incumbent Solutions', hint: 'Home-grown or competing vendor(s); history; technologies in use.' },
  { key: 'tier1_integrations',          label: 'Priority (Tier 1) Integrations', hint: 'Existing catalogs, lineage, or other metadata systems in the ecosystem.' },
  { key: 'data_details_and_users',      label: 'Data Details & Users', hint: 'Expected systems, processed assets, named users, domains, formats, types.' },
  { key: 'ingestion_sources',           label: 'Ingestion Sources', hint: 'Systems/apps/technologies with assets to be profiled, DQ-checked, lineage-scanned, etc. Flag must-have vs nice-to-have lineage connectors.' },
  { key: 'planned_ingestion_sources',   label: 'Planned Ingestion Sources', hint: 'Planned/future changes or updates to the AS-IS state above.' },
  { key: 'data_cleansing_remediation',  label: 'Data Cleansing & Remediation', hint: 'Manual issue management (native vs. integration)? Need for automated data correction?' },
  { key: 'deployment_preference',       label: 'Deployment Preference', hint: 'Challenges/objections to Ataccama Cloud (VPN, PrivateLink, InfoSec, regulatory, data residency, etc.).' },
  { key: 'technical_constraints',       label: 'Technical Constraints', hint: 'Security, compliance, scalability, and other requirements.' },
  { key: 'open_technical_requirements', label: 'Open Technical Requirements', hint: 'Unresolved technical requirements. Areas requiring further clarification.' },
];

const TECH_STACK_GROUPS: { key: string; heading: string; options: string[]; allowOther?: boolean }[] = [
  { key: 'data_infrastructure', heading: 'Data Infrastructure', options: ['AWS', 'Azure', 'GCP', 'On-premise', 'Hybrid'], allowOther: true },
  { key: 'data_lake',           heading: 'Data Lake',           options: ['S3', 'GCS', 'ADLS', 'Cloudera'], allowOther: true },
  { key: 'data_lake_metastore', heading: 'Data Lake Metastore', options: ['Glue', 'Hive', 'Delta Lake'], allowOther: true },
  { key: 'data_warehouse',      heading: 'Data Warehouse',      options: ['Snowflake', 'Redshift', 'BigQuery', 'Databricks', 'Synapse'], allowOther: true },
  { key: 'database',            heading: 'Database',            options: ['MySQL', 'Postgres', 'SQL Server', 'SAP HANA', 'Oracle', 'MongoDB', 'DynamoDB', 'Azure SQL'], allowOther: true },
  { key: 'datalake_processing', heading: 'Datalake Processing', options: ['Spark', 'Athena', 'Trino', 'Presto', 'Starburst'], allowOther: true },
  { key: 'etl',                 heading: 'ETL / ELT / Ingestion', options: ['SSIS', 'PowerCenter', 'dbt', 'Matillion', 'Coalesce', 'Fivetran'], allowOther: true },
  { key: 'business_intelligence', heading: 'Business Intelligence', options: ['Power BI', 'Qlik', 'Tableau', 'MicroStrategy', 'Looker'], allowOther: true },
  { key: 'nosql',               heading: 'NoSQL',               options: ['MongoDB', 'DynamoDB', 'Cosmos DB'], allowOther: true },
  { key: 'streaming',           heading: 'Streaming',           options: ['Kafka', 'SQS'], allowOther: true },
];

const ENTERPRISE_FIELDS: { key: string; label: string }[] = [
  { key: 'crm',               label: 'CRM' },
  { key: 'erp',               label: 'ERP' },
  { key: 'finance',           label: 'Finance System' },
  { key: 'hr',                label: 'HR System' },
  { key: 'claims',            label: 'Claims System' },
  { key: 'marketing',         label: 'Marketing' },
  { key: 'procurement',       label: 'Procurement' },
  { key: 'inventory_management', label: 'Inventory Management' },
  { key: 'order_management',  label: 'Order Management' },
];

const DMG_FIELDS: { key: string; label: string }[] = [
  { key: 'catalog', label: 'Catalog' },
  { key: 'dq',      label: 'DQ' },
  { key: 'mdm',     label: 'MDM' },
  { key: 'lineage', label: 'Lineage' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function Textarea({ value, onBlurSave, hint, disabled }: {
  value: string | null;
  onBlurSave: (next: string | null) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <div>
      <textarea
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== (value ?? '')) onBlurSave(local.trim() === '' ? null : local); }}
        rows={2}
        disabled={disabled}
        className="w-full text-[12px] text-brand-navy dark:text-fg-1 px-3 py-2 rounded-lg border border-brand-navy-30/60 dark:border-ink-border focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {hint && <p className="text-[10px] text-brand-navy-70 dark:text-fg-2 mt-0.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function Chip({ selected, onClick, disabled, children }: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
        selected
          ? 'bg-brand-purple-30 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple border-brand-purple/40 dark:border-accent-purple/40 font-semibold'
          : 'bg-white dark:bg-ink-1 text-brand-navy-70 dark:text-fg-2 border-brand-navy-30 hover:border-brand-purple/40 dark:hover:border-accent-purple/40 hover:text-brand-navy'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function SpecifyField({ value, onBlurSave, placeholder, disabled }: {
  value: string | null | undefined;
  onBlurSave: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== (value ?? '')) onBlurSave(local); }}
      disabled={disabled}
      placeholder={placeholder}
      className="text-[11px] text-brand-navy dark:text-fg-1 px-2 py-1 rounded border border-brand-navy-30/60 dark:border-ink-border focus:outline-none focus:border-brand-purple min-w-0 w-full disabled:opacity-60"
    />
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TechDiscoveryTab({ oppId, readOnly = false }: { oppId: number; oppName?: string; readOnly?: boolean }) {
  const [data, setData] = useState<TechDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFlash, setSavingFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get<ApiResponse<TechDiscovery>>(`/opportunities/${oppId}/tech-discovery`);
      setData(r.data.data);
      setError(null);
    } catch {
      setError('Failed to load Tech Discovery');
    } finally {
      setLoading(false);
    }
  }, [oppId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const save = useCallback(async (patch: Partial<TechDiscovery>) => {
    try {
      const r = await api.patch<ApiResponse<TechDiscovery>>(`/opportunities/${oppId}/tech-discovery`, patch);
      setData(r.data.data);
      setSavingFlash(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setSavingFlash(false), 1800);
    } catch (e) {
      setError((e as Error).message ?? 'Save failed');
    }
  }, [oppId]);

  const techStack = useMemo(() => (data?.tech_stack ?? {}) as Record<string, string[] | Record<string, string>>, [data]);
  const enterpriseSystems = useMemo(() => (data?.enterprise_systems ?? {}) as Record<string, string>, [data]);
  const existingDmg = useMemo(() => (data?.existing_dmg ?? {}) as Record<string, string>, [data]);

  function toggleTechStack(categoryKey: string, option: string) {
    const current = (techStack[categoryKey] as string[] | undefined) ?? [];
    const hasIt = current.includes(option);
    const nextCategory = hasIt ? current.filter(x => x !== option) : [...current, option];
    const next = { ...techStack, [categoryKey]: nextCategory };
    save({ tech_stack: next });
  }

  function setTechStackOther(categoryKey: string, value: string) {
    const otherSpecify = (techStack.other_specify as Record<string, string> | undefined) ?? {};
    const nextOther = { ...otherSpecify };
    if (value.trim()) nextOther[categoryKey] = value.trim();
    else delete nextOther[categoryKey];
    const next = { ...techStack, other_specify: nextOther };
    save({ tech_stack: next });
  }

  function setEnterpriseSystem(key: string, value: string) {
    const next = { ...enterpriseSystems };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    save({ enterprise_systems: next });
  }

  function setExistingDmg(key: string, value: string) {
    const next = { ...existingDmg };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    save({ existing_dmg: next });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => <div key={i} className="h-28 bg-gray-50 dark:bg-ink-2 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 dark:bg-status-d-overdue-soft border border-red-200 rounded-xl px-4 py-3 text-[12px] text-red-700">
        {error ?? 'No data'}
      </div>
    );
  }

  const anyActivity = !!data.updated_by_id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Tech Discovery</h2>
          <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-0.5 leading-relaxed max-w-2xl">
            Structured capture of the technical side of this deal — inspired by the Technical Discovery Document template. Fill in what you know after each discovery call; it feeds Similar Deals scoring (shared tech stack) and Call Prep context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savingFlash && <span className="text-[10px] text-status-success dark:text-status-d-success font-semibold">Saved</span>}
          {anyActivity && <span className="text-[10px] text-brand-navy-70 dark:text-fg-2">Last updated {new Date(data.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
        </div>
      </div>

      {/* Section 1: Discovery Notes */}
      <section className="bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-[#F5F5F7] dark:bg-ink-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2">Discovery Notes</h3>
        </div>
        <div className="px-4 py-3 space-y-3">
          {PROSE_SECTIONS.map(s => (
            <div key={String(s.key)} data-cite-target={`td:${String(s.key)}`}>
              <label className="text-[11px] font-semibold text-brand-navy dark:text-fg-1 block mb-1">{s.label}</label>
              <Textarea
                value={data[s.key] as string | null}
                onBlurSave={next => save({ [s.key]: next } as Partial<TechDiscovery>)}
                hint={s.hint}
                disabled={readOnly}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Technology Stack */}
      <section className="bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-[#F5F5F7] dark:bg-ink-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2">Technology Stack</h3>
        </div>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {TECH_STACK_GROUPS.map(g => {
            const selected = (techStack[g.key] as string[] | undefined) ?? [];
            const otherSpecify = (techStack.other_specify as Record<string, string> | undefined) ?? {};
            return (
              <div key={g.key}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2 mb-1.5">{g.heading}</p>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {g.options.map(opt => (
                    <Chip
                      key={opt}
                      selected={selected.includes(opt)}
                      onClick={() => toggleTechStack(g.key, opt)}
                      disabled={readOnly}
                    >
                      {opt}
                    </Chip>
                  ))}
                </div>
                {g.allowOther && (
                  <SpecifyField
                    value={otherSpecify[g.key] ?? ''}
                    onBlurSave={v => setTechStackOther(g.key, v)}
                    placeholder="Other (specify)…"
                    disabled={readOnly}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Enterprise systems + existing DMG */}
      <section className="bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-[#F5F5F7] dark:bg-ink-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2">Enterprise Systems & Existing Data Management Tools</h3>
        </div>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2 mb-1.5">Enterprise Software</p>
            <div className="space-y-1.5">
              {ENTERPRISE_FIELDS.map(f => (
                <div key={f.key} className="grid grid-cols-[110px,1fr] items-center gap-2">
                  <span className="text-[11px] text-brand-navy-70 dark:text-fg-2">{f.label}</span>
                  <SpecifyField
                    value={enterpriseSystems[f.key] ?? ''}
                    onBlurSave={v => setEnterpriseSystem(f.key, v)}
                    placeholder="Specify vendor / product…"
                    disabled={readOnly}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2 mb-1.5">Existing Data Mgmt & Governance</p>
            <div className="space-y-1.5">
              {DMG_FIELDS.map(f => (
                <div key={f.key} className="grid grid-cols-[110px,1fr] items-center gap-2">
                  <span className="text-[11px] text-brand-navy-70 dark:text-fg-2">{f.label}</span>
                  <SpecifyField
                    value={existingDmg[f.key] ?? ''}
                    onBlurSave={v => setExistingDmg(f.key, v)}
                    placeholder="Specify vendor / product…"
                    disabled={readOnly}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <p className="text-[10px] text-brand-navy-70 dark:text-fg-2 leading-relaxed">
        Auto-saves on blur. Tech-stack selections factor into Similar Deals scoring — a deal sharing Snowflake or dbt with this one will rank higher.
      </p>
    </div>
  );
}
