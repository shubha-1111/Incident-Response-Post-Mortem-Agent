import {
  insertPrediction as dbInsertPrediction,
  insertActualOutcome as dbInsertActualOutcome,
  getPredictionOutcomesJoined,
} from '../database/database.js';

export interface PredictionRecord {
  predictionId: string;
  incidentId: string;
  modelVersion: string;
  predictedLabel: string;
  confidenceScore: number;
  predictedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ActualOutcomeRecord {
  predictionId: string;
  actualLabel: string;
  observedAt: string;
  validatedBy?: string;
}

export interface AccuracyMetrics {
  totalPredictions: number;
  totalResolved: number;
  accuracy: number;
  precisionByLabel: Record<string, number>;
  recallByLabel: Record<string, number>;
  f1ByLabel: Record<string, number>;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  weightedPrecision: number;
  weightedRecall: number;
  weightedF1: number;
  predictionsPerDay: Array<{ day: string; count: number }>;
  avgConfidence: number;
}

export async function recordPrediction(input: {
  predictionId: string;
  incidentId: string;
  modelVersion: string;
  predictedLabel: string;
  confidenceScore: number;
  metadata?: Record<string, unknown>;
}): Promise<PredictionRecord> {
  const record: PredictionRecord = {
    predictionId: input.predictionId,
    incidentId: input.incidentId,
    modelVersion: input.modelVersion,
    predictedLabel: input.predictedLabel,
    confidenceScore: input.confidenceScore,
    predictedAt: new Date().toISOString(),
    metadata: input.metadata,
  };
  await dbInsertPrediction(
    input.predictionId,
    input.incidentId,
    input.modelVersion,
    input.predictedLabel,
    input.confidenceScore,
    input.metadata
  );
  return record;
}

export async function recordActualOutcome(input: {
  predictionId: string;
  actualLabel: string;
  validatedBy?: string;
}): Promise<ActualOutcomeRecord> {
  const record: ActualOutcomeRecord = {
    predictionId: input.predictionId,
    actualLabel: input.actualLabel,
    observedAt: new Date().toISOString(),
    validatedBy: input.validatedBy,
  };
  await dbInsertActualOutcome(input.predictionId, input.actualLabel, input.validatedBy);
  return record;
}

export async function calculateAccuracyMetrics(options?: {
  modelVersion?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AccuracyMetrics> {
  const allPredictions = await getPredictionOutcomesJoined(options);

  const totalPredictions = allPredictions.length;
  const resolvedPredictions = allPredictions.filter((p) => p.actualLabel);
  const totalResolved = resolvedPredictions.length;

  const correctPredictions = resolvedPredictions.filter(
    (p) => p.predictedLabel === p.actualLabel
  ).length;

  const accuracy = totalResolved > 0
    ? Math.round((correctPredictions / totalResolved) * 100) / 100
    : 0;

  const labels = [...new Set([
    ...resolvedPredictions.map((p) => p.predictedLabel),
    ...resolvedPredictions.map((p) => p.actualLabel!),
  ])].sort();

  const precisionByLabel: Record<string, number> = {};
  const recallByLabel: Record<string, number> = {};
  const f1ByLabel: Record<string, number> = {};

  for (const label of labels) {
    const tp = resolvedPredictions.filter(
      (p) => p.predictedLabel === label && p.actualLabel === label
    ).length;
    const fp = resolvedPredictions.filter(
      (p) => p.predictedLabel === label && p.actualLabel !== label
    ).length;
    const fn = resolvedPredictions.filter(
      (p) => p.predictedLabel !== label && p.actualLabel === label
    ).length;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    precisionByLabel[label] = Math.round(precision * 100) / 100;
    recallByLabel[label] = Math.round(recall * 100) / 100;
    f1ByLabel[label] = Math.round(f1 * 100) / 100;
  }

  const macroPrecision = labels.length > 0
    ? Object.values(precisionByLabel).reduce((a, b) => a + b, 0) / labels.length
    : 0;
  const macroRecall = labels.length > 0
    ? Object.values(recallByLabel).reduce((a, b) => a + b, 0) / labels.length
    : 0;
  const macroF1 = labels.length > 0
    ? Object.values(f1ByLabel).reduce((a, b) => a + b, 0) / labels.length
    : 0;

  const predictionsPerDayMap = new Map<string, number>();
  for (const p of allPredictions) {
    const day = p.predictedAt.split('T')[0];
    predictionsPerDayMap.set(day, (predictionsPerDayMap.get(day) || 0) + 1);
  }

  const predictionsPerDay = Array.from(predictionsPerDayMap.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const avgConfidence = allPredictions.length > 0
    ? Math.round((allPredictions.reduce((sum, p) => sum + p.confidenceScore, 0) / allPredictions.length) * 100) / 100
    : 0;

  return {
    totalPredictions,
    totalResolved,
    accuracy,
    precisionByLabel,
    recallByLabel,
    f1ByLabel,
    macroPrecision: Math.round(macroPrecision * 100) / 100,
    macroRecall: Math.round(macroRecall * 100) / 100,
    macroF1: Math.round(macroF1 * 100) / 100,
    weightedPrecision: Math.round(macroPrecision * 100) / 100,
    weightedRecall: Math.round(macroRecall * 100) / 100,
    weightedF1: Math.round(macroF1 * 100) / 100,
    predictionsPerDay,
    avgConfidence,
  };
}