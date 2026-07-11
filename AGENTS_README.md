# 6-Tier Autonomous Agent Specifications

This document provides exhaustive technical specifications for each of the 6 agents in the Incident Response pipeline.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INCIDENT RESPONSE WORKFLOW (8 Steps)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │  INGESTION   │───▶│   ANALYSIS   │───▶│   REASONING  │                 │
│  │    TIER      │    │    TIER      │    │    TIER      │                 │
│  └──────────────┘    └──────────────┘    └──────────────┘                 │
│        │                    │                    │                          │
│        ▼                    ▼                    ▼                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  1. INGEST-AGENT          2a. LOG-AGENT        3. RCA-AGENT          │  │
│  │  - Enkrypt Skill Sentinel  - Regex patterns      - Bounded ReAct     │  │
│  │  - Cohere embeddings       - Severity scoring    - Qdrant KB search  │  │
│  │  - Qdrant upsert           - Evidence pointers   - Forensic query    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  2b. ANOMALY-AGENT          4. REMEDIATION-AGENT       5. ROUTER      │  │
│  │  - Statistical anomalies    - CMDB asset criticality  - L2 HITL      │  │
│  │  - Threat Intel (AbuseIPDB,  - Enkrypt Rayder         - L4 Auto      │  │
│  │    VirusTotal, MITRE)       - Groq LLM selection     - Fail-closed   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  6. REPORT-AGENT           7. OBSERVABILITY                          │  │
│  │  - Featherless LLM         - Hallucination index                     │  │
│  │  - Cohere embeddings       - PII safety score                        │  │
│  │  - Qdrant learning loop    - XAI weights                             │  │
│  │  - GitHub publishing                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent 1: Ingest Agent (`src/agents/ingest-agent.ts`)

### Role
**Tier 1 - Data Scrubbing Gateway**  
First line of defense. Intercepts raw syslog streams, scrubs PII/malicious content via Enkrypt AI, embeds with Cohere, stores in Qdrant.

### Trigger
`ingestion-gate-step` workflow step — invoked when raw logs arrive via `/api/ingest` endpoint or simulation.

### Input
```typescript
interface IngestInput {
  logs: string[];           // Raw syslog lines
  incidentId: string;       // Correlation ID
}
```

### Output
```typescript
interface IngestOutput {
  written: string[];        // Qdrant point IDs successfully stored
  quarantined: number;      // Count of lines blocked by Enkrypt
}
```

### Processing Pipeline
1. **Safety Scan** — `scanInboundLog()` calls Enkrypt Skill Sentinel
   - `PASS` → proceed
   - `FAIL` / `NEEDS_REVIEW` → quarantine, increment counter, continue
2. **Parse** — `parseLogToMetadata()` extracts host, process, severity, message
3. **Embed** — Cohere `embed-english-v3.0` (1024-dim, `search_document`)
4. **Store** — Upsert to `forensic_events` collection with 90-day TTL (`expires_at`)

### External Dependencies
| Service | Purpose | Env Var |
|---------|---------|---------|
| **Enkrypt AI Skill Sentinel** | PII detection, prompt injection, malicious payload scanning | `ENKRYPT_SKILL_SENTINEL_URL` |
| **Cohere** | Vector embeddings for semantic search | `COHERE_API_KEY` |
| **Qdrant** | Vector database for forensic event storage | `QDRANT_URL`, `QDRANT_API_KEY` |

### Key Features
- **Fail-safe**: Network errors → `NEEDS_REVIEW` (human oversight)
- **TTL compliance**: 90-day auto-expiry via `expires_at` field
- **Telemetry**: OpenTelemetry spans + event bus streaming

---

## Agent 2a: Log Signature Agent (`src/agents/log-agent.ts`)

### Role
**Tier 2a - Threat Pattern Parser**  
Deterministic regex-based signature matching on scrubbed logs. Runs in parallel with Anomaly Agent.

### Trigger
`log-analysis-step` workflow step — after ingestion completes, queries Qdrant for incident's forensic events.

