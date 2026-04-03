
// ── Section IDs (used for ToC anchors) ───────────────────────────────────────
const SECTIONS = [
  { id: 'pipeline',    label: 'Pipeline' },
  { id: 'closed-lost', label: 'Closed Lost' },
  { id: 'my-tasks',    label: 'My Tasks' },
  { id: 'inbox',       label: 'Inbox & Quick Capture' },
  { id: 'se-mapping',  label: 'SE Deal Mapping' },
  { id: 'poc-board',   label: 'PoC Board' },
  { id: 'rfx-board',   label: 'RFx Board' },
  { id: 'insights',    label: 'Insights (Manager)' },
  { id: 'settings',    label: 'Settings (Manager)' },
];

// ── Layout components ────────────────────────────────────────────────────────

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold text-brand-navy mt-10 mb-3 pt-2 border-t border-brand-navy-30/40 first:border-0 first:mt-0 scroll-mt-4">
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-brand-navy mt-5 mb-1.5">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-brand-navy-70 leading-relaxed mb-2">{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-inside space-y-1 text-sm text-brand-navy-70 mb-3 pl-1">{children}</ul>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

function Badge({ color, children }: { color: 'purple' | 'pink' | 'green' | 'amber' | 'red' | 'gray'; children: React.ReactNode }) {
  const cls = {
    purple: 'bg-brand-purple/10 text-brand-purple border-brand-purple/30',
    pink:   'bg-brand-pink/10 text-brand-pink border-brand-pink/30',
    green:  'bg-green-100 text-green-700 border-green-200',
    amber:  'bg-amber-100 text-amber-700 border-amber-200',
    red:    'bg-red-100 text-red-600 border-red-200',
    gray:   'bg-gray-100 text-gray-500 border-gray-200',
  }[color];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      {children}
    </span>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-brand-purple-30/30 border border-brand-purple/20 rounded-lg px-4 py-3 text-sm text-brand-navy-70 leading-relaxed mb-4">
      {children}
    </div>
  );
}

function RoleTag({ role }: { role: 'manager' | 'se' | 'all' }) {
  if (role === 'all') return <Badge color="gray">All users</Badge>;
  if (role === 'manager') return <Badge color="pink">Manager only</Badge>;
  return <Badge color="purple">SE</Badge>;
}

// ── Table of Contents ────────────────────────────────────────────────────────

