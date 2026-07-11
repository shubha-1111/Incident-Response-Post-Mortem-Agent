import crypto from 'crypto';
import { CohereClient } from 'cohere-ai';
import { qdrantClient, COLLECTIONS } from '../config/qdrant.js';
import { scanInboundLog } from '../config/enkrypt.js';
import { traceAgentStep } from '../config/otel.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';


// Initialize Cohere client for generating standard 1024-dimension embeddings
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Define the absolute operational schema for structural data within our forensic layer
export interface ForensicEvent {
  event_id: string;
  incident_id: string;
  timestamp: number;
  expires_at: number;
  host: string;
  process: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  raw_message: string;
  sequence_no: number;
}

/**
 * Fallback parser to extract metadata components safely from amorphous log messages
 */
function parseLogToMetadata(rawLine: string): { host: string; process: string; severity: ForensicEvent['severity']; message: string } {
  try {
    // Basic CSV or structural splitting fallback logic
    const parts = rawLine.split(',');
    if (parts.length >= 4) {
      return {
        host: parts[0].trim(),
        process: parts[1].trim(),
        severity: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(parts[2].trim()) ? parts[2].trim() : 'MEDIUM') as ForensicEvent['severity'],
        message: parts.slice(3).join(',').trim(),
      };
    }
  } catch {
    // Fall through to default if processing structure drops out
  }

  return {
    host: 'unknown-host',
    process: 'syslog-fallback',
    severity: 'MEDIUM',
    message: rawLine,
  };
}

/**
 * Core Ingestion Agent Process
 * Handles validation, streaming safety filtration, vectorized payload assembly, and atomic writes.
 */
export async function ingestLogs(
  logs: string[],
  incidentId: string
): Promise<{ written: string[]; quarantined: number }> {
  // Wrap the operational lifespan in an isolated telemetry window
  return traceAgentStep('ingest-agent', 'process-batch', async (span) => {
    const writtenIds: string[] = [];
    let quarantinedCount = 0;
    let explicitSequenceNumber = 0;

    span.setAttribute('batch.total_lines_received', logs.length);

    for (const rawLine of logs) {
      if (!rawLine || rawLine.trim() === '') {
        continue;
      }

      eventBus.emit(IncidentEventType.STREAM_LOG, {
        incidentId,
        timestamp: Date.now(),
        level: 'info',
        message: `Ingest: Ingesting raw line: "${rawLine.length > 50 ? rawLine.substring(0, 50) + '...' : rawLine}"`,
        stepId: 'ingestion-gate-step'
      });

      // Step 1: Inline Safety Scan and Data Scrub via Enkrypt AI Skill Sentinel
      const safetyVerdict = await scanInboundLog(rawLine);

      if (safetyVerdict === 'FAIL' || safetyVerdict === 'NEEDS_REVIEW') {
        console.warn(`[Ingest Agent] Security Alert: Line quarantined by Skill Sentinel. Verdict: ${safetyVerdict}`);
        eventBus.emit(IncidentEventType.STREAM_LOG, {
          incidentId,
          timestamp: Date.now(),
          level: 'critical',
          message: `Ingest Alert: Line quarantined by Enkrypt AI Skill Sentinel due to PII/malicious content. Verdict: ${safetyVerdict}`,
          stepId: 'ingestion-gate-step'
        });
        quarantinedCount++;
        continue; // Quarantine line safely, move cleanly to next sequence item
      }

      // Step 2: Extract attributes and map properties into a structural shape
      explicitSequenceNumber++;
      const parsedMeta = parseLogToMetadata(rawLine);
      const currentTimeMs = Date.now();
      const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;

      const eventPayload: ForensicEvent = {
        event_id: crypto.randomUUID(),
        incident_id: incidentId,
        timestamp: currentTimeMs,
        expires_at: currentTimeMs + ninetyDaysInMs, // Hard compliance cutoff
        host: parsedMeta.host,
        process: parsedMeta.process,
        severity: parsedMeta.severity,
        raw_message: parsedMeta.message,
        sequence_no: explicitSequenceNumber,
      };

      try {
        // Step 3: Compute embedding payload vector using Cohere
        const response = await cohere.embed({
          texts: [eventPayload.raw_message],
          model: 'embed-english-v3.0',
          inputType: 'search_document',
        });

        const embedding = (response.embeddings as any)[0] as number[];

        // Step 4: Write to forensic_events Qdrant collection with associated payload indexes
        await qdrantClient.upsert(COLLECTIONS.FORENSIC_EVENTS, {
          wait: true,
          points: [
            {
              id: eventPayload.event_id,
              vector: embedding,
              payload: {
                ...eventPayload, // Cast our complete forensic record structure directly into payload store
              },
            },
          ],
        });

        eventBus.emit(IncidentEventType.STREAM_LOG, {
          incidentId,
          timestamp: Date.now(),
          level: 'info',
          message: `Ingest: Saved sequence #${eventPayload.sequence_no} to Vector DB (ID: ${eventPayload.event_id.substring(0, 8)}).`,
          stepId: 'ingestion-gate-step'
        });

        writtenIds.push(eventPayload.event_id);
      } catch (innerError: any) {
        console.error(`[Ingest Agent] Technical breakdown inserting point ID ${eventPayload.event_id}:`, innerError);
        eventBus.emit(IncidentEventType.STREAM_LOG, {
          incidentId,
          timestamp: Date.now(),
          level: 'warn',
          message: `Ingest Warning: Technical breakdown inserting sequence #${explicitSequenceNumber}: ${innerError.message}`,
          stepId: 'ingestion-gate-step'
        });
        quarantinedCount++; // Treat vector calculation or DB insertion breakdown as a local data drop boundary
      }
    }

    // Append batch metric values directly to telemetry engine metrics
    span.setAttribute('batch.written_records', writtenIds.length);
    span.setAttribute('batch.quarantined_records', quarantinedCount);

    return {
      written: writtenIds,
      quarantined: quarantinedCount,
    };
  });
}

export async function deleteExpiredForensicEvents(): Promise<number> {
  const nowMs = Date.now();
  const response = await qdrantClient.delete(COLLECTIONS.FORENSIC_EVENTS, {
    wait: true,
    filter: {
      must: [
        {
          key: 'expires_at',
          range: {
            lt: nowMs,
          },
        },
      ],
    },
  });
  
  console.log(`[Ingest Agent] TTL cleanup: deleted expired forensic events before ${new Date(nowMs).toISOString()}`);
  return response.operation_id ?? 0;
}
