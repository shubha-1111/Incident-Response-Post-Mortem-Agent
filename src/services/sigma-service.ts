import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

const SIGMA_RULES_PATH = process.env.SIGMA_RULES_PATH || './config/sigma-rules/';

export interface SigmaRule {
  title?: string;
  id?: string;
  status?: string;
  description?: string;
  author?: string;
  date?: string;
  modified?: string;
  tags?: string[];
  logsource?: {
    product?: string;
    service?: string;
  };
  detection?: any;
  falsepositives?: string[];
  level?: string;
}

export interface ConvertedSigmaRule {
  name: string;
  type: string;
  content: string;
  source: string;
}

class SigmaService {
  async loadSigmaRules(): Promise<SigmaRule[]> {
    try {
      const files = fs.readdirSync(SIGMA_RULES_PATH).filter(f => f.endsWith('.yml'));
      const rules: SigmaRule[] = [];

      for (const file of files) {
        const content = fs.readFileSync(path.join(SIGMA_RULES_PATH, file), 'utf8');
        try {
          const rule = yaml.load(content) as SigmaRule;
          if (rule) rules.push(rule);
        } catch (e) {
          console.error(`Failed to parse Sigma rule ${file}:`, e);
        }
      }

      return rules;
    } catch (error) {
      console.error('Failed to load Sigma rules:', error);
      return [];
    }
  }

  async convertSigmaToRule(sigmaRule: SigmaRule, targetFormat: 'splunk' | 'elastic' | 'kibana'): Promise<ConvertedSigmaRule> {
    const transformationMap: Record<string, (rule: SigmaRule) => string> = {
      splunk: (rule) => this.transformToSplunk(rule),
      elastic: (rule) => this.transformToElastic(rule),
      kibana: (rule) => this.transformToKibana(rule),
    };

    const transform = transformationMap[targetFormat];
    if (!transform) {
      throw new Error(`Unsupported target format: ${targetFormat}`);
    }

    return {
      name: sigmaRule.title || `Converted ${sigmaRule.id || 'Sigma'} rule`,
      type: targetFormat,
      content: transform(sigmaRule),
      source: 'Sigma',
    };
  }

  private transformToSplunk(rule: SigmaRule): string {
    const detection = rule.detection || {};
    const level = this.mapSigmaLevel(rule.level);
    const title = rule.title || 'Security Event';

    let searchQuery = '';
    if (detection.selection) {
      const conditions = Object.entries(detection.selection)
        .map(([key, value]) => `(${key} = "${value}" OR ${key} = "*${value}*")`)
        .join(' OR ');
      searchQuery = `search ${conditions}`;
    }

    return `
# Splunk Query for ${title}
# Sigma Rule ID: ${rule.id || 'unknown'}
# Author: ${rule.author || 'unknown'}

${searchQuery}

# Level: ${level}
# Tags: ${rule.tags?.join(', ') || 'none'}

# Description: ${rule.description || 'N/A'}
`;
  }

  private transformToElastic(rule: SigmaRule): string {
    const detection = rule.detection || {};
    const title = rule.title || 'Security Event';

    const mustArray: any[] = [];
    if (detection.selection) {
      for (const [key, value] of Object.entries(detection.selection)) {
        mustArray.push({ match: { [key]: value } });
      }
    }

    return `
# Elastic Query for ${title}
# Sigma Rule ID: ${rule.id || 'unknown'}

GET /_search
{
  "query": {
    "bool": {
      "must": ${JSON.stringify(mustArray)}
    }
  },
  "size": 100
}
`;
  }

  private transformToKibana(rule: SigmaRule): string {
    const detection = rule.detection || {};
    const title = rule.title || 'Security Event';

    let kqlQuery = '';
    if (detection.selection) {
      kqlQuery = Object.entries(detection.selection)
        .map(([key, value]) => `${key}:"${value}"`)
        .join(' OR ');
    }

    return `
# Kibana Query for ${title}
# Sigma Rule ID: ${rule.id || 'unknown'}

${kqlQuery}

# Level: ${this.mapSigmaLevel(rule.level)}
`;
  }

  private mapSigmaLevel(level: string | undefined): string {
    const levelMap: Record<string, string> = {
      'critical': 'ERROR',
      'high': 'WARN',
      'medium': 'INFO',
      'low': 'DEBUG',
      'informational': 'INFO',
      'unknown': 'INFO',
    };
    const key = (level || 'unknown').toLowerCase();
    return levelMap[key] || 'INFO';
  }

  async extractDetection(rule: SigmaRule): Promise<any> {
    return rule.detection || {};
  }
}

export const sigmaService = new SigmaService();

export default sigmaService;