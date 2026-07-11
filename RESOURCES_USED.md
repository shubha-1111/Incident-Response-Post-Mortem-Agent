# External Resources & Services — Rationale Documentation

This document catalogs every external service, API, and third-party resource used in the platform, with justification for each.

---

## Core AI & LLM Providers

### 1. Groq (`GROQ_API_KEY`)
**Service**: High-performance LLM inference (Llama-3.3-70B-Versatile)  
**Used By**: RCA Agent, Remediation Agent  
**Why**: 
- **Speed**: ~300 tokens/sec on Llama-3.3-70B — critical for real-time RCA (<5 min MTTR target)
- **Cost**: Free tier available (no credit card) — hackathon-friendly
- **Model Quality**: Llama-3.3-70B matches GPT-4 on coding/reasoning benchmarks
- **Integration**: `@ai-sdk/groq` provider works natively with Mastra `Agent` class

**Alternative Considered**: OpenAI GPT-4o — rejected due to cost, latency, and rate limits on free tier.

---

### 2. Featherless AI (`FEATHERLESS_API_KEY`)
**Service**: Multi-model LLM gateway (Llama-3.3-70B, Llama-3.1-8B, Mistral-7B)  
**Used By**: Report Agent (primary), RCA/Remediation (fallback), threat intel classification  
**Why**:
- **Model Variety**: Access to multiple open-weight models via single API
- **Cost Optimization**: Llama-3.1-8B for classification/summaries (~$0.02/1M tokens), Llama-3.3-70B for reports
- **Fallback Resilience**: Automatic failover when Groq rate-limited (implemented in `featherless-service.ts`)
- **OpenAI-Compatible API**: Drop-in replacement for `openai` SDK

**Fallback Chain**: Featherless → Groq (configured in `FeatherlessService.fallbackChatCompletion`)

---

### 3. Cohere (`COHERE_API_KEY`)
**Service**: Embedding models (embed-english-v3.0, 1024-dim)  
**Used By**: Ingest Agent, RCA Agent (tools), Report Agent  
**Why**:
- **Dimension Match**: 1024-dim vectors align with Qdrant collection schema
- **Quality**: `embed-english-v3.0` outperforms OpenAI text-embedding-3-small on MTEB
- **Input Types**: `search_document` / `search_query` optimization for asymmetric search
- **Free Tier**: Generous monthly allowance for hackathon use

**Alternative Considered**: OpenAI text-embedding-3-large (3072-dim, costlier, dimension mismatch).

---

## Vector Database

### 4. Qdrant Cloud (`QDRANT_URL`, `QDRANT_API_KEY`)
**Service**: Managed vector database (Cosine similarity, payload filtering)  
**Used By**: All agents (storage + retrieval)  
**Collections**:
| Collection | Vector Size | Distance | Purpose |
|------------|-------------|----------|---------|
| `forensic_events` | 1024 | Cosine | Raw log events with 90-day TTL |
| `incident_knowledge` | 1024 | Cosine | Post-mortem embeddings (learning loop) |

**Why Qdrant**:
- **Payload Filtering**: Native support for `timestamp` (range), `host` (keyword), `expires_at` (TTL) — essential for RCA tool constraints
- **MMR Support**: Maximal Marginal Relevance for diverse KB retrieval
- **Managed Cloud**: Zero-ops, free tier (1M vectors)
- **Performance**: HNSW index, sub-10ms p99 on 100K vectors
- **Client**: `@qdrant/js-client-rest` — TypeScript-first, well-maintained

**Schema Design**:
```typescript
// forensic_events payload indexes (created at startup)
- timestamp (integer, range)      → Temporal window queries
- host (keyword)                  → Host-filtered RCA lookups
- expires_at (integer, range)     → TTL cleanup
- sequence_no (integer)           → Deterministic ordering

// incident_knowledge — no additional indexes (pure vector search)
```

**Alternative Considered**: Pinecone (costly free tier limits), Weaviate (heavier), pgvector (requires Postgres management).

---

## Security Guardrails

