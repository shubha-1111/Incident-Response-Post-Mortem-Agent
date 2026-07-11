import { findSimilarIncidentsByVector } from './vector-correlation.js';
import { saveCorrelation, cacheSimilarIncidents, getCachedSimilarIncidents, getSimilarIncidents } from '../database/correlation-db.js';

export { getCachedSimilarIncidents, getSimilarIncidents };

/**
 * Runs vector similarity correlation for an incident: persists the matched
 * correlations and caches the full result set for fast subsequent lookups.
 */
export async function runVectorCorrelation(incidentId: string): Promise<void> {
  const similarIncidents = await findSimilarIncidentsByVector(incidentId);

  for (const similar of similarIncidents) {
    await saveCorrelation(
      incidentId,
      similar.incidentId,
      similar.score,
      'vector',
      { method: 'cosine_similarity' }
    );
  }

  await cacheSimilarIncidents(incidentId, similarIncidents);
}
