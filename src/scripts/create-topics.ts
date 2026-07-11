/**
 * Creates the canonical Kafka topics defined in src/config/kafka.ts.
 *
 * Run:  npm run kafka:topics
 * Prereqs: USE_KAFKA=true, KAFKA_BROKERS reachable. A running Kafka broker
 * (see docker-compose.yml) is required.
 */
import { ensureTopics, isKafkaEnabled } from '../config/kafka.js';

async function main(): Promise<void> {
  if (!isKafkaEnabled()) {
    console.error('[kafka:topics] USE_KAFKA is not enabled. Aborting.');
    process.exit(1);
  }
  await ensureTopics();
  console.log('[kafka:topics] Topic provisioning complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[kafka:topics] Failed:', err);
  process.exit(1);
});
