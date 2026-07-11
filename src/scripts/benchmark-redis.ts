/**
 * Redis cache benchmark (Phase 0.2 verification).
 *
 * Run:  npm run redis:benchmark
 * Prereqs: USE_REDIS=true and a reachable Redis cluster (see docker-compose.yml).
 * Exercises the IOC cache path and reports throughput + p99 latency.
 */
import { getRedisCluster, isRedisEnabled, cacheIOC, getCachedIOC, closeRedisCluster } from '../config/redis.js';

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 2000);

async function main() {
  if (!isRedisEnabled()) {
    console.error('[redis:benchmark] USE_REDIS is not enabled. Aborting.');
    process.exit(1);
  }
  const cluster = getRedisCluster();
  await cluster.ping();
  console.log(`[redis:benchmark] Connected. Running ${ITERATIONS} SETEX/GET cycles...`);

  const sample = { verdict: 'PASS', score: 87, source: 'abuseipdb' };
  const latencies: number[] = [];
  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    const ioc = `192.0.2.${i % 255}`;
    const t0 = performance.now();
    await cacheIOC(ioc, sample, 3600);
    const got = (await getCachedIOC(ioc)) as { verdict: string } | null;
    const t1 = performance.now();
    if (!got || got.verdict !== 'PASS') throw new Error(`cache round-trip mismatch at ${i}`);
    latencies.push(t1 - t0);
  }
  const elapsed = performance.now() - start;

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const opsPerSec = Math.round((ITERATIONS * 2) / (elapsed / 1000));

  console.log(`[redis:benchmark] ${ITERATIONS} SETEX + GET in ${elapsed.toFixed(0)}ms`);
  console.log(`[redis:benchmark] throughput ~${opsPerSec} ops/sec (2 ops/iter)`);
  console.log(`[redis:benchmark] p50 latency ${p50.toFixed(2)}ms, p99 latency ${p99.toFixed(2)}ms`);

  await closeRedisCluster();
  process.exit(0);
}

main().catch((err) => {
  console.error('[redis:benchmark] Failed:', err);
  process.exit(1);
});
