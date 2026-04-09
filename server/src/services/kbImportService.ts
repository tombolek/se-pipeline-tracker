import fs from 'fs';
import path from 'path';
import { query } from '../db/index.js';

// ── Proof Point Parser ──────────────────────────────────────────────────────

interface ParsedProofPoint {
  customer_name: string;
  about: string | null;
  vertical: string;
  products: string[];
  initiatives: string[];
  proof_point_text: string;
  source_file: string;
}

/**
 * Parse a vertical markdown file (e.g. finance_banking.md) into proof points.
 *
 * Expected format per customer:
 *   ### Customer Name
 *   **About:** ...
 *   | Field | Value |
 *   |---|---|
 *   | **Products** | DQ, MDM |
 *   | **Business Initiative(s)** | ... |
 *   **Proof Point:**
 *   <paragraphs>
 *   ---
 */
export function parseProofPointsFile(filePath: string): ParsedProofPoint[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const lines = content.split('\n');

  // Extract vertical name from first H1
  const h1Match = lines.find(l => l.startsWith('# '));
  const vertical = h1Match ? h1Match.replace(/^#\s+/, '').trim() : fileName.replace('.md', '');

  // Split into customer sections by ### headings
  const customers: ParsedProofPoint[] = [];
  let i = 0;

  while (i < lines.length) {
    // Find next ### heading
    if (!lines[i].startsWith('### ')) { i++; continue; }

    const customerName = lines[i].replace(/^###\s+/, '').trim();
    i++;

    let about: string | null = null;
    let products: string[] = [];
    let initiatives: string[] = [];
    let proofText = '';
    let inProofPoint = false;

    // Parse until next --- or ### or EOF
    while (i < lines.length && !lines[i].startsWith('### ')) {
      const line = lines[i];

      // About line
      if (line.startsWith('**About:**')) {
        about = line.replace(/^\*\*About:\*\*\s*/, '').trim();
        i++;
        continue;
      }

      // Products from table row
      if (line.includes('**Products**')) {
        const match = line.match(/\|\s*\*\*Products\*\*\s*\|\s*(.+?)\s*\|/);
        if (match) {
          products = match[1].split(',').map(p => p.trim()).filter(Boolean);
        }
        i++;
        continue;
      }

      // Initiatives from table row
      if (line.includes('**Business Initiative')) {
        const match = line.match(/\|\s*\*\*Business Initiative[^|]*\*\*\s*\|\s*(.+?)\s*\|/);
        if (match) {
          initiatives = match[1].split(',').map(p => p.trim()).filter(Boolean);
        }
        i++;
        continue;
      }

      // Proof Point start
      if (line.startsWith('**Proof Point:**')) {
        inProofPoint = true;
        i++;
        continue;
      }

      // Separator — end of this customer
      if (line.trim() === '---') {
        i++;
        break;
      }

      // Accumulate proof point text
      if (inProofPoint && line.trim()) {
        proofText += (proofText ? '\n\n' : '') + line.trim();
      }

      i++;
    }

    if (customerName && proofText) {
      customers.push({
        customer_name: customerName.replace(/\.$/, ''), // remove trailing period (e.g. "Associated Bank.")
        about,
        vertical,
        products,
        initiatives,
        proof_point_text: proofText,
        source_file: fileName,
      });
    }
  }

  return customers;
}

// ── Differentiator Parser ───────────────────────────────────────────────────

interface ParsedDifferentiator {
  name: string;
  tagline: string | null;
  core_message: string | null;
  capabilities_text: string;
  need_signals: string[];
  proof_points_json: unknown[];
  competitive_positioning: string | null;
  source_file: string;
}

/**
 * Parse the platform differentiators markdown into structured records.
 *
 * Expected format:
 *   ## N. Differentiator Name
 *   **Tagline:** ...
 *   **Core message:** ...
 *   ### Key Capabilities
 *   ...
 *   ### Prospect Need Signals
 *   - bullet items
 *   ### Proof Points
 *   | table |
 */
export function parseDifferentiatorsFile(filePath: string): {
  differentiators: ParsedDifferentiator[];
  competitivePositioning: string;
  needMapping: string;
} {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // Split on ## headings (level 2)
  const sections = content.split(/\n(?=## )/);

  const differentiators: ParsedDifferentiator[] = [];
  let competitivePositioning = '';
  let needMapping = '';

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0]?.trim() || '';

    // Match numbered differentiator: ## 1. Name or ## 2. Name etc.
    const diffMatch = heading.match(/^##\s+\d+\.\s+(.+)/);
    if (diffMatch) {
      const name = diffMatch[1].trim();

      // Extract tagline
      const taglineLine = lines.find(l => l.startsWith('**Tagline:**'));
      const tagline = taglineLine?.replace(/^\*\*Tagline:\*\*\s*/, '').trim() || null;

      // Extract core message
      const coreMsgLine = lines.find(l => l.startsWith('**Core message:**'));
      const core_message = coreMsgLine?.replace(/^\*\*Core message:\*\*\s*/, '').trim() || null;

      // Extract capabilities section (between ### Key Capabilities and ### Prospect Need Signals)
      const capStart = lines.findIndex(l => l.includes('Key Capabilities'));
      const capEnd = lines.findIndex((l, idx) => idx > capStart && l.includes('Prospect Need Signals'));
      const capabilities_text = capStart >= 0 && capEnd >= 0
        ? lines.slice(capStart + 1, capEnd).join('\n').trim()
        : '';

      // Extract need signals (bullet list after ### Prospect Need Signals)
      const needStart = lines.findIndex(l => l.includes('Prospect Need Signals'));
      const needEnd = lines.findIndex((l, idx) => idx > needStart + 1 && l.startsWith('### '));
      const needLines = needStart >= 0
        ? lines.slice(needStart + 1, needEnd >= 0 ? needEnd : undefined)
        : [];
      const need_signals = needLines
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^[\s-]+/, '').trim())
        .filter(Boolean);

      // Extract proof points table
      const ppStart = lines.findIndex(l => l.includes('### Proof Points'));
      const proof_points_json: unknown[] = [];
      if (ppStart >= 0) {
        // Find table rows (lines starting with |, skip header and separator)
        let tableStarted = false;
        for (let j = ppStart + 1; j < lines.length; j++) {
          const l = lines[j].trim();
          if (l.startsWith('|') && l.includes('---')) { tableStarted = true; continue; }
          if (l.startsWith('| **') || (tableStarted && l.startsWith('|'))) {
            const cells = l.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 4) {
              proof_points_json.push({
                customer: cells[0].replace(/\*\*/g, ''),
                industry: cells[1],
                challenge: cells[2],
                outcome: cells[3],
              });
            }
          }
          if (!l.startsWith('|') && tableStarted) break;
        }
      }

      differentiators.push({
        name,
        tagline,
        core_message,
        capabilities_text,
        need_signals,
        proof_points_json,
        competitive_positioning: null, // set globally below
        source_file: fileName,
      });
    }

    // Competitive Positioning Summary section
    if (heading.includes('Competitive Positioning Summary')) {
      competitivePositioning = lines.slice(1).join('\n').trim();
    }

    // Quick Reference: Need → Differentiator Mapping
    if (heading.includes('Quick Reference')) {
      needMapping = lines.slice(1).join('\n').trim();
    }
  }

  return { differentiators, competitivePositioning, needMapping };
}

