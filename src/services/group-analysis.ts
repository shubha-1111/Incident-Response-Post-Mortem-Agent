/**
 * Grouped aggregate metrics for a set of incidents (Phase 6.5).
 *
 * Operates on raw incident rows (from getIncidentsByIds) that expose
 * `state_json`, `threat_score`, `confidence_score`, `target_host` and
 * `status`. `state_json` may arrive as a string (SQLite) or object (Postgres
 * JSONB), so it is normalized before reading `attackType`.
 */
export interface GroupedMetrics {
  totalIncidents: number;
  byStatus: Record<string, number>;
  byAttackType: Record<string, number>;
  bySeverity: Record<string, number>;
  avgThreatScore: number;
  avgConfidence: number;
  timeToResolution: number;
  topAssets: Array<{ asset: string; count: number }>;
  topMitreTechniques: Array<{ technique: string; count: number }>;
}

function parseState(row: any): any {
  const raw = row?.state_json;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

export async function getGroupedMetrics(incidents: any[]): Promise<GroupedMetrics> {
  const metrics: GroupedMetrics = {
    totalIncidents: incidents.length,
    byStatus: {},
    byAttackType: {},
    bySeverity: {},
    avgThreatScore: 0,
    avgConfidence: 0,
    timeToResolution: 0,
    topAssets: [],
    topMitreTechniques: [],
  };

  const mitreCounts = new Map<string, number>();
  let threatSum = 0;
  let confidenceSum = 0;
  let scoredCount = 0;

  for (const incident of incidents) {
    // By status
    metrics.byStatus[incident.status] = (metrics.byStatus[incident.status] || 0) + 1;

    const state = parseState(incident);

    // By attack type (extracted from state)
    if (state.attackType) {
      metrics.byAttackType[state.attackType] = (metrics.byAttackType[state.attackType] || 0) + 1;
    }

    // By severity
    const severity = state.severity ?? incident.severity;
    if (severity) {
      metrics.bySeverity[severity] = (metrics.bySeverity[severity] || 0) + 1;
    }

    // Threat score average
    if (incident.threat_score != null) {
      threatSum += Number(incident.threat_score);
      scoredCount++;
    }

    // Confidence average
    if (incident.confidence_score != null) {
      confidenceSum += Number(incident.confidence_score);
    }

    // Asset tracking
    if (incident.target_host) {
      const existing = metrics.topAssets.find((a) => a.asset === incident.target_host);
      if (existing) existing.count++;
      else metrics.topAssets.push({ asset: incident.target_host, count: 1 });
    }

    // MITRE techniques (from state evidence chain / signals)
    const signals: any[] = Array.isArray(state.anomalySignals) ? state.anomalySignals : [];
    for (const sig of signals) {
      if (sig?.mitreTechnique) {
        mitreCounts.set(sig.mitreTechnique, (mitreCounts.get(sig.mitreTechnique) || 0) + 1);
      }
    }
    const chain: any[] = Array.isArray(state.evidenceChain) ? state.evidenceChain : [];
    for (const entry of chain) {
      const report = entry?.payload?.threatIntelReport;
      const techniques: string[] = [
        ...(report?.mitreAttack ?? []).map((t: any) => t.techniqueId).filter(Boolean),
        ...(report?.mitreTechniques ?? []),
      ];
      for (const t of techniques) {
        if (t && t !== 'T0000') mitreCounts.set(t, (mitreCounts.get(t) || 0) + 1);
      }
    }
  }

  metrics.avgThreatScore = scoredCount > 0 ? threatSum / scoredCount : 0;
  metrics.avgConfidence = incidents.length > 0 ? confidenceSum / incidents.length : 0;
  metrics.topAssets.sort((a, b) => b.count - a.count);
  metrics.topAssets = metrics.topAssets.slice(0, 10);
  metrics.topMitreTechniques = Array.from(mitreCounts.entries())
    .map(([technique, count]) => ({ technique, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return metrics;
}
