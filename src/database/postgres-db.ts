import { getPgPool, isPostgresEnabled, closePgPool } from '../config/postgres.js';
import { IncidentState } from '../schemas/incident-state.js';

/**
 * PostgreSQL / TimescaleDB implementation of the incident data layer.
 *
 * This mirrors the SQLite backend (sqlite.ts) function-for-function but uses
 * pg Pool SQL semantics:
 *   - `$n` positional placeholders
 *   - `::jsonb` casts on INSERT/UPDATE for JSON columns, `::text` on SELECT
 *   - `EXTRACT(EPOCH FROM (b - a)) * 1000` instead of SQLite `julianday`
 *   - `::int` / `::float` casts so aggregate types match the SQLite values
 *
 * Selected only when USE_POSTGRES=true (see database.ts dispatcher).
 */

export interface DbConn {
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ changes?: number }>;
  exec(sql: string): Promise<void>;
}

/** Converts SQLite-style `?` placeholders to pg `$n` for the shared wrapper. */
function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Returns a normalized connection object exposing `.get/.all/.run/.exec`,
 * so callers (e.g. health-monitor) work identically against Postgres.
 */
export async function getDatabase(): Promise<DbConn> {
  const pool = getPgPool();
  return {
    async get(sql: string, params: any[] = []) {
      const res = await pool.query(convertPlaceholders(sql), params);
      return res.rows[0] ?? null;
    },
    async all(sql: string, params: any[] = []) {
      const res = await pool.query(convertPlaceholders(sql), params);
      return res.rows;
    },
    async run(sql: string, params: any[] = []) {
      const res = await pool.query(convertPlaceholders(sql), params);
      return { changes: res.rowCount ?? undefined };
    },
    async exec(sql: string) {
      await pool.query(convertPlaceholders(sql));
    },
  };
}

export async function closeDatabase(): Promise<void> {
  await closePgPool();
}

export async function saveIncidentState(state: IncidentState): Promise<void> {
  const db = await getDatabase();
  const stateJson = JSON.stringify(state);

  await db.run(
    `INSERT INTO incidents (
      incident_id, status, target_host, confidence_score,
      retrieval_confidence, autonomy_tier, created_at, updated_at, state_json,
      threat_score, threat_breakdown_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)
    ON CONFLICT (incident_id) DO UPDATE SET
      status = EXCLUDED.status,
      target_host = EXCLUDED.target_host,
      confidence_score = EXCLUDED.confidence_score,
      retrieval_confidence = EXCLUDED.retrieval_confidence,
      autonomy_tier = EXCLUDED.autonomy_tier,
      updated_at = EXCLUDED.updated_at,
      state_json = EXCLUDED.state_json,
      threat_score = EXCLUDED.threat_score,
      threat_breakdown_json = EXCLUDED.threat_breakdown_json`,
    [
      state.incidentId,
      state.status,
      state.targetHost || null,
      state.confidenceScore,
      state.retrievalConfidence,
      state.autonomyTier || 'L2_HITL_APPROVAL',
      state.createdAt,
      state.updatedAt,
      stateJson,
      state.threatScore ?? null,
      state.threatBreakdown ? JSON.stringify(state.threatBreakdown) : null,
    ]
  );
}

export async function getIncidentState(incidentId: string): Promise<IncidentState | null> {
  const db = await getDatabase();
  const row = await db.get(
    'SELECT state_json::text AS state_json FROM incidents WHERE incident_id = $1',
    [incidentId]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.state_json) as IncidentState;
  } catch (err) {
    console.error(`[Database] Failed to parse state JSON for incident ${incidentId}:`, err);
    return null;
  }
}

