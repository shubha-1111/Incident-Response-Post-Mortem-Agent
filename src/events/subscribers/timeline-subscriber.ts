import { eventBus } from '../event-bus.js';
import { IncidentEventType } from '../event-types.js';
import { insertTimelineEvent } from '../../database/database.js';

export function registerTimelineSubscriber() {
  const listen = (eventType: IncidentEventType, mapper: (data: any) => { summary: string; actor: string; severity?: string }) => {
    eventBus.on(eventType, async (data: any) => {
      try {
        const mapped = mapper(data);
        await insertTimelineEvent(
          data.incidentId,
          mapped.actor,
          eventType,
          mapped.summary,
          mapped.severity || 'low',
          data.metadata
        );
      } catch (err) {
        console.error(`[timeline-subscriber] Failed to record timeline event for ${eventType}:`, err);
      }
    });
  };

  listen(IncidentEventType.LOG_RECEIVED, (d) => ({
    actor: 'ingest-agent',
    summary: `Raw syslog stream received and scrubbed of PII.`,
    severity: 'low',
  }));

  listen(IncidentEventType.LOG_PARSED, (d) => ({
    actor: 'log-agent',
    summary: `Signatures parsed. Target host is ${d.host || 'unknown'} running ${d.process || 'unknown'}.`,
    severity: 'low',
  }));

  listen(IncidentEventType.ANOMALY_FOUND, (d) => ({
    actor: 'anomaly-agent',
    summary: `Anomaly validation query completed. Threat intelligence indicators resolved.`,
    severity: d.isAnomaly ? 'medium' : 'low',
  }));

  listen(IncidentEventType.RCA_STARTED, (d) => ({
    actor: 'rca-agent',
    summary: `Forensics investigation React loop triggered.`,
    severity: 'low',
  }));

  listen(IncidentEventType.RCA_COMPLETED, (d) => ({
    actor: 'rca-agent',
    summary: `Forensics check completed. Determined root cause: ${d.rootCause}.`,
    severity: 'medium',
  }));

  listen(IncidentEventType.MITIGATION_STARTED, (d) => ({
    actor: 'remediation-agent',
    summary: `Remediation check initiated. Impact calculation started.`,
    severity: 'low',
  }));

  listen(IncidentEventType.MITIGATION_COMPLETED, (d) => ({
    actor: 'remediation-agent',
    summary: `Mitigation action formulated: [${d.action}] on host ${d.targetHost}.`,
    severity: 'medium',
  }));

  listen(IncidentEventType.HITL_REQUIRED, (d) => ({
    actor: 'system',
    summary: `High-impact policy match. Workflow override gate activated.`,
    severity: 'high',
  }));

  listen(IncidentEventType.HITL_APPROVED, (d) => ({
    actor: 'human:admin',
    summary: `Mitigation action authorized by Operator.`,
    severity: 'low',
  }));

  listen(IncidentEventType.POSTMORTEM_STARTED, (d) => ({
    actor: 'report-agent',
    summary: `Compiling markdown SRE post-mortem.`,
    severity: 'low',
  }));

  listen(IncidentEventType.POSTMORTEM_FINISHED, (d) => ({
    actor: 'report-agent',
    summary: `SRE Report committed to GitHub. Indexed into Qdrant memory.`,
    severity: 'low',
  }));
}
