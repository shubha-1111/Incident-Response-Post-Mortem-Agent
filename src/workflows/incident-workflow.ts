import { Workflow, createStep } from '@mastra/core';
import crypto from 'crypto';
import { z } from 'zod';
import { traceWorkflowStep, recordFailClosed } from '../config/otel.js';
import { IncidentState, IncidentStateSchema, createInitialIncidentState } from '../schemas/incident-state.js';
import { ingestLogs } from '../agents/ingest-agent.js';
import { runLogAgent } from '../agents/log-agent.js';
import { runAnomalyAgent } from '../agents/anomaly-agent.js';
import { runRcaAgent } from '../agents/rca-agent.js';
import { runRemediationAgent } from '../agents/remediation-agent.js';
import { runReportAgent } from '../agents/report-agent.js';
import { getFeatherlessService } from '../services/featherless-service.js';
import { getAssetCriticality } from '../tools/cmdb-tools.js';
import { qdrantClient, COLLECTIONS } from '../config/qdrant.js';
import { saveIncidentState, insertRiskHistory, insertMetricSnapshot } from '../database/database.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';
import { calculateThreatScore } from '../services/scoring-engine.js';
import { calculateExecutionConfidence } from '../services/confidence-engine.js';

// Helper to save database status and broadcast state update to frontend WebSocket connection
async function updateProgress(
  state: IncidentState, 
  stepId: string, 
  stepStatus: 'running' | 'completed' | 'failed'
) {
  try {
    await saveIncidentState(state);
    
    // Persist a metric snapshot for confidence curve + breakdown charts
    const confidenceScore = typeof state.confidenceScore === 'number' ? state.confidenceScore : undefined;
    const retrievalConfidence = typeof state.retrievalConfidence === 'number' ? state.retrievalConfidence : undefined;
    const threatScore = typeof state.threatScore === 'number' ? state.threatScore : undefined;
    await insertMetricSnapshot(state.incidentId, stepId, {
      confidence: confidenceScore,
      retrievalConfidence,
      threatScore,
    });
    
    // 1. Emit the base workflow step event
    eventBus.emit(IncidentEventType.WORKFLOW_STEP, {
      incidentId: state.incidentId,
      stepId,
      status: stepStatus,
      state,
      timestamp: Date.now()
    });

    // 2. Emit specific granular lifecycle events based on step and status
    if (stepId === 'ingestion-gate-step' && stepStatus === 'running') {
      eventBus.emit(IncidentEventType.LOG_RECEIVED, { incidentId: state.incidentId });
    }
    
    if (stepId === 'log-analysis-step' && stepStatus === 'completed') {
      eventBus.emit(IncidentEventType.LOG_PARSED, {
        incidentId: state.incidentId,
        host: state.targetHost,
        process: state.evidenceChain?.[0]?.payload?.process || 'syslog'
      });
    }

    if (stepId === 'anomaly-analysis-step' && stepStatus === 'completed') {
      const isAnomaly = state.evidenceChain?.some(entry => ((entry.payload as any)?.confidence ?? 0) > 0.5);
      eventBus.emit(IncidentEventType.ANOMALY_FOUND, {
        incidentId: state.incidentId,
        isAnomaly
      });
    }

    if (stepId === 'rca-step') {
      if (stepStatus === 'running') {
        eventBus.emit(IncidentEventType.RCA_STARTED, { incidentId: state.incidentId });
      } else if (stepStatus === 'completed') {
        eventBus.emit(IncidentEventType.RCA_COMPLETED, {
          incidentId: state.incidentId,
          rootCause: state.rootCauseHypothesis || 'unknown'
        });
      }
    }

    if (stepId === 'remediation-step') {
      if (stepStatus === 'running') {
        eventBus.emit(IncidentEventType.MITIGATION_STARTED, { incidentId: state.incidentId });
      } else if (stepStatus === 'completed') {
        eventBus.emit(IncidentEventType.MITIGATION_COMPLETED, {
          incidentId: state.incidentId,
          action: state.remediationAction?.actionType || 'none',
          targetHost: state.targetHost
        });
      }
    }

    if (stepId === 'autonomy-routing-step' && stepStatus === 'running') {
      if (state.status === 'pending_human_review') {
        eventBus.emit(IncidentEventType.HITL_REQUIRED, { incidentId: state.incidentId });
      }
    }

    if (stepId === 'report-step') {
      if (stepStatus === 'running') {
        eventBus.emit(IncidentEventType.POSTMORTEM_STARTED, { incidentId: state.incidentId });
      } else if (stepStatus === 'completed') {
        eventBus.emit(IncidentEventType.POSTMORTEM_FINISHED, { incidentId: state.incidentId });
      }
    }
  } catch (err) {
    console.error(`[Workflow Progress Broadcast] Failed to save/broadcast status for ${stepId}:`, err);
  }
}


