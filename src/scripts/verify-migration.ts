/**
 * Phase 0 verification: data integrity + query performance against live Postgres.
 * Run with USE_POSTGRES=true so the dispatcher targets Postgres.
 */
import { getSqliteDatabase } from '../database/sqlite.js';
import {
  getAllIncidents,
  getIncidentState,
  getDashboardStats,
  getDashboardCharts,
  getTimelineEvents,
  getWorkflowSteps,
} from '../database/database.js';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('  ok  :', msg);
  }
}

/** Canonical JSON with object keys sorted recursively (order-independent). */
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

async function countRows(db: any, table: string): Promise<number> {
  const row = await db.get(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(row?.c ?? 0);
}

async function main() {
  const sqlite = await getSqliteDatabase();
  const tables = [
    'incidents',
    'workflow_steps',
    'timeline_events',
    'risk_history',
    'threat_intel_cache',
    'metric_snapshots',
  ];

  console.log('\n[1] Row-count integrity (SQLite -> Postgres)');
  const { getPgPool } = await import('../config/postgres.js');
  for (const t of tables) {
    const s = await countRows(sqlite, t);
    const pgRow = await getPgPool().query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    const pc = pgRow.rows[0]?.c ?? 0;
    assert(s === pc, `${t}: sqlite=${s} pg=${pc}`);
  }

  console.log('\n[2] JSON column integrity (deep-compare parsed JSON)');
  const ids = (await sqlite.all('SELECT incident_id FROM incidents')).map((r: any) => r.incident_id);
  let mismatches = 0;
  for (const id of ids) {
    const sRow = await sqlite.get('SELECT state_json FROM incidents WHERE incident_id = ?', [id]);
    const pgRow = await getPgPool().query('SELECT state_json::text AS s FROM incidents WHERE incident_id = $1', [id]);
    // JSONB re-serializes (sorted keys / no whitespace), so compare parsed
    // objects semantically rather than as strings.
    const a = JSON.parse(sRow.state_json);
    const b = JSON.parse(pgRow.rows[0].s);
    if (canonical(a) !== canonical(b)) mismatches++;
  }
  assert(mismatches === 0, `state_json semantically equal for all ${ids.length} incidents (mismatches=${mismatches})`);

  console.log('\n[3] Live query correctness via dispatcher (USE_POSTGRES=true)');
  const all = await getAllIncidents();
  assert(all.length === ids.length, `getAllIncidents returns ${all.length} (expected ${ids.length})`);
  const sample = await getIncidentState(ids[0]);
  assert(!!sample && sample.incidentId === ids[0], `getIncidentState(${ids[0]}) round-trips`);
  const steps = await getWorkflowSteps(ids[0]);
  assert(Array.isArray(steps) && steps.length > 0, `getWorkflowSteps(${ids[0]}) -> ${steps.length} steps`);
  const timeline = await getTimelineEvents(ids[0]);
  assert(Array.isArray(timeline), `getTimelineEvents(${ids[0]}) -> ${timeline.length} events`);

  console.log('\n[4] Query performance (Postgres)');
  const t0 = performance.now();
  const stats = await getDashboardStats();
  const tStats = performance.now() - t0;
  const t1 = performance.now();
  const charts = await getDashboardCharts();
  const tCharts = performance.now() - t1;
  assert(tStats < 1000, `getDashboardStats in ${tStats.toFixed(1)}ms`);
  assert(tCharts < 1000, `getDashboardCharts in ${tCharts.toFixed(1)}ms`);
  console.log('  stats:', JSON.stringify(stats));
  console.log('  charts.autonomySplit:', JSON.stringify(charts.autonomySplit),
    'incidentsByStatus keys:', Object.keys(charts.incidentsByStatus).length);

  console.log('\nVerification complete. exitCode =', process.exitCode ?? 0);
  const { closeDatabase } = await import('../database/database.js');
  await closeDatabase();
}

main().catch((e) => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
