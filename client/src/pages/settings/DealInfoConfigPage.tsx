import { useState, useEffect, useCallback, useRef } from 'react';
import type { DealInfoConfig, DealInfoFieldDef, AvailableField, Opportunity } from '../../types';
import { getDealInfoConfig, saveDealInfoConfig, resetDealInfoConfig } from '../../api/settings';
import { listOpportunities, getOpportunity } from '../../api/opportunities';
import { invalidateDealInfoCache } from '../../components/opportunity/DealInfoTab';
import DealInfoTab from '../../components/opportunity/DealInfoTab';

export default function DealInfoConfigPage() {
  const [config, setConfig] = useState<DealInfoConfig | null>(null);
  const [availableFields, setAvailableFields] = useState<AvailableField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showFieldPicker, setShowFieldPicker] = useState<string | null>(null);
  const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null);
  const [dragFieldState, setDragFieldState] = useState<{ sectionId: string; idx: number } | null>(null);

  // Preview state
  const [allOpps, setAllOpps] = useState<Opportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [loadingOpp, setLoadingOpp] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDealInfoConfig()
      .then(resp => { setConfig(resp.config); setAvailableFields(resp.available_fields); })
      .catch(() => setError('Failed to load configuration'))
      .finally(() => setLoading(false));
    // Load all opps for preview search
    listOpportunities({ include_qualify: true, limit: 2000 })
      .then(opps => {
        setAllOpps(opps);
        // Auto-select first opp with full detail
        if (opps.length > 0) selectOpp(opps[0].id);
      })
      .catch(() => { /* non-critical */ });
  }, []);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch full opp detail for accurate preview (includes sf_raw_fields)
  async function selectOpp(oppId: number) {
    setLoadingOpp(true);
    try {
      const full = await getOpportunity(oppId);
      setSelectedOpp(full);
    } catch {
      // Fall back to list version
      const listOpp = allOpps.find(o => o.id === oppId);
      if (listOpp) setSelectedOpp(listOpp);
    } finally {
      setLoadingOpp(false);
    }
  }

  const save = useCallback(async (newConfig: DealInfoConfig) => {
    setConfig(newConfig);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await saveDealInfoConfig(newConfig);
      invalidateDealInfoCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }, []);

  async function handleReset() {
    if (!confirm('Reset to default layout? This will undo all customizations.')) return;
    setSaving(true);
    try {
      const newConfig = await resetDealInfoConfig();
      setConfig(newConfig);
      invalidateDealInfoCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to reset');
    } finally {
      setSaving(false);
    }
  }

  /* ── Section operations ── */
  function moveSection(idx: number, dir: -1 | 1) {
    if (!config) return;
    const target = idx + dir;
    if (target < 0 || target >= config.sections.length) return;
    const next = [...config.sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    save({ sections: next });
  }

  function toggleSectionOpen(sectionId: string) {
    if (!config) return;
    save({
      sections: config.sections.map(s =>
        s.id === sectionId ? { ...s, defaultOpen: !s.defaultOpen } : s
      ),
    });
  }

  function removeSection(sectionId: string) {
    if (!config) return;
    if (!confirm('Remove this section from the Deal Info tab?')) return;
    save({ sections: config.sections.filter(s => s.id !== sectionId) });
  }

  function onDragSectionStart(idx: number) { setDragSectionIdx(idx); }
  function onDragSectionOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragSectionIdx === null || dragSectionIdx === idx || !config) return;
    const next = [...config.sections];
    const [moved] = next.splice(dragSectionIdx, 1);
    next.splice(idx, 0, moved);
    setDragSectionIdx(idx);
    setConfig({ sections: next });
  }
  function onDragSectionEnd() {
    setDragSectionIdx(null);
    if (config) save(config);
  }

  /* ── Field operations within a section ── */
  function moveField(sectionId: string, idx: number, dir: -1 | 1) {
    if (!config) return;
    const section = config.sections.find(s => s.id === sectionId);
    if (!section?.fields) return;
    const target = idx + dir;
    if (target < 0 || target >= section.fields.length) return;
    const fields = [...section.fields];
    [fields[idx], fields[target]] = [fields[target], fields[idx]];
    save({
      sections: config.sections.map(s =>
        s.id === sectionId ? { ...s, fields } : s
      ),
    });
  }

  function removeField(sectionId: string, fieldKey: string) {
    if (!config) return;
    save({
      sections: config.sections.map(s =>
        s.id === sectionId ? { ...s, fields: s.fields?.filter(f => f.key !== fieldKey) } : s
      ),
    });
  }

  function addField(sectionId: string, field: AvailableField) {
    if (!config) return;
    const newField: DealInfoFieldDef = {
      key: field.key,
      label: field.label,
      source: field.source,
      ...(field.format ? { format: field.format as DealInfoFieldDef['format'] } : {}),
    };
    save({
      sections: config.sections.map(s =>
        s.id === sectionId ? { ...s, fields: [...(s.fields ?? []), newField] } : s
      ),
    });
    setShowFieldPicker(null);
  }

  function onDragFieldStart(sectionId: string, idx: number) {
    setDragFieldState({ sectionId, idx });
  }
  function onDragFieldOver(e: React.DragEvent, sectionId: string, idx: number) {
    e.preventDefault();
    if (!dragFieldState || dragFieldState.sectionId !== sectionId || dragFieldState.idx === idx || !config) return;
    const section = config.sections.find(s => s.id === sectionId);
    if (!section?.fields) return;
    const fields = [...section.fields];
    const [moved] = fields.splice(dragFieldState.idx, 1);
    fields.splice(idx, 0, moved);
    setDragFieldState({ sectionId, idx });
    setConfig({
      sections: config.sections.map(s =>
        s.id === sectionId ? { ...s, fields } : s
      ),
    });
  }
  function onDragFieldEnd() {
    setDragFieldState(null);
    if (config) save(config);
  }

  /* ── Unused fields (not assigned to any section) ── */
  function getUsedFieldKeys(): Set<string> {
    if (!config) return new Set();
    const used = new Set<string>();
    for (const s of config.sections) {
      if (s.fields) s.fields.forEach(f => used.add(f.key));
    }
    return used;
  }

  /* ── Search filtering ── */
  const filteredOpps = searchQuery.trim().length > 0
    ? allOpps.filter(o =>
        o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.account_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 8)
    : allOpps.slice(0, 8);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!config) {
    return <p className="text-sm text-status-overdue p-4">Failed to load configuration.</p>;
  }

  const usedKeys = getUsedFieldKeys();

  return (
    <div className="flex gap-6 min-h-0">
      {/* LEFT: Config panel */}
      <div className="w-[480px] flex-shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-brand-navy">Deal Info Layout</h2>
            <p className="text-xs text-brand-navy-70 mt-0.5">Configure fields and sections. Changes apply to all users.</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-status-success font-medium">Saved</span>}
            {saving && <span className="text-xs text-brand-navy-70">Saving...</span>}
            {error && <span className="text-xs text-status-overdue">{error}</span>}
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium text-brand-navy-70 border border-brand-navy-30 rounded-lg hover:border-brand-navy hover:text-brand-navy transition-colors"
            >
              Reset to default
            </button>
          </div>
        </div>

        {/* Section list */}
        <div className="space-y-2">
          {config.sections.map((section, idx) => {
            const isExpanded = expandedSection === section.id;
            const typeLabel = section.type === 'grid' ? 'Grid' : section.type === 'computed' ? 'Special' : 'Collapsible';
            const typeBg = section.type === 'grid' ? 'bg-blue-50 text-blue-600' : section.type === 'computed' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-brand-navy-70';

            return (
              <div
                key={section.id}
                draggable
                onDragStart={() => onDragSectionStart(idx)}
                onDragOver={e => onDragSectionOver(e, idx)}
                onDragEnd={onDragSectionEnd}
                className={`bg-white rounded-xl border border-brand-navy-30/40 overflow-hidden ${
                  dragSectionIdx === idx ? 'opacity-40 ring-2 ring-brand-purple' : ''
                }`}
              >
                {/* Section header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Drag handle */}
                  <svg className="w-4 h-4 text-brand-navy-30 flex-shrink-0 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
                  </svg>

                  {/* Section name + type badge */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium text-brand-navy truncate">{section.label}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBg}`}>{typeLabel}</span>
                  </div>

                  {/* Default open toggle */}
                  <button
                    onClick={() => toggleSectionOpen(section.id)}
                    className={`text-[10px] font-medium px-2 py-1 rounded-md border transition-colors ${
                      section.defaultOpen
                        ? 'bg-brand-purple-30 text-brand-purple border-brand-purple/20'
                        : 'bg-gray-50 text-brand-navy-70 border-brand-navy-30/40'
                    }`}
                    title="Toggle default expanded/collapsed"
                  >
                    {section.defaultOpen ? 'Expanded' : 'Collapsed'}
                  </button>

                  {/* Up/Down */}
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveSection(idx, -1)} disabled={idx === 0}
                      className="p-1 text-brand-navy-30 hover:text-brand-navy disabled:opacity-20 transition-colors rounded">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button onClick={() => moveSection(idx, 1)} disabled={idx === config.sections.length - 1}
                      className="p-1 text-brand-navy-30 hover:text-brand-navy disabled:opacity-20 transition-colors rounded">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Expand fields (only for grid/collapsible) */}
                  {section.type !== 'computed' && (
                    <button
                      onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                      className="p-1 text-brand-navy-70 hover:text-brand-navy transition-colors rounded"
                      title="Edit fields"
                    >
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}

                  {/* Remove */}
                  <button onClick={() => removeSection(section.id)} className="p-1 text-brand-navy-30 hover:text-status-overdue transition-colors rounded" title="Remove section">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Expanded field list */}
                {isExpanded && section.type !== 'computed' && (
                  <div className="border-t border-brand-navy-30/20 bg-gray-50/50 px-4 py-3">
                    {section.fields && section.fields.length > 0 ? (
                      <div className="space-y-1">
                        {section.fields.map((field, fIdx) => (
                          <div
                            key={field.key}
                            draggable
                            onDragStart={() => onDragFieldStart(section.id, fIdx)}
                            onDragOver={e => onDragFieldOver(e, section.id, fIdx)}
                            onDragEnd={onDragFieldEnd}
                            className={`flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-brand-navy-30/30 ${
                              dragFieldState?.sectionId === section.id && dragFieldState.idx === fIdx ? 'opacity-40' : ''
                            }`}
                          >
                            <svg className="w-3.5 h-3.5 text-brand-navy-30 flex-shrink-0 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
                            </svg>
                            <span className="text-xs text-brand-navy font-medium flex-1">{field.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              field.source === 'column' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500'
                            }`}>
                              {field.source === 'column' ? 'DB' : 'SF Raw'}
                            </span>
                            {field.format && (
                              <span className="text-[10px] text-brand-navy-30">{field.format}</span>
                            )}
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => moveField(section.id, fIdx, -1)} disabled={fIdx === 0}
                                className="p-0.5 text-brand-navy-30 hover:text-brand-navy disabled:opacity-20">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button onClick={() => moveField(section.id, fIdx, 1)} disabled={fIdx === (section.fields?.length ?? 0) - 1}
                                className="p-0.5 text-brand-navy-30 hover:text-brand-navy disabled:opacity-20">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                            <button onClick={() => removeField(section.id, field.key)}
                              className="p-0.5 text-brand-navy-30 hover:text-status-overdue transition-colors">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-brand-navy-30 italic">No fields in this section</p>
                    )}

                    {/* Add field */}
                    <div className="mt-2 relative">
                      <button
                        onClick={() => setShowFieldPicker(showFieldPicker === section.id ? null : section.id)}
                        className="text-xs text-brand-purple font-medium hover:text-brand-purple-70 transition-colors"
                      >
                        + Add field
                      </button>

                      {showFieldPicker === section.id && (
                        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-brand-navy-30 rounded-xl shadow-lg w-[320px] max-h-[280px] overflow-y-auto">
                          <div className="sticky top-0 bg-white px-3 py-2 border-b border-brand-navy-30/20">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70">Available Fields</p>
                          </div>
                          {availableFields
                            .filter(f => !usedKeys.has(f.key))
                            .map(f => (
                              <button
                                key={`${f.source}-${f.key}`}
                                onClick={() => addField(section.id, f)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-brand-purple-30/30 transition-colors flex items-center gap-2 border-b border-brand-navy-30/10 last:border-0"
                              >
                                <span className="text-brand-navy font-medium flex-1">{f.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  f.source === 'column' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500'
                                }`}>
                                  {f.source === 'column' ? 'DB' : 'SF Raw'}
                                </span>
                              </button>
                            ))
                          }
                          {availableFields.filter(f => !usedKeys.has(f.key)).length === 0 && (
                            <p className="px-3 py-4 text-xs text-brand-navy-30 text-center">All fields are assigned</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Computed section info */}
                {isExpanded && section.type === 'computed' && (
                  <div className="border-t border-brand-navy-30/20 bg-gray-50/50 px-4 py-3">
                    <p className="text-xs text-brand-navy-70 italic">This section is rendered by a special component and cannot be customized.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Info text at bottom */}
        <div className="mt-4 px-1">
          <p className="text-[11px] text-brand-navy-70 leading-relaxed">
            <strong>Grid</strong> sections display fields in a 2-column layout. <strong>Collapsible</strong> sections show content in expandable blocks. <strong>Special</strong> sections (Health Score, MEDDPICC, See All Fields) have fixed content but can be reordered or removed.
          </p>
        </div>
      </div>

      {/* RIGHT: Live Preview */}
      <div className="flex-1 min-w-[400px] flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-brand-navy">Live Preview</h3>
          {selectedOpp && (
            <span className="text-[10px] text-brand-navy-70">Updates as you edit</span>
          )}
        </div>

        {/* Opportunity search */}
        <div ref={searchRef} className="relative mb-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-navy-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search opportunities to preview..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-brand-navy-30/60 rounded-lg bg-white focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/30 placeholder:text-brand-navy-30"
            />
          </div>

          {/* Search dropdown */}
          {searchOpen && filteredOpps.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-brand-navy-30 rounded-xl shadow-lg max-h-[240px] overflow-y-auto">
              {filteredOpps.map(o => (
                <button
                  key={o.id}
                  onClick={() => { selectOpp(o.id); setSearchQuery(''); setSearchOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-brand-purple-30/30 transition-colors border-b border-brand-navy-30/10 last:border-0 flex items-center gap-3 ${
                    selectedOpp?.id === o.id ? 'bg-brand-purple-30/20' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-brand-navy font-medium truncate">{o.name}</p>
                    <p className="text-brand-navy-70 text-[10px] truncate">{o.account_name} &middot; {o.stage}</p>
                  </div>
                  {o.arr != null && (
                    <span className="text-[10px] text-brand-navy-70 flex-shrink-0">
                      ${(o.arr / 1000).toFixed(0)}k
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected opp pill */}
        {selectedOpp && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-brand-purple-30/30 rounded-lg border border-brand-purple/10">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-brand-navy font-medium truncate">{selectedOpp.name}</p>
              <p className="text-[10px] text-brand-navy-70 truncate">{selectedOpp.account_name} &middot; {selectedOpp.stage}</p>
            </div>
            <button
              onClick={() => setSelectedOpp(null)}
              className="p-1 text-brand-navy-30 hover:text-brand-navy transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Preview content */}
        {loadingOpp ? (
          <div className="flex-1 flex items-center justify-center rounded-xl border border-brand-navy-30/40 bg-gray-50/50">
            <div className="w-5 h-5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
          </div>
        ) : selectedOpp ? (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-brand-navy-30/40 bg-gray-50/50 p-4">
            <DealInfoTab
              opp={selectedOpp}
              oppId={selectedOpp.id}
              readOnly={true}
              onUpdate={() => {}}
              scrollToSection={null}
              onScrollDone={() => {}}
              configOverride={config}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-brand-navy-30 bg-gray-50/30">
            <div className="text-center py-12">
              <svg className="w-10 h-10 mx-auto text-brand-navy-30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p className="text-xs text-brand-navy-70">Search for an opportunity above to see a live preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
