---
name: Incident-response agent deploy gap
description: A hackathon-style Node/Express + separate Vite/React frontend repo shipped a Dockerfile that built and copied the frontend dist folder, but the Express server never mounted express.static for it — the UI was unreachable in any single-service deploy despite the build succeeding.
---

Backend build succeeding and Dockerfile referencing a frontend dist path does not mean the server actually serves it. Grep for `express.static` (or the equivalent static-file mount for the framework in use) before assuming a documented Docker/deploy setup actually works end-to-end.

**Why:** The build pipeline (`npm run build`) and Dockerfile both produced/copied `src/frontend/dist`, giving false confidence that deployment was wired up, but the route table had no static middleware or SPA fallback — every deploy would 404 on the UI.

**How to apply:** When a repo has a separate frontend build folder referenced by a Dockerfile/deploy config, verify the backend actually serves it (static middleware + SPA fallback route registered after API routes) before treating "the build works" as "the deploy works".
