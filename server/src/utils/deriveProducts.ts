/**
 * Derive Ataccama product tags from an opportunity name.
 *
 * Product abbreviations found in opp names:
 *   DQG, DQC, DQ&C, DQ&G, DQ/DG, DQ  →  DQ
 *   MDM                                →  MDM
 *   RDM                                →  RDM
 *   Catalog, Data Catalog, DC          →  Catalog
 *   Lineage                            →  Lineage
 *   Data Observability, Observability  →  Observability
 *   DG, Data Governance                →  DG
 *   Full Platform                      →  DQ, MDM, RDM, Catalog
 */
export function deriveProducts(oppName: string): string[] {
  const n = oppName.toUpperCase();
  const products = new Set<string>();

  // Full Platform — expands to all core modules
  if (/FULL\s+PLATFORM/i.test(oppName)) {
    products.add('DQ');
    products.add('MDM');
    products.add('RDM');
    products.add('Catalog');
    return [...products];
  }

  // DQ variants: DQG, DQC, DQ&C, DQ&G, DQ/DG, DQ- standalone
  // Must match DQ when not part of another word
  if (/\bDQ[GC&\/]\b|DQ&[CG]|\bDQ\b|\bDQ[- ]/.test(n)) {
    products.add('DQ');
  }

  // MDM
  if (/\bMDM\b/.test(n)) {
    products.add('MDM');
  }

  // RDM
  if (/\bRDM\b/.test(n)) {
    products.add('RDM');
  }

  // Catalog / Data Catalog
  if (/\bCATALOG\b|\bDATA\s+CATALOG\b/.test(n)) {
    products.add('Catalog');
  }

  // Lineage
  if (/\bLINEAGE\b/.test(n)) {
    products.add('Lineage');
  }

  // Data Observability / Observability
  if (/\bOBSERVABILITY\b/.test(n)) {
    products.add('Observability');
  }

  // DG / Data Governance (but not when already captured as DQ via DQ/DG)
  if (/\bDG\b|\bDATA\s+GOVERNANCE\b/.test(n) && !products.has('DQ')) {
    products.add('DG');
  }

  return [...products];
}

/** Stages at or beyond Build Value (where products should be tagged) */
const ADVANCED_STAGES = new Set([
  'Build Value',
  'Proposal Sent',
  'Submitted for Booking',
  'Negotiate',
  'Closed Won',
]);

export function needsProductTaggingTask(products: string[], stage: string): boolean {
  return products.length === 0 && ADVANCED_STAGES.has(stage);
}
