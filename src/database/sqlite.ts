import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { IncidentState } from '../schemas/incident-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'incidents.db');

let dbInstance: Database | null = null;

/**
 * Initializes the SQLite database connection and sets up the schema.
 */
export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Enable WAL mode for high concurrency
  await dbInstance.run('PRAGMA journal_mode = WAL;');

  // Create active incidents table
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      incident_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      target_host TEXT,
      confidence_score REAL,
      retrieval_confidence REAL,
      autonomy_tier TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      state_json TEXT NOT NULL,
      threat_score REAL,
      threat_breakdown_json TEXT
    );
  `);

  // Migration: Add columns to existing database if they don't exist
  try {
    await dbInstance.exec(`ALTER TABLE incidents ADD COLUMN threat_score REAL;`);
  } catch (e) {
    // Ignore error if column already exists
  }
  try {
    await dbInstance.exec(`ALTER TABLE incidents ADD COLUMN threat_breakdown_json TEXT;`);
  } catch (e) {
    // Ignore error if column already exists
  }

  // Create indexes for query columns
  await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
  `);

  // Create workflow steps table
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS workflow_steps (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id   TEXT NOT NULL,
      step_name     TEXT NOT NULL,
      status        TEXT NOT NULL,
      started_at    TEXT,
      finished_at   TEXT,
      duration_ms   INTEGER,
      metadata_json TEXT,
      UNIQUE(incident_id, step_name)
    );
  `);

  // Create timeline events table
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id  TEXT NOT NULL,
      timestamp    TEXT NOT NULL,
      actor        TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      summary      TEXT NOT NULL,
      severity     TEXT,
      metadata_json TEXT
    );
  `);

  // Create indexes for steps and timeline
  await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS idx_steps_incident ON workflow_steps(incident_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_incident ON timeline_events(incident_id, timestamp);
  `);

  // Sprint 3: Risk score history for line charts
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS risk_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      risk_score  REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_risk_history_incident ON risk_history(incident_id, timestamp);
  `);

  // Sprint 3: Free threat intelligence lookup cache (24h TTL)
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS threat_intel_cache (
      cache_key   TEXT PRIMARY KEY,
      source      TEXT NOT NULL,
      lookup_key  TEXT NOT NULL,
      result_json TEXT NOT NULL,
      success     INTEGER NOT NULL DEFAULT 1,
      confidence  REAL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_threat_cache_source ON threat_intel_cache(source, expires_at);
  `);

  // Charts: Per-step confidence + score snapshots for confidence curve + threat breakdown
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id  TEXT NOT NULL,
      step_name    TEXT NOT NULL,
      timestamp    TEXT NOT NULL,
      confidence   REAL,
      threat_score REAL,
      retrieval_confidence REAL,
      UNIQUE(incident_id, step_name)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_incident ON metric_snapshots(incident_id, timestamp);
  `);

// Saved filter presets (Phase 6.2)
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS filter_presets (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      filter_json  TEXT NOT NULL,
      is_default   INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_filter_presets_user ON filter_presets(user_id);
  `);

  // Incident groups for clustered analysis (Phase 7)
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS incident_groups (
      group_id      TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      incident_ids  TEXT NOT NULL,
      cluster_method TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      metadata_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_groups_method ON incident_groups(cluster_method);
  `);

  // Prediction accuracy tracking (Phase 5)
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      prediction_id  TEXT PRIMARY KEY,
      incident_id    TEXT NOT NULL,
      model_version  TEXT NOT NULL,
      predicted_label TEXT NOT NULL,
      confidence_score REAL,
      metadata_json  TEXT,
      predicted_at   TEXT NOT NULL,
      FOREIGN KEY(incident_id) REFERENCES incidents(incident_id)
    );
    CREATE INDEX IF NOT EXISTS idx_predictions_model ON predictions(model_version);
    CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(predicted_at);
  `);

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS outcomes (
      prediction_id TEXT PRIMARY KEY,
      actual_label  TEXT NOT NULL,
      observed_at   TEXT NOT NULL,
      validated_by  TEXT,
      FOREIGN KEY(prediction_id) REFERENCES predictions(prediction_id)
    );
  `);

  console.log(`[Database] Persistent SQLite initialized at: ${dbPath}`);
  return dbInstance;
}

