import { qdrantClient, COLLECTIONS } from '../config/qdrant.js';
import { CohereClient } from 'cohere-ai';
import { getIncidentState } from '../database/database.js';

/**
 * Vector similarity correlation.
 *
 * NOTE: The `incident_knowledge` Qdrant collection is seeded with Cohere
 * `embed-english-v3.0` 1024-dimensional vectors (see `src/index.ts` and
 * `src/config/qdrant.ts`), so embeddings here MUST use the same model and
 * dimension. We search the collection with its single unnamed vector because
 * that is how the collection is created.
 */

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export interface SimilarIncident {
  incidentId: string;
  score: number;
  payload?: Record<string, any>;
}

/**
 * Generates a 1024-dim embedding for the given text using Cohere.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    throw new Error('Cannot create embedding for empty text');
  }

  const response = await cohere.embed({
    texts: [text],
    model: 'embed-english-v3.0',
    inputType: 'search_query',
  });

  const embeddings = response.embeddings as unknown as number[][];
  const embedding = Array.isArray(embeddings) ? embeddings[0] : (embeddings as unknown as number[]);

  if (!embedding) {
    throw new Error('Embedding generation returned no vectors');
  }

  return embedding;
}

/**
 * Builds an embedding vector for an incident from its root-cause hypothesis
 * and evidence chain summaries.
 */
export async function getIncidentVector(incidentId: string): Promise<number[]> {
  const incident = await getIncidentState(incidentId);
  if (!incident) throw new Error('Incident not found');

  const description = [
    incident.rootCauseHypothesis,
    ...incident.evidenceChain.map((e) => e.summary),
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');

  return createEmbedding(description);
}

/**
 * Finds incidents in the knowledge base whose descriptions are vector-similar
 * to the given incident. Excludes the incident itself and returns scored,
 * payload-bearing results.
 */
export async function findSimilarIncidentsByVector(
  incidentId: string,
  limit: number = 5,
  minScore: number = 0.5
): Promise<SimilarIncident[]> {
  const vector = await getIncidentVector(incidentId);

  const searchResult = await qdrantClient.search(COLLECTIONS.INCIDENT_KNOWLEDGE, {
    vector,
    limit: limit + 1, // +1 to allow excluding self
    score_threshold: minScore,
    with_payload: true,
  });

  return searchResult
    .filter((result) => (result.payload?.incident_id ?? result.id) !== incidentId)
    .map((result) => ({
      incidentId: (result.payload?.incident_id as string) ?? String(result.id),
      score: result.score,
      payload: result.payload as Record<string, any> | undefined,
    }));
}
