---
name: Incident-response agent deploy gap
description: A hackathon-style Node/Express + separate Vite/React frontend repo shipped a Dockerfile that built and copied the frontend dist folder, but the Express server never mounted express.static for it — the UI was unreachable in any single-service deploy despite the build succeeding. (Note: a later session added the static-serving fix — always re-verify with a grep rather than assuming this repo still has the gap.)

---

Backend build succeeding and Dockerfile referencing a frontend dist path does not mean the server actually serves it. Grep for `express.static` (or the equivalent static-file mount for the framework in use) before assuming a documented Docker/deploy setup actually works end-to-end.

**Why:** The build pipeline (`npm run build`) and Dockerfile both produced/copied `src/frontend/dist`, giving false confidence that deployment was wired up, but the route table had no static middleware or SPA fallback — every deploy would 404 on the UI.

**How to apply:** When a repo has a separate frontend build folder referenced by a Dockerfile/deploy config, verify the backend actually serves it (static middleware + SPA fallback route registered after API routes) before treating "the build works" as "the deploy works".

## Follow-up: env-var hard-requirements can be scattered across config files

In this same repo, several config modules (`src/config/qdrant.ts`, and `openai` client construction inside `src/agents/rca-agent.ts`) throw at **import time** if their env var is missing — this crashes the whole server on boot, not just the feature that needs the credential. Other modules in the same codebase (`src/config/enkrypt.ts`, `cohere-ai` client) degrade gracefully instead. Don't assume all "required" env vars listed in a README behave the same way — grep for `throw new Error` / `new OpenAI(` / similar hard client constructors at module scope to find the ones that actually block startup, and request only those secrets first to unblock booting quickly.