### 5. Enkrypt AI — Skill Sentinel (`ENKRYPT_SKILL_SENTINEL_URL`)
**Service**: Inbound prompt injection / PII / malicious payload detection  
**Used By**: Ingest Agent (`scanInboundLog`)  
**Why**:
- **Purpose-Built**: Specialized for log/safety scanning, not general moderation
- **Verdicts**: `PASS` | `FAIL` | `NEEDS_REVIEW` — maps directly to our quarantine logic
- **Compliance**: Detects PII (emails, phones, SSNs, credit cards), secrets, prompt injections
- **Integration**: Simple HTTP POST, no SDK needed

**Failure Mode**: Unavailable → `NEEDS_REVIEW` (fail-safe to human)

---

### 6. Enkrypt AI — Rayder (`ENKRYPT_RAYDER_URL`)
**Service**: Outbound action policy validation  
**Used By**: Remediation Agent (`validateOutboundAction`)  
**Why**:
- **Policy-as-Code**: Validates remediation actions against safety policies before execution
- **Context-Aware**: Considers `actionType`, `target`, `assetCriticality`
- **Guardrail**: Prevents destructive actions on high-impact assets without human approval
- **Verdicts**: Same tri-state (`PASS`/`FAIL`/`NEEDS_REVIEW`) as Skill Sentinel

**Failure Mode**: Unavailable → `NEEDS_REVIEW` (fail-safe to human)

---

## Threat Intelligence

### 7. AbuseIPDB (`ABUSEIPDB_API_KEY`)
**Service**: IP reputation & abuse confidence scoring  
**Used By**: Anomaly Agent (`enrichEventWithThreatIntel`)  
**Why**:
- **Specialized**: Purpose-built for IP abuse reporting (not general VT)
- **Confidence Score**: 0–100% abuse confidence — directly usable for confidence boosting
- **Metadata**: Country, ISP, domain, usage type, reports count
- **Free Tier**: 1,000 requests/day — sufficient for demo

**Integration**: REST API, cached per IP per incident to avoid duplicate calls.

---

### 8. VirusTotal (`VIRUSTOTAL_API_KEY`)
**Service**: Multi-vendor malware/URL reputation  
**Used By**: Anomaly Agent (supplementary)  
**Why**:
- **Breadth**: 70+ vendor scans
- **Signals**: `maliciousVotes`, `harmlessVotes`, `communityScore`
- **Complementary**: AbuseIPDB = abuse reports, VT = malware detection — orthogonal signals

**Note**: Optional — system works without it (graceful degradation).

---

### 9. MITRE ATT&CK (Local Dataset)
**Service**: Adversary tactic/technique framework  
**Used By**: Anomaly Agent, Report Agent (tags)  
**Why**:
- **Standardization**: Universal language for threat classification
- **Mapping**: Log patterns → technique IDs (e.g., T1110.004 = Credential Stuffing)
- **No API Key**: Local JSON dataset (`src/services/mitre-attack-data.json`)
- **Reporting**: SOP references, executive summaries

---

### 10. CISA Known Exploited Vulnerabilities (KEV) (`CISA_KEV_SYNC`)
**Service**: Authoritative list of actively exploited CVEs  
**Used By**: `cisa-kev-sync.ts` (startup sync), RCA Agent (KB enrichment)  
**Why**:
- **Authority**: US government mandate — highest confidence exploit data
- **Actionability**: Each KEV entry includes `vulnerabilityName`, `vendorProject`, `product`, `vulnerabilityId` (CVE), `shortDescription`, `requiredAction`, `dueDate`
- **Integration**: Synced to Qdrant `incident_knowledge` at startup for RCA tool access

---

## Infrastructure & Persistence

### 11. PostgreSQL + TimescaleDB (`DATABASE_URL`)
**Service**: Relational + time-series database  
**Used By**: `database/postgres-db.ts`, `sql/schema-postgres.sql`  
**Tables**:
| Table | Purpose |
|-------|---------|
| `incidents` | Incident metadata, status, timestamps |
| `evidence_chain` | Immutable evidence log (append-only) |
| `risk_history` | Threat score time-series (Timescale hypertable) |
| `metric_snapshots` | Confidence/retrieval/threat per workflow step |
| `post_mortems` | Report references, GitHub URLs |