export async function getAllIncidents(): Promise<any[]> {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT incident_id, status, autonomy_tier, confidence_score, target_host, created_at, threat_score,
            threat_breakdown_json::text AS threat_breakdown_json
     FROM incidents
     ORDER BY created_at DESC`
  );
  return rows.map((row: any) => ({
    incidentId: row.incident_id,
    status: row.status,
    autonomyTier: row.autonomy_tier || 'L2_HITL_APPROVAL',
    confidenceScore: row.confidence_score,
    createdAt: row.created_at,
    targetHost: row.target_host || 'unknown-host',
    threatScore: row.threat_score ?? 0,
    threatBreakdown: row.threat_breakdown_json ? JSON.parse(row.threat_breakdown_json) : null,
  }));
}

export async function upsertWorkflowStep(
  incidentId: string,
  stepName: string,
  status: string,
  startedAt?: string | null,
  finishedAt?: string | null,
  durationMs?: number | null,
  metadata?: any
): Promise<void> {
  const db = await getDatabase();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  await db.run(
    `INSERT INTO workflow_steps (
      incident_id, step_name, status, started_at, finished_at, duration_ms, metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT (incident_id, step_name) DO UPDATE SET
      status = EXCLUDED.status,
      started_at = COALESCE(EXCLUDED.started_at, workflow_steps.started_at),
      finished_at = COALESCE(EXCLUDED.finished_at, workflow_steps.finished_at),
      duration_ms = COALESCE(EXCLUDED.duration_ms, workflow_steps.duration_ms),
      metadata_json = COALESCE(EXCLUDED.metadata_json, workflow_steps.metadata_json)`,
    [incidentId, stepName, status, startedAt || null, finishedAt || null, durationMs || null, metadataJson]
  );
}

export async function getWorkflowSteps(incidentId: string): Promise<any[]> {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT step_name AS "stepName", status, started_at AS "startedAt", finished_at AS "finishedAt",
            duration_ms AS "durationMs", metadata_json::text AS "metadataJson"
     FROM workflow_steps
     WHERE incident_id = $1`,
    [incidentId]
  );
  return rows.map((r: any) => ({
    ...r,
    metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
  }));
}

export async function initWorkflowSteps(incidentId: string): Promise<void> {
  const steps = [
    'ingestion-gate-step',
    'log-analysis-step',
    'anomaly-analysis-step',
    'rca-step',
    'remediation-step',
    'autonomy-routing-step',
    'report-step',
    'observability-step',
  ];
  for (const step of steps) {
    await upsertWorkflowStep(incidentId, step, 'NOT_STARTED');
  }
}

export async function insertTimelineEvent(
  incidentId: string,
  actor: string,
  eventType: string,
  summary: string,
  severity?: string | null,
  metadata?: any
): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  await db.run(
    `INSERT INTO timeline_events (
      incident_id, timestamp, actor, event_type, summary, severity, metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [incidentId, timestamp, actor, eventType, summary, severity || null, metadataJson]
  );
}

export async function getTimelineEvents(incidentId: string): Promise<any[]> {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT timestamp, actor, event_type AS "eventType", summary, severity,
            metadata_json::text AS "metadataJson"
     FROM timeline_events
     WHERE incident_id = $1
     ORDER BY timestamp ASC`,
    [incidentId]
  );
  return rows.map((r: any) => ({
    timestamp: r.timestamp,
    actor: r.actor,
    eventType: r.eventType,
    summary: r.summary,
    severity: r.severity,
    metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
  }));
}

export async function insertRiskHistory(
  incidentId: string,
  riskScore: number,
  timestamp?: string
): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO risk_history (incident_id, timestamp, risk_score) VALUES ($1,$2,$3)`,
    [incidentId, timestamp ?? new Date().toISOString(), riskScore]
  );
}

export async function getRiskHistory(
  options: { incidentId?: string; limit?: number } = {}
): Promise<Array<{ incidentId: string; timestamp: string; riskScore: number }>> {
  const db = await getDatabase();
  const limit = options.limit ?? 30;

  const rows = options.incidentId
    ? await db.all(
        `SELECT incident_id AS "incidentId", timestamp, risk_score AS "riskScore"
         FROM risk_history
         WHERE incident_id = $1
         ORDER BY timestamp ASC
         LIMIT $2`,
        [options.incidentId, limit]
      )
    : await db.all(
        `SELECT incident_id AS "incidentId", timestamp, risk_score AS "riskScore"
         FROM risk_history
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit]
      );

  return options.incidentId ? rows : rows.reverse();
}

