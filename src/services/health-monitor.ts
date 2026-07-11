import { getDatabase } from '../database/database.js';
import { qdrantClient } from '../config/qdrant.js';
import { getActiveSocketCount } from '../api/websocket.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded' | 'ready';

export interface SystemHealthReport {
  sqlite: HealthStatus;
  qdrant: HealthStatus;
  otel: HealthStatus;
  websocket: HealthStatus;
  threatFeeds: HealthStatus;
  workflow: HealthStatus;
  timestamp: string;
}

let lastHealthReport: SystemHealthReport | null = null;

export function getLastHealthReport(): SystemHealthReport | null {
  return lastHealthReport;
}

async function pingSqlite(): Promise<HealthStatus> {
  try {
    const db = await getDatabase();
    await db.get('SELECT 1 as ok');
    return 'healthy';
  } catch {
    return 'unhealthy';
  }
}

async function pingQdrant(): Promise<HealthStatus> {
  try {
    await qdrantClient.getCollections();
    return 'healthy';
  } catch {
    return 'unhealthy';
  }
}

function pingOtel(): HealthStatus {
  const hasService = Boolean(process.env.OTEL_SERVICE_NAME);
  const hasEndpoint = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  return hasService && hasEndpoint ? 'healthy' : 'unhealthy';
}

function pingWebSocket(): HealthStatus {
  return getActiveSocketCount() >= 0 ? 'healthy' : 'unhealthy';
}

async function pingThreatFeeds(): Promise<HealthStatus> {
  try {
    const db = await getDatabase();
    const row = await db.get(
      `SELECT COUNT(*) as count FROM threat_intel_cache WHERE expires_at > ?`,
      [new Date().toISOString()]
    );
    if ((row?.count ?? 0) > 0) return 'healthy';

    // No cache yet — check if CISA KEV feed URL is reachable
    const feedUrl = process.env.CISA_KEV_FEED_URL ||
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(feedUrl, { signal: controller.signal });
      return res.ok ? 'healthy' : 'degraded';
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return 'degraded';
  }
}

export async function checkSystemHealth(): Promise<SystemHealthReport> {
  const [sqlite, qdrant, threatFeeds] = await Promise.all([
    pingSqlite(),
    pingQdrant(),
    pingThreatFeeds(),
  ]);

  const report: SystemHealthReport = {
    sqlite,
    qdrant,
    otel: pingOtel(),
    websocket: pingWebSocket(),
    threatFeeds,
    workflow: 'ready',
    timestamp: new Date().toISOString(),
  };

  lastHealthReport = report;
  return report;
}

export function startHealthMonitor(intervalMs = 30_000): NodeJS.Timeout {
  const runCheck = async () => {
    try {
      const report = await checkSystemHealth();
      eventBus.emit(IncidentEventType.SYSTEM_HEALTH, report);
    } catch (err: any) {
      console.error('[Health Monitor] Check failed:', err.message);
    }
  };

  runCheck();
  const interval = setInterval(runCheck, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  console.log(`[Health Monitor] Deep health pings active (every ${intervalMs / 1000}s)`);
  return interval;
}
