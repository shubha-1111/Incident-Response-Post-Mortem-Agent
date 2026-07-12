import Groq from 'groq-sdk';
import { CohereClient } from 'cohere-ai';
import crypto from 'crypto';
import { qdrantClient, COLLECTIONS } from '../config/qdrant.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';
import OpenAI from 'openai';

import { traceAgentStep, recordTokenUsage } from '../config/otel.js';
import { IncidentState } from '../schemas/incident-state.js';
import { publishPostMortem } from '../tools/github-tools.js';
import { getFeatherlessService } from '../services/featherless-service.js';

export interface PostMortem {
  incident_id: string;
  title: string;
  timestamp: number;
  root_cause: string;
  symptoms: string[];
  evidence_summary: string;
  remediation: string;
  action_taken: string;
  autonomy_tier: string;
  human_approved: boolean;
  resolution_time_ms: number;
  tags: string[];
  sop_ref: string;
  markdown_report?: string;
  publish_url?: string;
}

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

const CRISPE_PROMPT = `C - Context: A security incident has been fully resolved. All evidence, root cause, and remediation data is provided.
R - Role: You are a Senior Security Documentation Specialist writing an institutional post-mortem for future AI retrieval and human review.
I - Instruction: Generate a structured post-mortem report. Write clear, factual, retrieval-optimized content. Use past tense. Be specific about what happened, what evidence confirmed it, and how it was resolved. Output valid JSON only. No markdown formatting outside the markdown_report field. No extra text.
S - Schema: Output must match exactly:
{
  "title": string,
  "root_cause": string,
  "symptoms": string[],
  "evidence_summary": string,
  "remediation": string,
  "tags": string[],
  "sop_ref": string,
  "markdown_report": string
}
P - Power: You receive the full IncidentState including evidenceChain, rootCauseHypothesis, remediationAction, actionJustification, and reasoningLog.
E - Executive Summary: One sentence describing what happened and how it was resolved.

For "markdown_report", write a comprehensive SRE-style post-mortem matching this markdown structure:
# SRE Post-Mortem: {Title}
**Incident ID:** {incidentId}
**Resolution Time:** {resolutionTime}
**Autonomy Tier:** {autonomyTier}

## 1. Executive Summary
{A concise summary of the incident trigger, user impact, and containment resolution}

## 2. Chronology & Incident Timeline
{Bullet points with timestamps detailing log ingestion, anomaly detection, RCA, remediation routing, and closure}

## 3. Technical Root Cause Analysis (RCA)
- **Primary Attack Vector:** {Root Cause Category}
- **Vulnerability Details:** {Details of the vulnerability/malicious flow}

## 4. Remediation & Action Items
- **Containment Action:** {Remediation action taken}
- **Justification:** {Blast radius mitigation description}
- **Action Items & Preventative Measures:**
  1. Re-evaluate access controls on the target asset.
  2. Map signature tags and configure WAF/IPS rule checks.
  3. Rotate credentials and review authorization logs.

## 5. Metadata & Learning Loop
- **SOP Reference:** {SOP Reference}
- **MITRE ATT&CK Tags:** {Tags}`;

/**
 * Generates structured post-mortems after incident resolution and indexes them in Qdrant.
 */