function ToC() {
  return (
    <nav className="bg-white border border-brand-navy-30/40 rounded-xl px-5 py-4 mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-3">Table of Contents</p>
      <ol className="space-y-1.5">
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="flex items-center gap-2 text-sm text-brand-navy-70 hover:text-brand-purple transition-colors"
            >
              <span className="w-5 text-right text-[11px] text-brand-navy-30 font-mono">{i + 1}.</span>
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HowToPage() {
  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-brand-navy">User Guide</h1>
        <p className="text-sm text-brand-navy-70 mt-1">How to use the SE Pipeline Tracker — page by page.</p>
      </div>

      <ToC />

      {/* ── 1. Pipeline ── */}
      <SectionTitle id="pipeline">1. Pipeline</SectionTitle>
      <RoleTag role="all" />
      <P>The Pipeline is your main view of all active (open) Salesforce opportunities.</P>

      <SubTitle>Default filter</SubTitle>
      <P>By default the pipeline shows <strong>Build Value and above</strong> — Qualify-stage deals are hidden. Click the <em>Qualify</em> toggle in the filter bar to include them. This preference is saved per user.</P>

      <SubTitle>Filters & search</SubTitle>
      <Ul>
        <Li><strong>Stage</strong> — multi-select, all stages checked by default. Uncheck any to hide that stage.</Li>
        <Li><strong>Fiscal Period</strong> — same multi-select behaviour as Stage.</Li>
        <Li><strong>Search</strong> — live text filter on opportunity name and account name.</Li>
        <Li><strong>Columns</strong> — choose which columns are visible; preference is saved.</Li>
      </Ul>

      <SubTitle>SE Comments freshness</SubTitle>
      <P>Each row shows a coloured dot indicating how recently the SE Comments field was updated in Salesforce:</P>
      <div className="flex items-center gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> Updated ≤ 7 days ago</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 8 – 21 days</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> 21+ days</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" /> Never</span>
      </div>

      <SubTitle>Opportunity detail</SubTitle>
      <P>Click any row to open the detail side panel. It has two columns:</P>
      <Ul>
        <Li><strong>Left</strong> — working area: Next Steps, Tasks, and Notes. This is where you add and complete work.</Li>
        <Li><strong>Right</strong> — read-only Salesforce fields: Deal Info, Next Step (SF), Manager Comments, SE Comments, Technical Blockers. Drag the divider between the two columns to resize.</Li>
      </Ul>
      <P>The <strong>AI Summary</strong> button generates a short briefing from the opportunity metadata, tasks, notes, and SE comments.</P>

      {/* ── 2. Closed Lost ── */}
      <SectionTitle id="closed-lost">2. Closed Lost</SectionTitle>
      <RoleTag role="all" />
      <P>Lists every opportunity that has disappeared from the Salesforce import — meaning the deal was marked Closed Lost in SF.</P>

      <SubTitle>Unread badge</SubTitle>
      <P>A pink badge on the sidebar item counts deals you haven't seen yet. Opening the tab automatically marks all visible records as read. You can also open an individual opportunity to mark it read.</P>

      <SubTitle>Closed date</SubTitle>
      <P>The <em>Closed</em> column shows the exact date and time the deal was last seen in a Salesforce import. Sorted most-recently-closed first.</P>

      <InfoBox>Tasks and notes on closed-lost opportunities are visible in read-only mode — nothing can be edited once a deal is closed.</InfoBox>

      {/* ── 3. My Tasks ── */}
      <SectionTitle id="my-tasks">3. My Tasks</SectionTitle>
      <RoleTag role="all" />
      <P>All open and in-progress tasks assigned to you, across every opportunity, in one place.</P>
      <Ul>
        <Li>Grouped by urgency: <strong>Overdue → Due Today → This Week → Later</strong></Li>
        <Li>Tick the checkbox to complete a task inline without opening the opportunity.</Li>
        <Li>Click an opportunity name to jump straight to its detail view.</Li>
      </Ul>

      {/* ── 4. Inbox ── */}
      <SectionTitle id="inbox">4. Inbox & Quick Capture</SectionTitle>
      <RoleTag role="all" />
      <P>A personal scratch pad for capturing thoughts before they're linked to a deal.</P>

      <SubTitle>Quick Capture</SubTitle>
      <P>Press <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl+K</kbd> (or <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">⌘K</kbd> on Mac) from anywhere in the app to open the Quick Capture modal. Type your note or task, optionally link it to an opportunity, then submit.</P>
      <Ul>
        <Li><strong>Linked + type = Note</strong> → saved directly as a note on that opportunity.</Li>
        <Li><strong>Linked + type = Task</strong> → saved directly as a task on that opportunity.</Li>
        <Li><strong>Not linked</strong> → saved as a standalone Inbox item for later.</Li>
      </Ul>

      <SubTitle>Inbox page</SubTitle>
      <P>Lists all unlinked jots. From here you can link a jot to an opportunity (converting it to a task or note), mark a todo done, or delete it. The sidebar badge counts unresolved items.</P>

      {/* ── 5. SE Mapping ── */}
      <SectionTitle id="se-mapping">5. SE Deal Mapping</SectionTitle>
      <RoleTag role="all" />
      <P>A dedicated view for managing which SE owns each opportunity — the SE Deal Mapping table.</P>

      <SubTitle>Who can assign whom?</SubTitle>
      <div className="overflow-hidden rounded-xl border border-brand-navy-30/40 mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-navy-30/20 text-left">
              <th className="px-4 py-2.5 font-semibold text-brand-navy-70 text-xs uppercase tracking-wide">Role</th>
              <th className="px-4 py-2.5 font-semibold text-brand-navy-70 text-xs uppercase tracking-wide">Can assign</th>
              <th className="px-4 py-2.5 font-semibold text-brand-navy-70 text-xs uppercase tracking-wide">Restriction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-navy-30/30">
            <tr className="bg-white">
              <td className="px-4 py-2.5"><Badge color="pink">Manager</Badge></td>
              <td className="px-4 py-2.5 text-brand-navy-70">Any active SE to any deal</td>
              <td className="px-4 py-2.5 text-brand-navy-70">None</td>
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2.5"><Badge color="purple">SE</Badge></td>
              <td className="px-4 py-2.5 text-brand-navy-70">Themselves only</td>
              <td className="px-4 py-2.5 text-brand-navy-70">Can only add themselves to an unassigned deal, or remove themselves from a deal they own. Cannot assign another SE.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <SubTitle>Filters</SubTitle>
      <Ul>
        <Li><strong>Search</strong> — filter by opportunity name or account name.</Li>
        <Li><strong>Stage</strong> — multi-select stage filter.</Li>
        <Li><strong>Fiscal Period</strong> — multi-select fiscal period filter.</Li>
        <Li><strong>SE buttons</strong> — quickly show All deals, Unassigned deals, or deals for a specific SE.</Li>
      </Ul>

      {/* ── 6. PoC Board ── */}
      <SectionTitle id="poc-board">6. PoC Board</SectionTitle>
      <RoleTag role="manager" />
      <P>A kanban-style board showing all active opportunities with a PoC status set in Salesforce. Columns correspond to PoC stages (Identified, In Progress, In Deployment, Completed, etc.).</P>
      <Ul>
        <Li>Only shows <strong>active (open)</strong> opportunities — closed-lost deals are excluded.</Li>
        <Li>PoC dates are pulled from Salesforce. Overdue end dates are highlighted in red.</Li>
        <Li>Click any card to open the full opportunity detail.</Li>
      </Ul>

      {/* ── 7. RFx Board ── */}
      <SectionTitle id="rfx-board">7. RFx Board</SectionTitle>
      <RoleTag role="manager" />
      <P>A kanban board for active opportunities with an RFx status (RFP, RFI, RFQ, etc.) in Salesforce. Cards are grouped by their RFx stage.</P>
      <Ul>
        <Li>Only shows <strong>active (open)</strong> opportunities — closed-lost deals are excluded.</Li>
        <Li>Click any card to open the full opportunity detail.</Li>
      </Ul>

      {/* ── 8. Insights ── */}
      <SectionTitle id="insights">8. Insights</SectionTitle>
      <RoleTag role="manager" />
      <P>A set of manager-only intelligence views for spotting issues across the team.</P>

      <SubTitle>Stage Movement</SubTitle>
      <P>Shows opportunities whose Salesforce stage changed in the last 7, 14, or 30 days (toggle in the top-right). Useful for tracking pipeline velocity and catching unexpected stage drops.</P>

      <SubTitle>Missing Notes</SubTitle>
      <P>Lists deals where the SE has not updated their SE Comments in Salesforce for longer than a configurable threshold (default 21 days), sorted from most stale to least. Use this to chase SEs for deal updates.</P>

      <SubTitle>Team Workload</SubTitle>
      <P>Per-SE summary: number of assigned opportunities, open tasks, overdue tasks, and next steps. Helps spot when someone is overloaded or has deals going unmanaged.</P>

      <SubTitle>Overdue Tasks</SubTitle>
      <P>All overdue tasks across the entire team, grouped by SE. Filters to focus on a specific SE are available.</P>

      <SubTitle>Other views</SubTitle>
      <P>Additional insight views (Deploy Mode, Closed Lost Stats, etc.) may be toggled on/off via <strong>Settings → Insights Menu</strong>.</P>

      {/* ── 9. Settings ── */}
      <SectionTitle id="settings">9. Settings</SectionTitle>
      <RoleTag role="manager" />

      <SubTitle>Users</SubTitle>
      <P>Create and manage SE and Manager accounts. You can deactivate users (they lose access but historical data is preserved) or update their names and roles. Passwords can be reset here.</P>

      <SubTitle>Import</SubTitle>
      <P>Upload a Salesforce Opportunities report (the standard <em>.xls</em> export) to sync deal data. The importer:</P>
      <Ul>
        <Li>Updates all SF-owned fields on existing opportunities.</Li>
        <Li>Creates new records for SF IDs not seen before.</Li>
        <Li>Marks deals as Closed Lost when their SF ID is absent from the import (triggers the unread badge on Closed Lost).</Li>
        <Li>Never touches tasks, notes, or SE assignments — those are always preserved.</Li>
      </Ul>
      <InfoBox><strong>First import tip:</strong> the very first import establishes the baseline. Any deal not in that file will immediately be flagged as Closed Lost, so make sure the first upload contains all currently-open opportunities.</InfoBox>

      <SubTitle>Import History</SubTitle>
      <P>A log of every import: timestamp, filename, how many records were added, updated, or closed, and any errors. Useful for auditing and troubleshooting.</P>

      <SubTitle>Insights Menu</SubTitle>
      <P>Configure which insight views appear in the sidebar under the <em>Insights</em> section. Toggle individual views on or off; reorder them by dragging.</P>

      <div className="h-8" />
    </div>
  );
}
