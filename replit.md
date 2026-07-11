# 6-Tier Autonomous Threat Mitigation & Learning Loop Engine

Imported Node.js/TypeScript incident-response agent system (Mastra + Qdrant + Enkrypt AI + Groq/Cohere). Backend is Express (`src/index.ts`, `src/api/server.ts`); frontend is a separate Vite/React app in `src/frontend`.

## Required environment for the backend to boot
- `QDRANT_URL`, `QDRANT_API_KEY` — hard requirement, `src/config/qdrant.ts` throws at import time if missing.
- `GROQ_API_KEY` — LLM calls in the RCA/remediation agents (`llama-3.3-70b-versatile`).
- `COHERE_API_KEY` — embeddings (`embed-english-v3.0`) for Qdrant vector search.
- Optional: `ENKRYPT_SKILL_SENTINEL_URL`/`ENKRYPT_RAYDER_URL` (falls back to PASS if unset), `ABUSEIPDB_API_KEY`, `VIRUSTOTAL_API_KEY`, `CMDB_API_URL`/`CMDB_API_KEY`, `INCIDENT_SINK_URL`.
- `JWT_SECRET` auto-generates a random one if unset (fine for a single dev session, but set a fixed 32+ char value in any multi-instance/production deploy so tokens survive restarts).
- `PORT` defaults to 3001. `NODE_ENV=development` auto-triggers a demo incident workflow run on boot.

## Running on Replit
- Single workflow `Start application` runs `npm start` (serves the built backend + static frontend from `src/frontend/dist`) on `PORT=5000`, mapped to external port 80 in `.replit`. Frontend must be rebuilt (`npm run build`) after any change under `src/frontend`, then restart the workflow.
- Secrets configured: `QDRANT_URL`, `QDRANT_API_KEY`, `OPENAI_API_KEY` (the latter is a hard `import`-time requirement in the RCA agent even though it's not documented as required in the README).
- Known gap: the Qdrant Cloud cluster currently returns `403 Forbidden` on every request (confirmed with a direct `curl`, independent of this app's code) — the cluster/key on the user's Qdrant Cloud account needs to be checked. Until fixed, vector search/embeddings-dependent features (similarity search, KB retrieval) silently degrade; login, dashboard, sidebar navigation, and all other UI still work.
- Login: `admin` / `admin` (from `.env.example` defaults; not overridden here).

## What changed in this session (frontend enhancement pass)
Wired previously-unused backend routes into the dashboard UI:
- Fixed `ConfusionMatrixChart.tsx` (was calling a relative URL with no auth header — broken in both dev and prod).
- New nav sections: **Incident Groups** (clustering + correlation network graph, `IncidentGroupsView.jsx`), **Model Analytics** (accuracy/precision-recall/confusion matrix, `AnalyticsPanel.jsx`), **Security Toolkit** (IOC lookup, CVE/CISA-KEV lookup, config analyzer, XOR decrypt, "explain term" AI helper, `SecurityToolkit.jsx`).
- Added `ReportGenerator.jsx` (executive-summary/technical-deep-dive preview + PDF download) to the Reports tab.
- Wired the previously-imported-but-unused `MultiSelectFilter` into `ActiveIncidents.jsx` for attack-type filtering.
- Added static frontend serving + SPA fallback to `src/api/server.ts` so a single deployed service can serve both the API and the built frontend (the existing `Dockerfile` already copied `src/frontend/dist` into the image but nothing served it — this was a latent gap).

## Deploying to Railway
The app builds as one service (backend serves the built frontend from `src/frontend/dist`):
1. `railway.json` and `Procfile` are set up to run `npm run build` then `npm run start`.
2. In Railway, set the required env vars above (`QDRANT_URL`, `QDRANT_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, `JWT_SECRET`, plus any optional integrations you use).
3. Railway auto-detects `PORT`; the app already reads `process.env.PORT`.
4. Healthcheck path is `/health` (public, no auth).

## User preferences
- Prefers implementing/wiring existing backend functionality into the frontend quickly over building new backend features from scratch.
