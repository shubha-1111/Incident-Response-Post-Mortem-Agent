export interface ConfidenceInput {
  abuseIpdb: boolean;
  virusTotal: boolean;
  mitreMapped: boolean;
  historicalMatch: number;
  embeddingSimilarity: number;
  llmConfidence: number;
}

export function calculateExecutionConfidence(sources: ConfidenceInput): number {
  let score = 0;
  
  if (sources.abuseIpdb) score += 20;
  if (sources.virusTotal) score += 15;
  if (sources.mitreMapped) score += 15;
  
  score += Math.min(20, (sources.historicalMatch || 0) * 20);
  score += Math.min(15, (sources.embeddingSimilarity || 0) * 15);
  score += Math.min(15, (sources.llmConfidence || 0) * 15);
  
  return Math.min(100, Math.round(score));
}
