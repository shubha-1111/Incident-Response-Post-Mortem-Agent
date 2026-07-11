import { recordConfidenceScore, traceAgentStep } from '../config/otel.js';
import type { ForensicEvent } from '../agents/ingest-agent.js';
import type { EvidencePointer, IncidentState } from '../schemas/incident-state.js';
import { enrichEventWithThreatIntel } from '../tools/threat-intel-tools.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';


type AnomalyAgentResult = Pick<IncidentState, 'confidenceScore'> & {
  evidence: EvidencePointer[];
};

export async function runAnomalyAgent(
  events: ForensicEvent[],
  incidentId: string
): Promise<AnomalyAgentResult> {
  return traceAgentStep('anomaly-agent', 'statistical-deviation', async (span) => {
    span.setAttribute('incident.id', incidentId);
    span.setAttribute('anomaly_agent.events_received', events.length);

    const evidence: EvidencePointer[] = [];
    const representativeEvent = events[0];

    const failedAuthEvents = events.filter((event) =>
      /failed/i.test(event.raw_message)
    );

    if (failedAuthEvents.length > 5) {
      const event = failedAuthEvents[0];
      evidence.push({
        eventId: event.event_id,
        timestamp: new Date(event.timestamp).toISOString(),
        host: event.host,
        reason: 'AUTH_FAILURE_SPIKE',
        confidence: Math.min(0.95, 0.6 + failedAuthEvents.length / 100),
      });
    }

    if (events.length > 0) {
      const hostCounts = new Map<string, number>();

      for (const event of events) {
        hostCounts.set(event.host, (hostCounts.get(event.host) ?? 0) + 1);
      }

      const concentratedHost = [...hostCounts.entries()].find(
        ([, count]) => count > events.length * 0.4
      );

      if (concentratedHost) {
        const [host] = concentratedHost;
        const event = events.find((candidate) => candidate.host === host) ?? representativeEvent;
        evidence.push({
          eventId: event.event_id,
          timestamp: new Date(event.timestamp).toISOString(),
          host: event.host,
          reason: 'HOST_CONCENTRATION',
          confidence: 0.55,
        });
      }
    }

    const criticalEvents = events.filter((event) => event.severity === 'CRITICAL');

    if (criticalEvents.length > 0) {
      const criticalConfidence = Math.min(0.9, 0.7 * criticalEvents.length);

      for (const event of criticalEvents) {
        evidence.push({
          eventId: event.event_id,
          timestamp: new Date(event.timestamp).toISOString(),
          host: event.host,
          reason: 'CRITICAL_SEVERITY_PRESENT',
          confidence: criticalConfidence,
        });
      }
    }

    // Enrich evidence with Threat Intelligence before returning
    await Promise.all(
      evidence.map(async (item) => {
        const event = events.find((e) => e.event_id === item.eventId);
        const rawMessage = event?.raw_message || '';
        const ipMatch = rawMessage.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
        if (ipMatch) {
          const ip = ipMatch[0];
          try {
            eventBus.emit(IncidentEventType.STREAM_LOG, {
              incidentId,
              timestamp: Date.now(),
              level: 'info',
              message: `Threat Intel: Querying reputation for IP ${ip} related to ${item.reason}...`,
              stepId: 'anomaly-analysis-step'
            });

            const report = await enrichEventWithThreatIntel(ip, [item.reason]);

            item.payload = { threatIntelReport: report };

            if (report.isConfirmedMalicious) {
              item.confidence = Math.min(0.95, item.confidence + 0.2);
              eventBus.emit(IncidentEventType.STREAM_LOG, {
                incidentId,
                timestamp: Date.now(),
                level: 'critical',
                message: `Threat Intel: IP ${ip} is CONFIRMED MALICIOUS (Score: ${report.abuseIPDB.abuseConfidenceScore}%). Boosted confidence to ${(item.confidence * 100).toFixed(0)}%.`,
                stepId: 'anomaly-analysis-step'
              });
            } else {
              eventBus.emit(IncidentEventType.STREAM_LOG, {
                incidentId,
                timestamp: Date.now(),
                level: 'info',
                message: `Threat Intel: IP ${ip} checked. Reputation score is low (${report.abuseIPDB.abuseConfidenceScore}%).`,
                stepId: 'anomaly-analysis-step'
              });
            }
          } catch (err: any) {
            console.error(`[Anomaly Agent] Failed to enrich evidence item: ${err.message}`);
            eventBus.emit(IncidentEventType.STREAM_LOG, {
              incidentId,
              timestamp: Date.now(),
              level: 'warn',
              message: `Threat Intel: Failed to query reputation for IP ${ip}: ${err.message}`,
              stepId: 'anomaly-analysis-step'
            });
          }
        }
      })
    );

    const confidenceScore =
      evidence.length === 0
        ? 0.05
        : Math.max(...evidence.map((pointer) => pointer.confidence));

    span.setAttribute('anomaly_agent.anomalies_found', evidence.length);
    recordConfidenceScore(span, confidenceScore, 0);

    return {
      evidence,
      confidenceScore,
    };
  });
}