export async function runReportAgent(
  state: IncidentState
): Promise<{
  state: IncidentState;
  postMortem: PostMortem | null;
}> {
  return traceAgentStep('report-agent', 'generate-post-mortem', async (span) => {
    span.setAttribute('incident.id', state.incidentId);

    eventBus.emit(IncidentEventType.POSTMORTEM_STARTED, {
      incidentId: state.incidentId,
      timestamp: Date.now()
    });

    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Report: SRE Report Compiler initialized (20% progress). Generating post-mortem report via LLM...`,
      stepId: 'report-step'
    });

    let completion;
    try {
      completion = await getOpenAI().chat.completions.create({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CRISPE_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              incidentId: state.incidentId,
              rootCause: state.rootCauseHypothesis,
              evidenceChain: state.evidenceChain,
              remediationAction: state.remediationAction,
              actionJustification: state.actionJustification,
              autonomyTier: state.autonomyTier,
              reasoningLog: state.reasoningLog,
            }),
          },
        ],
      });
    } catch (err: any) {
      console.error('[Report Agent] LLM completion error:', err);
      state.status = 'pending_human_review';
      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'critical',
        message: `Report Error: LLM completion failed: ${err.message}`,
        stepId: 'report-step'
      });
      return { state, postMortem: null };
    }

    // Step 2 — Record token usage
    recordTokenUsage(
      span,
      completion.usage?.prompt_tokens ?? 0,
      completion.usage?.completion_tokens ?? 0,
      'report-agent'
    );

    // Step 3 — Parse response safely
    const content = completion.choices[0]?.message?.content ?? '{}';
    let raw;
    try {
      raw = JSON.parse(content);
      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'info',
        message: `Report: LLM completion parsed successfully (40% progress). Constructing structured post-mortem...`,
        stepId: 'report-step'
      });
    } catch (err: any) {
      console.error('[Report Agent] JSON parsing failure on LLM response:', err);
      state.status = 'pending_human_review';
      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'critical',
        message: `Report Error: JSON parsing failure on LLM response: ${err.message}`,
        stepId: 'report-step'
      });
      return { state, postMortem: null };
    }

    // Step 4 — Build full PostMortem object
    const resolution_time_ms = Date.now() - new Date(state.createdAt).getTime();
    const postMortem: PostMortem = {
      incident_id: state.incidentId,
      title: raw.title || `Post-Mortem for Incident ${state.incidentId}`,
      timestamp: Date.now(),
      root_cause: raw.root_cause || state.rootCauseHypothesis || 'unknown_pattern',
      symptoms: raw.symptoms ?? [],
      evidence_summary: raw.evidence_summary || 'No evidence summary generated.',
      remediation: raw.remediation || 'No remediation summary generated.',
      action_taken: state.remediationAction?.actionType ?? 'none',
      autonomy_tier: state.autonomyTier || 'L4_AUTO_EXECUTE',
      human_approved: state.autonomyTier === 'L2_HITL_APPROVAL',
      resolution_time_ms,
      tags: raw.tags ?? [],
      sop_ref: raw.sop_ref ?? 'SOP-UNKNOWN',
      markdown_report: raw.markdown_report || '',
    };

    // Step 5 — Embed post-mortem for Qdrant
    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Report: Generating semantic vector embeddings via Cohere (60% progress)...`,
      stepId: 'report-step'
    });

    let embedding: number[] = new Array(1024).fill(0);
    try {
      const cohere = new CohereClient({ 
        token: process.env.COHERE_API_KEY 
      });
      const embedInput = `${postMortem.title} ${postMortem.root_cause} ${postMortem.evidence_summary} ${postMortem.remediation}`;
      const response = await cohere.embed({
        texts: [embedInput],
        model: 'embed-english-v3.0',
        inputType: 'search_document',
      });
      embedding = (response.embeddings as any)[0] as number[];
    } catch (err) {
      console.error('[Report Agent] Failed to generate semantic embeddings for post-mortem:', err);
    }

    // Step 6 — Write to incident_knowledge (Qdrant)
    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Report: Storing post-mortem vector to Qdrant Incident Knowledge Collection (80% progress)...`,
      stepId: 'report-step'
    });

    try {
      await qdrantClient.upsert(COLLECTIONS.INCIDENT_KNOWLEDGE, {
        wait: true,
        points: [
          {
            id: crypto.randomUUID(),
            vector: embedding,
            payload: { ...postMortem } as any,
          },
        ],
      });
      console.log('[Report Agent] Post-mortem written to knowledge base');
    } catch (err) {
      console.error('[Report Agent] Failed to upsert post-mortem to Qdrant collection:', err);
    }

    // Step 7 — Publish post-mortem to GitHub (or fallback to local file)
    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `Report: Publishing post-mortem report (100% progress). Finalizing incident resolution...`,
      stepId: 'report-step'
    });

    let publishUrl = '';
    try {
      const pubResult = await publishPostMortem(
        state.incidentId,
        postMortem.title,
        postMortem.markdown_report || ''
      );
      if (pubResult.success && pubResult.url) {
        publishUrl = pubResult.url;
        console.log(`[Report Agent] Post-mortem published: ${publishUrl}`);
      }
    } catch (err: any) {
      console.error('[Report Agent] Failed to publish post-mortem:', err.message);
    }

    // Step 8 — Update state
    state.status = 'resolved';
    state.postMortemRef = publishUrl || postMortem.incident_id;
    state.postMortem = {
      ...postMortem,
      publish_url: publishUrl,
    };

    return { state, postMortem };
  });
}
