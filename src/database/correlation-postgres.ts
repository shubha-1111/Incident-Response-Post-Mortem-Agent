import { getDatabase, DbConn } from './postgres-db.js';

/**
 * PostgreSQL / TimescaleDB backend for incident correlation persistence.
 *
 * Mirrors correlation-sqlite.ts function-for-function. JSON columns are stored
 * as `jsonb` and cast back to `::text` on read so the returned values are
 * strings (consistent with the SQLite backend) for safe JSON parsing.
 * Selected only when USE_POSTGRES=true (see correlation-db.ts dispatcher).
 */

let schemaReady: Promise<void> | null = null;

async function ensureSchema(db: DbConn): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS incident_correlations (
        id SERIAL PRIMARY KEY,
        incident_id TEXT NOT NULL,
        related_incident_id TEXT NOT NULL,
        correlation_type TEXT NOT NULL,
        score DOUBLE PRECISION NOT NULL,
        metadata_json JSONB,
        created_at TEXT NOT NULL,
        UNIQUE(incident_id, related_incident_id, correlation_type)
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS correlation_cache (
        incident_id TEXT PRIMARY KEY,
        results_json JSONB NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_corr_incident ON incident_correlations(incident_id, correlation_type);
      CREATE INDEX IF NOT EXISTS idx_corr_cache ON correlation_cache(incident_id, expires_at);
    `);
  })();

  return schemaReady;
}

export async function saveCorrelation(
  incidentId: string,
  relatedIncidentId: string,
  score: number,
  correlationType: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  const db = await getDatabase();
  await ensureSchema(db);
  const now = new Date().toISOString();
  const metadataJson = JSON.stringify(metadata ?? {});

  await db.run(
    `INSERT INTO incident_correlations (incident_id, related_incident_id, correlation_type, score, metadata_json, created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)
     ON CONFLICT(incident_id, related_incident_id, correlation_type) DO UPDATE SET
       score = EXCLUDED.score,
       metadata_json = EXCLUDED.metadata_json,
       created_at = EXCLUDED.created_at`,
    [incidentId, relatedIncidentId, correlationType, score, metadataJson, now]
  );
}

export async function cacheSimilarIncidents(
  incidentId: string,
  results: unknown,
  ttlHours = 24
): Promise<void> {
  const db = await getDatabase();
  await ensureSchema(db);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + ttlHours * 60 * 60 * 1000).toISOString();
  const resultsJson = JSON.stringify(results ?? []);

  await db.run(
    `INSERT INTO correlation_cache (incident_id, results_json, created_at, expires_at)
     VALUES ($1,$2::jsonb,$3,$4)
     ON CONFLICT(incident_id) DO UPDATE SET
       results_json = EXCLUDED.results_json,
       created_at = EXCLUDED.created_at,
       expires_at = EXCLUDED.expires_at`,
    [incidentId, resultsJson, now, expiresAt]
  );
}

export async function getCachedSimilarIncidents(incidentId: string): Promise<any[] | null> {
  const db = await getDatabase();
  await ensureSchema(db);
  const row = await db.get(
    `SELECT results_json::text AS results_json FROM correlation_cache WHERE incident_id = $1 AND expires_at > $2`,
    [incidentId, new Date().toISOString()]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.results_json);
  } catch {
    return null;
  }
}

export async function getSimilarIncidents(
  incidentId: string,
  limit = 5,
  minScore = 0.5
): Promise<Array<{ incidentId: string; score: number; correlationType: string; metadata: any }>> {
  const db = await getDatabase();
  await ensureSchema(db);
  const rows = await db.all(
    `SELECT related_incident_id, score, correlation_type, metadata_json::text AS metadata_json
     FROM incident_correlations
     WHERE incident_id = $1 AND correlation_type = 'vector' AND score >= $2
     ORDER BY score DESC
     LIMIT $3`,
    [incidentId, minScore, limit]
  );
  return rows.map((r: any) => ({
    incidentId: r.related_incident_id,
    score: r.score,
    correlationType: r.correlation_type,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
  }));
}