// Schemas for step validation
const ingestInputSchema = z.object({
  state: IncidentStateSchema.optional(),
  incidentId: z.string(),
  logs: z.array(z.string()).optional(),
});

const standardInputSchema = z.object({
  state: IncidentStateSchema,
  incidentId: z.string(),
});

const standardOutputSchema = z.object({
  state: IncidentStateSchema,
  incidentId: z.string(),
});

// ----------------------------------------------------
// 1. Ingestion Gate Step
// ----------------------------------------------------
export const ingestionGateStep = createStep({
  id: 'ingestion-gate-step',
  inputSchema: ingestInputSchema,
  outputSchema: standardOutputSchema,
  execute: async (params: any) => {
    const inputData = params?.inputData;
    const logs = (inputData?.logs || []) as string[];
    const incidentId = (inputData?.incidentId || 'INC-2026-DEMO-001') as string;

    const state = createInitialIncidentState({ incidentId, rawLogLines: logs });
    state.status = 'ingesting';
    state.currentNodeId = 'ingest-agent';
    state.currentTierId = 'ingestion-tier';
    await updateProgress(state, 'ingestion-gate-step', 'running');

    return traceWorkflowStep('incident-response-workflow', 'ingestion-gate-step', incidentId, async (span) => {
      try {
        const { written, quarantined } = await ingestLogs(logs, incidentId);
        const newState = {
          ...state,
          status: 'ingesting' as const,
        };
        await updateProgress(newState, 'ingestion-gate-step', 'completed');
        return { state: newState, incidentId };
      } catch (err: any) {
        console.error(`[Workflow Step: ingestion-gate-step] Error: ${err.message}`);
        const newState = {
          ...state,
          status: 'pending_human_review' as const,
          autonomyTier: 'L2_HITL_APPROVAL',
        };
        await updateProgress(newState, 'ingestion-gate-step', 'failed');
        return { state: newState, incidentId };
      }
    });
  },
});

// ----------------------------------------------------
// 2. Log Analysis Step
// ----------------------------------------------------
export const logAnalysisStep = createStep({
  id: 'log-analysis-step',
  inputSchema: standardInputSchema,
  outputSchema: standardOutputSchema.extend({
    forensicEvents: z.array(z.any()),
    logResult: z.any(),
  }),
  execute: async (params: any) => {
    try {
      const inputData = params?.inputData;
      const state = inputData?.state as IncidentState;
      const incidentId = inputData?.incidentId || 'INC-2026-DEMO-001';

      if (state) {
        state.status = 'analyzing';
        state.currentNodeId = 'log-agent';
        state.currentTierId = 'analysis-tier';
        if (!state.rawLogLines || state.rawLogLines.length === 0) {
          state.rawLogLines = ["SYSTEM ALERT: No log lines provided in initial ingestion payload. Analyze system status initialization."];
        }
        await updateProgress(state, 'log-analysis-step', 'running');
      }

      return traceWorkflowStep('incident-response-workflow', 'log-analysis-step', incidentId, async (span) => {
        try {
          const scrollResult = await qdrantClient.scroll(COLLECTIONS.FORENSIC_EVENTS, {
            filter: {
              must: [{ key: 'incident_id', match: { value: incidentId } }],
            },
            limit: 100,
          });
          const forensicEvents = scrollResult.points.map((p) => p.payload as any);
          const logResult = await runLogAgent(forensicEvents, incidentId);

          if (state) {
            await updateProgress(state, 'log-analysis-step', 'completed');
          }
          return { state: state || inputData, incidentId, forensicEvents, logResult };
        } catch (err: any) {
          console.error(`[Workflow Step: log-analysis-step] Error: ${err.message}`);
          if (state) {
            await updateProgress(state, 'log-analysis-step', 'failed');
          }
          return {
            state: state || inputData,
            incidentId,
            forensicEvents: [],
            logResult: { evidence: [], confidenceScore: 0.65 },
          };
        }
      });
    } catch (error: any) {
      console.error('[Diagnostic] Detailed failure inside log-analysis-step:', error);
      throw error;
    }
  },
});

