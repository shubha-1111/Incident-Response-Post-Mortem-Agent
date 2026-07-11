import { Kafka, Producer, Consumer, Admin } from 'kafkajs';

/**
 * Apache Kafka producer/consumer (OPTIONAL production event-streaming backend).
 *
 * The app runs fully in-process in development. Kafka is only used when
 * `USE_KAFKA=true`. Clients are constructed lazily and only connect on
 * `connectKafka()`, so importing this module is a no-op in SQLite mode.
 */

const USE_KAFKA = process.env.USE_KAFKA === 'true';
const BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

export const TOPICS = {
  THREAT_FEEDS: 'threat-feeds',
  INCIDENTS: 'incidents',
  IOC_LOOKUPS: 'ioc-lookups',
  ALERTS: 'alerts',
} as const;

const kafka = new Kafka({
  clientId: 'incident-response',
  brokers: BROKERS,
  ssl: process.env.KAFKA_SSL === 'true',
  sasl:
    process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD
      ? {
          mechanism: (process.env.KAFKA_SASL_MECHANISM as any) || 'plain',
          username: process.env.KAFKA_USERNAME,
          password: process.env.KAFKA_PASSWORD,
        }
      : undefined,
});

export const producer: Producer = kafka.producer();
export const consumer: Consumer = kafka.consumer({ groupId: 'incident-response-group' });

export function isKafkaEnabled(): boolean {
  return USE_KAFKA;
}

/** Connects producer + consumer. Call once during startup when Kafka is on. */
export async function connectKafka(): Promise<void> {
  await producer.connect();
  await consumer.connect();
  console.log('[kafka] Producer and consumer connected.');
}

/** Publishes a JSON event to a topic. */
export async function publishEvent(topic: string, value: unknown, key?: string): Promise<void> {
  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(value) }],
  });
}

/**
 * Subscribes to a topic and invokes `handler` per message. Must call
 * `connectKafka()` first.
 */
export async function subscribe(
  topic: string,
  handler: (payload: any) => Promise<void>
): Promise<void> {
  await consumer.subscribe({ topic, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        await handler(JSON.parse(message.value.toString()));
      } catch (err) {
        console.error(`[kafka] Handler error on topic ${topic}:`, err);
      }
    },
  });
}

/** Creates the canonical topics if they do not already exist. */
export async function ensureTopics(): Promise<void> {
  const admin: Admin = kafka.admin();
  await admin.connect();
  try {
    const existing = await admin.listTopics();
    const desired = [
      { topic: TOPICS.THREAT_FEEDS, numPartitions: 3, replicationFactor: 1 },
      { topic: TOPICS.INCIDENTS, numPartitions: 6, replicationFactor: 1 },
      { topic: TOPICS.IOC_LOOKUPS, numPartitions: 12, replicationFactor: 1 },
      { topic: TOPICS.ALERTS, numPartitions: 3, replicationFactor: 1 },
    ];
    const toCreate = desired.filter((d) => !existing.includes(d.topic));
    if (toCreate.length) {
      await admin.createTopics({ topics: toCreate });
      console.log(`[kafka] Created topics: ${toCreate.map((t) => t.topic).join(', ')}`);
    } else {
      console.log('[kafka] All topics already exist.');
    }
  } finally {
    await admin.disconnect();
  }
}

/** Disconnects producer + consumer. */
export async function disconnectKafka(): Promise<void> {
  await producer.disconnect();
  await consumer.disconnect();
}
