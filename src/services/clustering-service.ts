import { getAllIncidents, getIncidentState, getDatabase } from '../database/database.js';

export interface IncidentForClustering {
  incidentId: string;
  status: string;
  targetHost: string;
  threatScore: number;
  confidenceScore: number;
  createdAt: string;
  attackType?: string;
  mitreTechniques?: string[];
  autonomyTier?: string;
  anomalySignals?: Array<{ mitreTechnique?: string }>;
  evidenceChain?: Array<{ payload?: { threatIntelReport?: any } }>;
}

export interface ClusterResult {
  groupId: string;
  name: string;
  incidentIds: string[];
  clusterMethod: string;
  createdAt: string;
  metadata: {
    avgThreatScore: number;
    avgConfidence: number;
    topAssets: Array<{ asset: string; count: number }>;
    topMitreTechniques: Array<{ technique: string; count: number }>;
    byStatus: Record<string, number>;
    byAttackType: Record<string, number>;
    timeSpanHours: number;
  };
}

interface TimeBucketCluster {
  bucketKey: string;
  incidents: IncidentForClustering[];
  startTime: Date;
  endTime: Date;
}

function parseStateForClustering(incident: any): IncidentForClustering {
  let attackType: string | undefined;
  let mitreTechniques: string[] = [];
  let anomalySignals: Array<{ mitreTechnique?: string }> = [];
  let evidenceChain: Array<{ payload?: { threatIntelReport?: any } }> = [];

  try {
    const state = typeof incident.state_json === 'string'
      ? JSON.parse(incident.state_json)
      : incident.state_json;

    attackType = state.attackType;
    anomalySignals = state.anomalySignals ?? [];
    evidenceChain = state.evidenceChain ?? [];

    for (const entry of evidenceChain) {
      const report = entry?.payload?.threatIntelReport;
      if (report?.mitreAttack) {
        for (const t of report.mitreAttack) {
          if (t.techniqueId && t.techniqueId !== 'T0000') {
            mitreTechniques.push(t.techniqueId);
          }
        }
      }
      if (report?.mitreTechniques) {
        mitreTechniques.push(...report.mitreTechniques);
      }
    }
  } catch {
    // Ignore parse errors
  }

  return {
    incidentId: incident.incidentId,
    status: incident.status,
    targetHost: incident.targetHost || 'unknown',
    threatScore: incident.threatScore ?? 0,
    confidenceScore: incident.confidenceScore ?? 0,
    createdAt: incident.createdAt,
    attackType,
    mitreTechniques: [...new Set(mitreTechniques.filter(Boolean))],
    autonomyTier: incident.autonomyTier,
    anomalySignals,
    evidenceChain,
  };
}

function getTimeBucketKey(createdAt: string, bucketHours: number): string {
  const date = new Date(createdAt);
  const bucketMs = bucketHours * 60 * 60 * 1000;
  const bucketStart = Math.floor(date.getTime() / bucketMs) * bucketMs;
  return new Date(bucketStart).toISOString();
}

