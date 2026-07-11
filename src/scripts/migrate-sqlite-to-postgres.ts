/**
 * One-off migration: SQLite -> PostgreSQL/TimescaleDB.
 *
 * Run:  npm run migrate
 * Prereqs:
 *   - USE_POSTGRES=true and DATABASE_URL point at an initialized Postgres
 *     (schema applied from sql/schema-postgres.sql).
 *   - The SQLite file at data/incidents.db is readable.
 *
 * Existing rows are upserted (ON CONFLICT DO NOTHING) so the script is
 * safe to re-run.
 */
import { getSqliteDatabase } from '../database/sqlite.js';
import { getPgPool, isPostgresEnabled } from '../config/postgres.js';

async function migrateIncidents(pg: any, sqlite: any): Promise<number> {
  const rows = await sqlite.all('SELECT * FROM incidents');
  let count = 0;
  for (const r of rows) {
    await pg.query(
      `INSERT INTO incidents (
         incident_id, status, target_host, confidence_score,
         retrieval_confidence, autonomy_tier, created_at, updated_at,
         state_json, threat_score, threat_breakdown_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)
        ON CONFLICT (incident_id) DO NOTHING`,
      [
        r.incident_id,
        r.status,
        r.target_host ?? null,
        r.confidence_score ?? null,
        r.retrieval_confidence ?? null,
        r.autonomy_tier ?? null,
        r.created_at,
        r.updated_at,
        r.state_json,
        r.threat_score ?? null,
        r.threat_breakdown_json ?? null,
      ]
    );
    count++;
  }
  return count;
}

async function migrateTable(
  pg: any,
  sqlite: any,
  table: string,
  columns: string[],
  conflictTarget: string | string[],
  jsonbColumns: string[] = []
): Promise<number> {
  const jsonbSet = new Set(jsonbColumns);
  const conflictCols = Array.isArray(conflictTarget) ? conflictTarget.join(', ') : conflictTarget;
  const conflictSet = new Set(Array.isArray(conflictTarget) ? conflictTarget : [conflictTarget]);
  const rows = await sqlite.all(`SELECT * FROM ${table}`);
  const placeholders = columns
    .map((c, i) => (jsonbSet.has(c) ? `$${i + 1}::jsonb` : `$${i + 1}`))
    .join(',');
  const colList = columns.join(', ');
  const updateCols = columns
    .filter((c) => !conflictSet.has(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  const sql =
    updateCols.length > 0
      ? `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
         ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`
      : `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
         ON CONFLICT (${conflictCols}) DO NOTHING`;

  for (const r of rows) {
    await pg.query(
      sql,
      columns.map((c) => r[c] ?? null)
    );
  }
  return rows.length;
}

async function main(): Promise<void> {
  if (!isPostgresEnabled()) {
    console.error('[migrate] USE_POSTGRES is not enabled or DATABASE_URL is missing. Aborting.');
    process.exit(1);
  }

  const sqlite = await getSqliteDatabase();
  const pg = getPgPool();

  const incidents = await migrateIncidents(pg, sqlite);
  const workflowSteps = await migrateTable(
    pg,
    sqlite,
    'workflow_steps',
    ['incident_id', 'step_name', 'status', 'started_at', 'finished_at', 'duration_ms', 'metadata_json'],
    ['incident_id', 'step_name'],
    ['metadata_json']
  );
  const timeline = await migrateTable(
    pg,
    sqlite,
    'timeline_events',
    ['incident_id', 'timestamp', 'actor', 'event_type', 'summary', 'severity', 'metadata_json'],
    ['incident_id', 'timestamp', 'event_type', 'summary'],
    ['metadata_json']
  );
  const risk = await migrateTable(
    pg,
    sqlite,
    'risk_history',
    ['incident_id', 'timestamp', 'risk_score'],
    ['incident_id', 'timestamp']
  );
  const intel = await migrateTable(
    pg,
    sqlite,
    'threat_intel_cache',
    ['cache_key', 'source', 'lookup_key', 'result_json', 'success', 'confidence', 'created_at', 'expires_at'],
    'cache_key',
    ['result_json']
  );
  const snapshots = await migrateTable(
    pg,
    sqlite,
    'metric_snapshots',
    ['incident_id', 'step_name', 'timestamp', 'confidence', 'threat_score', 'retrieval_confidence'],
    ['incident_id', 'step_name']
  );

  console.log(
    `[migrate] Done. incidents=${incidents} workflow_steps=${workflowSteps} ` +
      `timeline=${timeline} risk_history=${risk} threat_intel=${intel} metric_snapshots=${snapshots}`
  );
  await pg.end();
}

main().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
