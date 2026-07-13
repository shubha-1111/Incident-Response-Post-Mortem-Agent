---
name: Incident-response agent deploy gap
description: Recurring deploy/runtime gaps found in the Mastra + Qdrant + Enkrypt AI incident-response agent (Railway deploy). Check for these patterns in similarly-structured repos.
---

## Frontend not served
Dockerfile copied frontend dist but nothing served it in production. Check that the server actually mounts/serves the built static frontend, not just that the build step runs.

## Enkrypt AI has no "Skill Sentinel" / "Rayder" HTTP API
Skill Sentinel is a separate CLI tool (agent-skill-package scanner); Rayder is a browser-extension-only red-teaming tool. Neither has a public REST endpoint. The real public API is Guardrails Detect: `POST https://api.enkryptai.com/guardrails/detect` with an `apikey` header and a `detectors`/`summary` request-response shape. Any code hitting `sentinel.enkryptai.com` or `rayder.enkryptai.com` will 404 regardless of API key — the fix is migrating the call site, not just adding auth.

## Qdrant collections must be created idempotently
`initializeCollections()`-style bootstrap code must check `getCollections()` and only create missing collections. Deleting + recreating on every boot silently wipes all accumulated vector data (postmortems, forensic embeddings) on every restart — a very easy mistake that looks like "RAG never learns" rather than "the DB gets wiped."

## Multiple sessions/agents editing the same repo via GitHub diverge fast
When a Repl and a separately-deployed session (e.g. one driving a Railway deploy) both commit to the same GitHub repo independently, `git push` gets rejected and histories diverge quickly (seen: 28 commits apart after one afternoon). Before assuming your local fix is the only one, `git fetch && git log origin/main --oneline` to check whether the other session already fixed (or independently reached) the same thing, then merge deliberately instead of force-pushing over their work.

## Fail-closed security defaults are a product decision, not a bug
Code that defaults to the safe/restrictive path when a dependency (CMDB, auth service, etc.) is unreachable or unconfigured is often an intentional fail-closed security posture, not an oversight. Flipping such a default to fail-open (e.g. "unknown asset criticality → treat as low-risk / auto-remediate" instead of "→ require human approval") measurably changes the security posture of the system. Get explicit user sign-off before changing it, even if it's framed as "just get things unstuck."
