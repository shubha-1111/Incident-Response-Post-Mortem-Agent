export interface EnrichedIOC {
  ioc: string;
  iocType: string;
  sources: string[];
  threatScore: number;
  firstSeen: string;
  lastSeen: string;
  threatDetails?: any;
}

export interface STIXIndicator {
  id: string;
  pattern: string;
  valid_from: string;
  valid_until?: string;
  labels?: string[];
  confidence?: number;
}

let Taxii2ClientClass: any;
try {
  Taxii2ClientClass = require('taxii2-client').Taxii2Client;
} catch {
  Taxii2ClientClass = null;
}

class TAXIIEnrichmentService {
  private client: any;

  constructor() {
    if (!Taxii2ClientClass) {
      this.client = null;
      console.warn('[TAXII] Module not available; service will return empty results');
      return;
    }
    this.client = new Taxii2ClientClass({
      server: process.env.STIX_TAXII_SERVER || '',
      username: process.env.STIX_TAXII_USERNAME,
      password: process.env.STIX_TAXII_PASSWORD,
    });
  }

  async syncTAXIIFeeds(): Promise<void> {
    if (!this.client) return;
    try {
      const collections = await this.client.getCollections();
      console.log(`Found ${collections.length} TAXII collections`);

      for (const collection of collections) {
        await this.syncCollection(collection.id);
      }
    } catch (error) {
      console.error('TAXII sync failed:', error);
    }
  }

  async syncCollection(collectionId: string): Promise<void> {
    if (!this.client) return;
    try {
      const { objects } = await this.client.getObjects(collectionId);
      console.log(`Processing ${objects.objects.length} objects from collection ${collectionId}`);

      for (const object of objects.objects) {
        if (object.type === 'indicator') {
          await this.processSTIXIndicator(object);
        }
      }
    } catch (error) {
      console.error(`Failed to sync collection ${collectionId}:`, error);
    }
  }

  async processSTIXIndicator(indicator: any): Promise<void> {
    const iocs = this.extractIOCsFromPattern(indicator.pattern);
    const cacheIOC = (await import('../config/redis.js')).cacheIOC;
    
    for (const ioc of iocs) {
      const enriched: EnrichedIOC = {
        ioc: ioc.value,
        iocType: ioc.type,
        sources: ['TAXII'],
        threatScore: indicator.confidence ? indicator.confidence / 100 : 0.7,
        firstSeen: indicator.valid_from,
        lastSeen: indicator.valid_until || indicator.valid_from,
        threatDetails: {
          stixId: indicator.id,
          labels: indicator.labels,
          pattern: indicator.pattern,
          validUntil: indicator.valid_until,
        },
      };

      await cacheIOC(ioc.value, enriched, 3600);
    }
  }

  extractIOCsFromPattern(pattern: string): Array<{ type: string; value: string }> {
    const iocs: Array<{ type: string; value: string }> = [];

    const ipv4Matches = pattern.match(/\[ipv4-addr:value = '([^']+)'\]/g) || [];
    for (const match of ipv4Matches) {
      const value = match.match(/'([^']+)'/)?.[1];
      if (value) iocs.push({ type: 'ip', value });
    }

    const domainMatches = pattern.match(/\[domain-name:value = '([^']+)'\]/g) || [];
    for (const match of domainMatches) {
      const value = match.match(/'([^']+)'/)?.[1];
      if (value) iocs.push({ type: 'domain', value });
    }

    const sha256Matches = pattern.match(/\[file:hashes.'SHA-256' = '([^']+)'\]/g) || [];
    for (const match of sha256Matches) {
      const value = match.match(/'([^']+)'/)?.[1];
      if (value) iocs.push({ type: 'hash', value });
    }

    const emailMatches = pattern.match(/\[email-addr:value = '([^']+)'\]/g) || [];
    for (const match of emailMatches) {
      const value = match.match(/'([^']+)'/)?.[1];
      if (value) iocs.push({ type: 'email', value });
    }

    return iocs;
  }
}

export const taxiiService = new TAXIIEnrichmentService();

export default taxiiService;