// ── Database Import ─────────────────────────────────────────────────────────

export async function importKnowledgeBase(kbDir: string): Promise<{
  proofPoints: number;
  differentiators: number;
  files: string[];
}> {
  const files: string[] = [];
  let totalPP = 0;
  let totalDiff = 0;

  // 1. Clear existing data
  await query('DELETE FROM kb_import_log', []);
  await query('DELETE FROM kb_proof_points', []);
  await query('DELETE FROM kb_differentiators', []);

  // 2. Import proof point files (all .md files except index.md and differentiators)
  const allFiles = fs.readdirSync(kbDir).filter(f => f.endsWith('.md'));
  const ppFiles = allFiles.filter(f => f !== 'index.md' && !f.includes('differentiator'));

  for (const fileName of ppFiles) {
    const filePath = path.join(kbDir, fileName);
    const proofPoints = parseProofPointsFile(filePath);

    for (const pp of proofPoints) {
      await query(
        `INSERT INTO kb_proof_points (customer_name, about, vertical, products, initiatives, proof_point_text, source_file)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (customer_name) DO UPDATE SET
           about = $2, vertical = $3, products = $4, initiatives = $5,
           proof_point_text = $6, source_file = $7, updated_at = now()`,
        [pp.customer_name, pp.about, pp.vertical, pp.products, pp.initiatives, pp.proof_point_text, pp.source_file]
      );
    }

    await query(
      'INSERT INTO kb_import_log (file_name, record_type, record_count) VALUES ($1, $2, $3)',
      [fileName, 'proof_point', proofPoints.length]
    );

    files.push(`${fileName}: ${proofPoints.length} proof points`);
    totalPP += proofPoints.length;
  }

  // 3. Import differentiators
  const diffFile = allFiles.find(f => f.includes('differentiator'));
  if (diffFile) {
    const filePath = path.join(kbDir, diffFile);
    const { differentiators, competitivePositioning } = parseDifferentiatorsFile(filePath);

    for (const d of differentiators) {
      await query(
        `INSERT INTO kb_differentiators (name, tagline, core_message, capabilities_text, need_signals, proof_points_json, competitive_positioning, source_file)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET
           tagline = $2, core_message = $3, capabilities_text = $4, need_signals = $5,
           proof_points_json = $6, competitive_positioning = $7, source_file = $8, updated_at = now()`,
        [d.name, d.tagline, d.core_message, d.capabilities_text, d.need_signals,
         JSON.stringify(d.proof_points_json), competitivePositioning, diffFile]
      );
    }

    await query(
      'INSERT INTO kb_import_log (file_name, record_type, record_count) VALUES ($1, $2, $3)',
      [diffFile, 'differentiator', differentiators.length]
    );

    files.push(`${diffFile}: ${differentiators.length} differentiators`);
    totalDiff += differentiators.length;
  }

  return { proofPoints: totalPP, differentiators: totalDiff, files };
}
