import { Database } from 'sqlite';
import { getDatabase } from './sqlite.js';

/**
 * SQLite backend for incident correlation persistence.
 *
 * Reuses the shared SQLite connection from `sqlite.ts` (same `incidents.db`
 * file) and lazily creates the correlation tables on first use. The function
 * signatures mirror the Postgres backend (correlation-postgres.ts) so the
 * dispatcher in `correlation-db.ts` can swap between them.
 */

let schemaReady: Promise<void> | null = null;

async function ensureSchema(db: Database): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS incident_correlations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id TEXT NOT NULL,
        related_incident_id TEXT NOT NULL,
        correlation_type TEXT NOT NULL,
        score REAL NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(incident_id, related_incident_id, correlation_type)
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS correlation_cache (
        incident_id TEXT PRIMARY KEY,
        results_json TEXT NOT NULL,
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
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(incident_id, related_incident_id, correlation_type) DO UPDATE SET
       score = excluded.score,
       metadata_json = excluded.metadata_json,
       created_at = excluded.created_at`,
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
     VALUES (?, ?, ?, ?)
     ON CONFLICT(incident_id) DO UPDATE SET
       results_json = excluded.results_json,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at`,
    [incidentId, resultsJson, now, expiresAt]
  );
}

export async function getCachedSimilarIncidents(incidentId: string): Promise<any[] | null> {
  const db = await getDatabase();
  await ensureSchema(db);
  const row = await db.get(
    `SELECT results_json FROM correlation_cache WHERE incident_id = ? AND expires_at > ?`,
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
    `SELECT related_incident_id, score, correlation_type, metadata_json
     FROM incident_correlations
     WHERE incident_id = ? AND correlation_type = 'vector' AND score >= ?
     ORDER BY score DESC
     LIMIT ?`,
    [incidentId, minScore, limit]
  );
  return rows.map((r: any) => ({
    incidentId: r.related_incident_id,
    score: r.score,
    correlationType: r.correlation_type,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
  }));
}
