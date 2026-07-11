import { Mastra } from '@mastra/core';
import { rcaAgent } from '../agents/rca-agent.js';
import { remediationAgent } from '../agents/remediation-agent.js';
import { incidentResponseWorkflow } from '../workflows/incident-workflow.js';

import { recordBootstrapError } from '../config/otel.js';

export let mastra: Mastra | null = null;

try {
  mastra = new Mastra({
    agents: {
      rcaAgent,
      remediationAgent,
    },
    workflows: {
      incidentResponseWorkflow,
    },
  });
} catch (error: any) {
  console.error('[Mastra Bootstrap] Failed to initialize Mastra instance:', error);
  try {
    recordBootstrapError(error);
  } catch (otelErr) {
    console.error('[Telemetry] Failed to record Mastra bootstrap error on OTel:', otelErr);
  }
}
