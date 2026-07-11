import { traceWorkflowStep } from '../config/otel.js';
import { runReportAgent } from '../agents/report-agent.js';
import { IncidentState } from '../schemas/incident-state.js';

/**
 * Autonomy Tier Router logic that decides the lifecycle flow of an incident.
 */
export async function routeAutonomy(state: IncidentState): Promise<IncidentState> {
  return traceWorkflowStep('autonomy-router', 'route-lifecycle', state.incidentId, async (span) => {
    span.setAttribute('incident.id', state.incidentId);

    const status = state.status;
    const assetCriticality = state.remediationPlan?.assetCriticality;
    const isStandard = assetCriticality === 'low_impact' || assetCriticality === 'medium_impact' || (assetCriticality as any) === 'standard';

    // ROUTING CRITERIA
    if (status === 'pending_human_review' || assetCriticality === 'high_impact') {
      // Route to L2 HITL Approval
      state.autonomyDecision = 'l2_hitl_approval';
      (state as any).autonomy_tier = 'L2_HITL_APPROVAL';
      span.setAttribute('router.path', 'L2_HITL_APPROVAL');
    } else if (status === 'resolved' && isStandard) {
      // Route to L4 Auto-Execute
      state.autonomyDecision = 'l4_auto_execute';
      (state as any).autonomy_tier = 'L4_AUTO_EXECUTE';
      span.setAttribute('router.path', 'L4_AUTO_EXECUTE');
    } else {
      // Default: If standard criticality and not explicitly failed or pending, route to auto-execute
      state.autonomyDecision = 'l4_auto_execute';
      (state as any).autonomy_tier = 'L4_AUTO_EXECUTE';
      span.setAttribute('router.path', 'L4_AUTO_EXECUTE_DEFAULT');
    }

    // Process actions based on selected path
    if ((state as any).autonomy_tier === 'L4_AUTO_EXECUTE') {
      state.status = 'resolved';
      state.reasoningLog.push(`[autonomy-router] Route: L4_AUTO_EXECUTE. Triggering post-mortem workflow.`);
      const reportResult = await runReportAgent(state);
      state = reportResult.state;
    } else if ((state as any).autonomy_tier === 'L2_HITL_APPROVAL') {
      state.status = 'pending_human_review';
      state.reasoningLog.push(`[autonomy-router] Route: L2_HITL_APPROVAL. Workflow paused. Awaiting SOC analyst decision card submission.`);
    }

    return state;
  });
}