export async function getCachedThreatIntel(cacheKey: string): Promise<any | null> {
  const db = await getDatabase();
  const row = await db.get(
    `SELECT result_json::text AS "resultJson", success, confidence
     FROM threat_intel_cache
     WHERE cache_key = $1 AND expires_at > $2`,
    [cacheKey, new Date().toISOString()]
  );
  if (!row) return null;
  try {
    return {
      data: JSON.parse(row.resultJson),
      success: row.success === true,
      confidence: row.confidence ?? 0,
    };
  } catch {
    return null;
  }
}

export async function setCachedThreatIntel(
  cacheKey: string,
  source: string,
  lookupKey: string,
  result: unknown,
  success: boolean,
  confidence: number,
  ttlHours = 24
): Promise<void> {
  const db = await getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await db.run(
    `INSERT INTO threat_intel_cache (
      cache_key, source, lookup_key, result_json, success, confidence, created_at, expires_at
    ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
    ON CONFLICT (cache_key) DO UPDATE SET
      result_json = EXCLUDED.result_json,
      success = EXCLUDED.success,
      confidence = EXCLUDED.confidence,
      created_at = EXCLUDED.created_at,
      expires_at = EXCLUDED.expires_at`,
    [
      cacheKey,
      source,
      lookupKey,
      JSON.stringify(result),
      success,
      confidence,
      now.toISOString(),
      expiresAt.toISOString(),
    ]
  );
}

export async function getThreatIntelFeedStats(): Promise<{
  abuseIpdb: { successRate: number; avgConfidence: number };
  virusTotal: { successRate: number; avgConfidence: number };
  otx: { successRate: number; avgConfidence: number };
  cisaKev: { successRate: number; avgConfidence: number };
  misp: { successRate: number; avgConfidence: number };
}> {
  const db = await getDatabase();
  const sources = ['abuseipdb', 'virustotal', 'otx', 'cisa_kev', 'misp'] as const;
  const result: Record<string, { successRate: number; avgConfidence: number }> = {};

  for (const source of sources) {
    const row = await db.get(
      `SELECT
         COUNT(*)::int AS total,
         SUM(CASE WHEN success = true THEN 1 ELSE 0 END)::int AS successes,
         AVG(CASE WHEN success = true THEN confidence ELSE NULL END)::float AS avgConf
       FROM threat_intel_cache
       WHERE source = $1 AND expires_at > $2`,
      [source, new Date().toISOString()]
    );

    const total = row?.total ?? 0;
    const successes = row?.successes ?? 0;
    const avgConf = row?.avgConf ?? 0;

    result[source === 'cisa_kev' ? 'cisaKev' : source === 'abuseipdb' ? 'abuseIpdb' : source === 'virustotal' ? 'virusTotal' : source] = {
      successRate: total > 0 ? Math.round((successes / total) * 100) : 0,
      avgConfidence: Math.round(avgConf || 0),
    };
  }

  return result as any;
}

export interface DashboardStats {
  totalIncidents: number;
  activeIncidents: number;
  resolvedToday: number;
  autoMitigated: number;
  avgResolutionMs: number;
  mitreTechniquesSeen: number;
  hitlRate: number;
  meanThreatScore: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = await getDatabase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const activeStatuses = [
    'received', 'ingesting', 'analyzing', 'retrieving_context',
    'root_cause_identified', 'remediation_proposed', 'pending_human_review',
  ];
  const activePlaceholders = activeStatuses.map((_, i) => `$${i + 1}`).join(',');

