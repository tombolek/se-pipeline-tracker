/**
 * PDF citation helpers (#135 · Phase 3).
 *
 * The Call Prep / Demo Prep PDF export builds an HTML string, opens it in a
 * new window, and triggers `window.print()`. We want the exported PDF to
 * retain the same provenance Claude Code emits on-screen — `[N]` markers and
 * a parallel `ResolvedCitation[]`. Since a printed PDF can't show hover
 * tooltips, we lift the source info into a classic academic-style footnote
 * appendix: inline markers render as small superscript pills, and a numbered
 * "Sources" section at the end lists each citation once with its label, meta,
 * and preview quote.
 *
 * HTML safety: any text passing through these helpers is escaped first so a
 * stray `<`, `>`, or `&` in a note preview doesn't corrupt the printed doc.
 */
import type { ResolvedCitation } from '../types/citations';

/** HTML-escape for user-supplied strings going into the PDF's innerHTML. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a prose fragment for the PDF:
 *  - HTML-escapes first (safety)
 *  - Converts `**bold**` → `<strong>`
 *  - Converts `[N]` markers → superscript pills (or a red `?` for markers that
 *    aren't in the `citations` array — same hallucination-guard grammar as the
 *    on-screen view)
 *
 * Pass the full citation list for this prose block so the renderer can tell
 * supported vs. unsupported markers apart.
 */
export function pdfInline(
  text: string,
  citations: ResolvedCitation[] | undefined,
): string {
  const known = new Set<number>((citations ?? []).map(c => c.id));
  const esc = escHtml(text);
  // Bold markers first — `**…**` is server-controlled so safe to process after escape.
  const bolded = esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Then inline `[N]` markers. Supported ones become a small purple superscript
  // pill; unsupported ones become a muted red `[?]` to flag uncited claims.
  return bolded.replace(/\[(\d+)\]/g, (_, n) => {
    const id = parseInt(n, 10);
    if (known.has(id)) {
      return `<sup class="cite-sup">${id}</sup>`;
    }
    return `<sup class="cite-sup cite-bad">?</sup>`;
  });
}

/**
 * Build a Sources appendix from the combined citation list across all prose
 * fields in the document. Dedupes by citation id so a claim cited three times
 * shows once at the bottom. Returns an empty string if there are no
 * citations so callers don't need to branch.
 */
export function buildSourcesAppendix(
  citationLists: Array<ResolvedCitation[] | undefined>,
): string {
  const byId = new Map<number, ResolvedCitation>();
  for (const list of citationLists) {
    for (const c of list ?? []) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
  }
  if (byId.size === 0) return '';

  const kindLabels: Record<string, string> = {
    note: 'Note',
    task: 'Task',
    field: 'SF Field',
    tech_discovery: 'Tech Discovery',
    kb_proof_point: 'KB Proof Point',
    history: 'History',
    opportunity: 'Opportunity',
  };

  const sorted = [...byId.values()].sort((a, b) => a.id - b.id);
  const rows = sorted
    .map(c => {
      const kind = kindLabels[c.kind] ?? c.kind;
      const preview = escHtml(truncate(c.preview ?? '', 220));
      const meta = c.meta ? ` &middot; ${escHtml(c.meta)}` : '';
      return `<li id="src-${c.id}">
        <div class="src-head"><span class="src-kind">${kind}</span> <strong>${escHtml(c.label)}</strong><span class="src-meta">${meta}</span></div>
        <div class="src-preview">&ldquo;${preview}&rdquo;</div>
      </li>`;
    })
    .join('');

  return `<div class="section sources-section">
    <h2>Sources</h2>
    <p class="sources-note">Footnote numbers above link to the items below. Claims without a number weren't backed by a specific source.</p>
    <ol class="sources">${rows}</ol>
  </div>`;
}

/** CSS block for PDF — shared by Call Prep and Demo Prep. Drop inside <style>. */
export const PDF_CITATION_CSS = `
  .cite-sup { display: inline-block; font-size: 7pt; font-weight: 700; color: #6a2cf5; background: #ede9fe; padding: 0 3px; border-radius: 2px; margin: 0 1px; vertical-align: super; line-height: 1; }
  .cite-sup.cite-bad { color: #b91c1c; background: #fee2e2; }
  .sources-section { margin-top: 24px; border-top: 1px solid #ded0fd; padding-top: 16px; page-break-before: auto; }
  .sources-note { font-size: 9pt; color: #665d81; margin-bottom: 8px; }
  .sources { list-style: decimal; margin-left: 22px; }
  .sources li { margin-bottom: 8px; font-size: 10pt; page-break-inside: avoid; }
  .src-head { margin-bottom: 2px; }
  .src-kind { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6a2cf5; margin-right: 4px; }
  .src-meta { color: #665d81; font-size: 9pt; }
  .src-preview { color: #4a4057; font-style: italic; font-size: 9.5pt; }
`;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}
