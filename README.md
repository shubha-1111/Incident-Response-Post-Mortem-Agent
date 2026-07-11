# 🛡️ 6-Tier Autonomous Threat Mitigation & Learning Loop Engine
### HiDevs × Mastra Hackathon 2026 Submission

---

## 💡 The Problem & Value Proposition

* **The Problem:** Modern corporate Security Operations Centers (SOCs) are drowning in alert fatigue, processing upwards of 1,000 alerts daily. The industry-average Mean Time to Resolution (MTTR) stands at a staggering **207 days**, giving attackers massive windows for lateral movement.
* **Our Solution:** A **6-Tier Autonomous Threat Mitigation & Learning Loop Engine** built with Mastra, Qdrant, and Enkrypt AI. It automates log scrubbing, anomaly detection, root cause analysis, and containment planning, dropping MTTR from months to **under 5 minutes**.
* **Safety First:** Autonomy is balanced with strict safety guardrails. High-impact operations or safety check failures instantly trigger a fail-closed response, reverting control to Human-in-the-Loop (HITL) gates.

---

## 🏗️ Architecture Topology Layout

```
                  +----------------------------------------------+
                  |            Raw Log Ingestion Gate            |
                  |     (Enkrypt AI Inbound Skill Sentinel)     |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------+-----------------------+
                  |         Parallel Analysis Core               |
                  |   [ Log Agent ]  <->  [ Anomaly Agent ]      |
                  |   (Signature Match)     (Threat Intel)       |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------+-----------------------+
                  |       Retrieval Confidence Gate              |
                  |     (Checks similarity vector scores)        |
                  +----------------------+-----------------------+
                                         |
                       (Score >= 0.5)    |    (Score < 0.5)
                     +-------------------+-------------------+
                     |                                       |
                     v                                       v
        +------------+------------+            +-------------+-------------+
        |  Root Cause Analysis    |            |   Novel Pattern Handler   |
        |  (Bounded ReAct Agent)  |            |   (Fail-Closed Path)      |
        +------------+------------+            +-------------+-------------+
                     |                                       |
                     v                                       |
        +------------+------------+                          |
        |   Remediation Planner   |                          |
        |  (CMDB / Rayder Gate)   |                          |
        +------------+------------+                          |
                     |                                       |
                     +-------------------+-------------------+
                                         |
                                         v
                  +----------------------+-----------------------+
                  |          Autonomy Lifecycle Router           |
                  |  - L4 Auto-Execution (Standard / Safe)       |
                  |  - L2 HITL Manual Approval (Critical / Lock) |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------+-----------------------+
                  |             Post-Mortem Agent                |
                  |    - Write report to Qdrant learning loop    |
                  |    - Publish to external incident sink       |
                  +----------------------------------------------+
```

---

## ⚙️ Environment Variables Index

| Variable | Required | Default | Purpose / Compliance Rules |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3001` | The port the Express API Gateway listens on. |
| `NODE_ENV` | No | `development` | Setting to `development` triggers live demo logs trigger on start. |
| `OPENAI_API_KEY` | **Yes** | - | OpenAI API credential for embeddings and agent completions. |
| `QDRANT_URL` | **Yes** | - | Vector database instance endpoint. |
| `QDRANT_API_KEY` | No | - | Qdrant database authorization credential. |
| `ENKRYPT_SKILL_SENTINEL_URL` | **Yes** | - | Enkrypt AI Skill Sentinel project URL for inbound log scrubbing. |
| `ENKRYPT_RAYDER_URL` | **Yes** | - | Enkrypt AI Rayder project URL for outbound action validation checks. |
| `ABUSEIPDB_API_KEY` | No | - | AbuseIPDB API key used to enrich IP threat indicators. |
| `VIRUSTOTAL_API_KEY` | No | - | VirusTotal API key to fetch vendor reputation metrics. |
| `CMDB_API_URL` | No | - | Internal Asset configuration database lookup endpoint. |
| `CMDB_API_KEY` | No | - | Configuration database authentication credential. |
| `INCIDENT_SINK_URL` | No | - | Target external ticketing sink URL (Jira / ServiceNow). |
| `JWT_SECRET` | **Yes** | - | Security token sign key. **Must be >= 32 characters** or startup fails. |
| `JWT_EXPIRY` | No | `3600` | Expiration time for generated JWT tokens in seconds. |

---

## 🚀 Getting Started & Blueprint

### 1. Prerequisites
Ensure you have **Node.js v18+** installed. A Qdrant cluster instance or local container must be running.

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root workspace based on the `.env.example` file:
```bash
cp src/.env.example .env
```
Populate `.env` with your API keys. Make sure your `JWT_SECRET` is at least 32 characters long.

### 4. Running the Platform
Start the server in development mode:
```bash
npm run dev
```
Starting in development mode triggers database collection initialization, seeds 3 historical incident vectors, and auto-triggers the live demo investigation workflow.

---

## 🎬 5-Minute "Live Demo Walkthrough Script" for Judges

Follow this step-by-step script to demonstrate the engine to the judges:

1. **Dashboard Authentication:**
   * Open the dashboard in your browser (defaults to `http://localhost:3000/src/frontend/index.html` or served path).
   * Enter the Operator ID: `admin` and Access Signature: `admin`, then click **Establish Session**.