  const totalRow = await db.get(`SELECT COUNT(*)::int AS count FROM incidents`);
  const activeRow = await db.get(
    `SELECT COUNT(*)::int AS count FROM incidents WHERE status IN (${activePlaceholders})`,
    activeStatuses
  );
  const resolvedTodayRow = await db.get(
    `SELECT COUNT(*)::int AS count FROM incidents
     WHERE status IN ('resolved', 'reported') AND updated_at >= $1`,
    [todayIso]
  );
  const autoMitigatedRow = await db.get(
    `SELECT COUNT(*)::int AS count FROM incidents
     WHERE status IN ('resolved', 'reported') AND autonomy_tier = 'L4_AUTO_EXECUTE'`
  );
  const avgResolutionRow = await db.get(
    `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)::float AS avgMs
     FROM incidents
     WHERE status IN ('resolved', 'reported')`
  );
  const meanThreatRow = await db.get(
    `SELECT AVG(threat_score)::float AS avgScore FROM incidents WHERE threat_score IS NOT NULL`
  );
  const hitlRow = await db.get(
    `SELECT
        SUM(CASE WHEN autonomy_tier = 'L2_HITL_APPROVAL' THEN 1 ELSE 0 END)::int AS hitl,
        COUNT(*)::int AS total
      FROM incidents`
  );

  const incidentRows = await db.all(`SELECT state_json::text AS state_json FROM incidents`);
  const mitreSet = new Set<string>();
  for (const row of incidentRows) {
    try {
      const state = JSON.parse(row.state_json);
      for (const entry of state.evidenceChain ?? []) {
        const report = entry.payload?.threatIntelReport;
        if (report?.mitreAttack) {
          for (const t of report.mitreAttack) {
            if (t.techniqueId && t.techniqueId !== 'T0000') {
              mitreSet.add(t.techniqueId);
            }
          }
        }
        if (report?.mitreTechniques) {
          for (const t of report.mitreTechniques) mitreSet.add(t);
        }
      }
      for (const signal of state.anomalySignals ?? []) {
        if (signal.mitreTechnique) mitreSet.add(signal.mitreTechnique);
      }
    } catch {
      // skip malformed rows
    }
  }

  const hitlTotal = hitlRow?.total ?? 0;
  const hitlCount = hitlRow?.hitl ?? 0;

  return {
    totalIncidents: totalRow?.count ?? 0,
    activeIncidents: activeRow?.count ?? 0,
    resolvedToday: resolvedTodayRow?.count ?? 0,
    autoMitigated: autoMitigatedRow?.count ?? 0,
    avgResolutionMs: Math.round(avgResolutionRow?.avgMs ?? 0),
    mitreTechniquesSeen: mitreSet.size,
    hitlRate: hitlTotal > 0 ? Math.round((hitlCount / hitlTotal) * 100) : 0,
    meanThreatScore: Math.round(meanThreatRow?.avgScore ?? 0),
  };
}

export async function insertMetricSnapshot(
  incidentId: string,
  stepName: string,
  options: { confidence?: number; threatScore?: number; retrievalConfidence?: number } = {}
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO metric_snapshots (incident_id, step_name, timestamp, confidence, threat_score, retrieval_confidence)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (incident_id, step_name) DO UPDATE SET
        timestamp = EXCLUDED.timestamp,
        confidence = EXCLUDED.confidence,
        threat_score = EXCLUDED.threat_score,
        retrieval_confidence = EXCLUDED.retrieval_confidence`,
    [
      incidentId,
      stepName,
      now,
      options.confidence ?? null,
      options.threatScore ?? null,
      options.retrievalConfidence ?? null,
    ]
  );
}

export async function getMetricSnapshots(incidentId: string): Promise<
  Array<{ stepName: string; timestamp: string; confidence: number | null; threatScore: number | null; retrievalConfidence: number | null }>
> {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT step_name AS "stepName", timestamp, confidence, threat_score AS "threatScore",
            retrieval_confidence AS "retrievalConfidence"
     FROM metric_snapshots
     WHERE incident_id = $1
     ORDER BY timestamp ASC`,
    [incidentId]
  );
  return rows;
}

