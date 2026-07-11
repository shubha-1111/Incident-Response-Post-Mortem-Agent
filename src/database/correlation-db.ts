import * as sqliteBackend from './correlation-sqlite.js';
import * as pgBackend from './correlation-postgres.js';
import { isPostgresEnabled } from '../config/postgres.js';

const backend = isPostgresEnabled() ? pgBackend : sqliteBackend;

export const saveCorrelation = backend.saveCorrelation;
export const cacheSimilarIncidents = backend.cacheSimilarIncidents;
export const getCachedSimilarIncidents = backend.getCachedSimilarIncidents;
export const getSimilarIncidents = backend.getSimilarIncidents;