
// ── Section IDs (used for ToC anchors) ───────────────────────────────────────
const SECTIONS = [
  { id: 'pipeline',    label: 'Pipeline' },
  { id: 'home',        label: 'Home / Daily Digest' },
  { id: 'closed-lost', label: 'Closed Lost' },
  { id: 'my-tasks',    label: 'My Tasks' },
  { id: 'my-pipeline', label: 'My Pipeline' },
  { id: 'calendar',    label: 'Calendar' },
  { id: 'inbox',       label: 'Inbox & Quick Capture' },
  { id: 'se-mapping',  label: 'SE Deal Mapping' },
  { id: 'poc-board',   label: 'PoC Board' },
  { id: 'rfx-board',   label: 'RFx Board' },
  { id: 'insights',    label: 'Insights (Manager)' },
  { id: 'settings',    label: 'Settings (Manager)' },
  { id: 'audit',       label: 'Audit (Manager)' },
  { id: 'ai-features', label: 'AI Features' },
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
        <Li><strong>Columns</strong> — choose which columns are visible and reorder them; preference is saved per user.</Li>
      </Ul>

      <SubTitle>SE Comments freshness</SubTitle>
      <P>Each row shows a coloured dot indicating how recently the SE Comments field was updated in Salesforce:</P>
      <div className="flex items-center gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> Updated ≤ 7 days ago</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 8 – 21 days</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> 21+ days</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" /> Never</span>
      </div>

      <SubTitle>Deal Health Score</SubTitle>
      <P>Every opportunity has a <strong>Health Score from 0 to 100</strong>, visible as a coloured indicator in the pipeline list and as a progress bar at the top of the opportunity detail panel.</P>
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-status-success inline-block" /> <strong>Green</strong> — 70 – 100 (Healthy)</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-status-warning inline-block" /> <strong>Amber</strong> — 40 – 69 (Needs attention)</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-status-overdue inline-block" /> <strong>Red</strong> — 0 – 39 (At risk)</span>
      </div>
      <P>The score starts at 100 and deductions are applied across five factors:</P>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-brand-navy-30/40">
              <th className="text-left py-2 pr-4 text-xs font-semibold text-brand-navy-70 uppercase tracking-wide">Factor</th>
              <th className="text-left py-2 pr-4 text-xs font-semibold text-brand-navy-70 uppercase tracking-wide">Max deduction</th>
              <th className="text-left py-2 text-xs font-semibold text-brand-navy-70 uppercase tracking-wide">Logic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-navy-30/20">
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy">MEDDPICC completeness</td>
              <td className="py-2 pr-4 text-brand-navy-70">−30</td>
              <td className="py-2 text-brand-navy-70">−3.3 pts for each of the 9 MEDDPICC fields that is blank</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy">SE Comments freshness</td>
              <td className="py-2 pr-4 text-brand-navy-70">−25</td>
              <td className="py-2 text-brand-navy-70">0 if ≤7d · −10 if 8–21d · −20 if &gt;21d · −25 if never updated</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy">Note freshness</td>
              <td className="py-2 pr-4 text-brand-navy-70">−20</td>
              <td className="py-2 text-brand-navy-70">0 if ≤14d · −10 if 15–30d · −20 if &gt;30d or no notes ever</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy">Overdue tasks</td>
              <td className="py-2 pr-4 text-brand-navy-70">−20</td>
              <td className="py-2 text-brand-navy-70">−5 per overdue task, capped at 4 tasks (−20 max)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy">Time in current stage</td>
              <td className="py-2 pr-4 text-brand-navy-70">−15</td>
              <td className="py-2 text-brand-navy-70">0 if &lt;30d · −10 if 30–60d · −15 if &gt;60d in the same stage</td>
            </tr>
          </tbody>
        </table>
      </div>
      <P>Hover over the score in the pipeline list to see a tooltip with the exact breakdown. In the opportunity detail, click the health bar to expand the full factor list with explanations. Use the <strong>At-risk only</strong> filter button in the pipeline to instantly surface all Red and Amber deals.</P>

      <SubTitle>Opportunity detail</SubTitle>
      <P>Click any row to open the detail side panel. The header shows the opportunity name, account name (clickable to open Account History), current stage, ARR, close date, a <Badge color="green">Health score</Badge> pill, a <Badge color="purple">MEDDPICC score</Badge> pill, a Coach lightbulb button, and a Summarize button.</P>

      <P><strong>AI Summary</strong> — a collapsible panel below the header. Shows a freshness indicator (e.g. "Generated 2h ago"). The summary is persisted server-side and can be regenerated on demand with the Regenerate button.</P>

      <P><strong>MEDDPICC Gap Coach</strong> — a second collapsible panel below the AI Summary. Shows per-element analysis with Green/Amber/Red ratings, evidence, gaps, and suggested discovery questions.</P>

      <P>The detail view has <strong>4 tabs</strong>:</P>
      <Ul>
        <Li><strong>Work</strong> — tasks, notes, and the Meeting Notes Processor (paste raw call notes and let AI extract structured outputs).</Li>
        <Li><strong>Timeline</strong> — unified event history across tasks, notes, stage changes, and SF field updates in chronological order.</Li>
        <Li><strong>Call Prep</strong> — AI-generated pre-call brief with talking points, risk areas, questions, customer stories, and differentiator plays. Includes a PDF export button.</Li>
        <Li><strong>Deal Info</strong> — configurable Salesforce fields (layout managed in Settings), MEDDPICC scores with an "Show AI notes" toggle to display inline AI analysis per element.</Li>
      </Ul>

      {/* ── 2. Home / Daily Digest ── */}
      <SectionTitle id="home">2. Home / Daily Digest</SectionTitle>
      <RoleTag role="all" />
      <P>The Home page (<code>/home</code>) is a personalised SE dashboard — your landing page when you log in.</P>

      <SubTitle>Summary KPI cards</SubTitle>
      <P>At the top of the page, KPI cards show key metrics for your pipeline. Use the <strong>7d / 14d / 30d</strong> toggle to change the time window for all cards at once.</P>

      <SubTitle>Sections</SubTitle>
      <Ul>
        <Li><strong>Today's Tasks</strong> — tasks due today or overdue, with quick-complete checkboxes.</Li>
        <Li><strong>PoC Alerts</strong> — PoCs approaching or past their end date that need attention.</Li>
        <Li><strong>Recent Activity</strong> — latest notes, task completions, and stage changes across your deals.</Li>
        <Li><strong>Stale Deals</strong> — opportunities with no activity in the last 14+ days, sorted by staleness.</Li>
      </Ul>

      <SubTitle>AI Quick Links</SubTitle>
      <P>Three shortcut buttons let you search for any opportunity and immediately open a drawer with the selected AI feature activated:</P>
      <Ul>
        <Li><strong>Pre-Call Brief</strong> — generates a call preparation brief for the selected opportunity.</Li>
        <Li><strong>Process Call Notes</strong> — opens the Meeting Notes Processor for the selected opportunity.</Li>
        <Li><strong>Opp Summary</strong> — generates or shows the AI Summary for the selected opportunity.</Li>
      </Ul>

      {/* ── 3. Closed Lost ── */}
      <SectionTitle id="closed-lost">3. Closed Lost</SectionTitle>
      <RoleTag role="all" />
      <P>Lists every opportunity that has disappeared from the Salesforce import — meaning the deal was marked Closed Lost in SF.</P>

      <SubTitle>Unread badge</SubTitle>
      <P>A pink badge on the sidebar item counts deals you haven't seen yet. Opening the tab automatically marks all visible records as read. You can also open an individual opportunity to mark it read.</P>

      <SubTitle>Closed date</SubTitle>
      <P>The <em>Closed</em> column shows the exact date and time the deal was last seen in a Salesforce import. Sorted most-recently-closed first.</P>

      <InfoBox>Tasks and notes on closed-lost opportunities are visible in read-only mode — nothing can be edited once a deal is closed.</InfoBox>

      {/* ── 4. My Tasks ── */}
      <SectionTitle id="my-tasks">4. My Tasks</SectionTitle>
      <RoleTag role="all" />
      <P>All open and in-progress tasks assigned to you, across every opportunity, in one place.</P>
      <Ul>
        <Li>Grouped by urgency: <strong>Overdue → Due Today → This Week → Later</strong></Li>
        <Li>Tick the checkbox to complete a task inline without opening the opportunity.</Li>
        <Li>Click an opportunity name to jump straight to its detail view.</Li>
      </Ul>

      {/* ── 5. My Pipeline ── */}
      <SectionTitle id="my-pipeline">5. My Pipeline</SectionTitle>
      <RoleTag role="all" />
      <P>A personal pipeline view scoped exclusively to your deals. It shows the same columns, filters, and sort options as the global Pipeline, but the SE owner filter is locked to the current user and cannot be changed.</P>
      <P>Use this when you want a focused view of just your opportunities without the noise of the full team pipeline.</P>

      {/* ── 6. Calendar ── */}
      <SectionTitle id="calendar">6. Calendar</SectionTitle>
      <RoleTag role="all" />
      <P>A month-by-month calendar view that consolidates upcoming PoC timelines, RFx submission deadlines, and task due dates in one place.</P>
      <Ul>
        <Li><strong>PoC events</strong> — multi-day bars spanning the PoC start and end dates. Overdue end dates are highlighted in red.</Li>
        <Li><strong>RFx events</strong> — single-day markers on the RFx submission date.</Li>
        <Li><strong>Tasks</strong> — your open tasks appear on their due date.</Li>
        <Li>Click any event to open the full opportunity detail.</Li>
      </Ul>
      <InfoBox>Use the team scope selector (top-right) to toggle between your own events and the full team view.</InfoBox>

      {/* ── 7. Inbox ── */}
      <SectionTitle id="inbox">7. Inbox & Quick Capture</SectionTitle>
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

      {/* ── 8. SE Mapping ── */}
      <SectionTitle id="se-mapping">8. SE Deal Mapping</SectionTitle>
      <RoleTag role="all" />
      <P>A dedicated view for managing which SE owns each opportunity.</P>

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

      {/* ── 9. PoC Board ── */}
      <SectionTitle id="poc-board">9. PoC Board</SectionTitle>
      <RoleTag role="all" />
      <P>A kanban-style board showing all active opportunities with a PoC status set in Salesforce. Columns correspond to PoC stages (Identified, In Progress, In Deployment, Completed, etc.).</P>
      <Ul>
        <Li>Only shows <strong>active (open)</strong> opportunities — closed-lost deals are excluded.</Li>
        <Li>PoC dates are pulled from Salesforce. Overdue end dates are highlighted in red.</Li>
        <Li>Use the <strong>Hide empty columns</strong> toggle (on by default) to keep the board compact.</Li>
        <Li>Use the <strong>Compact cards</strong> toggle for a condensed view; expand individual cards inline with the chevron.</Li>
        <Li>Click any card to open the full opportunity detail.</Li>
      </Ul>

      {/* ── 10. RFx Board ── */}
      <SectionTitle id="rfx-board">10. RFx Board</SectionTitle>
      <RoleTag role="all" />
      <P>Tracks active opportunities with an RFx status (RFP, RFI, RFQ, etc.) from Salesforce.</P>
      <Ul>
        <Li>Switch between <strong>Kanban</strong> (grouped by RFx stage) and <strong>List</strong> view using the toggle at the top.</Li>
        <Li>List view is sortable and filterable by RFx Status, SE Owner, and AE Owner.</Li>
        <Li>Only shows <strong>active (open)</strong> opportunities — closed-lost deals are excluded.</Li>
        <Li>Click any card or row to open the full opportunity detail.</Li>
      </Ul>

      {/* ── 11. Insights ── */}
      <SectionTitle id="insights">11. Insights</SectionTitle>
      <RoleTag role="manager" />
      <P>A set of manager-only intelligence views for spotting issues across the team. Which views appear in the sidebar can be configured via <strong>Settings → Menu Settings</strong>.</P>

      <SubTitle>Stage Movement</SubTitle>
      <P>Shows opportunities whose Salesforce stage changed in the last 7, 14, or 30 days (toggle in the top-right). Useful for tracking pipeline velocity and catching unexpected stage drops.</P>

      <SubTitle>Missing Notes</SubTitle>
      <P>Lists deals where the SE has not updated their SE Comments in Salesforce for longer than a configurable threshold (default 21 days), sorted from most stale to least. Use this to chase SEs for deal updates. Click any row to open the opportunity detail, or use the Quick Capture button per row.</P>

      <SubTitle>Team Workload</SubTitle>
      <P>Per-SE summary cards showing six stats: assigned opportunities, open tasks, next steps, overdue tasks, stale notes, and fresh notes. All non-zero stats are clickable — they drill through to the relevant filtered view (pipeline, overdue tasks, or missing notes filtered by that SE).</P>

      <SubTitle>Overdue Tasks</SubTitle>
      <P>All overdue tasks across the entire team, grouped by SE. The SE filter and a <code>?se_id=</code> deep-link from Team Workload let you focus on a specific person.</P>

      <SubTitle>Tech Blockers</SubTitle>
      <P>A table of all active opportunities with a Technical Blockers/Risk value set in Salesforce. Each entry is colour-coded by severity emoji prefix (🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low/None). The <strong>Recently Changed</strong> tab shows field-history changes over a 14–90 day window. The collapsible <strong>AI Insights</strong> panel generates a Claude-powered summary of blockers across the pipeline — click <em>Generate Summary</em> to run it, or <em>Regenerate</em> to refresh.</P>

      <SubTitle>DeployMode Overview</SubTitle>
      <P>Stat cards per deployment model (SaaS, PaaS+, etc.) showing deal count and total ARR. Click a stat card to filter the deal table below to that deployment type. Supports a multi-select quarter filter.</P>

      <SubTitle>Closed Lost Stats</SubTitle>
      <P>Analysis of closed lost deals broken down by reason, stage at close, and deployment model. Filter by time period to focus on recent losses.</P>

      <SubTitle>Agentic Qual</SubTitle>
      <P>Lists active opportunities with an Agentic Qualification value set in Salesforce. The <strong>Recently Changed</strong> tab shows field-history changes so you can track how agentic qualification is evolving across the pipeline.</P>

      <SubTitle>Weekly Pipeline Digest</SubTitle>
      <P>A manager summary of pipeline changes over a configurable window (<strong>7d / 14d / 30d</strong> toggle). Includes KPI stat cards at the top, followed by collapsible sections for stage progressions, stale deals, active PoCs, at-risk deals (low Health score), and recently closed lost opportunities.</P>

      <SubTitle>Team Tasks</SubTitle>
      <P>View all tasks across the team in either <strong>Kanban</strong> or <strong>List</strong> layout. Filterable by task status, assignee, and due date. Kanban columns correspond to task statuses (Open, In Progress, Blocked, Done).</P>

      <SubTitle>SE Deal Mapping</SubTitle>
      <P>Also available under Insights for quick access. This view is available to <strong>all users</strong> (not just managers) and shows the same SE assignment interface described in the SE Deal Mapping section above.</P>

      {/* ── 12. Settings ── */}
      <SectionTitle id="settings">12. Settings</SectionTitle>
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
      <P>A log of every import: timestamp, filename, how many records were added, updated, or closed, and any errors. The most recent import can be rolled back if needed.</P>

      <SubTitle>Backup & Restore</SubTitle>
      <P>Manage full database backups stored in a private S3 bucket (90-day retention).</P>
      <Ul>
        <Li><strong>Back Up Now</strong> — creates a JSON snapshot of all users, tasks, notes, and SE assignments and uploads it to S3. Takes a few seconds.</Li>
        <Li><strong>Backup list</strong> — browse all available backups with timestamps; download any of them as a local JSON file.</Li>
        <Li><strong>Restore from file</strong> — upload a local backup file, review a preview of what will be restored, then confirm. The restore handles circular FK dependencies (manager assignments) and resets database sequences; SE assignments are matched by email so they survive a wipe-and-restore.</Li>
      </Ul>
      <InfoBox>Restoring overwrites existing users, tasks, and notes. Create a fresh backup first if you want to be able to undo.</InfoBox>

      <SubTitle>Deploy</SubTitle>
      <P>Trigger a frontend deploy from inside the app without needing to open a terminal.</P>
      <Ul>
        <Li><strong>Version status</strong> — shows the currently deployed commit SHA alongside the latest commit on GitHub. A banner appears when a newer version is available.</Li>
        <Li><strong>Deploy button</strong> — tells the EC2 server to download the latest GitHub source, rebuild the React frontend (npm ci + Vite build), upload the new <code>dist/</code> to S3, and submit a CloudFront cache invalidation.</Li>
        <Li><strong>Live log</strong> — the build output streams to a terminal panel in real time (polled every 2 seconds) and auto-scrolls as lines arrive.</Li>
        <Li><strong>Commit history</strong> — the last 20 GitHub commits are listed with deploy-scope badges (<code>[fe]</code>, <code>[be]</code>, <code>[fe+be]</code>, <code>[infra]</code>) so you can see at a glance what is included in the latest build.</Li>
      </Ul>
      <InfoBox>Only frontend code (React) is deployed via this page. Backend or infrastructure changes still require a terminal deploy using <code>scripts/deploy.sh</code>.</InfoBox>

      <SubTitle>Menu Settings</SubTitle>
      <P>Configure which items appear in the sidebar. Two sections can be customised:</P>
      <Ul>
        <Li><strong>Main nav</strong> — toggle visibility of Calendar, SE Mapping, PoC Board, and RFx Board; reorder them by dragging.</Li>
        <Li><strong>Insights nav</strong> — toggle and reorder the manager Insights views that appear under the collapsible Insights section.</Li>
      </Ul>

      <SubTitle>Deal Info Layout</SubTitle>
      <P>Configure which fields and sections appear in the <strong>Deal Info</strong> tab of the opportunity detail panel. Drag sections to reorder them and use toggles to show or hide individual sections. A live preview using real opportunity data updates as you make changes, so you can see exactly what the layout will look like before saving.</P>

      {/* ── 13. Audit ── */}
      <SectionTitle id="audit">13. Audit</SectionTitle>
      <RoleTag role="manager" />
      <P>Usage analytics and an activity log for the entire team. Accessible from the sidebar (above Settings).</P>

      <SubTitle>Usage tab</SubTitle>
      <Ul>
        <Li><strong>Page views</strong> — how many times each route was visited, unique users who visited it, and when it was last accessed.</Li>
        <Li><strong>Feature usage</strong> — non-navigation events (opportunity opens, task creates, imports, etc.) grouped by action and entity type, so you can see which features are actually being used.</Li>
        <Li><strong>Per-user activity</strong> — total event count and last-seen for each team member over the last 180 days.</Li>
      </Ul>

      <SubTitle>Activity Log tab</SubTitle>
      <P>A paginated, append-only log of every significant server-side action — logins, logouts, user management, Salesforce imports, SE assignments, task changes, backups, restores, and deploys.</P>
      <Ul>
        <Li>Filter by <strong>time window</strong> (7 / 30 / 60 / 90 / 180 days), <strong>user</strong>, and <strong>action type</strong>.</Li>
        <Li>Expand any row to see a before/after JSON diff of what changed.</Li>
      </Ul>
      <InfoBox>Audit records older than 180 days are automatically purged on server startup.</InfoBox>

      {/* ── 14. AI Features ── */}
      <SectionTitle id="ai-features">14. AI Features</SectionTitle>
      <RoleTag role="all" />
      <P>All AI features are powered by Claude and available to every user. This section documents them in one place.</P>

      <SubTitle>AI Summary</SubTitle>
      <P>Generates a 3-paragraph briefing from the deal context — opportunity metadata, tasks, notes, SE comments, and MEDDPICC fields. The summary is displayed in a collapsible panel at the top of the opportunity detail and is <strong>persisted server-side</strong> with a freshness indicator (e.g. "Generated 3h ago"). Click <strong>Regenerate</strong> to refresh it with the latest deal data.</P>

      <SubTitle>MEDDPICC Gap Coach</SubTitle>
      <P>Triggered via the lightbulb button in the opportunity detail header. Analyses all deal context and produces a <Badge color="green">Green</Badge> / <Badge color="amber">Amber</Badge> / <Badge color="red">Red</Badge> rating per MEDDPICC element, along with supporting evidence, identified gaps, and suggested discovery questions. Results are cached server-side to avoid redundant API calls. The same analysis also appears inline in the <strong>Deal Info</strong> tab when you enable the "Show AI notes" toggle next to each MEDDPICC element.</P>

      <SubTitle>Pre-Call Brief</SubTitle>
      <P>Located in the <strong>Call Prep</strong> tab of the opportunity detail. Generates talking points, risk areas, recommended questions, relevant customer stories, and differentiator plays. Each piece of information is tagged with a source badge — <Badge color="gray">CSV</Badge> (from Salesforce import data), <Badge color="purple">DIFF</Badge> (from recent field changes), or <Badge color="green">KB</Badge> (from the knowledge base) — so you know where the insight comes from. Use the <strong>PDF export</strong> button to download the brief for offline use.</P>

      <SubTitle>Meeting Notes Processor</SubTitle>
      <P>Available in the <strong>Work</strong> tab of the opportunity detail. Paste raw call notes (with an optional source URL for reference) and Claude extracts structured outputs:</P>
      <Ul>
        <Li><strong>Tasks</strong> — action items with suggested assignees and due dates.</Li>
        <Li><strong>MEDDPICC updates</strong> — new information mapped to the relevant MEDDPICC elements.</Li>
        <Li><strong>SE comment draft</strong> — a suggested update for the SE Comments field in Salesforce.</Li>
        <Li><strong>Technical blockers</strong> — any technical risks or blockers mentioned in the call.</Li>
        <Li><strong>Next steps</strong> — agreed follow-ups and commitments.</Li>
      </Ul>
      <P>Each section can be reviewed and confirmed independently — accept the ones that look right, edit or discard the rest.</P>

      <SubTitle>Tech Blockers AI Insights</SubTitle>
      <P>Available in the <strong>Tech Blockers</strong> Insights view. Generates a Claude-powered summary of technical blockers across the entire pipeline, weighted by severity. Useful for identifying systemic technical issues and prioritising engineering support across deals.</P>

      <div className="h-8" />
    </div>
  );
}