export async function getDashboardCharts(): Promise<{
  incidentsByStatus: Record<string, number>;
  mttrTrend: Array<{ day: string; avgMs: number }>;
  autonomySplit: { L4: number; L2: number };
  mitreTop: Array<{ techniqueId: string; count: number }>;
  incidentsPerDay: Array<{ day: string; count: number }>;
}> {
  const db = await getDatabase();

  const statusRows = await db.all(`SELECT status, COUNT(*)::int AS count FROM incidents GROUP BY status`);
  const incidentsByStatus: Record<string, number> = {};
  for (const row of statusRows) {
    incidentsByStatus[row.status] = row.count;
  }

  const mttrRows = await db.all(
    `SELECT DATE(updated_at)::text AS day,
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)::float AS avgMs
     FROM incidents
     WHERE status IN ('resolved', 'reported') AND updated_at IS NOT NULL
     GROUP BY DATE(updated_at)
     ORDER BY day DESC
     LIMIT 7`
  );
  const mttrTrend = mttrRows.reverse().map((r: any) => ({ day: r.day, avgMs: Math.round(r.avgMs || 0) }));

  const autonomyRows = await db.all(
    `SELECT autonomy_tier, COUNT(*)::int AS count FROM incidents GROUP BY autonomy_tier`
  );
  const autonomySplit = { L4: 0, L2: 0 };
  for (const row of autonomyRows) {
    const tier = String(row.autonomy_tier || '');
    if (tier === 'L4_AUTO_EXECUTE') autonomySplit.L4 = row.count;
    else if (tier === 'L2_HITL_APPROVAL') autonomySplit.L2 = row.count;
  }

  const mitreCounts = new Map<string, number>();
  const incidentRows = await db.all(`SELECT state_json::text AS state_json FROM incidents`);
  for (const row of incidentRows) {
    try {
      const state = JSON.parse(row.state_json);
      for (const entry of state.evidenceChain ?? []) {
        const report = entry.payload?.threatIntelReport;
        if (report?.mitreAttack) {
          for (const t of report.mitreAttack) {
            if (t.techniqueId && t.techniqueId !== 'T0000') {
              mitreCounts.set(t.techniqueId, (mitreCounts.get(t.techniqueId) || 0) + 1);
            }
          }
        }
        if (report?.mitreTechniques) {
          for (const t of report.mitreTechniques) {
            const key = String(t);
            mitreCounts.set(key, (mitreCounts.get(key) || 0) + 1);
          }
        }
      }
      for (const signal of state.anomalySignals ?? []) {
        if (signal.mitreTechnique) {
          mitreCounts.set(signal.mitreTechnique, (mitreCounts.get(signal.mitreTechnique) || 0) + 1);
        }
      }
    } catch {
      // skip
    }
  }
  const mitreTop = Array.from(mitreCounts.entries())
    .map(([techniqueId, count]) => ({ techniqueId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const dayRows = await db.all(
    `SELECT DATE(created_at)::text AS day, COUNT(*)::int AS count
     FROM incidents GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 30`
  );
  const incidentsPerDay = dayRows.reverse().map((r: any) => ({ day: r.day, count: r.count }));

  return {
    incidentsByStatus,
    mttrTrend,
    autonomySplit,
    mitreTop,
    incidentsPerDay,
  };
}

/**
 * Returns full incident rows (including state_json) for the given IDs.
 * `state_json` is cast to text so the caller gets a parseable string on both
 * backends.
 */
export async function getIncidentsByIds(incidentIds: string[]): Promise<any[]> {
  if (!incidentIds || incidentIds.length === 0) return [];
  const db = await getDatabase();
  const placeholders = incidentIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await db.all(
    `SELECT incident_id, status, target_host, confidence_score, threat_score, created_at,
            state_json::text AS state_json
     FROM incidents WHERE incident_id IN (${placeholders})`,
    incidentIds
  );
  return rows;
}

// Prediction accuracy tracking (Phase 5)
export async function insertPrediction(
  predictionId: string,
  incidentId: string,
  modelVersion: string,
  predictedLabel: string,
  confidenceScore: number,
  metadata?: unknown
): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO predictions (prediction_id, incident_id, model_version, predicted_label, confidence_score, metadata_json, predicted_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT (prediction_id) DO UPDATE SET
       incident_id = EXCLUDED.incident_id,
       model_version = EXCLUDED.model_version,
       predicted_label = EXCLUDED.predicted_label,
       confidence_score = EXCLUDED.confidence_score,
       metadata_json = EXCLUDED.metadata_json,
       predicted_at = EXCLUDED.predicted_at`,
    [predictionId, incidentId, modelVersion, predictedLabel, confidenceScore, metadata ? JSON.stringify(metadata) : null, new Date().toISOString()]
  );
}

export async function insertActualOutcome(
  predictionId: string,
  actualLabel: string,
  validatedBy?: string
): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO outcomes (prediction_id, actual_label, observed_at, validated_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (prediction_id) DO UPDATE SET
       actual_label = EXCLUDED.actual_label,
       observed_at = EXCLUDED.observed_at,
       validated_by = EXCLUDED.validated_by`,
    [predictionId, actualLabel, new Date().toISOString(), validatedBy || null]
  );
}

export async function getPredictions(options?: {
  modelVersion?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Array<{
  predictionId: string;
  incidentId: string;
  modelVersion: string;
  predictedLabel: string;
  confidenceScore: number;
  predictedAt: string;
  metadata?: any;
}>> {
  const db = await getDatabase();
  let query = `SELECT prediction_id AS "predictionId", incident_id AS "incidentId", model_version AS "modelVersion",
                     predicted_label AS "predictedLabel", confidence_score AS "confidenceScore", predicted_at AS "predictedAt", metadata_json AS "metadata"
              FROM predictions`;
  const params: any[] = [];

  if (options?.modelVersion || options?.startDate || options?.endDate) {
    const conditions: string[] = [];
    if (options.modelVersion) { conditions.push('model_version = $' + (params.length + 1)); params.push(options.modelVersion); }
    if (options.startDate) { conditions.push('predicted_at >= $' + (params.length + 1)); params.push(options.startDate); }
    if (options.endDate) { conditions.push('predicted_at <= $' + (params.length + 1)); params.push(options.endDate); }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY predicted_at DESC';

  const rows = await db.all(query, params);
  return rows.map((r: any) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
  }));
}

export async function getOutcomes(): Promise<Array<{
  predictionId: string;
  actualLabel: string;
  observedAt: string;
  validatedBy?: string;
}>> {
  const db = await getDatabase();
  return db.all(
    `SELECT prediction_id AS "predictionId", actual_label AS "actualLabel", observed_at AS "observedAt", validated_by AS "validatedBy"
     FROM outcomes ORDER BY observed_at DESC`
  );
}

export async function getPredictionOutcomesJoined(options?: {
  modelVersion?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Array<{
  predictionId: string;
  incidentId: string;
  modelVersion: string;
  predictedLabel: string;
  confidenceScore: number;
  predictedAt: string;
  actualLabel?: string;
  observedAt?: string;
  validatedBy?: string;
}>> {
  const db = await getDatabase();
  let query = `SELECT p.prediction_id AS "predictionId", p.incident_id AS "incidentId", p.model_version AS "modelVersion",
                       p.predicted_label AS "predictedLabel", p.confidence_score AS "confidenceScore", p.predicted_at AS "predictedAt",
                       o.actual_label AS "actualLabel", o.observed_at AS "observedAt", o.validated_by AS "validatedBy"
                FROM predictions p
                LEFT JOIN outcomes o ON p.prediction_id = o.prediction_id`;
  const params: any[] = [];

  if (options?.modelVersion || options?.startDate || options?.endDate) {
    const conditions: string[] = [];
    if (options.modelVersion) { conditions.push('p.model_version = $' + (params.length + 1)); params.push(options.modelVersion); }
    if (options.startDate) { conditions.push('p.predicted_at >= $' + (params.length + 1)); params.push(options.startDate); }
    if (options.endDate) { conditions.push('p.predicted_at <= $' + (params.length + 1)); params.push(options.endDate); }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY p.predicted_at DESC';

  return db.all(query, params);
}

export async function getAccuracyPredictionAccuracy(options?: {
  modelVersion?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  totalPredictions: number;
  totalResolved: number;
  accuracy: number;
  precisionByLabel: Record<string, number>;
  recallByLabel: Record<string, number>;
  f1ByLabel: Record<string, number>;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  weightedPrecision: number;
  weightedRecall: number;
  weightedF1: number;
  predictionsPerDay: Array<{ day: string; count: number }>;
}> {
  const db = await getDatabase();
  const predictions = await getPredictionOutcomesJoined(options);

  const totalPredictions = predictions.length;
  const resolvedPredictions = predictions.filter((p) => p.actualLabel);
  const totalResolved = resolvedPredictions.length;

  const correctPredictions = resolvedPredictions.filter(
    (p) => p.predictedLabel === p.actualLabel
  ).length;

  const accuracy = totalResolved > 0
    ? Math.round((correctPredictions / totalResolved) * 100) / 100
    : 0;

  const labels = [...new Set([
    ...resolvedPredictions.map((p) => p.predictedLabel),
    ...resolvedPredictions.map((p) => p.actualLabel!),
  ])].sort();

  const precisionByLabel: Record<string, number> = {};
  const recallByLabel: Record<string, number> = {};
  const f1ByLabel: Record<string, number> = {};

  for (const label of labels) {
    const tp = resolvedPredictions.filter(
      (p) => p.predictedLabel === label && p.actualLabel === label
    ).length;
    const fp = resolvedPredictions.filter(
      (p) => p.predictedLabel === label && p.actualLabel !== label
    ).length;
    const fn = resolvedPredictions.filter(
      (p) => p.predictedLabel !== label && p.actualLabel === label
    ).length;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    precisionByLabel[label] = Math.round(precision * 100) / 100;
    recallByLabel[label] = Math.round(recall * 100) / 100;
    f1ByLabel[label] = Math.round(f1 * 100) / 100;
  }

  const macroPrecision = labels.length > 0
    ? Object.values(precisionByLabel).reduce((a, b) => a + b, 0) / labels.length
    : 0;
  const macroRecall = labels.length > 0
    ? Object.values(recallByLabel).reduce((a, b) => a + b, 0) / labels.length
    : 0;
  const macroF1 = labels.length > 0
    ? Object.values(f1ByLabel).reduce((a, b) => a + b, 0) / labels.length
    : 0;

  const predictionsPerDayMap = new Map<string, number>();
  for (const p of predictions) {
    const day = p.predictedAt.split('T')[0];
    predictionsPerDayMap.set(day, (predictionsPerDayMap.get(day) || 0) + 1);
  }

  const predictionsPerDay = Array.from(predictionsPerDayMap.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    totalPredictions,
    totalResolved,
    accuracy,
    precisionByLabel,
    recallByLabel,
    f1ByLabel,
    macroPrecision: Math.round(macroPrecision * 100) / 100,
    macroRecall: Math.round(macroRecall * 100) / 100,
    macroF1: Math.round(macroF1 * 100) / 100,
    weightedPrecision: Math.round(macroPrecision * 100) / 100,
    weightedRecall: Math.round(macroRecall * 100) / 100,
    weightedF1: Math.round(macroF1 * 100) / 100,
    predictionsPerDay,
  };
}

// Re-export guard so callers can avoid importing config directly.
export { isPostgresEnabled };
