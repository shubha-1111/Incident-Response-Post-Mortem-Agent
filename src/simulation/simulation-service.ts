import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';
import { incidentResponseWorkflow } from '../workflows/incident-workflow.js';
import { createInitialIncidentState } from '../schemas/incident-state.js';
import { saveIncidentState } from '../database/database.js';
import { SCENARIOS } from './scenarios.js';

let currentRunId = 0;

export interface SimulationRunOptions {
  scenario?: string;
  speed?: 'realtime' | 'fast';
}

export interface SimulationResult {
  incidentId: string;
  logsGenerated: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runSimulation(options: SimulationRunOptions = {}): Promise<SimulationResult> {
  const scenarioId = options.scenario || 'default';
  const speed = options.speed || 'realtime';
  const scenario = SCENARIOS[scenarioId] || SCENARIOS.default;
  const runId = ++currentRunId;

  const incidentId = `INC-2026-${scenarioId.toUpperCase().replace(/_/g, '-')}-${Math.floor(100 + Math.random() * 900)}`;
  const logs = scenario.generateLogs();
  const delayMs = speed === 'fast' ? 30 : 180;

  const state = createInitialIncidentState({ incidentId, rawLogLines: logs });
  state.status = 'ingesting';
  await saveIncidentState(state);

  eventBus.emit(IncidentEventType.LOG_RECEIVED, {
    incidentId,
    count: logs.length,
    scenario: scenario.name
  });

  for (let i = 0; i < logs.length; i++) {
    if (runId !== currentRunId) {
      return { incidentId, logsGenerated: i };
    }

    eventBus.emit(IncidentEventType.STREAM_LOG, {
      incidentId,
      timestamp: Date.now(),
      level: 'info',
      message: logs[i],
      stepId: 'ingestion-gate-step'
    });

    await sleep(delayMs);
  }

  if (runId !== currentRunId) {
    return { incidentId, logsGenerated: logs.length };
  }

  try {
    const run = await incidentResponseWorkflow.createRunAsync();
    run.start({
      inputData: { logs, incidentId },
    });
  } catch (err: any) {
    console.error(`[Simulation] Workflow trigger failed: ${err.message}`);
    await saveIncidentState({
      ...state,
      status: 'pending_human_review',
      autonomyTier: 'L2_HITL_APPROVAL',
      reasoningLog: [...state.reasoningLog, `Simulation workflow error: ${err.message}`]
    });
  }

  return { incidentId, logsGenerated: logs.length };
}

export function stopActiveSimulation(): void {
  currentRunId++;
}

export function getActiveSimulationCount(): number {
  return currentRunId > 0 ? 1 : 0;
}