// ----------------------------------------------------
// 3. Anomaly Analysis Step
// ----------------------------------------------------
export const anomalyAnalysisStep = createStep({
  id: 'anomaly-analysis-step',
  inputSchema: standardInputSchema.extend({
    forensicEvents: z.array(z.any()),
    logResult: z.any(),
  }),
  outputSchema: standardOutputSchema,
  execute: async (params: any) => {
    const inputData = params?.inputData;
    const prevState = inputData?.state as IncidentState;
    const incidentId = inputData?.incidentId as string;
    const forensicEvents = (inputData?.forensicEvents || []) as any[];
    const logResult = inputData?.logResult;

    if (prevState) {
      prevState.status = 'analyzing';
      prevState.currentNodeId = 'anomaly-agent';
      prevState.currentTierId = 'analysis-tier';
      await updateProgress(prevState, 'anomaly-analysis-step', 'running');
    }

    return traceWorkflowStep('incident-response-workflow', 'anomaly-analysis-step', incidentId, async (span) => {
      try {
        const anomalyResult = await runAnomalyAgent(forensicEvents, incidentId);
        const combinedEvidence = [...logResult.evidence, ...anomalyResult.evidence];
        const combinedConfidence = Math.max(logResult.confidenceScore, anomalyResult.confidenceScore);

        const evidenceEntries = combinedEvidence.map((p: any, idx: number) => ({
          evidenceId: p.eventId,
          incidentId,
          sequenceNo: idx,
          kind: 'forensic_event' as const,
          sourceNodeId: 'forensic-events-store' as const,
          observedAt: p.timestamp,
          recordedAt: new Date().toISOString(),
          summary: p.reason,
          payload: {
            host: p.host,
            confidence: p.confidence,
            threatIntelReport: p.payload?.threatIntelReport || null,
          },
          hash: crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),
        }));

        const assetCriticality = await getAssetCriticality(prevState?.targetHost || 'db-prod-02');
        
        let abuseIpConfidence = 0;
        let virusTotalScore = 0;
        const mitreTechniques: string[] = [];
        evidenceEntries.forEach((entry: any) => {
          const report = entry.payload?.threatIntelReport;
          if (report) {
            if (report.abuseIPDB?.abuseConfidenceScore !== undefined) {
              abuseIpConfidence = Math.max(abuseIpConfidence, report.abuseIPDB.abuseConfidenceScore);
            }
            if (report.virusTotal?.maliciousVotes !== undefined) {
              virusTotalScore = Math.max(virusTotalScore, report.virusTotal.maliciousVotes);
            }
            if (Array.isArray(report.mitreAttack)) {
              for (const t of report.mitreAttack) {
                if (t.techniqueId && t.techniqueId !== 'T0000') {
                  mitreTechniques.push(t.techniqueId);
                }
              }
            }
          }
        });

        const failedLoginCount = forensicEvents.filter((e: any) => /failed/i.test(e.raw_message || '')).length;
        
        const scoreResult = calculateThreatScore({
          severity: prevState?.status === 'failed_closed' ? 'critical' : 'high',
          mitreTechniques,
          abuseIpConfidence,
          virusTotalScore,
          failedLoginCount,
          assetCriticality,
          anomalyScore: combinedConfidence
        });

        const newState = {
          ...prevState,
          confidenceScore: combinedConfidence,
          evidenceChain: [...prevState.evidenceChain, ...evidenceEntries],
          status: 'analyzing' as const,
          threatScore: scoreResult.total,
          threatBreakdown: scoreResult.breakdown
        };

        // Featherless enrichment: analyze aggregated IOCs for threat level + recommendations
        if (process.env.FEATHERLESS_API_KEY) {
          try {
            const featherless = getFeatherlessService();
            const iocData = {
              abuseIpdb: abuseIpConfidence,
              virusTotal: virusTotalScore,
              mitreTechniques,
              failedLoginCount,
            };
            newState.threatIntelAssessment = await featherless.analyzeThreatIntel(iocData);
          } catch (feErr: any) {
            console.warn(`[Workflow] Featherless threat-intel analysis skipped: ${feErr.message}`);
          }
        }

        // Emit threat score to event bus
        eventBus.emit(IncidentEventType.THREAT_SCORE, {
          incidentId,
          threatScore: scoreResult.total,
          breakdown: scoreResult.breakdown
        });

        await insertRiskHistory(incidentId, scoreResult.total);

        await updateProgress(newState, 'anomaly-analysis-step', 'completed');
        return { state: newState, incidentId };
      } catch (err: any) {
        console.error(`[Workflow Step: anomaly-analysis-step] Error: ${err.message}`);
        const newState = {
          ...prevState,
          status: 'pending_human_review' as const,
          autonomyTier: 'L2_HITL_APPROVAL',
          reasoningLog: [...prevState.reasoningLog, `Anomaly analysis failed: ${err.message}`],
        };
        await updateProgress(newState, 'anomaly-analysis-step', 'failed');
        return { state: newState, incidentId };
      }
    });
  },
});

