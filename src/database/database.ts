/**
 * Database dispatcher.
 *
 * Selects the active backend at module-load time based on `USE_POSTGRES`:
 *   - false (default): SQLite backend (sqlite.ts) — keeps the dev app working
 *     with zero infrastructure.
 *   - true: PostgreSQL/TimescaleDB backend (postgres-db.ts).
 *
 * Every exported function keeps the same signature across backends, so the
 * rest of the codebase (server.ts, workflows, agents, etc.) is unaffected.
 * Only `getDatabase()` differs in return type (sqlite `Database` vs pg `DbConn`),
 * which is why it is dispatched explicitly below.
 */
import * as sqliteBackend from './sqlite.js';
import * as pgBackend from './postgres-db.js';
import { isPostgresEnabled } from '../config/postgres.js';

const backend = isPostgresEnabled() ? pgBackend : sqliteBackend;

export const saveIncidentState = backend.saveIncidentState;
export const getIncidentState = backend.getIncidentState;
export const getAllIncidents = backend.getAllIncidents;
export const upsertWorkflowStep = backend.upsertWorkflowStep;
export const getWorkflowSteps = backend.getWorkflowSteps;
export const initWorkflowSteps = backend.initWorkflowSteps;
export const insertTimelineEvent = backend.insertTimelineEvent;
export const getTimelineEvents = backend.getTimelineEvents;
export const insertRiskHistory = backend.insertRiskHistory;
export const getRiskHistory = backend.getRiskHistory;
export const getCachedThreatIntel = backend.getCachedThreatIntel;
export const setCachedThreatIntel = backend.setCachedThreatIntel;
export const getThreatIntelFeedStats = backend.getThreatIntelFeedStats;
export const insertMetricSnapshot = backend.insertMetricSnapshot;
export const getMetricSnapshots = backend.getMetricSnapshots;
export const getDashboardStats = backend.getDashboardStats;
export const getDashboardCharts = backend.getDashboardCharts;
export const getIncidentsByIds = backend.getIncidentsByIds;
export const insertPrediction = backend.insertPrediction;
export const insertActualOutcome = backend.insertActualOutcome;
export const getPredictions = backend.getPredictions;
export const getOutcomes = backend.getOutcomes;
export const getPredictionOutcomesJoined = backend.getPredictionOutcomesJoined;
export const getAccuracyPredictionAccuracy = backend.getAccuracyPredictionAccuracy;

export type { DashboardStats } from './sqlite.js';

/**
 * Returns the active backend's connection handle. Return type is intentionally
 * broad (`any`) because SQLite returns a `Database` while Postgres returns a
 * normalized `DbConn` — both expose `.get/.all/.run/.exec`.
 */
export async function getDatabase(...args: any[]): Promise<any> {
  return backend.getDatabase(...(args as []));
}

/** Closes the active backend (no-op for SQLite, ends the pg pool when enabled). */
export async function closeDatabase(): Promise<void> {
  if (isPostgresEnabled()) {
    await pgBackend.closeDatabase();
  }
}
