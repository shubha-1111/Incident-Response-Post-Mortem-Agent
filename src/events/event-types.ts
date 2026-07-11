export enum IncidentEventType {
  LOG_RECEIVED       = 'LOG_RECEIVED',
  LOG_PARSED         = 'LOG_PARSED',
  ANOMALY_FOUND      = 'ANOMALY_FOUND',
  RCA_STARTED        = 'RCA_STARTED',
  RCA_COMPLETED      = 'RCA_COMPLETED',
  MITIGATION_STARTED = 'MITIGATION_STARTED',
  MITIGATION_COMPLETED = 'MITIGATION_COMPLETED',
  HITL_REQUIRED      = 'HITL_REQUIRED',
  HITL_APPROVED      = 'HITL_APPROVED',
  POSTMORTEM_STARTED = 'POSTMORTEM_STARTED',
  POSTMORTEM_FINISHED = 'POSTMORTEM_FINISHED',
  WORKFLOW_STEP      = 'WORKFLOW_STEP',
  STREAM_LOG         = 'STREAM_LOG',
  THREAT_SCORE       = 'THREAT_SCORE',
  SYSTEM_HEALTH      = 'SYSTEM_HEALTH',
}

export interface WorkflowStepPayload {
  incidentId: string;
  stepId: string;
  status: 'running' | 'completed' | 'failed' | 'waiting' | 'not_started';
  state: any;
  timestamp: number;
}
