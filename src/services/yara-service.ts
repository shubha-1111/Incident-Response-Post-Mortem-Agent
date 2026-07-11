import fs from 'fs';
import path from 'path';

const YARA_RULES_PATH = process.env.YARA_RULES_PATH || './config/yara-rules/';

export interface YARAResult {
  rule: string;
  tags: string[];
  meta: Record<string, any>;
  description?: string;
}

export interface YARARule {
  name: string;
  condition: string;
  strings: any[];
  meta: Record<string, any>;
  level?: string;
  tags?: string[];
}

class YARAService {
  private rulesCache: string[] = [];

  async loadYARARules(): Promise<string[]> {
    try {
      const files = fs.readdirSync(YARA_RULES_PATH).filter(f => f.endsWith('.yar') || f.endsWith('.yara'));
      this.rulesCache = files.map(file => fs.readFileSync(path.join(YARA_RULES_PATH, file), 'utf8'));
      return this.rulesCache;
    } catch (error) {
      console.error('Failed to load YARA rules:', error);
      return [];
    }
  }

  async scanWithYARA(fileContent: Buffer): Promise<YARAResult[]> {
    if (this.rulesCache.length === 0) {
      await this.loadYARARules();
    }

    const matches: YARAResult[] = [];
    const contentString = fileContent.toString('utf8');

    for (const rule of this.rulesCache) {
      const parsedRule = this.parseYARARule(rule);
      if (parsedRule && this.evaluateRule(contentString, parsedRule)) {
        matches.push({
          rule: parsedRule.name,
          tags: parsedRule.tags || [parsedRule.level || 'unknown'],
          meta: parsedRule.meta,
          description: parsedRule.meta.description,
        });
      }
    }

    return matches;
  }

  parseYARARule(ruleContent: string): YARARule | null {
    const nameMatch = ruleContent.match(/rule\s+(\w+)\s*\{/);
    if (!nameMatch) return null;

    const name = nameMatch[1];
    const metaMatch = ruleContent.match(/meta:\s*\{([^}]+)\}/s);
    const stringsMatch = ruleContent.match(/strings:\s*\{([^}]+)\}/s);
    const conditionMatch = ruleContent.match(/condition:\s*(.+?)(?:\n\s*\}|\s*$)/s);

    const meta: Record<string, any> = {};
    if (metaMatch) {
      const metaContent = metaMatch[1];
      const metaPairs = metaContent.match(/(\w+)\s*=\s*"([^"]+)"/g);
      if (metaPairs) {
        for (const pair of metaPairs) {
          const match = pair.match(/(\w+)\s*=\s*"([^"]+)"/);
          if (match) meta[match[1]] = match[2];
        }
      }
    }

    const condition = conditionMatch ? conditionMatch[1].trim() : '';
    const strings = stringsMatch ? this.parseStrings(stringsMatch[1]) : [];

    const tags: string[] = [];
    const tagsMatch = ruleContent.match(/tags:\s*\[([^\]]+)\]/);
    if (tagsMatch) {
      tags.push(...tagsMatch[1].match(/["']?(\w+)["']?/g) || []);
    }

    const levelMatch = ruleContent.match(/level:\s*["']?(\w+)["']?/);
    const level = levelMatch ? levelMatch[1] : 'unknown';

    return { name, condition, strings, meta, tags, level };
  }

  private parseStrings(stringsContent: string): any[] {
    const strings: any[] = [];
    const stringDefs = stringsContent.match(/(\$\w+)\s*=\s*"([^"]+)"/g);
    if (stringDefs) {
      for (const def of stringDefs) {
        const match = def.match(/(\$\w+)\s*=\s*"([^"]+)"/);
        if (match) strings.push({ name: match[1], value: match[2] });
      }
    }
    return strings;
  }

  evaluateRule(content: string, rule: YARARule): boolean {
    if (!rule.condition || rule.strings.length === 0) return false;

    for (const str of rule.strings) {
      const strMatch = str.value.match(/\$([^$]+)\$/);
      if (strMatch) {
        const stringName = strMatch[1];
        const stringDef = rule.strings.find(s => s.name === `$${stringName}`);
        if (stringDef && content.includes(stringDef.value.replace(/\$/g, ''))) {
          return true;
        }
      } else if (content.includes(str.value.replace(/\$/g, ''))) {
        return true;
      }
    }

    return false;
  }

  async addYARARule(ruleContent: string): Promise<void> {
    const parsed = this.parseYARARule(ruleContent);
    if (!parsed) return;

    this.rulesCache.push(ruleContent);
    const rulePath = path.join(YARA_RULES_PATH, `${parsed.name}.yar`);
    fs.writeFileSync(rulePath, ruleContent);
  }

  async compileYARARule(ruleContent: string): Promise<any> {
    return { rule: ruleContent, compiled: true };
  }
}

export const yaraService = new YARAService();

export default yaraService;
