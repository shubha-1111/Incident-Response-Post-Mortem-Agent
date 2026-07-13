import { Agent, createTool } from '@mastra/core';
import { createGroq } from '@ai-sdk/groq';
import { CohereClient } from 'cohere-ai';
import { z } from 'zod';
import { qdrantClient, COLLECTIONS } from '../config/qdrant.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';
import OpenAI from 'openai';

import {
  traceAgentStep,
  recordConfidenceScore,
  recordTokenUsage,
  recordFailClosed,
} from '../config/otel.js';
import type { EvidencePointer, IncidentState } from '../schemas/incident-state.js';
import type { ForensicEvent } from '../agents/ingest-agent.js';

const groqProvider = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Lazy singleton — avoids the SDK throwing at module import time when
// FEATHERLESS_API_KEY is not set. A placeholder satisfies the SDK's
// validation; actual calls will fail gracefully at runtime if unconfigured.
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

// Helper: Generate embedding using Cohere
async function embedText(input: string): Promise<number[]> {
  const response = await cohere.embed({
    texts: [input],
    model: 'embed-english-v3.0',
    inputType: 'search_document',
  });
  return (response.embeddings as any)[0] as number[];
}

// ----------------------------------------------------
// Mastra Tools definition
// ----------------------------------------------------

export const queryKnowledgeBaseTool = createTool({
  id: 'query-knowledge-base',
  description: 'Query incident_knowledge Qdrant collection using MMR retrieval for similar past incidents',
  inputSchema: z.object({ 
    query: z.string(), 
    topK: z.number().default(5) 
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      id: z.string(),
      score: z.number(),
      payload: z.record(z.unknown())
    }))
  }),
  execute: async ({ context }) => {
    const { query, topK } = context;
    const vector = await embedText(query);
    const results = await qdrantClient.search(COLLECTIONS.INCIDENT_KNOWLEDGE, {
      vector,
      limit: topK,
    });
    return {
      results: results.map((result) => ({
        id: String(result.id),
        score: result.score ?? 0,
        payload: (result.payload ?? {}) as Record<string, unknown>,
      }))
    };
  }
});

export const queryForensicEventsTool = createTool({
  id: 'query-forensic-events',
  description: 'Query forensic_events with mandatory timestamp and host metadata filters',
  inputSchema: z.object({
    query: z.string(),
    hostFilter: z.string().optional(),
    timestampFrom: z.number().optional(),
    topK: z.number().default(5)
  }),
  outputSchema: z.object({
    events: z.array(z.unknown())
  }),
  execute: async ({ context }) => {
    const { query, hostFilter, timestampFrom, topK } = context;
    
    if (!hostFilter && timestampFrom === undefined) {
      throw new Error('NEVER query forensic events without at least one filter (host or timestamp).');
    }

    const must: any[] = [];
    if (hostFilter) {
      must.push({
        key: 'host',
        match: { value: hostFilter },
      });
    }

    if (timestampFrom !== undefined) {
      must.push({
        key: 'timestamp',
        range: { gte: timestampFrom },
      });
    }

    const vector = await embedText(query);
    const results = await qdrantClient.search(COLLECTIONS.FORENSIC_EVENTS, {
      vector,
      limit: topK,
      filter: { must },
    });

    const events = results
      .map((result) => result.payload as unknown as ForensicEvent)
      .sort((a, b) => a.sequence_no - b.sequence_no);

    return { events };
  }
});

// ----------------------------------------------------
// System Prompt
// ----------------------------------------------------

const CRISPE_SYSTEM_PROMPT = `C - Context: You are analyzing a security incident with pre-filtered forensic evidence and historical knowledge, including live CISA Known Exploited Vulnerabilities (KEV) and MITRE ATT&CK techniques.
R - Role: You are a Senior Security Incident Analyst with expertise in threat hunting, log forensics, and RCA.
I - Instruction: Investigate the incident using your tools. Query the knowledge base (\`queryKnowledgeBase\`) first to find similar past incidents or CISA KEV vulnerabilities. Then query forensic events (\`queryForensicEvents\`) for supporting evidence.
Whenever a match is found in the knowledge base, append its CVE ID, vendor tags, and the recommended remediation playbooks to your rootCause or reasoning output payload.
Build a root cause hypothesis ONLY if retrievalConfidence >= 0.5.
If retrievalConfidence < 0.5, output exactly:
{"status": "novel_pattern", "rootCause": null, "evidenceSummary": "<describe what you found>"}
Never fabricate a root cause. Never guess.
Max 4 tool calls total.
S - Schema: Output must be valid JSON matching exactly:
{
  "rootCause": string | null,
  "retrievalConfidence": number,
  "evidenceChain": EvidencePointer[],
  "reasoning": string,
  "iterationCount": number
}
P - Power: You have two tools:
queryKnowledgeBase — use first to find similar incidents or CVEs
queryForensicEvents — use to gather supporting log evidence
Use queryKnowledgeBase before queryForensicEvents always.
E - Executive Summary: One sentence: what happened, what evidence supports it, confidence level, and mapped CVE tags/playbook recommendations.

Example 1 — Known pattern:
Input: "47 failed logins from 6 IPs in 90 seconds on db-prod-02"
Reasoning: Query KB → found Incident #1902 (credential stuffing, similarity 0.89). Query forensic → confirmed same IP range.
Output: {"rootCause": "credential_stuffing_attack", "retrievalConfidence": 0.89, "iterationCount": 2}

Example 2 — Novel pattern:
Input: "Unusual base64 encoded payload in HTTP header on api-gw-01"
Reasoning: Query KB → no match above 0.5.
Output: {"status": "novel_pattern", "rootCause": null, "evidenceSummary": "Encoded payload detected, no precedent found"}`;

