import { getPredictionOutcomesJoined } from '../database/database.js';

export type ConfusionMatrix = {
  labels: string[];
  matrix: number[][];
  truePositives: Record<string, number>;
  falsePositives: Record<string, number>;
  falseNegatives: Record<string, number>;
  trueNegatives: Record<string, number>;
};

export async function generateConfusionMatrix(options?: {
  modelVersion?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ConfusionMatrix> {
  const predictions = await getPredictionOutcomesJoined(options);
  const resolvedPredictions = predictions.filter((p) => p.actualLabel !== undefined);

  const predictedLabels = resolvedPredictions.map((p) => p.predictedLabel);
  const actualLabels = resolvedPredictions.map((p) => p.actualLabel!);
  const labels = [...new Set([...predictedLabels, ...actualLabels])].sort();

  const labelIndex = (label: string) => labels.indexOf(label);

  const matrix: number[][] = labels.map(() => labels.map(() => 0));
  const truePositives: Record<string, number> = {};
  const falsePositives: Record<string, number> = {};
  const falseNegatives: Record<string, number> = {};
  const trueNegatives: Record<string, number> = {};

  for (const label of labels) {
    truePositives[label] = 0;
    falsePositives[label] = 0;
    falseNegatives[label] = 0;
    trueNegatives[label] = 0;
  }

  for (const { predictedLabel, actualLabel } of resolvedPredictions) {
    const actualIdx = labelIndex(actualLabel!);
    const predIdx = labelIndex(predictedLabel);
    matrix[actualIdx][predIdx]++;
  }

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    truePositives[label] = matrix[i][i];
    falsePositives[label] = matrix.map((row) => row[i]).reduce((sum, val) => sum + val, 0) - matrix[i][i];
    falseNegatives[label] = matrix[i].reduce((sum, val) => sum + val, 0) - matrix[i][i];
    const totalSum = matrix.flat().reduce((sum, val) => sum + val, 0);
    const colSum = matrix.map((row) => row[i]).reduce((sum, val) => sum + val, 0);
    const rowSum = matrix[i].reduce((sum, val) => sum + val, 0);
    trueNegatives[label] = totalSum - colSum - rowSum + matrix[i][i];
  }

  return {
    labels,
    matrix,
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
  };
}

export function getPrecision(matrix: ConfusionMatrix, label: string): number {
  const tp = matrix.truePositives[label] || 0;
  const fp = matrix.falsePositives[label] || 0;
  return tp + fp > 0 ? Math.round((tp / (tp + fp)) * 100) / 100 : 0;
}

export function getRecall(matrix: ConfusionMatrix, label: string): number {
  const tp = matrix.truePositives[label] || 0;
  const fn = matrix.falseNegatives[label] || 0;
  return tp + fn > 0 ? Math.round((tp / (tp + fn)) * 100) / 100 : 0;
}

export function getF1Score(matrix: ConfusionMatrix, label: string): number {
  const precision = getPrecision(matrix, label);
  const recall = getRecall(matrix, label);
  return precision + recall > 0 ? Math.round((2 * precision * recall / (precision + recall)) * 100) / 100 : 0;
}