/** Alias used by the migration script to read from SQLite regardless of backend. */
export const getSqliteDatabase = getDatabase;

/**
 * Saves or updates an incident state in the database.
 */
export async function saveIncidentState(state: IncidentState): Promise<void> {
  const db = await getDatabase();
  const stateJson = JSON.stringify(state);
  
  await db.run(
    `INSERT INTO incidents (
      incident_id, status, target_host, confidence_score, 
      retrieval_confidence, autonomy_tier, created_at, updated_at, state_json,
      threat_score, threat_breakdown_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(incident_id) DO UPDATE SET
      status = excluded.status,
      target_host = excluded.target_host,
      confidence_score = excluded.confidence_score,
      retrieval_confidence = excluded.retrieval_confidence,
      autonomy_tier = excluded.autonomy_tier,
      updated_at = excluded.updated_at,
      state_json = excluded.state_json,
      threat_score = excluded.threat_score,
      threat_breakdown_json = excluded.threat_breakdown_json`,
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
      state.threatBreakdown ? JSON.stringify(state.threatBreakdown) : null
    ]
  );
}

/**
 * Retrieves a single incident by its ID.
 */
export async function getIncidentState(incidentId: string): Promise<IncidentState | null> {
  const db = await getDatabase();
  const row = await db.get('SELECT state_json FROM incidents WHERE incident_id = ?', [incidentId]);
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.state_json) as IncidentState;
  } catch (err) {
    console.error(`[Database] Failed to parse state JSON for incident ${incidentId}:`, err);
    return null;
  }
}

/**
 * Retrieves all incident summaries for the dashboard list.
 */
export async function getAllIncidents(): Promise<any[]> {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT incident_id, status, autonomy_tier, confidence_score, target_host, created_at, threat_score, threat_breakdown_json
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
    threatBreakdown: row.threat_breakdown_json ? JSON.parse(row.threat_breakdown_json) : null
  }));
}

export async function getIncidentsByIds(incidentIds: string[]): Promise<any[]> {
  if (!incidentIds.length) return [];
  const db = await getDatabase();
  const placeholders = incidentIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT incident_id, status, autonomy_tier, confidence_score, target_host, created_at, threat_score, threat_breakdown_json, state_json
     FROM incidents 
     WHERE incident_id IN (${placeholders})`,
    incidentIds
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
    stateJson: row.state_json,
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(incident_id, step_name) DO UPDATE SET
      status = excluded.status,
      started_at = COALESCE(excluded.started_at, started_at),
      finished_at = COALESCE(excluded.finished_at, finished_at),
      duration_ms = COALESCE(excluded.duration_ms, duration_ms),
      metadata_json = COALESCE(excluded.metadata_json, metadata_json)`,
    [incidentId, stepName, status, startedAt || null, finishedAt || null, durationMs || null, metadataJson]
  );
}

export async function getWorkflowSteps(incidentId: string): Promise<any[]> {
  const db = await getDatabase();
  return db.all(
    `SELECT step_name as stepName, status, started_at as startedAt, finished_at as finishedAt, duration_ms as durationMs, metadata_json as metadataJson 
     FROM workflow_steps 
     WHERE incident_id = ?`,
    [incidentId]
  );
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
    'observability-step'
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [incidentId, timestamp, actor, eventType, summary, severity || null, metadataJson]
  );
}

