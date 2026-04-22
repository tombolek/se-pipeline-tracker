/**
 * Citation / provenance types — shared shape between server and client for
 * AI features (MEDDPICC Coach, Call Prep, etc.). Issue #135.
 *
 * Duplicated at `server/src/types/citations.ts`. Keep in sync.
 */

export type CitationKind =
  | 'note'
  | 'task'
  | 'field'
  | 'tech_discovery'
  | 'kb_proof_point'
  | 'history'
  | 'opportunity';

export interface ResolvedCitation {
  id: number;
  kind: CitationKind;
  label: string;
  meta?: string;
  preview: string;

  note_id?: number;
  task_id?: number;
  field_name?: string;
  tech_discovery_path?: string;
  kb_proof_point_id?: number;
  history_field?: string;
  opportunity_id?: number;
  opportunity_sfid?: string;
}

export interface CitedText {
  text: string;
  citations: ResolvedCitation[];
}