### Input
```typescript
ForensicEvent[]  // From Qdrant scroll (filtered by incident_id)
incidentId: string
```

### Output
```typescript
interface LogAgentResult {
  evidence: EvidencePointer[];
  confidenceScore: number;  // Mean of evidence confidences, min 0.1
}
```

### Detection Patterns
| Pattern | Label | Severity Boost |
|---------|-------|----------------|
| `failed (login\|auth\|password)` | `AUTH_FAILURE` | +0.3 |
| `port scan\|nmap\|masscan` | `PORT_SCAN` | +0.4 |
| `UNION\|SELECT.*FROM\|DROP TABLE` | `SQL_INJECTION` | +0.5 |
| `sudo\|privilege escalat\|root access` | `PRIV_ESCALATION` | +0.45 |
| `curl\|wget\|base64.*decode\|\/dev\/tcp` | `DATA_EXFIL` | +0.5 |

### Evidence Pointer Schema
```typescript
interface EvidencePointer {
  eventId: string;
  timestamp: string;      // ISO 8601
  host: string;
  reason: string;         // Pattern label
  confidence: number;     // 0.5 + severityBoost, capped at 1.0
}
```

### External Dependencies
- **Qdrant** — Read forensic events
- **OpenTelemetry** — Tracing + confidence metrics

---

## Agent 2b: Anomaly Detection Agent (`src/agents/anomaly-agent.ts`)

### Role
**Tier 2b - Behavioral Threat Detector**  
Statistical anomaly detection + external threat intelligence enrichment. Runs in parallel with Log Agent.

### Trigger
`anomaly-analysis-step` — same forensic events as Log Agent.

### Input
```typescript
ForensicEvent[]
incidentId: string
```

### Output
```typescript
interface AnomalyAgentResult {
  evidence: EvidencePointer[];
  confidenceScore: number;  // Max evidence confidence, min 0.05
}
```

### Detection Logic
1. **Auth Failure Spike** — >5 failed logins → `AUTH_FAILURE_SPIKE` (confidence 0.6–0.95)
2. **Host Concentration** — Single host >40% of events → `HOST_CONCENTRATION` (0.55)
3. **Critical Severity Presence** — Any CRITICAL events → `CRITICAL_SEVERITY_PRESENT` (0.7–0.9)

### Threat Intelligence Enrichment
For each evidence item with an IP in raw message:
- **AbuseIPDB** — Reputation score, abuse confidence, country, ISP
- **VirusTotal** — Malicious votes, harmless votes, community score
- **MITRE ATT&CK** — Technique IDs mapped from behavior

Confidence boosted +0.2 (capped 0.95) if `isConfirmedMalicious`.

### External Dependencies
| Service | Purpose | Env Var |
|---------|---------|---------|
| **AbuseIPDB** | IP reputation & abuse confidence | `ABUSEIPDB_API_KEY` |
| **VirusTotal** | Multi-vendor malware detection | `VIRUSTOTAL_API_KEY` |
| **MITRE ATT&CK** | Technique mapping (local dataset) | — |

---

## Agent 3: Root Cause Analysis Agent (`src/agents/rca-agent.ts`)

### Role
**Tier 3 - Bounded ReAct Forensic Investigator**  
LLM-driven reasoning agent with strict tool-use boundaries. Queries knowledge base first, then forensic events, outputs structured JSON.

### Trigger
`rca-step` — after anomaly analysis, only if combined confidence ≥ 0.5 (else fail-closed to novel pattern).

### Input
```typescript
IncidentState  // Full state with evidenceChain, confidenceScore, threatScore
EvidencePointer[]  // Aggregated evidence from Log + Anomaly agents
```

### Output
```typescript
interface RCAResult {
  rootCause: string | null;           // e.g., "credential_stuffing_attack"
  retrievalConfidence: number;        // Max KB vector similarity score
  evidenceChain: EvidencePointer[];
  reasoning: string;                  // Human-readable reasoning trace
  isNovelPattern: boolean;            // True if retrievalConfidence < 0.5
}
```

