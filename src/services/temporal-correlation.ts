import { getIncidentState, getDatabase } from '../database/database.js';

const TIME_WINDOW_HOURS = 24;

export interface TemporalCorrelation {
  incidentId: string;
  similarityScore: number;
  correlationType: 'temporal';
  metadata: {
    timeDeltaHours: number;
    incidentTime: string;
  };
}

/**
 * Detects incidents created within a symmetric time window around the target
 * incident. Closer-in-time incidents score higher (1.0 at t=0, down to 0.0 at
 * the window edge).
 */
export async function findTemporalCorrelations(
  incidentId: string,
  timeWindowHours: number = TIME_WINDOW_HOURS
): Promise<TemporalCorrelation[]> {
  const incident = await getIncidentState(incidentId);
  if (!incident) return [];

  const incidentTime = new Date(incident.createdAt);
  const windowStart = new Date(incidentTime.getTime() - timeWindowHours * 60 * 60 * 1000);
  const windowEnd = new Date(incidentTime.getTime() + timeWindowHours * 60 * 60 * 1000);

  const db = await getDatabase();
  const rows = await db.all(
    `SELECT incident_id, created_at FROM incidents
     WHERE incident_id != ? AND created_at BETWEEN ? AND ?
     ORDER BY created_at DESC
     LIMIT 10`,
    [incidentId, windowStart.toISOString(), windowEnd.toISOString()]
  );

  return (rows as any[]).map((row) => {
    const timeDelta = Math.abs(new Date(row.created_at).getTime() - incidentTime.getTime());
    const similarityScore = Math.max(0, 1 - timeDelta / (timeWindowHours * 60 * 60 * 1000));

    return {
      incidentId: row.incident_id,
      similarityScore,
      correlationType: 'temporal' as const,
      metadata: {
        timeDeltaHours: timeDelta / (60 * 60 * 1000),
        incidentTime: row.created_at,
      },
    };
  });
}
