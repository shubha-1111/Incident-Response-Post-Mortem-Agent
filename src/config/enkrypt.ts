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
      console.error(`[Enkrypt] Skill Sentinel request failed with status: ${response.status}`);
      return 'NEEDS_REVIEW';
    }

    const result = (await response.json()) as { decision?: EnkryptDecision };
    
    if (result.decision === 'PASS' || result.decision === 'FAIL' || result.decision === 'NEEDS_REVIEW') {
      return result.decision;
    }

    return 'PASS';
  } catch (error) {
    console.error('[Enkrypt] Error during Skill Sentinel scan:', error);
    // Fail-safe to human oversight on system/network errors
    return 'NEEDS_REVIEW';
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
      console.error(`[Enkrypt] Rayder validation failed with status: ${response.status}`);
      return 'NEEDS_REVIEW';
    }

    const result = (await response.json()) as { decision?: EnkryptDecision };
    if (result.decision === 'PASS' || result.decision === 'FAIL' || result.decision === 'NEEDS_REVIEW') {
      return result.decision;
    }

    return 'PASS';
  } catch (error) {
    console.error('[Enkrypt] Error during Rayder outbound action validation:', error);
    // Fail-safe to human oversight on system/network errors
    return 'NEEDS_REVIEW';
  }
}

