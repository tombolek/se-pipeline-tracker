export interface Opportunity {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  account_segment: string | null;
  account_industry: string | null;
  stage: string;
  arr: number | null;
  arr_currency: string;
  close_date: string | null;
  ae_owner_name: string | null;
  team: string | null;
  deploy_mode: string | null;
  record_type: string | null;
  key_deal: boolean;
  se_comments: string | null;
  se_comments_updated_at: string | null;
  manager_comments: string | null;
  next_step_sf: string | null;
  poc_status: string | null;
  engaged_competitors: string | null;
  is_closed_lost: boolean;
  closed_at: string | null;
  closed_lost_seen: boolean;
  last_note_at: string | null;
  stage_changed_at: string | null;
  previous_stage: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
  open_task_count: number;
  next_step_count: number;
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

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'manager' | 'se';
  is_active: boolean;
  show_qualify: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface ApiResponse<T = unknown> {
  data: T;
  error: string | null;
  meta: Record<string, unknown>;
}
