export interface Opportunity {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  account_segment: string | null;
  account_industry: string | null;
  stage: string;
  record_type: string | null;
  key_deal: boolean;
  arr: number | null;
  arr_currency: string;
  arr_converted: number | null;
  close_date: string | null;
  close_month: string | null;
  fiscal_period: string | null;
  fiscal_year: string | null;
  ae_owner_name: string | null;
  se_owner: { id: number; name: string; email: string } | null;
  team: string | null;
  deploy_mode: string | null;
  deploy_location: string | null;
  sales_plays: string | null;
  lead_source: string | null;
  opportunity_source: string | null;
  channel_source: string | null;
  biz_dev: string | null;
  open_task_count: number;
  next_step_count: number;
  overdue_task_count: number;
  se_comments: string | null;
  se_comments_updated_at: string | null;
  manager_comments: string | null;
  next_step_sf: string | null;
  psm_comments: string | null;
  technical_blockers: string | null;
  engaged_competitors: string | null;
  budget: string | null;
  authority: string | null;
  need: string | null;
  timeline: string | null;
  metrics: string | null;
  economic_buyer: string | null;
  decision_criteria: string | null;
  decision_process: string | null;
  paper_process: string | null;
  implicate_pain: string | null;
  champion: string | null;
  agentic_qual: string | null;
  poc_status: string | null;
  poc_start_date: string | null;
  poc_end_date: string | null;
  poc_type: string | null;
  poc_deploy_type: string | null;
  rfx_status: string | null;
  sourcing_partner: string | null;
  sourcing_partner_tier: string | null;
  influencing_partner: string | null;
  partner_manager: string | null;
  is_closed_lost: boolean;
  closed_at: string | null;
  closed_lost_seen: boolean;
  last_note_at: string | null;
  stage_changed_at: string | null;
  previous_stage: string | null;
  is_favorited: boolean;
  // Detail only
  tasks?: Task[];
  notes?: Note[];
  sf_raw_fields?: Record<string, unknown>;
}

export interface Task {
  id: number;
  opportunity_id: number;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done' | 'blocked';
  is_next_step: boolean;
  due_date: string | null;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  created_by_id: number | null;
  opportunity_name?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  opportunity_id: number;
  author_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

export interface ColumnPrefs {
  pipeline?: string[];
  closed_lost?: string[];
  se_mapping?: string[];
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'manager' | 'se';
  is_active: boolean;
  show_qualify: boolean;
  force_password_change: boolean;
  manager_id: number | null;
  teams: string[];
  column_prefs: ColumnPrefs | null;
  created_at: string;
  last_login_at: string | null;
}

export interface ApiResponse<T = unknown> {
  data: T;
  error: string | null;
  meta: Record<string, unknown>;
}