### Tools (Mastra `createTool`)
| Tool | Description | Constraints |
|------|-------------|-------------|
| `queryKnowledgeBase` | MMR search `incident_knowledge` collection | Must call first, max 5 results |
| `queryForensicEvents` | Filtered search `forensic_events` (host + time window) | Requires at least one filter |

### System Prompt (CRISPE Framework)
```
C - Context: Senior Security Analyst with threat hunting, log forensics, RCA expertise
R - Role: Investigate using tools. Query KB first, then forensic events.
I - Instruction: Build root cause ONLY if retrievalConfidence >= 0.5.
   If < 0.5 → output {"status": "novel_pattern", "rootCause": null, ...}
S - Schema: Strict JSON output with rootCause, retrievalConfidence, evidenceChain, reasoning, iterationCount
P - Power: 2 tools (queryKnowledgeBase, queryForensicEvents). Max 4 calls total.
E - Executive Summary: One sentence — what happened, evidence, confidence, CVE tags/playbooks
```

### LLM Configuration
| Parameter | Value |
|-----------|-------|
| **Model** | Groq `llama-3.3-70b-versatile` (via `@ai-sdk/groq`) |
| **Embeddings** | Cohere `embed-english-v3.0` (for tool queries) |
| **Temperature** | 0 (deterministic) |
| **Max Iterations** | 4 tool calls |

### Fail-Closed Conditions
1. `retrievalConfidence < 0.5` → `novel_pattern`, route to HITL
2. `iterationCount >= 4` → `max_iterations_exceeded`, route to HITL
3. JSON parse failure → `json_parse_failure`, route to HITL
4. LLM API error → route to HITL

### External Dependencies
| Service | Purpose | Env Var |
|---------|---------|---------|
| **Groq** | LLM inference (Llama-3.3-70B) | `GROQ_API_KEY` |
| **Cohere** | Embeddings for tool queries | `COHERE_API_KEY` |
| **Qdrant** | KB + forensic event search | `QDRANT_URL`, `QDRANT_API_KEY` |
| **Featherless AI** | Fallback LLM (optional) | `FEATHERLESS_API_KEY` |

---

## Agent 4: Remediation Planner Agent (`src/agents/remediation-agent.ts`)

### Role
**Tier 4 - Mitigation Engineer**  
Selects safest targeted remediation action based on root cause, target host, and asset criticality. Validates via Enkrypt Rayder before execution.

### Trigger
`remediation-step` — after RCA completes with non-novel root cause.

### Input
```typescript
IncidentState  // Includes rootCauseHypothesis, targetHost, evidenceChain
```

### Output
```typescript
interface RemediationAction {
  actionType: 'block_ip' | 'isolate_host' | 'rotate_credential' | 'patch_rule';
  params: Record<string, string>;  // e.g., { target_ip, duration_hours } or { host, scope }
  justification: string;
  confidenceScore: number;
  enkryptVerdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
}
```

### Action Taxonomy
| Action | Params | Use Case |
|--------|--------|----------|
| `block_ip` | `target_ip`, `duration_hours` | External malicious IP |
| `isolate_host` | `host` | Compromised internal host |
| `rotate_credential` | `host`, `scope` | Credential stuffing / theft |
| `patch_rule` | `host`, `rule_id` | Vulnerability exploitation |

### Decision Logic (CRISPE Prompt)
```
C - Context: Confirmed root cause, asset criticality from CMDB
R - Role: Senior Incident Responder, minimize blast radius
I - Instruction: Select EXACTLY ONE action from taxonomy. Output ONLY JSON.
   If unsure → isolate_host (safest default)
S - Schema: { actionType, params, justification, confidenceScore }
P - Power: Receives rootCause, targetHost, assetCriticality
E - Summary: One line — action, target, reason, confidence
```

### Safety Gates
1. **CMDB Lookup** — `getAssetCriticality(host)` → `standard` | `high_impact` (default-deny: `high_impact`)
2. **Enkrypt Rayder Validation** — `validateOutboundAction(action, target, criticality)`
   - `PASS` → proceed
   - `FAIL` / `NEEDS_REVIEW` → fail-closed → `L2_HITL_APPROVAL`
