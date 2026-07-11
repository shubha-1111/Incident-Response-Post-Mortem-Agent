export interface ThreatScoreInput {
  severity: string;
  mitreTechniques: string[];
  abuseIpConfidence?: number;
  virusTotalScore?: number;
  failedLoginCount?: number;
  assetCriticality: string;
  anomalyScore: number;
}

export function calculateThreatScore(input: ThreatScoreInput): { total: number; breakdown: Record<string, number> } {
  // 1. Log Severity (0 - 30)
  let severityScore = 5;
  const sev = String(input.severity).toLowerCase();
  if (sev === 'critical') severityScore = 30;
  else if (sev === 'high') severityScore = 20;
  else if (sev === 'medium') severityScore = 10;

  // 2. AbuseIPDB Confidence (0 - 20)
  const abuseIpScore = ((input.abuseIpConfidence ?? 0) / 100) * 20;

  // 3. VirusTotal Reputation Score (0 - 15)
  const virusTotalScore = Math.min(15, ((input.virusTotalScore ?? 0) / 10) * 15);

  // 4. MITRE ATT&CK Techniques mapping (0 - 10)
  const mitreScore = Math.min(10, (input.mitreTechniques?.length || 0) * 5);

  // 5. Failed Logins Count (0 - 15)
  const loginCountScore = Math.min(15, input.failedLoginCount ?? 0);

  // 6. Asset Criticality (0 - 10)
  let assetScore = 2;
  const asset = String(input.assetCriticality).toLowerCase();
  if (asset === 'high_impact') assetScore = 10;
  else if (asset === 'medium_impact') assetScore = 5;

  const total = Math.min(100, Math.round(
    severityScore + abuseIpScore + virusTotalScore + mitreScore + loginCountScore + assetScore
  ));

  return {
    total,
    breakdown: {
      severity: Math.round(severityScore),
      abuseIpdb: Math.round(abuseIpScore),
      virusTotal: Math.round(virusTotalScore),
      mitre: Math.round(mitreScore),
      failedLogins: Math.round(loginCountScore),
      assetCriticality: Math.round(assetScore)
    }
  };
}
