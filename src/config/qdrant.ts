import { QdrantClient } from '@qdrant/js-client-rest';

// Ensure environment variables are strictly enforced at runtime
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

if (!QDRANT_URL || !QDRANT_API_KEY) {
  throw new Error('CRITICAL: Missing QDRANT_URL or QDRANT_API_KEY in environment variables.');
}

// Initialize the single client instance
export const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
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