export async function getTimelineEvents(incidentId: string): Promise<any[]> {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT timestamp, actor, event_type as eventType, summary, severity, metadata_json as metadataJson
     FROM timeline_events
     WHERE incident_id = ?
     ORDER BY timestamp ASC`,
    [incidentId]
  );
  return rows.map((r: any) => ({
    timestamp: r.timestamp,
    actor: r.actor,
    eventType: r.eventType,
    summary: r.summary,
    severity: r.severity,
    metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null
  }));
}

export async function insertRiskHistory(
  incidentId: string,
  riskScore: number,
  timestamp?: string
): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO risk_history (incident_id, timestamp, risk_score) VALUES (?, ?, ?)`,
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
        `SELECT incident_id as incidentId, timestamp, risk_score as riskScore
         FROM risk_history
         WHERE incident_id = ?
         ORDER BY timestamp ASC
         LIMIT ?`,
        [options.incidentId, limit]
      )
    : await db.all(
        `SELECT incident_id as incidentId, timestamp, risk_score as riskScore
         FROM risk_history
         ORDER BY timestamp DESC
         LIMIT ?`,
        [limit]
      );

  return options.incidentId ? rows : rows.reverse();
}

export async function getCachedThreatIntel(cacheKey: string): Promise<any | null> {
  const db = await getDatabase();
  const row = await db.get(
    `SELECT result_json as resultJson, success, confidence
     FROM threat_intel_cache
     WHERE cache_key = ? AND expires_at > ?`,
    [cacheKey, new Date().toISOString()]
  );
  if (!row) return null;
  try {
    return {
      data: JSON.parse(row.resultJson),
      success: row.success === 1,
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      result_json = excluded.result_json,
      success = excluded.success,
      confidence = excluded.confidence,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at`,
    [
      cacheKey,
      source,
      lookupKey,
      JSON.stringify(result),
      success ? 1 : 0,
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
         COUNT(*) as total,
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
         AVG(CASE WHEN success = 1 THEN confidence ELSE NULL END) as avgConf
       FROM threat_intel_cache
       WHERE source = ? AND expires_at > ?`,
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

  const totalRow = await db.get(`SELECT COUNT(*) as count FROM incidents`);
  const activeRow = await db.get(
    `SELECT COUNT(*) as count FROM incidents WHERE status IN (${activeStatuses.map(() => '?').join(',')})`,
    activeStatuses
  );
  const resolvedTodayRow = await db.get(
    `SELECT COUNT(*) as count FROM incidents
     WHERE status IN ('resolved', 'reported') AND updated_at >= ?`,
    [todayIso]
  );
  const autoMitigatedRow = await db.get(
    `SELECT COUNT(*) as count FROM incidents
     WHERE status IN ('resolved', 'reported') AND autonomy_tier = 'L4_AUTO_EXECUTE'`
  );
  const avgResolutionRow = await db.get(
    `SELECT AVG(
        (julianday(updated_at) - julianday(created_at)) * 86400000
      ) as avgMs
      FROM incidents
      WHERE status IN ('resolved', 'reported')`
  );
  const meanThreatRow = await db.get(
    `SELECT AVG(threat_score) as avgScore FROM incidents WHERE threat_score IS NOT NULL`
  );
  const hitlRow = await db.get(
    `SELECT
        SUM(CASE WHEN autonomy_tier = 'L2_HITL_APPROVAL' THEN 1 ELSE 0 END) as hitl,
        COUNT(*) as total
      FROM incidents`
  );

  // Extract distinct MITRE technique IDs from state_json evidence chains
  const incidentRows = await db.all(`SELECT state_json FROM incidents`);
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
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(incident_id, step_name) DO UPDATE SET
        timestamp = excluded.timestamp,
        confidence = excluded.confidence,
        threat_score = excluded.threat_score,
        retrieval_confidence = excluded.retrieval_confidence`,
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
    `SELECT step_name as stepName, timestamp, confidence, threat_score as threatScore, retrieval_confidence as retrievalConfidence
     FROM metric_snapshots
     WHERE incident_id = ?
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

  const statusRows = await db.all(`SELECT status, COUNT(*) as count FROM incidents GROUP BY status`);
  const incidentsByStatus: Record<string, number> = {};
  for (const row of statusRows) {
    incidentsByStatus[row.status] = row.count;
  }

  const mttrRows = await db.all(
    `SELECT DATE(updated_at) as day, AVG((julianday(updated_at) - julianday(created_at)) * 86400000) as avgMs
     FROM incidents
     WHERE status IN ('resolved', 'reported') AND updated_at IS NOT NULL
     GROUP BY DATE(updated_at)
     ORDER BY day DESC
     LIMIT 7`
  );
  const mttrTrend = mttrRows.reverse().map((r) => ({ day: r.day, avgMs: Math.round(r.avgMs || 0) }));

  const autonomyRows = await db.all(
    `SELECT autonomy_tier, COUNT(*) as count FROM incidents GROUP BY autonomy_tier`
  );
  const autonomySplit = { L4: 0, L2: 0 };
  for (const row of autonomyRows) {
    const tier = String(row.autonomy_tier || '');
    if (tier === 'L4_AUTO_EXECUTE') autonomySplit.L4 = row.count;
    else if (tier === 'L2_HITL_APPROVAL') autonomySplit.L2 = row.count;
  }

  const mitreCounts = new Map<string, number>();
  const incidentRows = await db.all(`SELECT state_json FROM incidents`);
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
    `SELECT DATE(created_at) as day, COUNT(*) as count FROM incidents GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 30`
  );
  const incidentsPerDay = dayRows.reverse().map((r) => ({ day: r.day, count: r.count }));

  return {
    incidentsByStatus,
    mttrTrend,
    autonomySplit,
    mitreTop,
    incidentsPerDay,
  };
}

/**
 * Prediction accuracy tracking for confusion matrix and precision/recall metrics.
 */
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
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(prediction_id) DO UPDATE SET
       incident_id = excluded.incident_id,
       model_version = excluded.model_version,
       predicted_label = excluded.predicted_label,
       confidence_score = excluded.confidence_score,
       metadata_json = excluded.metadata_json,
       predicted_at = excluded.predicted_at`,
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
     VALUES (?, ?, ?, ?)
     ON CONFLICT(prediction_id) DO UPDATE SET
       actual_label = excluded.actual_label,
       observed_at = excluded.observed_at,
       validated_by = excluded.validated_by`,
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
  let query = `SELECT prediction_id as predictionId, incident_id as incidentId, model_version as modelVersion, 
                     predicted_label as predictedLabel, confidence_score as confidenceScore, predicted_at as predictedAt, metadata_json as metadata
              FROM predictions`;
  const params: any[] = [];

  if (options?.modelVersion || options?.startDate || options?.endDate) {
    const conditions: string[] = [];
    if (options.modelVersion) { conditions.push('model_version = ?'); params.push(options.modelVersion); }
    if (options.startDate) { conditions.push('predicted_at >= ?'); params.push(options.startDate); }
    if (options.endDate) { conditions.push('predicted_at <= ?'); params.push(options.endDate); }
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
  const rows = await db.all(
    `SELECT prediction_id as predictionId, actual_label as actualLabel, observed_at as observedAt, validated_by as validatedBy
     FROM outcomes ORDER BY observed_at DESC`
  );
  return rows;
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
  let query = `SELECT p.prediction_id as predictionId, p.incident_id as incidentId, p.model_version as modelVersion,
                     p.predicted_label as predictedLabel, p.confidence_score as confidenceScore, p.predicted_at as predictedAt,
                     o.actual_label as actualLabel, o.observed_at as observedAt, o.validated_by as validatedBy
              FROM predictions p
              LEFT JOIN outcomes o ON p.prediction_id = o.prediction_id`;
  const params: any[] = [];

  if (options?.modelVersion || options?.startDate || options?.endDate) {
    const conditions: string[] = [];
    if (options.modelVersion) { conditions.push('p.model_version = ?'); params.push(options.modelVersion); }
    if (options.startDate) { conditions.push('p.predicted_at >= ?'); params.push(options.startDate); }
    if (options.endDate) { conditions.push('p.predicted_at <= ?'); params.push(options.endDate); }
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
