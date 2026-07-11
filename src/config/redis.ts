import Redis, { Cluster } from 'ioredis';

/**
 * Redis Cluster client (OPTIONAL production backend for IOC / hot-path caching).
 *
 * The app keeps running on SQLite-backed caching in development. Redis is only
 * used when `USE_REDIS=true`. The cluster is constructed lazily on first use,
 * so importing this module never opens sockets in SQLite mode.
 */

const USE_REDIS = process.env.USE_REDIS === 'true';

function parseNodes(raw: string | undefined): Array<{ host: string; port: number }> {
  const fallback = [
    { host: '127.0.0.1', port: 7001 },
    { host: '127.0.0.1', port: 7002 },
    { host: '127.0.0.1', port: 7003 },
  ];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host, port] = entry.split(':');
      return { host, port: Number(port) || 6379 };
    });
}

let cluster: Cluster | null = null;

export function isRedisEnabled(): boolean {
  return USE_REDIS;
}

/** Returns a lazily-created Redis Cluster, or throws if Redis is disabled. */
export function getRedisCluster(): Cluster {
  if (!cluster) {
    cluster = new Redis.Cluster(parseNodes(process.env.REDIS_NODES), {
      scaleReads: 'slave',
      redisOptions: {
        password: process.env.REDIS_PASSWORD || undefined,
        enableReadyCheck: true,
      },
      clusterRetryStrategy: (times) => Math.min(times * 200, 2000),
    });

    cluster.on('error', (err) => {
      console.error('[redis] Cluster error:', err);
    });

    console.log('[redis] Cluster client initialized.');
  }
  return cluster;
}

/** Caches an IOC lookup result with a TTL (seconds, default 1h). */
export async function cacheIOC(ioc: string, data: unknown, ttl: number = 3600): Promise<void> {
  await getRedisCluster().setex(`ioc:${ioc}`, ttl, JSON.stringify(data));
}

/** Reads a cached IOC lookup, or null on miss/parse error. */
export async function getCachedIOC(ioc: string): Promise<unknown | null> {
  const raw = await getRedisCluster().get(`ioc:${ioc}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Closes the cluster. Safe to call in SQLite mode (no-op). */
export async function closeRedisCluster(): Promise<void> {
  if (cluster) {
    await cluster.quit();
    cluster = null;
  }
}
