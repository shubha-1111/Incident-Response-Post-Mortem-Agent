import { QdrantClient } from '@qdrant/js-client-rest';

// Lazily construct the client on first actual use instead of at module import
// time. Throwing during `import` happens before any try/catch in the app can
// run (e.g. in index.ts's bootstrapDatabase), which crashes the entire
// process on boot -- including the HTTP server -- before it can even answer a
// healthcheck. Deferring the check means a missing/misconfigured credential
// only breaks the Qdrant-dependent call site (which already has error
// handling), not the whole app.
let _client: QdrantClient | null = null;

function getRealClient(): QdrantClient {
  if (_client) return _client;

  const QDRANT_URL = process.env.QDRANT_URL;
  const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

  if (!QDRANT_URL || !QDRANT_API_KEY) {
    throw new Error('CRITICAL: Missing QDRANT_URL or QDRANT_API_KEY in environment variables.');
  }

  _client = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });
  return _client;
}

// Proxy so all existing call sites (`qdrantClient.search(...)`,
// `qdrantClient.upsert(...)`, etc.) keep working unchanged, while the
// underlying client -- and its env var validation -- is created lazily on
// first property access.
export const qdrantClient: QdrantClient = new Proxy({} as QdrantClient, {
  get(_target, prop, _receiver) {
    const client = getRealClient() as any;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const COLLECTIONS = {
  INCIDENT_KNOWLEDGE: 'incident_knowledge',
  FORENSIC_EVENTS: 'forensic_events',
} as const;

/**
 * Bootstraps the required Qdrant collections with optimal distance metrics and indexes.
 * Idempotent: only creates collections that don't already exist. Never deletes
 * existing collections — data (learned postmortems, forensic events) must
 * survive service restarts.
 */
export async function initializeCollections(): Promise<void> {
  try {
    const existingCollections = await qdrantClient.getCollections();
    const names = existingCollections.collections.map((c) => c.name);

    // 1. Initialize Incident Knowledge Base Collection (only if missing)
    if (!names.includes(COLLECTIONS.INCIDENT_KNOWLEDGE)) {
      await qdrantClient.createCollection(COLLECTIONS.INCIDENT_KNOWLEDGE, {
        vectors: {
          size: 1024,
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
      });
      console.log(`[Qdrant] Created collection: ${COLLECTIONS.INCIDENT_KNOWLEDGE}`);
    } else {
      console.log(`[Qdrant] Collection already exists, keeping data: ${COLLECTIONS.INCIDENT_KNOWLEDGE}`);
    }

    // 2. Initialize Forensic Events Collection (only if missing)
    if (!names.includes(COLLECTIONS.FORENSIC_EVENTS)) {
      await qdrantClient.createCollection(COLLECTIONS.FORENSIC_EVENTS, {
        vectors: {
          size: 1024,
          distance: 'Cosine',
        },
      });

      // Create payload index for timestamp to support temporal ordering filtering
      await qdrantClient.createPayloadIndex(COLLECTIONS.FORENSIC_EVENTS, {
        field_name: 'timestamp',
        field_schema: 'integer',
        wait: true,
      });

      // Create payload index for host targeting during RCA lookup loops
      await qdrantClient.createPayloadIndex(COLLECTIONS.FORENSIC_EVENTS, {
        field_name: 'host',
        field_schema: 'keyword',
        wait: true,
      });

      // Create payload index for TTL-based 90-day retention enforcement
      await qdrantClient.createPayloadIndex(COLLECTIONS.FORENSIC_EVENTS, {
        field_name: 'expires_at',
        field_schema: 'integer',
        wait: true,
      });

      // Create payload index for deterministic temporal ordering during RCA queries
      await qdrantClient.createPayloadIndex(COLLECTIONS.FORENSIC_EVENTS, {
        field_name: 'sequence_no',
        field_schema: 'integer',
        wait: true,
      });

      console.log(`[Qdrant] Created collection and indexes for: ${COLLECTIONS.FORENSIC_EVENTS}`);
    } else {
      console.log(`[Qdrant] Collection already exists, keeping data: ${COLLECTIONS.FORENSIC_EVENTS}`);
    }
  } catch (error) {
    console.error('[Qdrant] Critical failure initializing vector collections:', error);
    throw error;
  }
}

export async function collectionExists(name: string): Promise<boolean> {
  const existingCollections = await qdrantClient.getCollections();
  return existingCollections.collections.some((collection) => collection.name === name);
}
