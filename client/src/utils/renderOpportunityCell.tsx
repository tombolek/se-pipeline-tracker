/**
 * Shared cell renderer for dynamic opportunity columns.
 * Used by PipelinePage, ClosedLostPage, and SeDealMappingPage.
 */
import type { Opportunity } from '../types';
import StageBadge from '../components/shared/StageBadge';
import FreshnessDot from '../components/shared/FreshnessDot';
import TruncatedCell from '../components/shared/TruncatedCell';
import HealthScoreBadge from '../components/shared/HealthScoreBadge';
import { formatARR, formatDate } from './formatters';

const dash = <span className="text-brand-navy-30">—</span>;
// block + truncate + max-w caps plain-text cells so no single value blows out column width
const txt = (v: string | null | undefined) =>
  v ? <span className="text-xs text-brand-navy-70 block truncate max-w-[180px]">{v}</span> : dash;

export function renderOpportunityCell(opp: Opportunity, colKey: string): React.ReactNode {
  switch (colKey) {
    case 'name':
      return (
        <div className="flex items-center gap-2 min-w-0">
          <FreshnessDot updatedAt={opp.se_comments_updated_at} />
          <span className="text-sm font-medium text-brand-navy truncate max-w-[260px]">{opp.name}</span>
        </div>
      );
    case 'account_name':     return txt(opp.account_name);
    case 'account_segment':  return txt(opp.account_segment);
    case 'account_industry': return txt(opp.account_industry);
    case 'stage':            return <StageBadge stage={opp.stage} />;
    case 'record_type':      return txt(opp.record_type);
    case 'key_deal':
      return opp.key_deal
        ? <span className="text-xs font-medium text-brand-purple">Yes</span>
        : dash;
    case 'close_date': {
      const isOverdue = opp.close_date && new Date(opp.close_date) < new Date();
      return (
        <span className={`text-xs whitespace-nowrap ${isOverdue ? 'text-status-overdue font-medium' : 'text-brand-navy-70'}`}>
          {formatDate(opp.close_date)}
        </span>
      );
    }
    case 'close_month':      return txt(opp.close_month);
    case 'fiscal_period':    return txt(opp.fiscal_period);
    case 'fiscal_year':      return txt(opp.fiscal_year);
    case 'deploy_mode':      return txt(opp.deploy_mode);
    case 'deploy_location':  return txt(opp.deploy_location);
    case 'sales_plays':
      return <TruncatedCell value={opp.sales_plays} className="text-xs text-brand-navy-70" />;
    case 'arr':
      return <span className="text-sm font-medium text-brand-navy whitespace-nowrap">{formatARR(opp.arr)}</span>;
    case 'arr_currency':     return txt(opp.arr_currency);
    case 'arr_converted':
      return <span className="text-sm font-medium text-brand-navy whitespace-nowrap">{formatARR(opp.arr_converted)}</span>;
    case 'ae_owner_name':    return txt(opp.ae_owner_name);
    case 'se_owner':
      return opp.se_owner
        ? <span className="text-xs text-brand-navy-70 block truncate max-w-[180px]">{opp.se_owner.name}</span>
        : <span className="text-xs text-status-warning font-medium">Unassigned</span>;
    case 'team':                return txt(opp.team);
    case 'lead_source':         return txt(opp.lead_source);
    case 'opportunity_source':  return txt(opp.opportunity_source);
    case 'channel_source':      return txt(opp.channel_source);
    case 'biz_dev':             return txt(opp.biz_dev);
    case 'health_score':
      return <HealthScoreBadge opp={opp} />;
    case 'open_task_count':
      return opp.open_task_count > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-brand-navy-70">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {opp.open_task_count}
        </span>
      ) : dash;
    case 'se_comments_freshness':
      return <FreshnessDot updatedAt={opp.se_comments_updated_at} />;
    case 'next_step_sf':
      return <TruncatedCell value={opp.next_step_sf} className="text-xs text-brand-navy-70" />;
    case 'manager_comments':
      return <TruncatedCell value={opp.manager_comments} className="text-xs text-brand-navy-70" />;
    case 'se_comments':
      return <TruncatedCell value={opp.se_comments} className="text-xs text-brand-navy-70" />;
    case 'psm_comments':
      return <TruncatedCell value={opp.psm_comments} className="text-xs text-brand-navy-70" />;
    case 'technical_blockers':
      return <TruncatedCell value={opp.technical_blockers} className="text-xs text-brand-navy-70" />;
    case 'engaged_competitors':
      return <TruncatedCell value={opp.engaged_competitors} className="text-xs text-brand-navy-70" />;
    case 'budget':            return <TruncatedCell value={opp.budget}            className="text-xs text-brand-navy-70" />;
    case 'authority':         return <TruncatedCell value={opp.authority}         className="text-xs text-brand-navy-70" />;
    case 'need':              return <TruncatedCell value={opp.need}              className="text-xs text-brand-navy-70" />;
    case 'timeline':          return <TruncatedCell value={opp.timeline}          className="text-xs text-brand-navy-70" />;
    case 'metrics':           return <TruncatedCell value={opp.metrics}           className="text-xs text-brand-navy-70" />;
    case 'economic_buyer':    return <TruncatedCell value={opp.economic_buyer}    className="text-xs text-brand-navy-70" />;
    case 'decision_criteria': return <TruncatedCell value={opp.decision_criteria} className="text-xs text-brand-navy-70" />;
    case 'decision_process':  return <TruncatedCell value={opp.decision_process}  className="text-xs text-brand-navy-70" />;
    case 'paper_process':     return <TruncatedCell value={opp.paper_process}     className="text-xs text-brand-navy-70" />;
    case 'implicate_pain':    return <TruncatedCell value={opp.implicate_pain}    className="text-xs text-brand-navy-70" />;
    case 'champion':          return <TruncatedCell value={opp.champion}          className="text-xs text-brand-navy-70" />;
    case 'agentic_qual':      return <TruncatedCell value={opp.agentic_qual}      className="text-xs text-brand-navy-70" />;
    case 'poc_status':        return txt(opp.poc_status);
    case 'poc_start_date':    return <span className="text-xs text-brand-navy-70">{formatDate(opp.poc_start_date)}</span>;
    case 'poc_end_date':      return <span className="text-xs text-brand-navy-70">{formatDate(opp.poc_end_date)}</span>;
    case 'poc_type':          return txt(opp.poc_type);
    case 'poc_deploy_type':   return txt(opp.poc_deploy_type);
    case 'rfx_status':            return txt(opp.rfx_status);
    case 'sourcing_partner':      return txt(opp.sourcing_partner);
    case 'sourcing_partner_tier': return txt(opp.sourcing_partner_tier);
    case 'influencing_partner':   return txt(opp.influencing_partner);
    case 'partner_manager':       return txt(opp.partner_manager);
    case 'closed_at':             return <span className="text-xs text-brand-navy-70 whitespace-nowrap">{formatDate(opp.closed_at)}</span>;
    default:                      return dash;
  }
}