function computeClusterMetadata(incidents: IncidentForClustering[]): ClusterResult['metadata'] {
  const mitreCounts = new Map<string, number>();
  const assetCounts = new Map<string, number>();
  const byStatus: Record<string, number> = {};
  const byAttackType: Record<string, number> = {};

  let threatSum = 0;
  let confidenceSum = 0;
  let scoredCount = 0;

  const times = incidents.map(i => new Date(i.createdAt).getTime());
  const timeSpanHours = (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60);

  for (const inc of incidents) {
    byStatus[inc.status] = (byStatus[inc.status] || 0) + 1;
    if (inc.attackType) {
      byAttackType[inc.attackType] = (byAttackType[inc.attackType] || 0) + 1;
    }

    if (inc.threatScore != null) {
      threatSum += inc.threatScore;
      scoredCount++;
    }
    if (inc.confidenceScore != null) {
      confidenceSum += inc.confidenceScore;
    }

    assetCounts.set(inc.targetHost, (assetCounts.get(inc.targetHost) || 0) + 1);

    for (const sig of inc.anomalySignals ?? []) {
      if (sig.mitreTechnique) {
        mitreCounts.set(sig.mitreTechnique, (mitreCounts.get(sig.mitreTechnique) || 0) + 1);
      }
    }
    for (const tech of inc.mitreTechniques ?? []) {
      mitreCounts.set(tech, (mitreCounts.get(tech) || 0) + 1);
    }
  }

  const topAssets = Array.from(assetCounts.entries())
    .map(([asset, count]) => ({ asset, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topMitreTechniques = Array.from(mitreCounts.entries())
    .map(([technique, count]) => ({ technique, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    avgThreatScore: scoredCount > 0 ? threatSum / scoredCount : 0,
    avgConfidence: incidents.length > 0 ? confidenceSum / incidents.length : 0,
    topAssets,
    topMitreTechniques,
    byStatus,
    byAttackType,
    timeSpanHours,
  };
}

export async function clusterIncidentsByTimeBucket(
  bucketHours: number = 24,
  minIncidentsPerCluster: number = 2
): Promise<ClusterResult[]> {
  const incidents = await getAllIncidents();
  const incidentsForClustering = incidents.map(parseStateForClustering);

  const buckets = new Map<string, TimeBucketCluster>();

  for (const inc of incidentsForClustering) {
    const bucketKey = getTimeBucketKey(inc.createdAt, bucketHours);
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      const startTime = new Date(bucketKey);
      const endTime = new Date(startTime.getTime() + bucketHours * 60 * 60 * 1000);
      bucket = { bucketKey, incidents: [], startTime, endTime };
      buckets.set(bucketKey, bucket);
    }
    bucket.incidents.push(inc);
  }

  const results: ClusterResult[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.incidents.length < minIncidentsPerCluster) continue;

    const groupId = `time-${bucket.bucketKey.replace(/[:.]/g, '-')}`;
    const name = `Time Cluster ${new Date(bucket.bucketKey).toLocaleDateString()} (${bucket.incidents.length} incidents)`;
    const metadata = computeClusterMetadata(bucket.incidents);

    results.push({
      groupId,
      name,
      incidentIds: bucket.incidents.map(i => i.incidentId),
      clusterMethod: 'time_bucket',
      createdAt: new Date().toISOString(),
      metadata,
    });
  }

  return results;
}

export async function clusterIncidentsByAsset(
  minIncidentsPerCluster: number = 2
): Promise<ClusterResult[]> {
  const incidents = await getAllIncidents();
  const incidentsForClustering = incidents.map(parseStateForClustering);

  const assetGroups = new Map<string, IncidentForClustering[]>();
  for (const inc of incidentsForClustering) {
    const key = inc.targetHost;
    if (!assetGroups.has(key)) assetGroups.set(key, []);
    assetGroups.get(key)!.push(inc);
  }

  const results: ClusterResult[] = [];
  for (const [asset, assetIncidents] of assetGroups.entries()) {
    if (assetIncidents.length < minIncidentsPerCluster) continue;

    const groupId = `asset-${asset.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const name = `Asset Cluster: ${asset} (${assetIncidents.length} incidents)`;
    const metadata = computeClusterMetadata(assetIncidents);

    results.push({
      groupId,
      name,
      incidentIds: assetIncidents.map(i => i.incidentId),
      clusterMethod: 'asset',
      createdAt: new Date().toISOString(),
      metadata,
    });
  }

  return results;
}

export async function clusterIncidentsByAttackType(
  minIncidentsPerCluster: number = 2
): Promise<ClusterResult[]> {
  const incidents = await getAllIncidents();
  const incidentsForClustering = incidents.map(parseStateForClustering);

  const typeGroups = new Map<string, IncidentForClustering[]>();
  for (const inc of incidentsForClustering) {
    const key = inc.attackType || 'unknown';
    if (!typeGroups.has(key)) typeGroups.set(key, []);
    typeGroups.get(key)!.push(inc);
  }

  const results: ClusterResult[] = [];
  for (const [attackType, typeIncidents] of typeGroups.entries()) {
    if (typeIncidents.length < minIncidentsPerCluster) continue;

    const groupId = `attack-${attackType.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const name = `Attack Type Cluster: ${attackType} (${typeIncidents.length} incidents)`;
    const metadata = computeClusterMetadata(typeIncidents);

    results.push({
      groupId,
      name,
      incidentIds: typeIncidents.map(i => i.incidentId),
      clusterMethod: 'attack_type',
      createdAt: new Date().toISOString(),
      metadata,
    });
  }

  return results;
}

export async function clusterIncidentsByMitreTechnique(
  minIncidentsPerCluster: number = 2
): Promise<ClusterResult[]> {
  const incidents = await getAllIncidents();
  const incidentsForClustering = incidents.map(parseStateForClustering);

  const techniqueGroups = new Map<string, IncidentForClustering[]>();
  for (const inc of incidentsForClustering) {
    const techniques = [...new Set([
      ...(inc.mitreTechniques ?? []),
      ...(inc.anomalySignals ?? []).map(s => s.mitreTechnique).filter((t): t is string => Boolean(t))
    ])];
for (const tech of techniques) {
    if (!techniqueGroups.has(tech)) techniqueGroups.set(tech as string, []);
    techniqueGroups.get(tech as string)!.push(inc);
  }
  }

  const results: ClusterResult[] = [];
  for (const [technique, techIncidents] of techniqueGroups.entries()) {
    if (techIncidents.length < minIncidentsPerCluster) continue;

    const uniqueIncidents = Array.from(new Map(techIncidents.map(i => [i.incidentId, i])).values());
    if (uniqueIncidents.length < minIncidentsPerCluster) continue;

    const groupId = `mitre-${technique.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const name = `MITRE Cluster: ${technique} (${uniqueIncidents.length} incidents)`;
    const metadata = computeClusterMetadata(uniqueIncidents);

    results.push({
      groupId,
      name,
      incidentIds: uniqueIncidents.map(i => i.incidentId),
      clusterMethod: 'mitre_technique',
      createdAt: new Date().toISOString(),
      metadata,
    });
  }

  return results;
}

export async function clusterIncidentsHybrid(
  options: {
    timeBucketHours?: number;
    minIncidentsPerCluster?: number;
  } = {}
): Promise<ClusterResult[]> {
  const { timeBucketHours = 24, minIncidentsPerCluster = 2 } = options;

  const [timeClusters, assetClusters, attackTypeClusters, mitreClusters] = await Promise.all([
    clusterIncidentsByTimeBucket(timeBucketHours, minIncidentsPerCluster),
    clusterIncidentsByAsset(minIncidentsPerCluster),
    clusterIncidentsByAttackType(minIncidentsPerCluster),
    clusterIncidentsByMitreTechnique(minIncidentsPerCluster),
  ]);

  return [
    ...timeClusters,
    ...assetClusters,
    ...attackTypeClusters,
    ...mitreClusters,
  ];
}

export async function saveClusterResults(clusters: ClusterResult[]): Promise<void> {
  const db = await getDatabase();
  for (const cluster of clusters) {
    await db.run(
      `INSERT INTO incident_groups (group_id, name, incident_ids, cluster_method, created_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET
         name = excluded.name,
         incident_ids = excluded.incident_ids,
         cluster_method = excluded.cluster_method,
         metadata_json = excluded.metadata_json`,
      [
        cluster.groupId,
        cluster.name,
        JSON.stringify(cluster.incidentIds),
        cluster.clusterMethod,
        cluster.createdAt,
        JSON.stringify(cluster.metadata),
      ]
    );
  }
}

export async function getAllClusterGroups(): Promise<any[]> {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT group_id, name, incident_ids, cluster_method, created_at, metadata_json
     FROM incident_groups
     ORDER BY created_at DESC`
  );
  return rows.map((r: any) => ({
    ...r,
    incidentIds: JSON.parse(r.incident_ids || '[]'),
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
  }));
}

export async function getClusterGroup(groupId: string): Promise<any | null> {
  const db = await getDatabase();
  const row = await db.get(
    `SELECT group_id, name, incident_ids, cluster_method, created_at, metadata_json
     FROM incident_groups
     WHERE group_id = ?`,
    [groupId]
  );
  if (!row) return null;
  return {
    ...row,
    incidentIds: JSON.parse(row.incident_ids || '[]'),
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
  };
}

export async function getIncidentsForGroup(groupId: string): Promise<any[]> {
  const group = await getClusterGroup(groupId);
  if (!group || !group.incidentIds.length) return [];

  const { getIncidentsByIds } = await import('../database/database.js');
  const incidents = await getIncidentsByIds(group.incidentIds);
  return incidents;
}

export async function generateGroupAnalysis(groupId: string): Promise<any> {
  const group = await getClusterGroup(groupId);
  if (!group) {
    throw new Error(`Group not found: ${groupId}`);
  }

  const incidents = await getIncidentsForGroup(groupId);
  const { getGroupedMetrics } = await import('./group-analysis.js');
  const metrics = await getGroupedMetrics(incidents);

  const timeline = incidents
    .map(inc => ({
      incidentId: inc.incidentId,
      timestamp: inc.createdAt,
      status: inc.status,
      threatScore: inc.threatScore,
      attackType: (() => {
        try {
          const state = typeof inc.state_json === 'string' ? JSON.parse(inc.state_json) : inc.state_json;
          return state.attackType || 'unknown';
        } catch { return 'unknown'; }
      })(),
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    groupId: group.groupId,
    name: group.name,
    clusterMethod: group.clusterMethod,
    incidentCount: group.incidentIds.length,
    metrics,
    timeline,
    incidents: incidents.map(inc => ({
      incidentId: inc.incidentId,
      status: inc.status,
      targetHost: inc.targetHost,
      threatScore: inc.threatScore,
      confidenceScore: inc.confidenceScore,
      createdAt: inc.createdAt,
    })),
  };
}