3. **Autonomy Router** — Only `L4_AUTO_EXECUTE` if: status=resolved + standard criticality + Enkrypt PASS

### LLM Configuration
| Parameter | Value |
|-----------|-------|
| **Model** | Groq `llama-3.3-70b-versatile` |
| **Fallback** | Featherless `meta-llama/Llama-3.3-70B-Instruct` |
| **Temperature** | 0 |
| **Output** | JSON object (Zod validated) |

### External Dependencies
| Service | Purpose | Env Var |
|---------|---------|---------|
| **Groq** | Primary LLM | `GROQ_API_KEY` |
| **Featherless AI** | Fallback LLM | `FEATHERLESS_API_KEY` |
| **CMDB** | Asset criticality lookup | `CMDB_API_URL`, `CMDB_API_KEY` |
| **Enkrypt AI Rayder** | Outbound action policy validation | `ENKRYPT_RAYDER_URL` |

---

## Agent 5: Autonomy Router (Not an LLM Agent)

### Role
**Tier 5 - Governance Decision Engine**  
Pure logic router (no LLM). Determines autonomy tier based on state.

### Location
`src/workflows/autonomy-router.ts` + `src/workflows/incident-workflow.ts` (autonomyRoutingStep)

### Routing Logic
```typescript
if (status === 'pending_human_review' || assetCriticality === 'high_impact') {
  → L2_HITL_APPROVAL  // Human-in-the-loop required
} else if (status === 'resolved' && assetCriticality === 'standard' && enkryptVerdict === 'PASS') {
  → L4_AUTO_EXECUTE   // Safe to auto-execute
} else {
  → L2_HITL_APPROVAL  // Default deny
}
```

### Outputs
- Updates `state.autonomyTier` (`L2_HITL_APPROVAL` | `L4_AUTO_EXECUTE`)
- Updates `state.status` (`pending_human_review` | `resolved`)
- Emits `HITL_REQUIRED` event for frontend

---

## Agent 6: Post-Mortem SRE Report Agent (`src/agents/report-agent.ts`)

### Role
**Tier 6 - SRE Technical Writer & Learning Loop**  
Generates comprehensive post-mortem, embeds to Qdrant for future RCA retrieval, publishes to GitHub.

### Trigger
`report-step` — only if `state.status === 'resolved'`.

### Input
```typescript
IncidentState  // Full incident lifecycle data
```

### Output
```typescript
interface PostMortem {
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
  markdown_report: string;      // Full SRE-style markdown
  publish_url?: string;         // GitHub URL if published
}
```

### Report Structure (Markdown)
```markdown
# SRE Post-Mortem: {Title}
**Incident ID:** {incidentId}
**Resolution Time:** {resolutionTime}
**Autonomy Tier:** {autonomyTier}

## 1. Executive Summary
{A concise summary of trigger, impact, containment}

## 2. Chronology & Incident Timeline
- Log ingestion at {timestamp}
- Anomaly detection at {timestamp}
- RCA initiated at {timestamp}
- Remediation routed at {timestamp}
- Closure at {timestamp}

## 3. Technical Root Cause Analysis
- **Primary Attack Vector:** {rootCause}
- **Vulnerability Details:** {details}

## 4. Remediation & Action Items
- **Containment Action:** {action}
- **Justification:** {blast radius mitigation}
- **Preventative Measures:**
  1. Re-evaluate access controls
  2. Map signature tags, configure WAF/IPS
  3. Rotate credentials, review auth logs

## 5. Metadata & Learning Loop
- **SOP Reference:** {sop_ref}
- **MITRE ATT&CK Tags:** {tags}
```

### Processing Pipeline
1. **LLM Generation** — Featherless `meta-llama/Llama-3.3-70B-Instruct`, temp 0, JSON mode
2. **Token Tracking** — OpenTelemetry `recordTokenUsage`
3. **Embedding** — Cohere `embed-english-v3.0` (`search_document`)
4. **Qdrant Upsert** — `incident_knowledge` collection (learning loop)
5. **GitHub Publish** — `publishPostMortem()` via Octokit (creates `.md` in `data/post-mortems/`)
6. **State Update** — `status = 'resolved'`, `postMortemRef` set