**Why TimescaleDB**:
- **Hypertables**: Automatic partitioning of time-series data
- **Compression**: 90%+ storage savings on metrics
- **Continuous Aggregates**: Pre-computed dashboards
- **PostgreSQL Compatible**: Standard SQL, Prisma/Drizzle ready

**Local Dev**: SQLite (`src/database/sqlite.ts`) — zero-config, file-based.

---

### 12. Redis Cluster (`REDIS_URL` / `USE_REDIS=true`)
**Service**: In-memory cache + pub/sub  
**Used By**: `src/config/redis.ts`, `services/ioc-pipeline.ts`, `services/bloom-filter.ts`  
**Use Cases**:
- IOC deduplication (Bloom filter)
- Hot-path caching (asset criticality, threat scores)
- Rate limiting (API quotas)
- Session store (JWT blacklist)

**Why Cluster Mode**: 3 masters + 3 replicas — HA for production.

---

### 13. Apache Kafka (`KAFKA_BROKERS` / `USE_KAFKA=true`)
**Service**: Event streaming backbone  
**Used By**: `src/config/kafka.ts`, `src/scripts/create-topics.ts`  
**Topics**:
| Topic | Partitions | Retention | Purpose |
|-------|------------|-----------|---------|
| `incident.events` | 6 | 7 days | Workflow lifecycle events |
| `anomaly.signals` | 6 | 3 days | Real-time anomaly detections |
| `threat.intel` | 3 | 30 days | Enriched threat intelligence |
| `audit.log` | 3 | 90 days | Immutable audit trail |

**Why Kafka**: Durable, ordered, replayable event log — essential for audit compliance.

---

## Observability

### 14. OpenTelemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`)
**Service**: Distributed tracing + metrics  
**Used By**: `src/config/otel.ts`, all agents/workflows  
**Instrumentation**:
- `@opentelemetry/auto-instrumentations-node` — Zero-code Express, HTTP, DB, Redis
- Custom spans: `traceAgentStep`, `traceWorkflowStep`
- Custom metrics: `recordConfidenceScore`, `recordTokenUsage`, `recordFailClosed`

**Exporters**: OTLP/HTTP → Grafana Tempo (traces), Prometheus (metrics), Loki (logs)

**Why**: Vendor-neutral, CNCF graduated, auto-instrumentation covers 80% of needs.

---

## Identity & Access

### 15. JWT (`JWT_SECRET`, `JWT_EXPIRY`)
**Service**: Stateless authentication  
**Used By**: `src/config/auth.ts`, `src/api/server.ts`  
**Config**: HS256, 32+ char secret, 1-hour expiry (configurable)  
**Why**: No external IdP dependency, works offline, portable.

---

## Publishing & Collaboration

### 16. GitHub (`GITHUB_TOKEN`, `GITHUB_REPO`)
**Service**: Post-mortem publishing + version control  
**Used By**: `src/tools/github-tools.ts` (`publishPostMortem`)  
**Why**:
- **Audit Trail**: Immutable git history of all post-mortems
- **Collaboration**: PR reviews, issues, links to code
- **Learning Loop**: Qdrant KB ← GitHub markdown (bidirectional)
- **Free**: Public repos unlimited, private repos free for teams

---

## Container Orchestration

### 17. Railway (Deployment Target)
**Platform**: Managed container hosting  
**Why**:
- **Free Tier**: $5/month credit (covers hobby projects)
- **GitHub Native**: Auto-deploy on push
- **Dockerfile Support**: Uses project's multi-stage Dockerfile
- **Environment Variables**: Secure variable injection (no .env in repo)
- **Public Domain**: Auto-generated `*.up.railway.app` HTTPS URL
- **No Credit Card**: Free developer trial

**Alternative**: Render, Fly.io, AWS ECS — Railway simplest for hackathon.

---

