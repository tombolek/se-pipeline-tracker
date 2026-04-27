
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
  { id: 'sidebar-helpers', label: "Recent Actions & What's New" },
  { id: 'offline',     label: 'Offline mode (PWA)' },
];

// ── Layout components ────────────────────────────────────────────────────────

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold text-brand-navy dark:text-fg-1 mt-10 mb-3 pt-2 border-t border-brand-navy-30/40 dark:border-ink-border-soft first:border-0 first:mt-0 scroll-mt-4">
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1 mt-5 mb-1.5">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-brand-navy-70 dark:text-fg-2 leading-relaxed mb-2">{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-inside space-y-1 text-sm text-brand-navy-70 dark:text-fg-2 mb-3 pl-1">{children}</ul>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

function Badge({ color, children }: { color: 'purple' | 'pink' | 'green' | 'amber' | 'red' | 'gray'; children: React.ReactNode }) {
  const cls = {
    purple: 'bg-brand-purple/10 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple border-brand-purple/30 dark:border-accent-purple/30',
    pink:   'bg-brand-pink/10 dark:bg-accent-pink-soft text-brand-pink dark:text-accent-pink border-brand-pink/30',
    green:  'bg-green-100 text-green-700 border-green-200',
    amber:  'bg-amber-100 text-amber-700 border-amber-200',
    red:    'bg-red-100 text-red-600 border-red-200',
    gray:   'bg-gray-100 dark:bg-ink-3 text-gray-500 border-gray-200',
  }[color];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      {children}
    </span>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-brand-purple-30/30 dark:bg-accent-purple-soft border border-brand-purple/20 rounded-lg px-4 py-3 text-sm text-brand-navy-70 dark:text-fg-2 leading-relaxed mb-4">
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
    <nav className="bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft rounded-xl px-5 py-4 mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 dark:text-fg-2 mb-3">Table of Contents</p>
      <ol className="space-y-1.5">
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="flex items-center gap-2 text-sm text-brand-navy-70 dark:text-fg-2 hover:text-brand-purple dark:text-accent-purple transition-colors"
            >
              <span className="w-5 text-right text-[11px] text-brand-navy-30 dark:text-fg-4 font-mono">{i + 1}.</span>
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
        <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">User Guide</h1>
        <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-1">How to use SE Buddy — page by page.</p>
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
            <tr className="border-b border-brand-navy-30/40 dark:border-ink-border-soft">
              <th className="text-left py-2 pr-4 text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Factor</th>
              <th className="text-left py-2 pr-4 text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Max deduction</th>
              <th className="text-left py-2 text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Logic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-navy-30/20">
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy dark:text-fg-1">MEDDPICC completeness</td>
              <td className="py-2 pr-4 text-brand-navy-70 dark:text-fg-2">−30</td>
              <td className="py-2 text-brand-navy-70 dark:text-fg-2">−3.3 pts for each of the 9 MEDDPICC fields that is blank</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy dark:text-fg-1">SE Comments freshness</td>
              <td className="py-2 pr-4 text-brand-navy-70 dark:text-fg-2">−25</td>
              <td className="py-2 text-brand-navy-70 dark:text-fg-2">0 if ≤7d · −10 if 8–21d · −20 if &gt;21d · −25 if never updated</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy dark:text-fg-1">Note freshness</td>
              <td className="py-2 pr-4 text-brand-navy-70 dark:text-fg-2">−20</td>
              <td className="py-2 text-brand-navy-70 dark:text-fg-2">0 if ≤14d · −10 if 15–30d · −20 if &gt;30d or no notes ever</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy dark:text-fg-1">Overdue tasks</td>
              <td className="py-2 pr-4 text-brand-navy-70 dark:text-fg-2">−20</td>
              <td className="py-2 text-brand-navy-70 dark:text-fg-2">−5 per overdue task, capped at 4 tasks (−20 max)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium text-brand-navy dark:text-fg-1">Time in current stage</td>
              <td className="py-2 pr-4 text-brand-navy-70 dark:text-fg-2">−15</td>
              <td className="py-2 text-brand-navy-70 dark:text-fg-2">0 if &lt;30d · −10 if 30–60d · −15 if &gt;60d in the same stage</td>
            </tr>
          </tbody>
        </table>
      </div>
      <P>Hover over the score in the pipeline list to see a tooltip with the exact breakdown. In the opportunity detail, click the health bar to expand the full factor list with explanations. Use the <strong>At-risk only</strong> filter button in the pipeline to instantly surface all Red and Amber deals.</P>

      <SubTitle>Opportunity detail</SubTitle>
      <P>Click any row to open the detail side panel. The header shows the opportunity name, account name (clickable to open Account History), current stage, ARR, close date, a <Badge color="green">Health score</Badge> pill, a <Badge color="purple">MEDDPICC score</Badge> pill, a Coach lightbulb button, and a Summarize button.</P>

      <SubTitle>Inline SE Owner &amp; Contributors</SubTitle>
      <P>The header also exposes an <strong>SE Owner pill</strong> and a <strong>Contributors strip</strong> right under the title — no drawer round-trip needed to change ownership:</P>
      <Ul>
        <Li><strong>SE Owner pill</strong> — click to open a compact search popover. Managers can reassign to any active SE or unassign. An SE who already owns the deal can hand it off or unassign themselves. An SE can self-assign an unassigned deal. Permissions mirror the server rules exactly.</Li>
        <Li><strong>Contributors</strong> — zero-or-more SE teammates who also work on the deal, in addition to the single SE Owner. Add or remove teammates with the <em>+</em> chip. Managers and the current SE Owner can manage anyone; any SE can add or remove themselves. Contributors also show in the Deal Info tab when the <em>Contributors</em> section is enabled in the Deal Info Layout.</Li>
      </Ul>

      <P><strong>AI Summary</strong> — a collapsible panel below the header. Shows a freshness indicator (e.g. "Generated 2h ago"). The summary is persisted server-side and can be regenerated on demand with the Regenerate button.</P>

      <P><strong>MEDDPICC Gap Coach</strong> — a second collapsible panel below the AI Summary. Shows per-element analysis with Green/Amber/Red ratings, evidence, gaps, and suggested discovery questions.</P>

      <P>The detail view has <strong>6 tabs</strong>:</P>
      <Ul>
        <Li><strong>Work</strong> — tasks, notes, and the Meeting Notes Processor (paste raw call notes and let AI extract structured outputs).</Li>
        <Li><strong>Timeline</strong> — unified event history across tasks, notes, stage changes, and SF field updates in chronological order.</Li>
        <Li><strong>Call Prep</strong> — AI-generated pre-call brief with talking points, risk areas, questions, customer stories, and differentiator plays. Includes a PDF export button and a Slack send placeholder.</Li>
        <Li><strong>Demo Prep</strong> — AI-generated demo readiness brief with 6 critical questions, evidence, missing items, suggested commitments, coaching tips, overall assessment, and a before-you-demo checklist. PDF export and Slack send buttons mirror Call Prep.</Li>
        <Li><strong>Similar Deals</strong> — ranks historical closed deals, in-flight deals in advanced stages, and KB proof points by similarity. When the deterministic scorer produces 5+ matches, Claude adds a one-sentence "why it matches" caption on each row; when it produces fewer than 3 matches, Claude synthesizes a short playbook (win pattern, positioning, anticipate, lead-with) from matching KB proof points instead. Both AI layers are cached 7 days per deal.</Li>
        <Li><strong>Deal Info</strong> — configurable Salesforce fields (layout managed in Settings), MEDDPICC scores with an "Show AI notes" toggle to display inline AI analysis per element.</Li>
      </Ul>
      <P>All stage-change and time-in-stage data everywhere in the app (Timeline, Stage Movement, Weekly Digest, Recent Activity, Forecasting Brief) is now derived from Salesforce's per-stage date columns (<em>Stage Date: Build Value</em>, etc.), so multi-stage jumps within a window produce one row per move rather than just the most recent.</P>

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

      <SubTitle>Needs Attention (Data Hygiene)</SubTitle>
      <P>A KPI card and section that surfaces deals with SE-responsibility issues — things you should fix or follow up on. Each flagged deal shows one or more issue badges. The rules focus on <strong>SE-owned data</strong>, not AE responsibilities like MEDDPICC or close dates.</P>
      <P>Detection rules:</P>
      <Ul>
        <Li><Badge color="amber">SE Comments Nd old</Badge> — SE Comments in Salesforce haven't been updated in more than 21 days (or were never set).</Li>
        <Li><Badge color="red">PoC should be In Progress</Badge> — PoC Estimated Start Date has passed but the PoC Status is still Identified or In Deployment.</Li>
        <Li><Badge color="red">PoC overdue by Nd</Badge> — PoC Status is In Progress but the Estimated End Date has passed.</Li>
        <Li><Badge color="red">PoC wrap-up overdue Nd</Badge> — PoC Status is Wrapping Up but the Estimated End Date has passed.</Li>
        <Li><Badge color="amber">PoC span Nwk</Badge> — PoC Start-to-End Date is more than 6 weeks apart.</Li>
        <Li><Badge color="purple">Missing PoC planning</Badge> — deal is at Develop Solution stage but has no PoC Status and/or no PoC Start Date set.</Li>
        <Li><Badge color="purple">Missing Tech Blockers</Badge> — deal is at Develop Solution or later but the Technical Blockers/Risk field is empty.</Li>
        <Li><Badge color="amber">Demo mentioned, no follow-up</Badge> — SE Comments or Next Step mention "demo" but there's been no note added in the last 7 days.</Li>
      </Ul>
      <P>For managers, the same hygiene data appears in the <strong>1:1 Prep</strong> page per-SE, with a table view and hygiene-issue count in the stats row.</P>

      <SubTitle>AI Quick Links</SubTitle>
      <P>Four shortcut buttons let you search for any opportunity and immediately open a drawer with the selected AI feature activated:</P>
      <Ul>
        <Li><strong>Pre-Call Brief</strong> — generates a call preparation brief for the selected opportunity.</Li>
        <Li><strong>Process Call Notes</strong> — opens the Meeting Notes Processor for the selected opportunity.</Li>
        <Li><strong>Opp Summary</strong> — generates or shows the AI Summary for the selected opportunity.</Li>
        <Li><strong>Demo Prep</strong> — generates a demo preparation brief (6 critical questions, evidence, missing items, suggested commitments, coaching tips, overall assessment, and a before-you-demo checklist).</Li>
      </Ul>

      {/* ── 3. Closed Lost ── */}
      <SectionTitle id="closed-lost">3. Closed Lost</SectionTitle>
      <RoleTag role="all" />
      <P>Lists every opportunity that has disappeared from the Salesforce import — meaning the deal was marked Closed Lost in SF.</P>
      <InfoBox><strong>Closed Won detection:</strong> if a deal disappears from SF while in the <em>Submitted for Booking</em> stage, it is classified as Closed Won (not Closed Lost). Those deals are moved out of Closed Lost and out of Loss Analysis.</InfoBox>

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
      <SectionTitle id="inbox">7. Inbox, Quick Switcher & Quick Capture</SectionTitle>
      <RoleTag role="all" />
      <P>A personal scratch pad for capturing thoughts before they're linked to a deal, plus two keyboard shortcuts for jumping between deals and filing notes/tasks from anywhere in the app.</P>

      <SubTitle>Quick Switcher</SubTitle>
      <P>Press <kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl+K</kbd> (or <kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">⌘K</kbd> on Mac) to open the opportunity switcher. Start typing to search any deal by <strong>opportunity name</strong>, <strong>account name</strong>, or <strong>Salesforce opportunity id</strong>. Results are grouped into three tiers so your own work surfaces first:</P>
      <Ul>
        <Li><strong>Favorites</strong> — any deal you've starred.</Li>
        <Li><strong>Your Territory</strong> — deals you own, plus any deal on a team you belong to (from your <code>teams</code> membership).</Li>
        <Li><strong>Everything else</strong> — the remaining matches across the whole pipeline.</Li>
      </Ul>
      <P>Use <kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">↑</kbd>/<kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">↓</kbd> to navigate, <kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">↵</kbd> to open the deal drawer, <kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">Esc</kbd> to close. Each tier is capped at 5 results and ordered active-first (Closed Won/Lost deals appear faded so live pipeline wins visually).</P>

      <SubTitle>Quick Capture</SubTitle>
      <P>Press <kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl+I</kbd> (or <kbd className="bg-gray-100 dark:bg-ink-3 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">⌘I</kbd> on Mac) from anywhere in the app to open the Quick Capture modal. Type your note or task, optionally link it to an opportunity, then submit.</P>
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
      <div className="overflow-hidden rounded-xl border border-brand-navy-30/40 dark:border-ink-border-soft mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-navy-30/20 text-left">
              <th className="px-4 py-2.5 font-semibold text-brand-navy-70 dark:text-fg-2 text-xs uppercase tracking-wide">Role</th>
              <th className="px-4 py-2.5 font-semibold text-brand-navy-70 dark:text-fg-2 text-xs uppercase tracking-wide">Can assign</th>
              <th className="px-4 py-2.5 font-semibold text-brand-navy-70 dark:text-fg-2 text-xs uppercase tracking-wide">Restriction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-navy-30/30">
            <tr className="bg-white dark:bg-ink-1">
              <td className="px-4 py-2.5"><Badge color="pink">Manager</Badge></td>
              <td className="px-4 py-2.5 text-brand-navy-70 dark:text-fg-2">Any active SE to any deal</td>
              <td className="px-4 py-2.5 text-brand-navy-70 dark:text-fg-2">None</td>
            </tr>
            <tr className="bg-white dark:bg-ink-1">
              <td className="px-4 py-2.5"><Badge color="purple">SE</Badge></td>
              <td className="px-4 py-2.5 text-brand-navy-70 dark:text-fg-2">Themselves only</td>
              <td className="px-4 py-2.5 text-brand-navy-70 dark:text-fg-2">Can only add themselves to an unassigned deal, or remove themselves from a deal they own. Cannot assign another SE.</td>
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

      <SubTitle>Loss Analysis</SubTitle>
      <P>Analysis of Closed Lost deals (renamed from "Closed Lost Stats" / "Win/Loss Analysis"). Slices the data by Stage at Close, Competitor, Industry, Segment, Record Type, Team, SE Owner, and AE Owner. Includes KPI cards for Deals Lost, ARR Lost, Avg Deal Size, and <strong>Avg Days in Pipeline</strong> (first-seen → closed-lost). Filter by time period (30d / 90d / 1yr / All) or toggle between <em># Deals</em> and <em>ARR</em>. Click any pie slice to cross-filter across every chart. Deals lost while still in Qualify are excluded (they are not "qualified pipeline"). Competitors parsed from comma/semicolon/slash-delimited lists appear as per-competitor slices.</P>
      <P><strong>Inline SE Owner re-assignment (Manager only):</strong> the Filtered Deals table now always appears and includes an SE Owner column. Managers can change the SE Owner on any closed deal (Won or Lost) via an inline dropdown — useful for cleaning up unassigned deals after a sales cycle closes. SEs see the SE Owner read-only.</P>

      <SubTitle>Forecasting Brief</SubTitle>
      <P>Manager-only SE forecast call prep page. Two tabs:</P>
      <Ul>
        <Li><strong>Current FQ</strong> — KPI cards (pipeline total, commit+ML, SE engagement health), a forecast table with expandable rows showing inline AI summary, SE comments, tech status & MEDDPICC gaps, plus an AI-generated forecast narrative.</Li>
        <Li><strong>Key Deals</strong> — collapsible deal cards for the must-discuss opportunities.</Li>
      </Ul>
      <P>Expanded rows link to the full Opportunity Detail drawer. Stale-comment alerts surface on Thursdays, and the AI narrative auto-refreshes on Fridays.</P>

      <SubTitle>Agentic Qual</SubTitle>
      <P>Lists active opportunities with an Agentic Qualification value set in Salesforce. The <strong>Recently Changed</strong> tab shows field-history changes so you can track how agentic qualification is evolving across the pipeline.</P>

      <SubTitle>Weekly Pipeline Digest</SubTitle>
      <P>A manager summary of pipeline changes over a configurable window (<strong>7d / 14d / 30d</strong> toggle). Includes KPI stat cards at the top, followed by collapsible sections for stage progressions, stale deals, active PoCs, at-risk deals (low Health score), and recently closed lost opportunities.</P>

      <SubTitle>Team Tasks</SubTitle>
      <P>View all tasks across the team in either <strong>Kanban</strong> or <strong>List</strong> layout. Filterable by task status, assignee, and due date. Kanban columns correspond to task statuses (Open, In Progress, Blocked, Done).</P>

      <SubTitle>SE Deal Mapping</SubTitle>
      <P>Also available under Insights for quick access. This view is available to <strong>all users</strong> (not just managers) and shows the same SE assignment interface described in the SE Deal Mapping section above.</P>

      <SubTitle>1:1 Prep</SubTitle>
      <P>A one-page brief for your next 1:1 with any SE. Pick the SE from the dropdown (or deep-link with <code>?se=&lt;id&gt;</code>). Sections include stat cards (open opps, total ARR, Health RAG, overdue tasks, stale comments, hygiene issues), an AI Coaching Brief (collapsible, with freshness badge), overdue tasks, due this week, deals missing SE notes, <strong>Data Hygiene — Needs Attention</strong> table (same 8 rules as the Home page), deals with no next step, recent stage movements, and all open opportunities. Clicking any deal or task opens the full Opportunity Detail in a side drawer.</P>

      <SubTitle>Closed Won</SubTitle>
      <P>Closed Won report for SE bonus calculation. Aggregates Closed Won ARR in USD (<code>arr_converted</code>) with a view toggle:</P>
      <Ul>
        <Li><strong>By Territory</strong> — Team → SE breakdown.</Li>
        <Li><strong>By SE</strong> — SE → Team breakdown; SE totals are global across territories.</Li>
      </Ul>
      <P>Filter by fiscal year (dropdown) and quarter (<em>All</em> / Q1-Q4). New-business only — New Logo + Upsell + Cross-Sell (Services + Renewal excluded). Quarter bucketing uses <code>closed_at</code>-based months so results are consistent with the % to Target page. Rows expand to show the underlying deals; clicking a deal opens the opp drawer.</P>

      <SubTitle>% to Target</SubTitle>
      <P>Closed Won progress against configured quota groups. Each group renders as a donut plus a month-over-month sparkline; a combined chart compares all groups against the linear FY pace line. Filter by FY and quarter (<em>All YTD</em> / Q1-Q4) — switching the quarter changes the <em>as-of</em> point used by every chart so you can see where each group stood at any quarter boundary. New-business only, USD via <code>arr_converted</code>. Groups are configured in <strong>Settings → Quotas</strong>.</P>

      <SubTitle>Win Rate</SubTitle>
      <InfoBox><strong>Work in progress:</strong> this report is still being validated — the numbers may not yet be fully accurate. A matching banner is shown at the top of the page.</InfoBox>
      <P>Three win-rate metrics at the team level and broken down per SE:</P>
      <Ul>
        <Li><strong>Overall Win Rate</strong> — classic Won / (Won + Lost).</Li>
        <Li><strong>Technical Win Rate</strong> — share of closed deals that reached Negotiate. Proxies "did the SE earn a technical win?"</Li>
        <Li><strong>Negotiate Win Rate</strong> — share of Negotiate-reaching deals that Closed Won. Proxies "once the technical side was solved, did we commercial-close?"</Li>
      </Ul>
      <P>Filterable by FY and quarter (<em>All</em> / Q1-Q4), same bucketing as Closed Won and % to Target. Per-SE rows expand to show the underlying deals with "reached Negotiate" and Won/Lost badges. New-business only (New Logo + Upsell + Cross-Sell).</P>

      <SubTitle>Pipeline Analytics</SubTitle>
      <P>Visual dashboard for the current pipeline:</P>
      <Ul>
        <Li><strong>Funnel chart</strong> — ARR by stage.</Li>
        <Li><strong>ARR by SE owner</strong> — stacked by stage.</Li>
        <Li><strong>ARR by record type</strong> — donut.</Li>
        <Li><strong>ARR by close month</strong> — bar chart.</Li>
        <Li><strong>Stage velocity</strong> — average days in stage with RAG colouring.</Li>
        <Li><strong>Summary KPI cards</strong> — total pipeline, converted ARR, key deals, average deal size.</Li>
      </Ul>

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

      <SubTitle>Knowledge Base</SubTitle>
      <P>Manage the curated markdown files under <code>kb/</code> that power <strong>Call Prep</strong> and the <strong>Similar Deals</strong> tab. Each file covers one vertical (e.g. <em>finance_banking.md</em>, <em>insurance_pc.md</em>) and follows a strict template: one <code>### Customer</code> section per customer, with an About paragraph, a Products / Business Initiatives table, a <strong>Proof Point</strong> narrative, and a <code>---</code> separator.</P>
      <Ul>
        <Li><strong>Download</strong> — pulls the raw <code>.md</code> file to edit locally in any text editor.</Li>
        <Li><strong>Upload</strong> — replaces the file on disk atomically, re-parses it, and (for proof-point files) auto-imports the delta: customers removed from the file disappear from the DB, new or edited customers are upserted. Parser errors reject the upload with a descriptive message before any DB write.</Li>
        <Li><strong>Full re-import</strong> — clears and re-parses every file. Needed after editing <em>index.md</em> or the differentiators file (those have cross-file dependencies).</Li>
      </Ul>
      <P>Each row shows the file's disk size, kind (proof points / differentiators / index), the current customer count in the DB, and when it was last imported.</P>

      <SubTitle>Templates</SubTitle>
      <P>Reusable <strong>task packs</strong> and <strong>note templates</strong> SEs can apply in one click from the Work tab of any opportunity.</P>
      <Ul>
        <Li><strong>Task packs</strong> — a set of tasks with per-task due-date offsets (<em>+Nd</em>) and optional <Badge color="purple">Next step</Badge> flags. Example: "PoC Kickoff" → 6 tasks with staggered offsets.</Li>
        <Li><strong>Notes</strong> — a prefilled note body (e.g. a "Call Recap" structure).</Li>
      </Ul>
      <P>Each template can be scoped to a specific stage or left <em>global</em>. The SE-facing <strong>Use template</strong> picker next to "+ Add task" / "+ Add note" filters to the deal's current stage plus any global templates. Full CRUD lives on this page; the list shows each template's kind, scope, author, item count, and a short content preview.</P>

      <SubTitle>Quotas</SubTitle>
      <P>Configure quota groups used by the <strong>% to Target</strong> Insights page. Three rule types:</P>
      <Ul>
        <Li><strong>All Closed Won (Global)</strong> — the full-company quota.</Li>
        <Li><strong>By team(s)</strong> — e.g. NA Enterprise + NA Strategic.</Li>
        <Li><strong>By AE owner(s)</strong> — e.g. DACH = Thomas Miebach.</Li>
      </Ul>
      <P>The same deal can count toward multiple groups. Seeded with Global ($16M), NA ($11.4M), INTL ($6.12M), and DACH ($1.5M).</P>

      <SubTitle>Role Access</SubTitle>
      <P>Admin-only page that controls which roles can see each page and menu item. Pages are grouped into <em>Main Navigation</em>, <em>Insights</em>, and <em>Administration</em>; per-role checkboxes (Manager / SE / Viewer) let you toggle visibility individually or use the section-level checkbox to toggle a whole group at once. Admin users always see Administration pages regardless of the matrix.</P>
      <InfoBox>Role access lives in three places: the sidebar nav lists, this admin registry, and a DB seed migration. Adding a new page requires touching all three — see the project CLAUDE.md for the checklist.</InfoBox>

      <SubTitle>Developer</SubTitle>
      <P>Debug tools for admins. Changes made here affect only your own browser; other users are unaffected.</P>
      <Ul>
        <Li><strong>Simulate offline mode</strong> — toggle to short-circuit every API request with a synthetic <em>Network Error</em>. The app behaves as if you disconnected from VPN: cached data is served where available, the offline banner appears, and writes queue locally. A persistent red <Badge color="red">SIMULATED OFFLINE</Badge> chip pins to the bottom-right corner so you can't forget to turn it off. Click the chip to exit.</Li>
        <Li><strong>Offline cache storage</strong> — readout of how much IndexedDB you're currently using and the browser quota. Use <strong>Clear offline cache</strong> to wipe everything locally (you'll re-sync on next connect).</Li>
      </Ul>

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

      <SubTitle>Demo Prep</SubTitle>
      <P>Available as a <strong>Demo Prep</strong> tab on the opportunity detail and as an AI Quick Link on the Home page. Generates a structured demo readiness assessment: 6 critical discovery questions with evidence from the deal, missing items to uncover, suggested commitments to ask for during the demo, coaching tips, an overall readiness assessment, and a <em>Before-You-Demo checklist</em>. Results are persisted server-side and can be exported as <strong>PDF</strong> or sent to <strong>Slack</strong> from the header of the tab.</P>

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

      <SubTitle>Similar Deals — AI "Why it matches"</SubTitle>
      <P>On the <strong>Similar Deals</strong> tab, when the deterministic scorer produces 5 or more candidates, the top 15 are sent to Claude for per-row annotation — one sentence per candidate explaining why it's relevant to the active deal, grounded in that candidate's notes and match signals. Rendered inline on each row in a purple callout, replacing the default deterministic "why" text. Cached 7 days per deal; Refresh button on the tab header.</P>

      <SubTitle>Similar Deals — Synthesized Playbook</SubTitle>
      <P>When the deterministic scorer produces <strong>fewer than 3 matches</strong> — e.g. an early-stage opp with thin signal — the tab instead synthesizes a short <em>playbook</em> from the closest KB proof points: a win pattern, positioning, bullets of what to lead with, and bullets of blockers to anticipate. Clearly labelled "no direct matches — drawn from KB proof points" so it isn't confused with real deal evidence. The prompt explicitly forbids invention; every claim must be grounded in the proof-point text. Cached 7 days; Refresh button on the card.</P>

      {/* ── 15. Sidebar Helpers ── */}
      <SectionTitle id="sidebar-helpers">15. Recent Actions &amp; What's New</SectionTitle>
      <RoleTag role="all" />
      <P>Two buttons in the sidebar footer give you an always-available safety net and a summary of recent releases.</P>

      <SubTitle>Recent Actions (Undo)</SubTitle>
      <P>The <strong>Recent actions</strong> button lists destructive actions you've taken in the last <strong>30 days</strong> and lets you undo them inline. Covers:</P>
      <Ul>
        <Li>Deleted tasks.</Li>
        <Li>Deleted Inbox items.</Li>
        <Li>SE Owner reassignments (yours).</Li>
      </Ul>
      <P>Actions that can no longer be safely reverted (for example, the opp was reassigned again by someone else after you) are shown as <em>Not undoable</em> with the reason. Soft-deleted rows are hard-deleted by a startup cleanup job once they exceed the 30-day window.</P>

      <SubTitle>What's New</SubTitle>
      <P>The <strong>What's New</strong> button in the sidebar footer opens a drawer with the full release history parsed from the app's <code>CHANGELOG.md</code>. Entries published since your last visit are highlighted with a <Badge color="purple">New</Badge> badge, and the sidebar button shows an unread count. Opening the panel marks entries as seen, so the badge clears until the next release.</P>

      {/* ── 16. Offline mode (PWA) ── */}
      <SectionTitle id="offline">16. Offline mode (PWA)</SectionTitle>
      <RoleTag role="all" />
      <P>The app keeps a local copy of the data you've recently viewed so it continues to work off VPN or on a dropped connection. You'll notice the difference most when you're on a train, at a conference, or briefly off the corporate network.</P>

      <SubTitle>What's cached automatically</SubTitle>
      <Ul>
        <Li>The app itself (HTML, JavaScript, styles, icons) — served from a Service Worker so the page loads without network.</Li>
        <Li>Your pipeline list, any opportunity drawer you open, favorites, the user directory, the mentions feed, the Home digest, and the Calendar — stored in your browser's IndexedDB.</Li>
        <Li>Other pages are cached <strong>on-demand</strong>: visit a page once while online and it'll be available offline afterwards.</Li>
      </Ul>
      <InfoBox>Cache is capped at <strong>500 MB</strong> with least-recently-used eviction on drawer payloads. <strong>Favorited deals are never evicted</strong> — they're your always-available set.</InfoBox>

      <SubTitle>Favorites = your offline pin</SubTitle>
      <P>Favoriting a deal (the <Badge color="amber">★</Badge> star) has always marked it as something you care about. It now also means "keep this available offline." No separate pin-for-offline action — one control, two meanings. The Favorites page carries an info banner explaining this, plus:</P>
      <Ul>
        <Li>How much storage your cache is using.</Li>
        <Li>When the data was last synced.</Li>
        <Li>A <strong>Sync now</strong> button to force a refresh.</Li>
      </Ul>

      <SubTitle>Connection indicator</SubTitle>
      <P>Always visible in the sidebar footer. Four states:</P>
      <Ul>
        <Li><Badge color="green">Live</Badge> — connected, latest data.</Li>
        <Li><Badge color="purple">Syncing…</Badge> — background refresh in progress.</Li>
        <Li><Badge color="amber">Cached N min ago</Badge> — online but last successful fetch is more than 5 minutes old. Click for detail + Sync now.</Li>
        <Li><Badge color="purple">Offline</Badge> — network unreachable. Data is being served from cache; pending writes are queued locally.</Li>
      </Ul>
      <P>When offline, a thin banner also appears at the top of every page with the last-synced time and a <strong>Try reconnect</strong> button. Non-cached rows on the Pipeline are dimmed so you know they exist but need a connection to open.</P>

      <SubTitle>Queued writes</SubTitle>
      <P>Four kinds of edit can be made while offline. They queue locally and flush automatically when you reconnect — you don't have to do anything to resend them.</P>
      <Ul>
        <Li><strong>Add a note</strong> — append-only, never conflicts. Shows as <em>(you — pending sync)</em> in the drawer until synced.</Li>
        <Li><strong>Create a task</strong> — new rows can't conflict; just flushes.</Li>
        <Li><strong>Edit a task</strong> — title, description, status, due date, assignee. Protected by a version check so two people editing the same task in parallel can't silently overwrite each other.</Li>
        <Li><strong>Reassign SE Owner</strong> — same version check as task edits.</Li>
      </Ul>
      <P>The sidebar indicator flips to <Badge color="amber">Pending sync</Badge> with a count chip whenever the queue has items. Opening the dropdown shows the total and a shortcut to the review page.</P>

      <SubTitle>Reconnect — what you see</SubTitle>
      <P>When the app regains its connection, the queue drains in the background and surfaces one of two chips at the bottom of the screen:</P>
      <Ul>
        <Li><Badge color="green">Synced N changes</Badge> — all queued writes applied cleanly. Dismisses after a few seconds; no further action needed.</Li>
        <Li><Badge color="amber">Synced N · M need review</Badge> — at least one queued edit conflicts with something that happened while you were offline. Click <em>Review →</em> to open the Review Offline Changes page.</Li>
      </Ul>

      <SubTitle>Review Offline Changes</SubTitle>
      <P>When a queued edit collides with a change made by someone else, the app doesn't silently win or lose — it parks the edit in a conflict queue and lets you pick what happens to it on the <strong>Review Offline Changes</strong> page. Each conflict card shows:</P>
      <Ul>
        <Li>What <strong>you tried to do</strong> (captured at queue time — so it's still accurate even days later).</Li>
        <Li>The <strong>current server state</strong> and who changed it, if known.</Li>
        <Li>Three actions: <strong>Re-apply my change</strong> (force-overwrites whatever's on the server now), <strong>Keep current</strong> (discards your queued edit), or <strong>View opportunity</strong>.</Li>
      </Ul>
      <P>A <em>Discard all unapplied changes</em> footer option lets you dismiss the whole list if you've looked at each and don't want to re-apply anything.</P>

      <SubTitle>Connection heartbeat</SubTitle>
      <P>While the tab is visible, the app pings the server every 45 seconds on a tiny no-content endpoint. Each successful ping keeps the indicator green; a network failure flips it to <Badge color="purple">Offline</Badge>. When a ping succeeds after being offline, any queued writes flush automatically — so a laptop that slept with pending edits picks up where it left off within ~45 seconds of reconnecting, even if you never click back into the tab. Paused while the tab is hidden to save battery.</P>

      <SubTitle>Installable app (optional)</SubTitle>
      <P>Chrome and Edge will show an <em>Install app</em> prompt in the address bar. Installing is optional and doesn't change any behaviour — it just puts the app in its own window with the Ataccama symbol, no address bar, and a dedicated taskbar / dock icon. Uninstall from your OS like any other app.</P>

      <SubTitle>Security &amp; storage notes</SubTitle>
      <Ul>
        <Li><strong>Logout wipes the cache</strong> — a shared laptop can't leak a previous user's deals.</Li>
        <Li>The browser is asked to keep the cache <em>persistent</em> so it isn't evicted under disk pressure.</Li>
        <Li>Cached data is readable by anyone with access to your browser profile — use OS-level disk encryption (BitLocker on Windows, FileVault on Mac) for at-rest protection.</Li>
        <Li>Cache is per-browser-profile — Chrome at the office and Edge at home are separate caches.</Li>
      </Ul>

      <SubTitle>Testing offline without dropping VPN</SubTitle>
      <P>Admins have a <strong>Simulate offline mode</strong> toggle in <em>Settings → Developer</em>. When on, every API request is short-circuited with a synthetic network error, so you can verify the offline experience end-to-end from your desk.</P>

      <div className="h-8" />
    </div>
  );
}