// ----------------------------------------------------
// 4. RCA Step
// ----------------------------------------------------
export const rcaStep = createStep({
  id: 'rca-step',
  inputSchema: standardInputSchema,
  outputSchema: standardOutputSchema.extend({ path: z.string() }),
  execute: async (params: any) => {
    const inputData = params?.inputData;
    const prevState = inputData?.state as IncidentState;
    const incidentId = inputData?.incidentId as string;

    if (prevState) {
      prevState.status = 'retrieving_context';
      prevState.currentNodeId = 'retrieval-confidence-check';
      prevState.currentTierId = 'reasoning-tier';
      await updateProgress(prevState, 'rca-step', 'running');
    }

    return traceWorkflowStep('incident-response-workflow', 'rca-step', incidentId, async (span) => {
      try {
        const combinedConfidence = prevState.confidenceScore;
        if (combinedConfidence < 0.5) {
          recordFailClosed(span, 'retrieval_confidence_below_threshold', 'rca-step');
          const newState = {
            ...prevState,
            status: 'pending_human_review' as const,
            autonomyTier: 'L2_HITL_APPROVAL',
            reasoningLog: [...prevState.reasoningLog, `Combined confidence score ${combinedConfidence} < 0.5 threshold. Path routed to novel.`],
          };
          await updateProgress(newState, 'rca-step', 'completed');
          return { state: newState, incidentId, path: 'novel' };
        }

        // transition to rca-agent node
        prevState.currentNodeId = 'rca-agent';
        await updateProgress(prevState, 'rca-step', 'running');

        const evidencePointers = prevState.evidenceChain.map((entry: any) => ({
          eventId: entry.evidenceId,
          timestamp: entry.observedAt,
          host: entry.payload?.host || 'unknown',
          reason: entry.summary,
          confidence: entry.payload?.confidence || 0.5,
        }));

        const rcaResult = await runRcaAgent(prevState, evidencePointers);
        let newState = { ...prevState };

        if (rcaResult) {
          const hasAbuse = prevState.evidenceChain.some((entry: any) => entry.payload?.threatIntelReport !== null && entry.payload?.threatIntelReport !== undefined);
          const hasMitre = prevState.evidenceChain.some((entry: any) => {
            const report = entry.payload?.threatIntelReport;
            return Array.isArray(report?.threatIntelReport?.mitreTechniques) && report.threatIntelReport.mitreTechniques.length > 0;
          });

          const confidenceResult = calculateExecutionConfidence({
            abuseIpdb: hasAbuse,
            virusTotal: hasAbuse,
            mitreMapped: hasMitre,
            historicalMatch: rcaResult.retrievalConfidence,
            embeddingSimilarity: rcaResult.retrievalConfidence > 0.1 ? rcaResult.retrievalConfidence - 0.05 : 0,
            llmConfidence: prevState.confidenceScore
          });

          newState = {
            ...prevState,
            rootCauseHypothesis: rcaResult.rootCause || 'unknown_pattern',
            retrievalConfidence: rcaResult.retrievalConfidence,
            reasoningLog: [...prevState.reasoningLog, rcaResult.reasoning],
            confidenceScore: confidenceResult / 100, // Normalized to 0-1 range
          };

          // Featherless enrichment: classify attack type + generate plain-language summary
          if (process.env.FEATHERLESS_API_KEY) {
            try {
              const featherless = getFeatherlessService();
              const incidentData = {
                incidentId: prevState.incidentId,
                targetHost: (prevState.targetHost as string) || 'unknown-host',
                rootCauseHypothesis: rcaResult.rootCause || 'unknown_pattern',
                evidenceChain: prevState.evidenceChain,
              };
              const classification = await featherless.classifyAttackType(incidentData);
              const summary = await featherless.generateIncidentSummary(incidentData);
              newState = {
                ...newState,
                attackType: classification.attackType,
                attackConfidence: classification.confidence,
                plainLanguageSummary: summary,
              };
            } catch (feErr: any) {
              console.warn(`[Workflow] Featherless enrichment skipped: ${feErr.message}`);
            }
          }


          if (rcaResult.isNovelPattern) {
            recordFailClosed(span, 'novel_pattern', 'rca-step');
            newState = {
              ...newState,
              status: 'pending_human_review' as const,
              autonomyTier: 'L2_HITL_APPROVAL',
            };
          } else {
            newState = {
              ...newState,
              status: 'root_cause_identified' as const,
            };
          }
        }

        await updateProgress(newState, 'rca-step', 'completed');
        return { state: newState, incidentId, path: 'rca' };
      } catch (err: any) {
        console.error(`[Workflow Step: rca-step] Error: ${err.message}`);
        const newState = {
          ...prevState,
          status: 'pending_human_review' as const,
          autonomyTier: 'L2_HITL_APPROVAL',
          reasoningLog: [...prevState.reasoningLog, `RCA failed: ${err.message}`],
        };
        await updateProgress(newState, 'rca-step', 'failed');
        return { state: newState, incidentId, path: 'error' };
      }
    });
  },
});

