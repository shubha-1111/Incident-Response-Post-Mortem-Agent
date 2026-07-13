import { Agent } from '@mastra/core';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import crypto from 'crypto';
import { traceAgentStep, recordFailClosed, recordTokenUsage } from '../config/otel.js';
import {
  IncidentState,
  RemediationAction,
  remediationActionSchema,
} from '../schemas/incident-state.js';
import { getAssetCriticality } from '../tools/cmdb-tools.js';
import { validateOutboundAction } from '../config/enkrypt.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';
import OpenAI from 'openai';


const groqProvider = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

// Lazy singleton — avoids the SDK throwing at module import time when
// FEATHERLESS_API_KEY is not set.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: 'https://api.featherless.ai/v1',
      apiKey: process.env.FEATHERLESS_API_KEY || 'featherless-not-configured',
    });
  }
  return _openai;
}

const CRISPE_PROMPT = `C - Context: A confirmed root cause has been identified for a security incident. Asset criticality has been pre-fetched from CMDB. You must select the safest, most targeted remediation action.
R - Role: You are a Senior Security Incident Responder specializing in production infrastructure protection. You minimize blast radius above all else.
I - Instruction: Select exactly ONE action from the allowed taxonomy. Output ONLY valid JSON. No explanation text. Never invent actions outside the allowed list. If unsure → choose isolate_host as the safest default.
S - Schema: Output must match exactly:
{
  "actionType": "block_ip" | "isolate_host" | "rotate_credential" | "patch_rule",
  "params": { [key: string]: string },
  "justification": string,
  "confidenceScore": number
}
P - Power: You receive rootCause, targetHost, assetCriticality as input context. Use them to select the most appropriate action type.
E - Executive Summary: One line — action selected, target, reason, confidence.

FEW-SHOT EXAMPLE 1:
Input: rootCause=credential_stuffing, host=db-prod-02, criticality=high_impact
Reasoning: Credential stuffing on high-impact DB. Rotating credentials minimizes downtime vs isolation.
Output: {"actionType": "rotate_credential", "params": {"host": "db-prod-02", "scope": "db_user"}, "justification": "Credential rotation stops attack without taking prod DB offline", "confidenceScore": 0.88}

FEW-SHOT EXAMPLE 2:
Input: rootCause=port_scan_detected, host=api-gw-01, criticality=standard
Reasoning: Active port scan from external IP. Block at network level immediately.
Output: {"actionType": "block_ip", "params": {"target_ip": "203.0.113.42", "duration_hours": "24"}, "justification": "Blocking scanning IP stops reconnaissance before exploitation", "confidenceScore": 0.91}`;

export const remediationAgent = new Agent({
  name: 'remediation-agent',
  instructions: CRISPE_PROMPT,
  model: groqProvider('llama-3.3-70b-versatile') as any,
});

export async function runRemediationAgent(
  state: IncidentState
): Promise<{
  state: IncidentState;
  action: RemediationAction | null;
}> {
  return traceAgentStep('remediation-agent', 'run-remediation', async (span) => {
    span.setAttribute('incident.id', state.incidentId);

    // Step 1 — Fetch asset criticality
    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Remediation: Fetching asset criticality from CMDB Registry for host ${state.targetHost || 'unknown'}...`,
      stepId: 'remediation-step'
    });

    let assetCriticality: 'standard' | 'high_impact' = 'high_impact';
    try {
      const fetchedCriticality = await getAssetCriticality(state.targetHost || '');
      if (fetchedCriticality === 'standard' || fetchedCriticality === 'high_impact') {
        assetCriticality = fetchedCriticality;
      }
    } catch (err) {
      assetCriticality = 'high_impact'; // default-deny
    }

    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Remediation: CMDB returned asset criticality = ${assetCriticality}. Generating remediation plan...`,
      stepId: 'remediation-step'
    });

    // Step 2 — Call Mastra Remediation Agent
    let completion;
    try {
      const chatCompletion = await getOpenAI().chat.completions.create({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        messages: [
          { role: 'system', content: CRISPE_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              rootCause: state.rootCauseHypothesis,
              targetHost: state.targetHost,
              assetCriticality,
              evidenceSummary: state.evidenceChain.slice(-3),
            })
          }
        ],
        response_format: { type: 'json_object' },
      });

      completion = {
        text: chatCompletion.choices[0]?.message?.content || '{}'
      };
    } catch (err: any) {
      recordFailClosed(span, 'openai_api_error', 'remediation-agent');
      state.status = 'pending_human_review';
      state.autonomyTier = 'L2_HITL_APPROVAL';
      state.reasoningLog.push(`Remediation generation failed: ${err.message}`);
      
      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'critical',
        message: `Remediation Error: Remediation generator failed: ${err.message}. Routing to safety review.`,
        stepId: 'remediation-step'
      });

      return { state, action: null };
    }

    // Step 3 — safeParse the response
    const content = completion.text ?? '{}';
    let parsedJson;
    try {
      parsedJson = JSON.parse(content);
    } catch (err) {
      parsedJson = {};
    }

    const parsed = remediationActionSchema.safeParse(parsedJson);

    if (!parsed.success) {
      recordFailClosed(span, 'zod_parse_failure', 'remediation-agent');
      state.status = 'pending_human_review';
      state.autonomyTier = 'L2_HITL_APPROVAL';
      state.reasoningLog.push(
        `Remediation schema validation failed: ${JSON.stringify(parsed.error.issues)}`
      );

      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'warn',
        message: `Remediation Warning: Proposed action failed schema validation. Routing to safety review.`,
        stepId: 'remediation-step'
      });

      return { state, action: null };
    }

    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Remediation: Proposed action [${parsed.data.actionType}] with ${(parsed.data.confidenceScore * 100).toFixed(0)}% confidence. Justification: ${parsed.data.justification}`,
      stepId: 'remediation-step'
    });

    // Step 4 — Enkrypt outbound validation
    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Remediation: Passing action to Enkrypt Policy Sentinel for outbound validation...`,
      stepId: 'remediation-step'
    });

    let enkryptVerdict = 'NEEDS_REVIEW';
    try {
      enkryptVerdict = await validateOutboundAction(
        parsed.data.actionType,
        state.targetHost || '',
        assetCriticality
      );
    } catch (err) {
      enkryptVerdict = 'NEEDS_REVIEW';
    }

    if (enkryptVerdict === 'FAIL' || enkryptVerdict === 'NEEDS_REVIEW') {
      recordFailClosed(span, `enkrypt_verdict_${enkryptVerdict}`, 'remediation-agent');
      state.status = 'pending_human_review';
      state.autonomyTier = 'L2_HITL_APPROVAL';
      state.evidenceChain = [
        ...state.evidenceChain,
        {
          eventId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          host: state.targetHost || 'unknown-host',
          reason: `Enkrypt blocked action: ${enkryptVerdict}`,
          confidence: 0,
        } as any,
      ];

      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'critical',
        message: `Remediation Alert: Enkrypt Outbound Policy Validation BLOCKED the action [${parsed.data.actionType}] (Verdict: ${enkryptVerdict}). Routing to safety review.`,
        stepId: 'remediation-step'
      });

      return { state, action: null };
    }

    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Remediation: Enkrypt Outbound Policy Validation APPROVED the action. Verdict: PASS.`,
      stepId: 'remediation-step'
    });

    // Step 5 — Return approved action
    state.remediationAction = {
      actionType: parsed.data.actionType,
      params: parsed.data.params,
      enkryptVerdict: 'PASS',
    };
    state.actionJustification = parsed.data.justification;
    state.status = 'remediation_proposed';

    return { state, action: parsed.data };
  });
}
