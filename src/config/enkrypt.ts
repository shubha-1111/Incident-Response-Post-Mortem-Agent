import { EnkryptDecision } from '../schemas/incident-state.js';

export type EnkryptVerdict = EnkryptDecision;

// Enkrypt AI's public Guardrails Detect API is a single endpoint that runs a
// configurable set of detectors (PII, injection attacks, toxicity, policy
// violations, etc.) against a piece of text. We point both our inbound log
// scan and outbound action validation at it, toggling which detectors are
// enabled for each use case. Override via ENKRYPT_GUARDRAILS_URL if Enkrypt
// gives you a project-specific endpoint from the dashboard.
const ENKRYPT_GUARDRAILS_URL =
  process.env.ENKRYPT_GUARDRAILS_URL ||
  process.env.ENKRYPT_SKILL_SENTINEL_URL ||
  'https://api.enkryptai.com/guardrails/detect';
const ENKRYPT_RAYDER_URL = process.env.ENKRYPT_RAYDER_URL || ENKRYPT_GUARDRAILS_URL;
const ENKRYPT_API_KEY = process.env.ENKRYPT_API_KEY;

interface GuardrailsDetectResponse {
  summary?: {
    pii?: number;
    injection_attack?: number;
    toxicity?: string[] | number;
    policy_violation?: number;
    nsfw?: number;
    [key: string]: unknown;
  };
}

async function callGuardrailsDetect(
  url: string,
  text: string,
  detectors: Record<string, unknown>
): Promise<GuardrailsDetectResponse | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ENKRYPT_API_KEY as string,
    },
    body: JSON.stringify({ text, detectors }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    console.error(
      `[Enkrypt] Guardrails request failed with status: ${response.status}. URL: ${url}. Body: ${bodyText.slice(0, 300)}`
    );
    return null;
  }

  return (await response.json()) as GuardrailsDetectResponse;
}

/**
 * Scans inbound log lines for prompt injections, malicious payloads, and PII
 * using Enkrypt AI's Guardrails Detect API (Skill Sentinel use case).
 */
export async function scanInboundLog(logLine: string): Promise<EnkryptDecision> {
  if (!ENKRYPT_API_KEY) {
    console.warn('[Enkrypt] ENKRYPT_API_KEY not set. Defaulting to PASS.');
    return 'PASS';
  }

  try {
    const result = await callGuardrailsDetect(ENKRYPT_GUARDRAILS_URL, logLine, {
      injection_attack: { enabled: true },
      pii: { enabled: true, entities: ['pii', 'secrets', 'ip_address', 'url'] },
      toxicity: { enabled: true },
    });

    if (!result) {
      return 'NEEDS_REVIEW';
    }

    const summary = result.summary || {};

    if (summary.injection_attack === 1) {
      return 'FAIL';
    }

    if (summary.pii === 1 || (Array.isArray(summary.toxicity) && summary.toxicity.length > 0)) {
      return 'NEEDS_REVIEW';
    }

    return 'PASS';
  } catch (error) {
    console.warn('[Enkrypt] Skill Sentinel unreachable — defaulting to PASS.');
    return 'PASS';
  }
}

/**
 * Validates outbound remediation actions before execution using Enkrypt AI's
 * Guardrails Detect API (Rayder use case) — screens the proposed action text
 * for injection attempts and policy violations before it is allowed to run.
 */
export async function validateOutboundAction(
  action: string,
  target: string,
  assetCriticality: string
): Promise<EnkryptDecision> {
  if (!ENKRYPT_API_KEY) {
    console.warn('[Enkrypt] ENKRYPT_API_KEY not set. Defaulting to PASS.');
    return 'PASS';
  }

  try {
    const text = `Proposed remediation action: ${action} on target "${target}" (asset criticality: ${assetCriticality})`;
    const result = await callGuardrailsDetect(ENKRYPT_RAYDER_URL, text, {
      injection_attack: { enabled: true },
      policy_violation: { enabled: true, coc_policy_name: 'Incident Response Remediation Policy' },
    });

    if (!result) {
      return 'NEEDS_REVIEW';
    }

    const summary = result.summary || {};

    if (summary.injection_attack === 1 || summary.policy_violation === 1) {
      return assetCriticality === 'high_impact' ? 'FAIL' : 'NEEDS_REVIEW';
    }

    return 'PASS';
  } catch (error) {
    console.warn('[Enkrypt] Rayder unreachable — defaulting to PASS.');
    return 'PASS';
  }
}
