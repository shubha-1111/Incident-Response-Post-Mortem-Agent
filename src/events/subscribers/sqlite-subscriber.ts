import { eventBus } from '../event-bus.js';
import { IncidentEventType } from '../event-types.js';
import { upsertWorkflowStep, initWorkflowSteps } from '../../database/database.js';

export function registerSqliteSubscriber() {
  eventBus.on(IncidentEventType.WORKFLOW_STEP, async (data: {
    incidentId: string;
    stepId: string;
    status: 'running' | 'completed' | 'failed' | 'waiting' | 'not_started';
    timestamp?: number;
    metadata?: any;
  }) => {
    try {
      const now = new Date().toISOString();
      const isStart = data.status === 'running';
      const isEnd = ['completed', 'failed'].includes(data.status);
      
      if (data.stepId === 'ingestion-gate-step' && data.status === 'running') {
        await initWorkflowSteps(data.incidentId);
      }
      
      await upsertWorkflowStep(
        data.incidentId,
        data.stepId,
        data.status,
        isStart ? now : null,
        isEnd ? now : null,
        null,
        data.metadata
      );
    } catch (err) {
      console.error('[sqlite-subscriber] Failed to record step:', err);
    }
  });
}

