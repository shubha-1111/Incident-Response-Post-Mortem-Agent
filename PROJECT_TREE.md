# Project Directory Tree

```
incident-response-agent/
├── Dockerfile                              # Multi-stage Docker build for Railway deployment
├── docker-compose.yml                      # Local infra (Qdrant, Redis, Kafka, Postgres)
├── PROJECT_TREE.md                         # This file
├── README.md                               # Main project documentation
├── AGENTS_README.md                        # Detailed agent specifications
├── RESOURCES_USED.md                       # External services & dependencies rationale
├── package.json                            # Root workspace scripts & dependencies
├── package-lock.json
├── tsconfig.json                           # TypeScript configuration
├── .env.example                            # Environment variable template
├── .gitignore
├── FEATHERLESS_INTEGRATION.md              # Featherless AI integration docs
├── sql/
│   └── schema-postgres.sql                 # PostgreSQL schema for persistence
├── data/
│   └── post-mortems/                       # Sample post-mortem reports
│       ├── inc-2026-demo-001-postmortem.md
│       └── inc-2026-scan-367-postmortem.md
├── src/
│   ├── index.ts                            # Application entrypoint (DB init, CISA sync, server start)
│   ├── run-diagnostics.ts                  # Health check script
│   ├── agents/                             # 6 Core AI Agents
│   │   ├── ingest-agent.ts                 # Tier 1: Log ingestion + Enkrypt PII scrubbing + Cohere embeddings → Qdrant
│   │   ├── log-agent.ts                    # Tier 2a: Signature-based threat pattern matching (regex)
│   │   ├── anomaly-agent.ts                # Tier 2b: Statistical anomaly + Threat Intel (AbuseIPDB, VirusTotal, MITRE ATT&CK)
│   │   ├── rca-agent.ts                    # Tier 3: Bounded ReAct RCA agent (Groq Llama-3.3-70B + Cohere embeddings + Qdrant KB)
│   │   ├── remediation-agent.ts            # Tier 4: Remediation planner (Groq Llama-3.3-70B + CMDB + Enkrypt Rayder)
│   │   └── report-agent.ts                 # Tier 6: SRE Post-Mortem generator (Featherless Llama-3.3-70B + Cohere + Qdrant + GitHub)
│   ├── api/
│   │   ├── server.ts                       # Express HTTP Gateway (Auth, Ingest, Approvals, Dashboard data)
│   │   └── websocket.ts                    # WebSocket server for real-time anomaly streaming
│   ├── config/
│   │   ├── auth.ts                         # JWT session management
│   │   ├── enkrypt.ts                      # Enkrypt AI Skill Sentinel (inbound) + Rayder (outbound) clients
│   │   ├── otel.ts                         # OpenTelemetry tracing + custom metrics
│   │   ├── qdrant.ts                       # Qdrant vector DB client + collection schemas
│   │   ├── kafka.ts                        # Kafka producer/consumer config
│   │   ├── redis.ts                        # Redis client
│   │   ├── postgres.ts                     # PostgreSQL connection pool
│   │   └── misp.ts                         # MISP threat intel platform config
│   ├── database/
│   │   ├── database.ts                     # SQLite operations (incidents, metrics, risk history)
│   │   ├── correlation-db.ts               # Correlation DB interface
│   │   ├── correlation-postgres.ts         # PostgreSQL correlation implementation
│   │   ├── correlation-sqlite.ts           # SQLite correlation implementation
│   │   ├── postgres-db.ts                  # PostgreSQL operations
│   │   └── sqlite.ts                       # SQLite connection
│   ├── events/
│   │   ├── event-bus.ts                    # Event emitter for real-time workflow updates
│   │   ├── event-types.ts                  # Event type definitions
│   │   └── subscribers/
│   │       ├── index.ts
│   │       ├── sqlite-subscriber.ts        # Persists events to SQLite
│   │       ├── timeline-subscriber.ts      # Timeline event aggregation
│   │       └── websocket-subscriber.ts     # Broadcasts to WebSocket clients
│   ├── frontend/                           # React + Vite + Tailwind Dashboard
│   │   ├── index.html                      # SPA entry point
│   │   ├── index.css                       # Global styles + Tailwind
│   │   ├── main.jsx                        # React app root
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── vite.config.ts
│   │   └── components/
│   │       ├── ConfusionMatrixChart.tsx    # Confusion matrix visualization
│   │       ├── IncidentNetworkGraph.tsx    # Network graph of incidents
│   │       └── MultiSelectFilter.tsx       # Multi-select filter component
│   ├── schemas/
│   │   └── incident-state.ts               # Zod schemas for IncidentState, EvidencePointer, RemediationAction, EnkryptDecision
│   ├── scripts/
│   │   ├── benchmark-kafka.ts              # Kafka throughput benchmark
│   │   ├── benchmark-redis.ts              # Redis benchmark
│   │   ├── create-topics.ts                # Kafka topic creation
│   │   ├── migrate-sqlite-to-postgres.ts   # Migration script
│   │   ├── test-featherless.ts             # Featherless AI integration test
│   │   └── verify-migration.ts             # Migration verification
│   ├── services/
│   │   ├── accuracy-engine.ts              # Accuracy metrics computation
│   │   ├── asset-correlation.ts            # Asset correlation logic
│   │   ├── bloom-filter.ts                 # Bloom filter for deduplication
│   │   ├── cisa-kev-sync.ts                # CISA KEV catalog sync
│   │   ├── clustering-service.ts           # Incident clustering
│   │   ├── confidence-engine.ts            # Confidence scoring
│   │   ├── confusion-matrix.ts             # Confusion matrix calculation
│   │   ├── correlation-engine.ts           # Cross-incident correlation
│   │   ├── crypto-analysis.ts              # Cryptographic analysis
│   │   ├── cve-service.ts                  # CVE lookup service
│   │   ├── decision-engine.ts              # Decision making engine
│   │   ├── featherless-service.ts          # Featherless AI wrapper (Groq fallback)
│   │   ├── feed-sync-scheduler.ts          # Threat feed sync scheduler
│   │   ├── filter-engine.ts                # Log filtering
│   │   ├── filter-presets.ts               # Filter presets
│   │   ├── group-analysis.ts               # Group incident analysis
│   │   ├── health-monitor.ts               # Health monitoring
│   │   ├── ioc-pipeline.ts                 # IOC extraction pipeline
│   │   ├── misp-service-reexport.ts        # MISP service re-export
│   │   ├── misp-service.ts                 # MISP threat intel service
│   │   ├── misp-sync.ts                    # MISP sync logic
│   │   ├── pdf-service.ts                  # PDF report generation
│   │   ├── remediation-playbooks.ts        # Remediation playbook definitions
│   │   ├── report-templates.ts             # Report templates
│   │   ├── scoring-engine.ts               # Threat scoring
│   │   ├── sigma-service.ts                # Sigma rule processing
│   │   ├── temporal-correlation.ts         # Temporal correlation analysis
│   │   ├── vector-correlation.ts           # Vector-based correlation
│   │   └── yara-service.ts                 # YARA rule matching
│   ├── simulation/
│   │   ├── scenarios.ts                    # Demo incident scenarios & log fixtures
│   │   └── simulation-service.ts           # Automated simulation runner
│   ├── tests/
│   │   └── integration.test.ts             # Integration tests
│   ├── tools/
│   │   ├── cmdb-tools.ts                   # CMDB asset criticality lookup
│   │   ├── enkrypt-tools.ts                # Enkrypt AI tool wrappers
│   │   ├── github-tools.ts                 # GitHub post-mortem publishing
│   │   └── threat-intel-tools.ts           # AbuseIPDB, VirusTotal, MITRE ATT&CK enrichment
│   └── workflows/
│       ├── autonomy-router.ts              # Autonomy tier routing logic (L2 HITL vs L4 Auto)
│       └── incident-workflow.ts            # Mastra 8-step workflow graph orchestration
└── .kilo/                                  # Kilo CLI configuration
    ├── agent/
    ├── command/
    ├── package.json
    └── agent-manager.json
```

## Key Architectural Directories

| Directory | Purpose |
|-----------|---------|
| `src/agents/` | 6-tier autonomous agent pipeline |
| `src/workflows/` | Mastra workflow graph orchestration |
| `src/api/` | Express + WebSocket gateway |
| `src/config/` | External service clients & telemetry |
| `src/database/` | SQLite/PostgreSQL persistence layer |
| `src/events/` | Event-driven architecture (pub/sub) |
| `src/services/` | Business logic & ML services |
| `src/tools/` | Agent-executable tool functions |
| `src/frontend/` | React dashboard (served by Express in prod) |
| `src/simulation/` | Demo data & automated scenarios |
| `src/scripts/` | Operational & benchmarking scripts |