### 18. Docker / Docker Compose
**Service**: Containerization & local infra  
**Files**: `Dockerfile`, `docker-compose.yml`  
**Compose Services**:
| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | `timescale/timescaledb:2.14.2-pg15` | Primary DB |
| `kafka` + `zookeeper` | `confluentinc/cp-kafka:7.4.0` | Event streaming |
| `redis-1`..`redis-6` | `redis:7.2` | Redis Cluster (3M/3R) |

**Why**: Reproducible local dev, matches production Railway container.

---

## Frontend Stack

### 19. React + Vite + Tailwind CSS
**Location**: `src/frontend/`  
**Why**:
- **Vite**: Instant HMR, optimized production build
- **Tailwind**: Utility-first, no CSS files, dark mode built-in
- **Single HTML**: `index.html` served by Express in production
- **WebSocket**: Real-time dashboard updates via `src/api/websocket.ts`

---

## Development Tools

### 20. TypeScript + ts-node + tsx
**Config**: `tsconfig.json` (ESM, strict, NodeNext)  
**Why**: Type safety across agents, workflows, tools — catches schema drift at compile time.

### 21. Mastra (`@mastra/core`)
**Framework**: Agent orchestration, workflows, steps, tools  
**Why**:
- **Workflows**: DAG-based `.then().commit()` — visual, testable, resumable
- **Steps**: Typed input/output schemas (Zod), retry/timeout built-in
- **Agents**: `Agent` class with `tools`, `instructions`, `model` provider abstraction
- **Tools**: `createTool` with Zod schemas — LLM-function calling made safe

---

### 22. Zod
**Library**: Schema validation  
**Used By**: All agent inputs/outputs, workflow steps, API endpoints  
**Why**: TypeScript-first, zero-runtime-overhead (compile-time types), excellent error messages.

---

## Summary: Required vs Optional

| Resource | Required | Fallback | Free Tier |
|----------|----------|----------|-----------|
| **Groq API** | ✅ Yes | Featherless | ✅ Yes |
| **Qdrant Cloud** | ✅ Yes | Local Docker | ✅ Yes |
| **Cohere API** | ✅ Yes | — | ✅ Yes |
| **Enkrypt Skill Sentinel** | ✅ Yes | `PASS` default | Trial |
| **Enkrypt Rayder** | ✅ Yes | `PASS` default | Trial |
| **Featherless AI** | ⚠️ Report Agent | Groq | ✅ Yes |
| **AbuseIPDB** | ⚠️ Enrichment | Skip | ✅ Yes (1K/day) |
| **VirusTotal** | ❌ Optional | Skip | ✅ Yes |
| **PostgreSQL** | ⚠️ Prod | SQLite | Docker |
| **Redis** | ❌ Optional | In-memory | Docker |
| **Kafka** | ❌ Optional | Event bus | Docker |
| **GitHub** | ⚠️ Publishing | Local file | ✅ Yes |
| **Railway** | ✅ Deploy | Local | ✅ Trial |

---

## Cost Analysis (Hackathon / Production)

| Service | Free Tier Limits | Estimated Monthly Cost (Post-Free) |
|---------|------------------|-----------------------------------|
| Groq | Unlimited (rate-limited) | $0 (free tier generous) |
| Qdrant Cloud | 1M vectors, 1GB | $0–$10 |
| Cohere | 100K requests/mo | $0–$5 |
| Enkrypt AI | Trial | ~$50–$200 (enterprise) |
| Featherless | Pay-per-token | ~$5–$20 |
| AbuseIPDB | 1K/day | $50/mo |
| Railway | $5 credit/mo | $5–$20 |
| GitHub | Unlimited public | $0 |

**Total Hackathon Cost**: **$0** (all free tiers sufficient for demo)

---

## Security Notes

1. **No Secrets in Code**: All credentials via environment variables
2. **`.gitignore`**: Excludes `.env`, `*.pem`, `*.key`, `node_modules`, `dist`
3. **Fail-Closed Defaults**: Every external call has safe fallback (`NEEDS_REVIEW`, `PASS`, skip)
4. **Least Privilege**: API keys scoped to minimal required permissions
5. **Audit Trail**: All decisions logged to SQLite/Postgres + event bus + OpenTelemetry