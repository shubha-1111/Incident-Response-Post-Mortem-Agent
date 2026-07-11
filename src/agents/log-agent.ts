import { recordConfidenceScore, traceAgentStep } from '../config/otel.js';
import type { ForensicEvent } from '../agents/ingest-agent.js';
import type { EvidencePointer, IncidentState } from '../schemas/incident-state.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';


const KNOWN_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  severityBoost: number;
}> = [
  {
    pattern: /failed (login|auth|password)/i,
    label: 'AUTH_FAILURE',
    severityBoost: 0.3,
  },
  {
    pattern: /port scan|nmap|masscan/i,
    label: 'PORT_SCAN',
    severityBoost: 0.4,
  },
  {
    pattern: /(\bUNION\b|\bSELECT\b.*\bFROM\b|DROP TABLE)/i,
    label: 'SQL_INJECTION',
    severityBoost: 0.5,
  },
  {
    pattern: /sudo|privilege escalat|root access/i,
    label: 'PRIV_ESCALATION',
    severityBoost: 0.45,
  },
  {
    pattern: /curl|wget|base64.*decode|\/dev\/tcp/i,
    label: 'DATA_EXFIL',
    severityBoost: 0.5,
  },
];

type LogAgentResult = Pick<IncidentState, 'confidenceScore'> & {
  evidence: EvidencePointer[];
};

export async function runLogAgent(
  events: ForensicEvent[],
  incidentId: string
): Promise<LogAgentResult> {
  return traceAgentStep('log-agent', 'pattern-match', async (span) => {
    span.setAttribute('incident.id', incidentId);
    span.setAttribute('log_agent.events_received', events.length);

    const evidence: EvidencePointer[] = [];

    for (const event of events) {
      for (const pattern of KNOWN_PATTERNS) {
        if (!pattern.pattern.test(event.raw_message)) {
          continue;
        }

        eventBus.emit(IncidentEventType.STREAM_LOG, {
          incidentId,
          timestamp: Date.now(),
          level: 'warn',
          message: `Log Agent: Matched signature ${pattern.label} in event ${event.event_id.substring(0, 8)} on host ${event.host}.`,
          stepId: 'log-analysis-step'
        });

        evidence.push({
          eventId: event.event_id,
          timestamp: new Date(event.timestamp).toISOString(),
          host: event.host,
          reason: pattern.label,
          confidence: Math.min(1, 0.5 + pattern.severityBoost),
        });
      }
    }

    const confidenceScore =
      evidence.length === 0
        ? 0.1
        : evidence.reduce((sum, pointer) => sum + pointer.confidence, 0) /
          evidence.length;

    span.setAttribute('log_agent.matches_found', evidence.length);
    recordConfidenceScore(span, confidenceScore, 0);

    return {
      evidence,
      confidenceScore,
    };
  });
}
