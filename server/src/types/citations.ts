/**
 * Citation / provenance types — shared shape between server and client for
 * AI features (MEDDPICC Coach, Call Prep, etc.). Issue #135.
 *
 * Duplicated at `client/src/types/citations.ts`. Keep in sync.
 */

/** Kinds of things an AI claim can cite. */
export type CitationKind =
  | 'note'
  | 'task'
  | 'field'            // Opportunity SF/app column, e.g., "economic_buyer", "technical_blockers"
  | 'tech_discovery'   // Tech Discovery path: "technical_constraints" or "tech_stack.data_warehouse"
  | 'kb_proof_point'
  | 'history'          // Field-history entry
  | 'opportunity';     // A whole deal — used by cross-opp narratives (1:1 Prep, Forecasting).
                       // Click-jump navigates to the deal's drawer.

/**
 * A resolved citation returned by the server — ref info + preview strings the
 * client renders in the hover tooltip. `id` is the numeric marker number that
 * appears in the AI's `[N]` markers (1-based, stable per response).
 */
export interface ResolvedCitation {
  id: number;
  kind: CitationKind;

  /** Title for the hover tooltip. e.g., "Salesforce field · Economic Buyer" */
  label: string;
  /** Extra line: timestamp / author / context. */
  meta?: string;
  /** The actual content preview (quoted excerpt or field value). */
  preview: string;

  // Kind-specific pointers. Exactly one is populated per citation; clients
  // read these to know what to scroll to in the drawer.
  note_id?: number;
  task_id?: number;
  field_name?: string;
  tech_discovery_path?: string;
  kb_proof_point_id?: number;
  history_field?: string;
  opportunity_id?: number;
  opportunity_sfid?: string;  // for client-side click-jump to /home?oppId=<sfid>
}

/** Envelope for AI outputs that include citations. */
export interface CitedText {
  text: string;                       // Contains `[N]` markers
  citations: ResolvedCitation[];      // Array; citations[i].id === i + 1
}

/**
 * A source the AI is allowed to cite. Passed into the prompt context. The
 * validator later re-checks that each citation the AI emitted in the response
 * corresponds to one of these (so hallucinated ids get stripped).
 */
export interface CitationSource {
  /** Stable internal key, e.g., "note-45" or "field-economic_buyer". Used by the
   *  validator to dedupe and confirm. Not shown to the AI — only the list
   *  order + id number is. */
  key: string;
  kind: CitationKind;
  label: string;                       // Same role as ResolvedCitation.label
  meta?: string;
  preview: string;

  // Raw pointer — copied into ResolvedCitation when accepted.
  note_id?: number;
  task_id?: number;
  field_name?: string;
  tech_discovery_path?: string;
  kb_proof_point_id?: number;
  history_field?: string;
  opportunity_id?: number;
  opportunity_sfid?: string;
}
