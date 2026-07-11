import { producer, TOPICS } from '../config/kafka.js';
import { cacheIOC, getCachedIOC } from '../config/redis.js';
import { BloomFilter } from './bloom-filter.js';
import { EnrichedIOC } from './misp-service.js';

const BLOOM_FILTER_SIZE = 1000000;
const bloomFilter = new BloomFilter(BLOOM_FILTER_SIZE);

export interface IOCInfo {
  value: string;
  type: string;
}

export interface IOCResult {
  ioc: string;
  iocType: string;
  enriched?: EnrichedIOC;
  cached: boolean;
  sources?: string[];
  threatScore?: number;
}

export async function processIOC(ioc: string, iocType: string): Promise<IOCResult> {
  if (bloomFilter.has(ioc)) {
    const cached = await getCachedIOC(ioc);
    if (cached && typeof cached === 'object' && cached !== null) {
      const enriched = cached as EnrichedIOC;
      return {
        ioc,
        iocType,
        enriched,
        cached: true,
        sources: enriched.sources,
        threatScore: enriched.threatScore,
      };
    }
  }

  const enriched = await enrichIOC(ioc, iocType);
  bloomFilter.add(ioc);
  await cacheIOC(ioc, enriched, 3600);

  await producer.send({
    topic: TOPICS.IOC_LOOKUPS,
    messages: [{
      key: ioc,
      value: JSON.stringify({ ioc, iocType, enriched }),
    }],
  });

  return { ioc, iocType, enriched, cached: false };
}

async function enrichIOC(ioc: string, iocType: string): Promise<EnrichedIOC> {
  const enrichment: EnrichedIOC = {
    ioc,
    iocType,
    sources: [],
    threatScore: 0,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };

  const enrichments = await Promise.allSettled([
    enrichFromVirusTotal(ioc, iocType),
    enrichFromAbuseIPDB(ioc, iocType),
    enrichFromOTX(ioc, iocType),
    enrichFromShodan(ioc, iocType),
  ]);

  for (const result of enrichments) {
    if (result.status === 'fulfilled' && result.value) {
      enrichment.sources.push(result.value.source);
      enrichment.threatScore = Math.max(enrichment.threatScore, result.value.score || 0);
      enrichment.threatDetails = { ...(enrichment.threatDetails || {}), ...result.value.details };
    }
  }

  return enrichment;
}

async function enrichFromVirusTotal(ioc: string, iocType: string): Promise<any> {
  if (!process.env.VIRUSTOTAL_API_KEY) return { source: 'VirusTotal', score: 0, error: 'No API key' };
  try {
    const response = await fetch(`https://www.virustotal.com/api/v3/${iocType}s/${ioc}`, {
      headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY },
    });
    if (!response.ok) throw new Error(`VT ${response.status}`);
    const data = await response.json();
    const stats = data.data.attributes.last_analysis_stats;
    const total = Math.max(1, stats.harmless + stats.malicious + stats.undetected + stats.suspicious);
    return {
      source: 'VirusTotal',
      score: stats.malicious / total,
      details: data.data.attributes,
    };
  } catch (error) {
    return { source: 'VirusTotal', score: 0, error: 'Failed to enrich' };
  }
}

async function enrichFromAbuseIPDB(ioc: string, iocType: string): Promise<any> {
  if (iocType !== 'ip') return { source: 'AbuseIPDB', score: 0 };
  if (!process.env.ABUSEIPDB_API_KEY) return { source: 'AbuseIPDB', score: 0, error: 'No API key' };
  try {
    const response = await fetch('https://api.abuseipdb.com/api/v2/check', {
      method: 'POST',
      headers: { 'Key': process.env.ABUSEIPDB_API_KEY },
      body: JSON.stringify({ ipAddress: ioc, maxAgeInDays: 90 }),
    });
    const data = await response.json();
    return {
      source: 'AbuseIPDB',
      score: data.data.abuseConfidenceScore / 100,
      details: data.data,
    };
  } catch (error) {
    return { source: 'AbuseIPDB', score: 0, error: 'Failed to enrich' };
  }
}

async function enrichFromOTX(ioc: string, iocType: string): Promise<any> {
  try {
    const response = await fetch(`https://otx.alienvault.com/api/v1/indicators/${ioc}`, {
      headers: { 'X-OTX-API-Key': process.env.OTX_API_KEY || 'mock-key' },
    });
    if (!response.ok) throw new Error(`OTX ${response.status}`);
    const data = await response.json();
    return {
      source: 'OTX',
      score: data.pulse_info ? Math.min(1, data.pulse_info.count / 100) : 0,
      details: data,
    };
  } catch (error) {
    return { source: 'OTX', score: 0, error: 'Failed to enrich' };
  }
}

async function enrichFromShodan(ioc: string, iocType: string): Promise<any> {
  if (iocType !== 'ip') return { source: 'Shodan', score: 0 };
  try {
    const response = await fetch(`https://api.shodan.io/shodan/host/${ioc}`, {
      headers: { 'X-Shodan-API-Key': process.env.SHODAN_API_KEY || 'mock-key' },
    });
    if (!response.ok) throw new Error(`Shodan ${response.status}`);
    const data = await response.json();
    return {
      source: 'Shodan',
      score: Math.min(1, (data.tags?.length || 0) / 20),
      details: data,
    };
  } catch (error) {
    return { source: 'Shodan', score: 0, error: 'Failed to enrich' };
  }
}

export async function processIocsBatch(iocs: string[]): Promise<IOCResult[]> {
  const results: IOCResult[] = [];
  for (const ioc of iocs) {
    const iocType = detectIOCType(ioc);
    const result = await processIOC(ioc, iocType);
    results.push(result);
  }
  return results;
}

function detectIOCType(value: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return 'ip';
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return 'domain';
  if (/^[a-fA-F0-9]{32}$/.test(value)) return 'hash';
  if (/^[a-fA-F0-9]{40}$/.test(value)) return 'hash';
  if (/^[a-fA-F0-9]{64}$/.test(value)) return 'hash';
  if (/^mailto:|^[\w.+]+@[\w.-]+\.\w+$/i.test(value)) return 'email';
  if (/^https?:\/\//i.test(value)) return 'url';
  return 'unknown';
}