// ----------------------------------------------------
// 5. Remediation Step
// ----------------------------------------------------
export const remediationStep = createStep({
  id: 'remediation-step',
  inputSchema: standardInputSchema.extend({ path: z.string() }),
  outputSchema: standardOutputSchema,
  execute: async (params: any) => {
    const inputData = params?.inputData;
    const prevState = inputData?.state as IncidentState;
    const incidentId = inputData?.incidentId as string;

    if (prevState.status === 'pending_human_review') {
      return { state: prevState, incidentId };
    }

    prevState.status = 'remediation_proposed';
    prevState.currentNodeId = 'remediation-agent';
    prevState.currentTierId = 'remediation-tier';
    await updateProgress(prevState, 'remediation-step', 'running');

    return traceWorkflowStep('incident-response-workflow', 'remediation-step', incidentId, async (span) => {
      try {
        const targetHost = (prevState.evidenceChain[0]?.payload?.host as string) || 'unknown-host';
        const updatedState: IncidentState = {
          ...prevState,
          targetHost: (prevState.targetHost as string) || targetHost,
        };

        const remediationResult = await runRemediationAgent(updatedState);
        
        await updateProgress(remediationResult.state, 'remediation-step', 'completed');
        return {
          state: remediationResult.state,
          incidentId,
        };
      } catch (err: any) {
        console.error(`[Workflow Step: remediation-step] Error: ${err.message}`);
        const newState = {
          ...prevState,
          status: 'pending_human_review' as const,
          autonomyTier: 'L2_HITL_APPROVAL',
          reasoningLog: [...prevState.reasoningLog, `Remediation planning failed: ${err.message}`],
        };
        await updateProgress(newState, 'remediation-step', 'failed');
        return { state: newState, incidentId };
      }
    });
  },
});

