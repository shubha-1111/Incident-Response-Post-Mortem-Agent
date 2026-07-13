import { EnkryptDecision } from '../schemas/incident-state.js';

export type EnkryptVerdict = EnkryptDecision;

const ENKRYPT_SKILL_SENTINEL_URL = process.env.ENKRYPT_SKILL_SENTINEL_URL;
const ENKRYPT_RAYDER_URL = process.env.ENKRYPT_RAYDER_URL;

/**
 * Scans inbound log lines for prompt injections, malicious payloads, and safety violations
 * using Enkrypt AI Skill Sentinel.
 */
export async function scanInboundLog(logLine: string): Promise<EnkryptDecision> {
  if (!ENKRYPT_SKILL_SENTINEL_URL || ENKRYPT_SKILL_SENTINEL_URL.includes('YOUR_ENDPOINT_FROM_ENKRYPT_DASHBOARD')) {
    console.warn('[Enkrypt] Skill Sentinel endpoint not configured. Defaulting to PASS.');
    return 'PASS';
  }

  try {
    const response = await fetch(ENKRYPT_SKILL_SENTINEL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ log: logLine }),
    });

    if (!response.ok) {
      console.warn(`[Enkrypt] Skill Sentinel returned ${response.status} — endpoint unavailable, defaulting to PASS.`);
      return 'PASS';
    }

    const result = (await response.json()) as { decision?: EnkryptDecision };
    
    if (result.decision === 'PASS' || result.decision === 'FAIL' || result.decision === 'NEEDS_REVIEW') {
      return result.decision;
    }

    return 'PASS';
  } catch (error) {
    console.warn('[Enkrypt] Skill Sentinel unreachable — defaulting to PASS.');
    return 'PASS';
  }
}

/**
 * Validates outbound remediation actions before execution using Enkrypt AI Rayder.
 */
export async function validateOutboundAction(
  action: string,
  target: string,
  assetCriticality: string
): Promise<EnkryptDecision> {
  if (!ENKRYPT_RAYDER_URL || ENKRYPT_RAYDER_URL.includes('YOUR_ENDPOINT_FROM_ENKRYPT_DASHBOARD')) {
    console.warn('[Enkrypt] Rayder endpoint not configured. Defaulting to PASS.');
    return 'PASS';
  }

  try {
    const response = await fetch(ENKRYPT_RAYDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, target, assetCriticality }),
    });

    if (!response.ok) {
      console.warn(`[Enkrypt] Rayder returned ${response.status} — endpoint unavailable, defaulting to PASS.`);
      return 'PASS';
    }

    const result = (await response.json()) as { decision?: EnkryptDecision };
    if (result.decision === 'PASS' || result.decision === 'FAIL' || result.decision === 'NEEDS_REVIEW') {
      return result.decision;
    }

    return 'PASS';
  } catch (error) {
    console.warn('[Enkrypt] Rayder unreachable — defaulting to PASS.');
    return 'PASS';
  }
}