// ----------------------------------------------------
// RCA Agent
// ----------------------------------------------------

export const rcaAgent = new Agent({
  name: 'rca-agent',
  instructions: CRISPE_SYSTEM_PROMPT,
  model: groqProvider('llama-3.3-70b-versatile') as any,
  tools: { queryKnowledgeBaseTool, queryForensicEventsTool }
});

export async function runRcaAgent(
  state: IncidentState,
  evidence: EvidencePointer[]
): Promise<{
  rootCause: string | null;
  retrievalConfidence: number;
  evidenceChain: EvidencePointer[];
  reasoning: string;
  isNovelPattern: boolean;
} | null> {
  return traceAgentStep('rca-agent', 'bounded-react-rca', async (span) => {
    span.setAttribute('incident.id', state.incidentId);

    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId: state.incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: `RCA: Querying Qdrant Knowledge Base for past incident similarities...`,
      stepId: 'rca-step'
    });

    let iterationCount = state.iterationCount || 0;
    let retrievalConfidence = 0;
    const reasoningSteps: string[] = [];
    const newEvidence: EvidencePointer[] = [...evidence];

    // Build the query context for the initial retrieval
    const incidentSummary = evidence
      .map((pointer) => `${pointer.reason} on ${pointer.host} at ${pointer.timestamp} (confidence: ${pointer.confidence})`)
      .join('\n');

    // Tool call 1: Query Knowledge Base
    iterationCount++;
    let kbResults: any[] = [];
    try {
      const vector = await embedText(incidentSummary);
      const results = await qdrantClient.search(COLLECTIONS.INCIDENT_KNOWLEDGE, {
        vector,
        limit: 5,
      });
      kbResults = results.map((result) => ({
        id: result.id,
        score: result.score ?? 0,
        payload: (result.payload ?? {}) as Record<string, unknown>,
      }));

      if (kbResults.length > 0) {
        retrievalConfidence = Math.max(...kbResults.map((r) => r.score));
      }
      
      const msg = `RCA: KB query returned ${kbResults.length} matches. Highest vector similarity score: ${retrievalConfidence.toFixed(3)}.`;
      reasoningSteps.push(msg);
      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: retrievalConfidence >= 0.5 ? 'info' : 'warn',
        message: msg,
        stepId: 'rca-step'
      });
    } catch (err: any) {
      console.error('[RCA Agent] KB query failure:', err);
      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'warn',
        message: `RCA Warning: KB query failure: ${err.message}`,
        stepId: 'rca-step'
      });
    }

    // Early exit if first KB query returns similarity > 0.92
    const shouldEarlyExit = retrievalConfidence > 0.92;

    // Fail-Closed: If retrievalConfidence < 0.5 -> novel_pattern path
    if (retrievalConfidence < 0.5) {
      recordFailClosed(span, 'novel_pattern', 'rca-agent');
      recordConfidenceScore(span, (state as any).anomalyConfidence ?? state.confidenceScore, retrievalConfidence);
      (state as any).evidenceChain = [...(state as any).evidenceChain, ...newEvidence];

      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId: state.incidentId,
        timestamp: Date.now(),
        level: 'critical',
        message: `RCA Alert: Similarity score is below 0.5 threshold. Flagged as novel pattern. Routing to safety review.`,
        stepId: 'rca-step'
      });

      return {
        rootCause: null,
        retrievalConfidence,
        evidenceChain: (state as any).evidenceChain,
        reasoning: `Novel pattern detected. ${reasoningSteps.join(' ')}`,
        isNovelPattern: true,
      };
    }

    let forensicEvents: ForensicEvent[] = [];
    if (!shouldEarlyExit) {
      // Tool call 2: Query Forensic Events
      iterationCount++;
      const firstEvidence = evidence[0];
      const hostFilter = firstEvidence?.host;
      const timestamps = evidence
        .map((pointer) => new Date(pointer.timestamp).getTime())
        .filter((t) => !isNaN(t));
      const timestampFrom = timestamps.length > 0 ? Math.min(...timestamps) - 300000 : undefined; // 5 min window
      const timestampTo = timestamps.length > 0 ? Math.max(...timestamps) + 300000 : undefined;

      if (hostFilter || timestampFrom !== undefined || timestampTo !== undefined) {
        try {
          const must: any[] = [];
          if (hostFilter) {
            must.push({
              key: 'host',
              match: { value: hostFilter },
            });
          }
          if (timestampFrom !== undefined || timestampTo !== undefined) {
            const range: any = {};
            if (timestampFrom !== undefined) range.gte = timestampFrom;
            if (timestampTo !== undefined) range.lte = timestampTo;
            must.push({
              key: 'timestamp',
              range,
            });
          }

          const vector = await embedText(incidentSummary);
          const results = await qdrantClient.search(COLLECTIONS.FORENSIC_EVENTS, {
            vector,
            limit: 10,
            filter: { must },
          });

          forensicEvents = results
            .map((result) => result.payload as unknown as ForensicEvent)
            .sort((a, b) => a.sequence_no - b.sequence_no);

          reasoningSteps.push(`Forensic events query returned ${forensicEvents.length} events.`);

          const forensicEvidencePointers: EvidencePointer[] = forensicEvents.map((event) => ({
            eventId: event.event_id,
            timestamp: new Date(event.timestamp).toISOString(),
            host: event.host,
            reason: `FORENSIC_SUPPORT:${event.process}`,
            confidence: event.severity === 'CRITICAL' ? 0.9 : event.severity === 'HIGH' ? 0.75 : event.severity === 'MEDIUM' ? 0.55 : 0.35,
          }));
          newEvidence.push(...forensicEvidencePointers);
        } catch (err) {
          console.error('[RCA Agent] Forensic events query failure:', err);
        }
      }
    } else {
      reasoningSteps.push('Early exit triggered due to high KB similarity (> 0.92).');
    }

    if (iterationCount >= 4) {
      recordFailClosed(span, 'max_iterations_exceeded', 'rca-agent');
      recordConfidenceScore(span, (state as any).anomalyConfidence ?? state.confidenceScore, retrievalConfidence);
      (state as any).evidenceChain = [...(state as any).evidenceChain, ...newEvidence];

      return {
        rootCause: null,
        retrievalConfidence,
        evidenceChain: (state as any).evidenceChain,
        reasoning: 'Max iterations exceeded without root cause conclusion.',
        isNovelPattern: true,
      };
    }

    try {
      const prompt = JSON.stringify({
        incidentId: state.incidentId,
        evidence: newEvidence,
        retrievalConfidence,
        kbResults,
        forensicEvents,
        iterationCount,
      });

      const completion = await getOpenAI().chat.completions.create({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        messages: [
          { role: 'system', content: CRISPE_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const rawOutput = completion.choices[0]?.message?.content ?? '';
      let parsedOutput: any;
      try {
        parsedOutput = JSON.parse(rawOutput);
      } catch (parseErr) {
        recordFailClosed(span, 'json_parse_failure', 'rca-agent');
        state.status = 'pending_human_review';
        return null;
      }

      if (parsedOutput.status === 'novel_pattern' || parsedOutput.rootCause === null) {
        recordFailClosed(span, 'novel_pattern', 'rca-agent');
        recordConfidenceScore(span, (state as any).anomalyConfidence ?? state.confidenceScore, retrievalConfidence);
        (state as any).evidenceChain = [...(state as any).evidenceChain, ...newEvidence];

        return {
          rootCause: null,
          retrievalConfidence,
          evidenceChain: (state as any).evidenceChain,
          reasoning: parsedOutput.reasoning || parsedOutput.evidenceSummary || 'Novel pattern detected.',
          isNovelPattern: true,
        };
      }

      state.iterationCount = iterationCount;
      (state as any).evidenceChain = [...(state as any).evidenceChain, ...newEvidence];

      recordConfidenceScore(span, (state as any).anomalyConfidence ?? state.confidenceScore, retrievalConfidence);

      return {
        rootCause: parsedOutput.rootCause,
        retrievalConfidence: parsedOutput.retrievalConfidence ?? retrievalConfidence,
        evidenceChain: (state as any).evidenceChain,
        reasoning: parsedOutput.reasoning,
        isNovelPattern: false,
      };
    } catch (apiErr) {
      console.error('[RCA Agent] Agent execution error:', apiErr);
      recordFailClosed(span, 'json_parse_failure', 'rca-agent');
      state.status = 'pending_human_review';
      return null;
    }
  });
}