2. **Review Autonomous Investigation:**
   * Observe `INC-2026-DEMO-001` automatically appearing in the incident list.
   * Click on it to load the **Audit Trail**.
   * Show the judges the **Evidence Ledger** detailing parsed event details and **Threat Intel Report** outputs (showing AbuseIPDB confidence and MITRE ATT&CK technique IDs like `T1110.004`).
3. **Observe the Safety Lock (Fail-Closed):**
   * Highlight the orange banner: **ATTENTION: HUMAN OVERRIDE REQUIRED**.
   * Explain: Because the attack targeted a production database (`db-prod-02`) that CMDB flagged as `high_impact`, the engine activated a fail-closed lock and paused containment execution, routing the autonomy tier to `L2_HITL_APPROVAL`.
4. **Approve Override containment:**
   * Click **Approve Containment Execution**.
   * Observe the status updating immediately to `resolved`.
   * Click the **Post-Mortem Document** tab. Show the judges the clean terminal-style Markdown post-mortem generated by the Post-Mortem agent, including Root Cause, Action Taken, and SOP references.
   * Explain: This document has been embedded and indexed back into the Qdrant database, completing the learning loop.

---

## 🎯 Evaluation Criteria Mapping Matrix

Use this matrix to trace hackathon requirements directly to the codebase:

