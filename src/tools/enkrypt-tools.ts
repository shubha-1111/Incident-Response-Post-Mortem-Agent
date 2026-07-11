import { createTool } from '@mastra/core';
import { z } from 'zod';
import {
  scanInboundLog,
  validateOutboundAction,
  EnkryptVerdict,
} from '../config/enkrypt.js';
import { recordFailClosed } from '../config/otel.js';

// ----------------------------------------------------
// Tool 1: Inbound Sentinel Scanner
// ----------------------------------------------------
export const enkryptInboundScanTool = createTool({
  id: 'enkrypt-inbound-scan',
  description: 'Scan log content for PII and prompt injection using Enkrypt Skill Sentinel',
  inputSchema: z.object({ logLine: z.string() }),
  outputSchema: z.object({ 
    verdict: z.enum(['PASS','FAIL','NEEDS_REVIEW']),
    safe: z.boolean()
  }),
  execute: async ({ context }) => {
    try {
      const verdict = await scanInboundLog(context.logLine);
      return { verdict, safe: verdict === 'PASS' };
    } catch (error: any) {
      console.error(`[Enkrypt Tool] Inbound scan crash. Defaulting to restrictive FAIL. Error: ${error.message}`);
      return { verdict: 'FAIL' as const, safe: false };
    }
  }
});

// ----------------------------------------------------
// Tool 2: Outbound Rayder Action Validator
// ----------------------------------------------------
export const enkryptOutboundValidateTool = createTool({
  id: 'enkrypt-outbound-validate',
  description: 'Validate remediation action against Enkrypt Rayder safety policy',
  inputSchema: z.object({
    action: z.string(),
    target: z.string(),
    assetCriticality: z.enum(['standard','high_impact'])
  }),
  outputSchema: z.object({
    verdict: z.enum(['PASS','FAIL','NEEDS_REVIEW']),
    approved: z.boolean()
  }),
  execute: async ({ context }) => {
    try {
      const verdict = await validateOutboundAction(
        context.action,
        context.target,
        context.assetCriticality
      );
      return { verdict, approved: verdict === 'PASS' };
    } catch (error: any) {
      console.error(`[Enkrypt Tool] Outbound validation crash. Defaulting to FAIL. Error: ${error.message}`);
      return { verdict: 'FAIL' as const, approved: false };
    }
  }
});

// ----------------------------------------------------
// Function 3: runEnkryptGate
// ----------------------------------------------------
export async function runEnkryptGate(
  action: string,
  target: string,
  assetCriticality: 'standard' | 'high_impact',
  incidentId: string
): Promise<EnkryptVerdict> {
  try {
    const verdict = await validateOutboundAction(action, target, assetCriticality);

    if (verdict === 'NEEDS_REVIEW') {
      console.warn(`[Enkrypt Gate] Security Alert: Action needs review for incident ${incidentId}. Action: ${action} on ${target}`);
      return 'NEEDS_REVIEW';
    }

    if (verdict === 'FAIL') {
      console.error(`[Enkrypt Gate] Security Intercept: Blocked action for incident ${incidentId}. Action: ${action} on ${target}`);
      return 'FAIL';
    }

    return 'PASS';
  } catch (error: any) {
    console.error(`[Enkrypt Gate] Fail-closed: Error in validation gate for incident ${incidentId}. Defaulting to FAIL. Error: ${error.message}`);
    return 'FAIL';
  }
}