// ----------------------------------------------------
// 6. Autonomy Routing Step
// ----------------------------------------------------
export const autonomyRoutingStep = createStep({
  id: 'autonomy-routing-step',
  inputSchema: standardInputSchema,
  outputSchema: standardOutputSchema,
  execute: async (params: any) => {
    const inputData = params?.inputData;
    const prevState = inputData?.state as IncidentState;
    const incidentId = inputData?.incidentId as string;

    if (prevState.status === 'pending_human_review') {
      return { state: prevState, incidentId };
    }

    prevState.currentNodeId = 'autonomy-router';
    prevState.currentTierId = 'governance-tier';
    await updateProgress(prevState, 'autonomy-routing-step', 'running');

    return traceWorkflowStep('incident-response-workflow', 'autonomy-routing-step', incidentId, async (span) => {
      try {
        let assetCriticality: 'standard' | 'high_impact' = 'high_impact';
        try {
          const fetchedCriticality = await getAssetCriticality((prevState.targetHost as string) || '');
          if (fetchedCriticality === 'standard' || fetchedCriticality === 'high_impact') {
            assetCriticality = fetchedCriticality;
          }
        } catch (err) {
          assetCriticality = 'high_impact';
        }

        const enkryptVerdict = prevState.remediationAction?.enkryptVerdict || 'FAIL';
        const isL4 = prevState.status === 'remediation_proposed' && assetCriticality === 'standard' && enkryptVerdict === 'PASS';
        let newState = { ...prevState };

        if (isL4) {
          newState = {
            ...prevState,
            autonomyTier: 'L4_AUTO_EXECUTE',
            status: 'resolved' as const,
            reasoningLog: [...prevState.reasoningLog, '[autonomy-routing-step] Route path L4_AUTO_EXECUTE validated. Automatically executing containment action and resolving.'],
          };
        } else {
          newState = {
            ...prevState,
            autonomyTier: 'L2_HITL_APPROVAL',
            status: 'pending_human_review' as const,
            reasoningLog: [...prevState.reasoningLog, `[autonomy-routing-step] Route path L2_HITL_APPROVAL locked. Reason: status=${prevState.status}, assetCriticality=${assetCriticality}, enkryptVerdict=${enkryptVerdict}`],
          };
        }

        await updateProgress(newState, 'autonomy-routing-step', 'completed');
        return { state: newState, incidentId };
      } catch (err: any) {
        console.error(`[Workflow Step: autonomy-routing-step] Error: ${err.message}`);
        const newState = {
          ...prevState,
          status: 'pending_human_review' as const,
          autonomyTier: 'L2_HITL_APPROVAL',
        };
        await updateProgress(newState, 'autonomy-routing-step', 'failed');
        return { state: newState, incidentId };
      }
    });
  },
});