| Judging Criteria | Implementation Module | Source Code Location |
| :--- | :--- | :--- |
| **Autonomous Workflow Orchestration** | Mastra Workflows, Steps & graph commits | [`src/workflows/incident-workflow.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/workflows/incident-workflow.ts) |
| **Security Guardrails & Gateways** | Enkrypt AI integration (Skill Sentinel & Rayder) | [`src/config/enkrypt.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/config/enkrypt.ts) <br> [`src/tools/enkrypt-tools.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/tools/enkrypt-tools.ts) |
| **Vector Store Learning Loop** | Qdrant collection upserts & embeddings | [`src/agents/report-agent.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/agents/report-agent.ts) <br> [`src/config/qdrant.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/config/qdrant.ts) |
| **Centralized State Validation** | Strict Zod schemas & mutations | [`src/schemas/incident-state.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/schemas/incident-state.ts) |
| **Asset Dependency Governance** | CMDB lookup deny-lists & default-deny | [`src/tools/cmdb-tools.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/tools/cmdb-tools.ts) |
| **Threat Intelligence Enrichment** | IP checking & MITRE ATT&CK mapping | [`src/tools/threat-intel-tools.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/tools/threat-intel-tools.ts) |
| **High-Fidelity Command Interface** | Single Page React/Tailwind Dashboard | [`src/frontend/index.html`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/frontend/index.html) |
| **Observability & Distributed Tracing** | OpenTelemetry spans & logs integration | [`src/config/otel.ts`](file:///Users/shubha/Desktop/Incident%20Response%20&%20Post-Mortem%20Agent/src/config/otel.ts) |

---

## 📂 Project Repository Tree Structure

Below is the directory tree of the platform, outlining where the frontend dashboard, backend APIs, Mastra orchestration, database schemas, and AI agents reside:

```text
.
├── Dockerfile                  # Container definition for hosting the platform
├── README.md                   # Platform documentation and evaluation guide
├── package.json                # Monorepo scripts and third-party dependencies
├── tsconfig.json               # Backend TypeScript compile rules
├── jest.config.js              # Integration test settings
└── src/                        # Platform Core Source
    ├── index.ts                # App entrypoint (initializes DBs, feeds CISA vulnerabilities, & starts server)
    ├── agents/                 # Multi-Agent intelligence layers
    │   ├── ingest-agent.ts     # PII log scrubber gateway using Enkrypt AI Skill Sentinel
    │   ├── log-agent.ts        # Threat log parser (regex pattern and process matching)
    │   ├── anomaly-agent.ts    # Webhook signal and historical Qdrant vector database anomaly check
    │   ├── rca-agent.ts        # Bounded ReAct agent for finding root cause
    │   ├── remediation-agent.ts# Remediation planner matching CMDB impact and Enkrypt Rayder guardrails
    │   └── report-agent.ts     # SRE markdown post-mortem document compiler
    ├── api/                    # Communications layer
    │   ├── server.ts           # Express HTTP Gateway endpoints (Auth, Ingest, Approvals, Dashboard)
    │   └── websocket.ts        # Real-time WebSocket anomaly stream broadcaster
    ├── config/                 # Platform settings & telemetry hooks
    │   ├── auth.ts             # JWT session authorization & token middleware
    │   ├── enkrypt.ts          # Enkrypt AI Skill Sentinel & Rayder URL setup
    │   ├── otel.ts             # OpenTelemetry tracing registry and custom metric hook binders
    │   └── qdrant.ts           # Qdrant client connection and collection schema builders
    ├── database/               # Relational data persistence
    │   └── database.ts         # SQLite instance initialization & dashboard query utilities
    ├── frontend/               # Single Page React/Tailwind Dashboard UI
    │   ├── index.html          # HTML entry point (fonts, layout structure)
    │   ├── index.css           # Global custom css rules and Tailwind setup
    │   ├── main.jsx            # Core React dashboard view featuring the ChatGPT-style sidebar
    │   ├── package.json        # Frontend developer packages (Vite, React, Lucide)
    │   └── vite.config.ts      # Vite dev server and production builder configs
    ├── schemas/                # Shared data model layer
    │   └── incident-state.ts   # Incident state Zod validation schemas
    ├── tools/                  # Executable agent utilities
    │   ├── cmdb-tools.ts       # Critical host lookups and impact scoring rules
    │   ├── enkrypt-tools.ts    # Enkrypt API calls (Skill Sentinel scrubbing & Rayder checks)
    │   ├── github-tools.ts     # Post-mortem report commit publisher
    │   └── threat-intel-tools.ts # IP locations and MITRE ATT&CK maps
    └── workflows/              # Orchestration & control loop scripts
        ├── autonomy-router.ts  # Autonomy tier evaluation rules (L2 HITL vs L4 Auto)
        └── incident-workflow.ts# Mastra workflow graph representing the 6-tier response loop
```

---

## 🤖 Platform AI Agents Specification

The Incident Response platform utilizes a pipeline of **6 coordinate agents**, each performing specific duties during the threat response lifecycle:

1. **Ingest Agent (`src/agents/ingest-agent.ts`)**
   - **Role**: Data Scrubbing Gateway
   - **Purpose**: Intercepts inbound raw syslog streams and scrubs sensitive details (phone numbers, emails, passwords, auth tokens, credit cards) using the **Enkrypt AI Skill Sentinel** API.
   - **Trigger**: Fired as the initial step in the threat response loop when raw log records are received.

2. **Log Signature Agent (`src/agents/log-agent.ts`)**
   - **Role**: Threat Pattern Parser
   - **Purpose**: Parses scrubbed syslog texts, isolates host/process details, and detects predefined security patterns (credential brute-force, database dropping attempts, nmap scans).
   - **Trigger**: Runs in parallel with the Anomaly Detection Agent immediately following successful log ingestion.

3. **Anomaly Detection Agent (`src/agents/anomaly-agent.ts`)**
   - **Role**: Behavioral Threat Detector
   - **Purpose**: Queries Qdrant vector database for historical similarity to flag repeat anomalies, fetches AbuseIPDB threat confidence indices, maps IP geolocation details, and extracts matching **MITRE ATT&CK** technique codes.
   - **Trigger**: Executes concurrently with the Log Signature Agent.

4. **Root Cause Analysis (RCA) Agent (`src/agents/rca-agent.ts`)**
   - **Role**: Forensic investigator
   - **Purpose**: A ReAct-based agent powered by Groq/LLM. It executes custom tools to query past incident knowledge and search local telemetry. It determines the high-confidence root cause category (e.g., `credential_stuffing`, `sql_injection_attempt`, `port_scan_detected`).
   - **Trigger**: Fired when parallel analysis checks complete and evidence meets confidence thresholds.

5. **Remediation Planner Agent (`src/agents/remediation-agent.ts`)**
   - **Role**: Mitigation Engineer
   - **Purpose**: Performs critical asset lookups in the internal Configuration Management Database (CMDB) to score impact. It devises a mitigation action (e.g. `block_ip`, `rotate_credential`, `patch_rule`) and runs validation checks via **Enkrypt AI Rayder** before routing.
   - **Trigger**: Triggered directly by the RCA Agent's diagnostic decisions.

6. **Post-Mortem SRE Report Agent (`src/agents/report-agent.ts`)**
   - **Role**: SRE Technical Writer
   - **Purpose**: Gathers the full forensic audit ledger, RCA diagnostic outputs, and remediation planner actions. It compiles a highly detailed, GitHub-compatible markdown report, commits it to the target git repository, and embeds it back into the Qdrant vector knowledge collection to complete the learning loop.
   - **Trigger**: Executes as the final block in the threat mitigation cycle once containment actions are approved/completed.

