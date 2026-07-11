import { getIncidentState, getDatabase } from '../database/database.js';

export interface AssetCorrelation {
  incidentId: string;
  similarityScore: number;
  correlationType: 'asset';
  metadata: {
    asset: string;
    lastIncident: string;
  };
}

/**
 * Correlates incidents that target the same host/asset as the target incident.
 * A fixed confidence score is assigned because the shared asset is the sole
 * correlation signal.
 */
export async function findAssetCorrelations(incidentId: string): Promise<AssetCorrelation[]> {
  const incident = await getIncidentState(incidentId);
  if (!incident || !incident.targetHost) return [];

  const db = await getDatabase();
  const rows = await db.all(
    `SELECT incident_id, target_host, created_at FROM incidents
     WHERE incident_id != ? AND target_host = ?
     ORDER BY created_at DESC
     LIMIT 10`,
    [incidentId, incident.targetHost]
  );

  return (rows as any[]).map((row) => ({
    incidentId: row.incident_id,
    similarityScore: 0.8, // Fixed score for same asset
    correlationType: 'asset' as const,
    metadata: {
      asset: row.target_host,
      lastIncident: row.created_at,
    },
  }));
}
