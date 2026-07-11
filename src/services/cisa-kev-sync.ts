import { cacheIOC, isRedisEnabled } from '../config/redis.js';

export async function syncCISAKEV(): Promise<void> {
  if (!isRedisEnabled()) {
    console.log('[CISA KEV] Skipping sync - Redis not enabled');
    return;
  }
  try {
    const response = await fetch('https://www.cisa.gov/known-exploited-vulnerabilities-catalog.json');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    for (const vuln of data.vulnerabilities) {
      await cacheIOC(vuln.cveID, {
        source: 'CISA_KEV',
        description: vuln.vulnerabilityName,
        dueDate: vuln.dueDate,
        knownRansomwareCampaignUse: vuln.knownRansomwareCampaignUse,
      }, 86400);
    }
    console.log(`Synced ${data.vulnerabilities.length} CISA KEV entries`);
  } catch (error) {
    console.error('CISA KEV sync failed:', error);
  }
}