import { getDatabase } from '../database/database.js';
import type { IncidentStatus, IncidentSeverity } from '../schemas/incident-state.js';

export interface IncidentFilter {
  attackTypes?: string[];
  severity?: IncidentSeverity[];
  status?: IncidentStatus[];
  timeRange?: { start: string; end: string };
  confidenceRange?: { min: number; max: number };
  assets?: string[];
  mitreTechniques?: string[];
  threatScoreRange?: { min: number; max: number };
}

export interface FilteredIncident {
  incidentId: string;
  status: string;
  targetHost: string;
  confidenceScore: number | null;
  threatScore: number | null;
  createdAt: string;
  severity?: string;
  state: any;
}

/**
 * Multi-criteria incident filter.
 *
 * Relational columns (status, time, confidence, threat score, asset) are
 * pushed down to SQL so the scan stays cheap. JSON-only signals (attack types,
 * MITRE techniques, severity) are resolved in JavaScript against the
 * deserialized incident state, keeping the query backend-agnostic (SQLite +
 * Postgres).
 */
export async function filterIncidents(filter: IncidentFilter): Promise<FilteredIncident[]> {
  const db = await getDatabase();

  let query =
    `SELECT incident_id, status, target_host, confidence_score, threat_score, created_at, state_json ` +
    `FROM incidents WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  const next = (value: any) => `$${paramIndex++}`;

  if (filter.status && filter.status.length > 0) {
    query += ` AND status IN (${filter.status.map(() => `?`).join(',')})`;
    params.push(...filter.status);
  }

  if (filter.timeRange) {
    query += ` AND created_at BETWEEN ? AND ?`;
    params.push(filter.timeRange.start, filter.timeRange.end);
  }

  if (filter.confidenceRange) {
    query += ` AND confidence_score BETWEEN ? AND ?`;
    params.push(filter.confidenceRange.min, filter.confidenceRange.max);
  }

  if (filter.threatScoreRange) {
    query += ` AND threat_score BETWEEN ? AND ?`;
    params.push(filter.threatScoreRange.min, filter.threatScoreRange.max);
  }

  if (filter.assets && filter.assets.length > 0) {
    query += ` AND target_host IN (${filter.assets.map(() => `?`).join(',')})`;
    params.push(...filter.assets);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const rows = (await db.all(query, params)) as any[];

  let results: FilteredIncident[] = rows.map((row) => {
    let state: any = null;
    try {
      state = typeof row.state_json === 'string' ? JSON.parse(row.state_json) : row.state_json;
    } catch {
      state = null;
    }
    return {
      incidentId: row.incident_id,
      status: row.status,
      targetHost: row.target_host,
      confidenceScore: row.confidence_score ?? null,
      threatScore: row.threat_score ?? null,
      createdAt: row.created_at,
      severity: state?.severity ?? undefined,
      state,
    };
  });

  if (filter.attackTypes && filter.attackTypes.length > 0) {
    const types = filter.attackTypes.map((t) => t.toLowerCase());
    results = results.filter((r) =>
      types.some((t) => JSON.stringify(r.state ?? {}).toLowerCase().includes(t))
    );
  }

  if (filter.mitreTechniques && filter.mitreTechniques.length > 0) {
    const techniques = filter.mitreTechniques.map((t) => t.toLowerCase());
    results = results.filter((r) =>
      techniques.some((t) => JSON.stringify(r.state ?? {}).toLowerCase().includes(t))
    );
  }

  if (filter.severity && filter.severity.length > 0) {
    const sev = filter.severity.map((s) => s.toLowerCase());
    results = results.filter((r) => r.severity && sev.includes(String(r.severity).toLowerCase()));
  }

  return results;
}
