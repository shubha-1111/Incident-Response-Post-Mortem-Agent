# 🛡️ Incident Response Postmortem Agent

## Project Overview

A **6-Tier Autonomous Threat Mitigation & Learning Loop Engine** built with Mastra, Qdrant, and Enkrypt AI. Automatically scrubs logs, detects anomalies, performs root-cause analysis, plans containment, and generates SRE post-mortem reports — dropping MTTR from days to under 5 minutes.

### Stack
- **Backend**: Node.js + Express + TypeScript (ESM, ts-node for dev)
- **Frontend**: React 18 + Vite + Tailwind CSS 3 + Recharts
- **AI Pipeline**: Mastra workflow engine — 6 agents in sequence
- **Database**: SQLite (local incidents) + Qdrant (vector embeddings)
- **Auth**: JWT (auto-generated secret if not set)
- **Realtime**: WebSocket server for live log streaming
- **Deployment**: Railway (Docker multi-stage build)

### How to run (dev)
```bash
npm install --legacy-peer-deps   # install backend deps
cd src/frontend && npm install    # install frontend deps
cd src/frontend && npx vite build # build frontend static files
npm run dev                       # start Express on $PORT (default 5000)
```

The Express server serves the built frontend from `src/frontend/dist/`.

### How to build for production (Railway)
```bash
npm run build          # compiles TypeScript + builds frontend
npm run start          # runs dist/index.js
```

### Required environment variables (see `.env.example`)
| Variable | Description |
|---|---|
| `GROQ_API_KEY` | LLM for RCA agent |
| `COHERE_API_KEY` | Embeddings for Qdrant seeding |
| `QDRANT_URL` | Qdrant cloud instance URL |
| `QDRANT_API_KEY` | Qdrant API key |
| `ENKRYPT_API_KEY` | Security guardrails |
| `ABUSEIPDB_API_KEY` | Threat intelligence |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Dashboard login (defaults: admin/admin) |

Without Qdrant/Groq/Cohere keys, the app runs in degraded mode — the dashboard and incident tracking still work, but the AI pipeline steps will fail.

### Key files
- `src/index.ts` — entry point, bootstrap, dev simulation
- `src/api/server.ts` — all Express routes
- `src/workflows/incident-workflow.ts` — Mastra 6-tier workflow
- `src/frontend/main.jsx` — React SPA root + all state management
- `src/frontend/components/` — all UI components
- `src/frontend/vite.config.ts` — Vite config with dev proxy to backend

### Port mapping
- Dev: PORT env var (default 5000 on Replit, 3001 otherwise)
- Railway healthcheck: `GET /health`
- Frontend built to: `src/frontend/dist/`

## User Preferences
- Use React + Tailwind CSS for frontend
- Use Recharts for all charts (replaces Chart.js)
- Dark glassmorphism design system — keep the `glass-panel`, `card-panel`, `btn-approve-glow` CSS classes
- Charts should have interactive hover tooltips
- Incident cards should be expandable (click chevron for details)
- KPI counters in the header should animate on value changes