// ----------------------------------------------------
// 7. Report Step
// ----------------------------------------------------
export const reportStep = createStep({
  id: 'report-step',
  inputSchema: standardInputSchema,
  outputSchema: standardOutputSchema.extend({ postMortem: z.any().nullable() }),
  execute: async (params: any) => {
    const inputData = params?.inputData;
    const prevState = inputData?.state as IncidentState;
    const incidentId = inputData?.incidentId as string;

    if (prevState.status !== 'resolved') {
      return { state: prevState, incidentId, postMortem: null };
    }

    prevState.currentNodeId = 'report-agent';
    prevState.currentTierId = 'reporting-tier';
    await updateProgress(prevState, 'report-step', 'running');

    return traceWorkflowStep('incident-response-workflow', 'report-step', incidentId, async (span) => {
      try {
        const reportResult = await runReportAgent(prevState);
        
        await updateProgress(reportResult.state, 'report-step', 'completed');
        return {
          state: reportResult.state,
          incidentId,
          postMortem: reportResult.postMortem,
        };
      } catch (err: any) {
        console.error(`[Workflow Step: report-step] Error: ${err.message}`);
        const newState = {
          ...prevState,
          reasoningLog: [...prevState.reasoningLog, `Post-mortem generation failed: ${err.message}`],
        };
        await updateProgress(newState, 'report-step', 'failed');
        return { state: newState, incidentId, postMortem: null };
      }
    });
  },
});

// ----------------------------------------------------
// 8. AI Observability Step (Evidently AI simulation)
// ----------------------------------------------------
export const observabilityStep = createStep({
  id: 'observability-step',
  inputSchema: standardInputSchema.extend({ postMortem: z.any().nullable() }),
  outputSchema: standardOutputSchema.extend({
    postMortem: z.any().nullable(),
    aiObservability: z.any(),
  }),
  execute: async (params: any) => {
    const inputData = params?.inputData;
    const prevState = inputData?.state as IncidentState;
    const incidentId = inputData?.incidentId as string;
    const postMortem = inputData?.postMortem;

    if (prevState.status !== 'resolved') {
      return { state: prevState, incidentId, postMortem, aiObservability: null };
    }

    prevState.currentNodeId = 'incident-sink';
    prevState.currentTierId = 'reporting-tier';
    await updateProgress(prevState, 'observability-step', 'running');

    return traceWorkflowStep('incident-response-workflow', 'observability-step', incidentId, async (span) => {
      const reportText = JSON.stringify(postMortem || '');
      const piiLeaks: string[] = [];
      if (reportText.includes('password') || reportText.includes('api_key') || reportText.includes('secret')) {
        piiLeaks.push('CREDENTIAL_LEAK_RISK');
      }
      
      const hallucinationIndex = Math.min(0.95, Math.max(0.05, 1 - (prevState.confidenceScore || 0.8)));
      const promptInjectionFlags = reportText.includes('system prompt') || reportText.includes('ignore instructions') ? 'SUSPICIOUS' : 'PASSED';
      const piiSafetyScore = piiLeaks.length > 0 ? 0.6 : 0.98;
      
      const xai_weights = {
        'Raw Logs Telemetry': 0.4,
        'Anomaly Detection': 0.25,
        'Knowledge Base Match': 0.25,
        'CMDB Validation': 0.1
      };

      const aiObservability = {
        hallucinationIndex,
        promptInjectionFlags,
        piiSafetyScore,
        piiLeaks,
        xai_weights
      };

      const newState = {
        ...prevState,
        aiObservability
      };
      
      await updateProgress(newState, 'observability-step', 'completed');
      return { state: newState, incidentId, postMortem, aiObservability };
    });
  },
});

// ----------------------------------------------------
// Workflow Assembly
// ----------------------------------------------------
export const incidentResponseWorkflow = new Workflow({
  id: 'incident-response-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(ingestionGateStep)
  .then(logAnalysisStep)
  .then(anomalyAnalysisStep)
  .then(rcaStep)
  .then(remediationStep)
  .then(autonomyRoutingStep)
  .then(reportStep)
  .then(observabilityStep)
  .commit();

// Seed Data Export (moved to simulation module)
export { DEMO_INCIDENT_ID, DEMO_LOGS } from '../simulation/scenarios.js';