### External Dependencies
| Service | Purpose | Env Var |
|---------|---------|---------|
| **Featherless AI** | LLM for report generation | `FEATHERLESS_API_KEY` |
| **Groq** | Fallback LLM | `GROQ_API_KEY` |
| **Cohere** | Semantic embedding for KB | `COHERE_API_KEY` |
| **Qdrant** | Knowledge base storage | `QDRANT_URL`, `QDRANT_API_KEY` |
| **GitHub** | Post-mortem publishing | `GITHUB_TOKEN`, `GITHUB_REPO` |

---

## Cross-Agent Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  INGEST     │────▶│  LOG AGENT  │────▶│             │
│  (Tier 1)   │     │  (Tier 2a)  │     │             │
└─────────────┘     └─────────────┘     │   RCA AGENT │
                                        │  (Tier 3)   │
┌─────────────┐     ┌─────────────┐     │             │
│  ANOMALY    │────▶│  EVIDENCE   │────▶│  - KB Query │
│  (Tier 2b)  │     │  AGGREGATION│     │  - Forensic │
└─────────────┘     └─────────────┘     │  - LLM RCA  │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ REMEDIATION │
                                        │  (Tier 4)   │
                                        │             │
                                        │ - CMDB      │
                                        │ - LLM Plan  │
                                        │ - Enkrypt   │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  AUTONOMY   │
                                        │   ROUTER    │
                                        │  (Tier 5)   │
                                        └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
             ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
             │  L4 AUTO    │            │  L2 HITL    │            │  NOVEL      │
             │  EXECUTE    │            │  APPROVAL   │            │  PATTERN    │
             └──────┬──────┘            └──────┬──────┘            └──────┬──────┘
                    │                          │                          │
                    ▼                          ▼                          ▼
             ┌─────────────────────────────────────────────────────────────────┐
             │                     REPORT AGENT (Tier 6)                        │
             │  - Generates SRE post-mortem                                     │
             │  - Embeds to Qdrant (learning loop)                              │
             │  - Publishes to GitHub                                           │
             │  - AI Observability metrics (hallucination, PII, XAI)           │
             └─────────────────────────────────────────────────────────────────┘
```

---

## Model & Provider Summary

| Agent | Primary Model | Provider | Fallback | Embeddings |
|-------|---------------|----------|----------|------------|
| Ingest | — | — | — | Cohere `embed-english-v3.0` |
| Log | — | — | — | — |
| Anomaly | — | — | — | — |
| RCA | Llama-3.3-70B | Groq | Featherless | Cohere `embed-english-v3.0` |
| Remediation | Llama-3.3-70B | Groq | Featherless | — |
| Router | N/A (logic) | — | — | — |
| Report | Llama-3.3-70B | Featherless | Groq | Cohere `embed-english-v3.0` |

---

## Fail-Closed Safety Matrix

| Failure Point | Detection | Response |
|---------------|-----------|----------|
| Enkrypt Skill Sentinel unavailable | HTTP error/timeout | `NEEDS_REVIEW` → quarantine line |
| Enkrypt Rayder unavailable | HTTP error/timeout | `NEEDS_REVIEW` → HITL |
| RCA confidence < 0.5 | Vector similarity score | `novel_pattern` → HITL |
| RCA max iterations (4) | Iteration counter | `max_iterations_exceeded` → HITL |
| RCA JSON parse failure | Zod validation | `json_parse_failure` → HITL |
| Remediation Enkrypt FAIL | Verdict = FAIL | `enkrypt_verdict_FAIL` → HITL |
| Asset criticality = high_impact | CMDB lookup | Default deny → HITL |
| LLM API error | Exception caught | Route to HITL with error context |

All fail-closed paths set `state.autonomyTier = 'L2_HITL_APPROVAL'` and `state.status = 'pending_human_review'`.