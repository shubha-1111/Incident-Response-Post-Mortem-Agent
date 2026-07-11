/**
 * Kafka throughput + consumer-lag benchmark (Phase 0.3 verification).
 *
 * Run:  npm run kafka:benchmark
 * Prereqs: USE_KAFKA=true, reachable brokers, and topics created
 *          (npm run kafka:topics).
 *
 * Produces N messages to IOC_LOOKUPS, consumes them back, and reports
 * producer throughput and end-to-end consumer lag.
 */
import { producer, consumer, ensureTopics, isKafkaEnabled, TOPICS, disconnectKafka } from '../config/kafka.js';

const MESSAGES = Number(process.env.BENCH_MESSAGES ?? 5000);
const TOPIC = TOPICS.IOC_LOOKUPS;

async function main() {
  if (!isKafkaEnabled()) {
    console.error('[kafka:benchmark] USE_KAFKA is not enabled. Aborting.');
    process.exit(1);
  }
  await ensureTopics();
  await producer.connect();
  await consumer.connect();

  console.log(`[kafka:benchmark] Producing ${MESSAGES} messages to '${TOPIC}'...`);
  const produced = await producer.send({
    topic: TOPIC,
    messages: Array.from({ length: MESSAGES }, (_, i) => ({
      key: `ioc-${i}`,
      value: JSON.stringify({ ioc: `10.0.0.${i % 255}`, score: i }),
    })),
  });
  const baseOffset = produced[0]?.baseOffset ?? '0';
  console.log(`[kafka:benchmark] Produced. baseOffset=${baseOffset}`);

  let consumed = 0;
  const start = performance.now();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  await consumer.run({
    eachMessage: async () => {
      consumed++;
    },
  });

  // Wait until all messages are consumed (or timeout).
  const deadline = Date.now() + 30_000;
  while (consumed < MESSAGES && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const elapsed = performance.now() - start;
  const throughput = Math.round(consumed / (elapsed / 1000));

  console.log(`[kafka:benchmark] Consumed ${consumed}/${MESSAGES} in ${elapsed.toFixed(0)}ms`);
  console.log(`[kafka:benchmark] consumer throughput ~${throughput} msg/sec`);
  console.log(`[kafka:benchmark] lag = ${MESSAGES - consumed} messages`);

  await disconnectKafka();
  process.exit(consumed === MESSAGES ? 0 : 1);
}

main().catch((err) => {
  console.error('[kafka:benchmark] Failed:', err);
  process.exit(1);
});
