export interface MISPEvent {
  id: number;
  info: string;
  threat_level_id: string;
  analysis: string;
  date: string;
  Attribute?: MISPAttribute[];
}

export interface MISPAttribute {
  id: number;
  type: string;
  value: string;
  comment: string;
  to_ids: boolean;
  timestamp: string;
}

export interface EnrichedIOC {
  ioc: string;
  iocType: string;
  sources: string[];
  threatScore: number;
  firstSeen: string;
  lastSeen: string;
  threatDetails?: any;
}

class MISPService {
  private client: any;

  constructor() {
    try {
      const MISP = require('misp-js').MISP;
      this.client = new MISP(process.env.MISP_URL || 'https://misp.local', process.env.MISP_API_KEY || '');
    } catch {
      this.client = null;
      console.warn('[MISP] Module not available; service will return empty results');
    }
  }

  async syncMISPEvents(): Promise<MISPEvent[]> {
    if (!this.client) return [];
    try {
      const events = await this.client.events();
      console.log(`Synced ${events.length} MISP events`);
      return events;
    } catch (error) {
      console.error('MISP sync failed:', error);
      return [];
    }
  }

  async getEvent(eventId: number): Promise<MISPEvent | null> {
    if (!this.client) return null;
    try {
      return await this.client.getEvent(eventId);
    } catch (error) {
      console.error(`Failed to get MISP event ${eventId}:`, error);
      return null;
    }
  }

  async publishThreatIntelEvent(event: any): Promise<any> {
    if (!this.client) throw new Error('MISP client not configured');
    try {
      return await this.client.addEvent(event);
    } catch (error) {
      console.error('Failed to publish to MISP:', error);
      throw error;
    }
  }

  mapMISPTypeToIOCType(mispType: string): string | null {
    const mapping: Record<string, string> = {
      'ip-dst': 'ip',
      'ip-src': 'ip',
      'domain': 'domain',
      'hostname': 'domain',
      'url': 'url',
      'md5': 'hash',
      'sha256': 'hash',
      'email': 'email',
      'email-subject': 'email-subject',
      'user-agent': 'user-agent',
      'filename': 'filename',
      'vulnerability': 'vulnerability',
      'malware-samples': 'malware-sample',
      'target-email': 'email',
      'attachment': 'attachment',
      'link': 'link',
    };
    return mapping[mispType] || null;
  }

  extractIOCsFromEvent(event: MISPEvent): Array<{ type: string; value: string; comment: string; threatLevel: string }> {
    if (!event.Attribute) return [];
    return event.Attribute
      .filter(attr => attr.to_ids && this.mapMISPTypeToIOCType(attr.type))
      .map(attr => ({
        type: this.mapMISPTypeToIOCType(attr.type) as string,
        value: attr.value,
        comment: attr.comment,
        threatLevel: event.threat_level_id,
      }));
  }

  async processEventForThreatIntel(event: MISPEvent): Promise<EnrichedIOC[]> {
    const iocs = this.extractIOCsFromEvent(event);
    return iocs.map(ioc => ({
      ioc: ioc.value,
      iocType: ioc.type,
      sources: ['MISP'],
      threatScore: this.calculateThreatScoreFromEvent(event),
      firstSeen: event.date,
      lastSeen: event.date,
      threatDetails: {
        mispEventId: event.id,
        info: event.info,
        analysis: event.analysis,
        comment: ioc.comment,
        threatLevel: ioc.threatLevel,
      },
    }));
  }

  private calculateThreatScoreFromEvent(event: MISPEvent): number {
    const threatLevelScores: Record<string, number> = {
      'High': 0.9,
      'Medium': 0.7,
      'Low': 0.3,
      'Undefined': 0.5,
      'Critical': 1.0,
    };
    return threatLevelScores[event.threat_level_id] || 0.5;
  }
}

export const mispService = new MISPService();

export default mispService;