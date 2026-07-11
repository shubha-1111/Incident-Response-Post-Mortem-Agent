import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';

// Resolve relative to this compiled file's own location (dist/services/report-templates.js)
// rather than process.cwd(), so it works no matter what directory the process is launched from.
// dist/services/../../config/report-templates -> <app-root>/config/report-templates
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'config', 'report-templates');

const registerHelpers = () => {
  Handlebars.registerHelper('formatDate', (timestamp: string | number | Date) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  });

  Handlebars.registerHelper('formatScore', (score: number) => {
    if (typeof score !== 'number') return '0';
    return Math.round(score).toString();
  });

  Handlebars.registerHelper('severityClass', (severity: string) => {
    const s = String(severity).toLowerCase();
    if (['critical', 'high'].includes(s)) return 'high';
    if (['medium', 'warn', 'warning'].includes(s)) return 'medium';
    return 'low';
  });

  Handlebars.registerHelper('levelClass', (level: string) => {
    const l = String(level).toLowerCase();
    if (['critical', 'error'].includes(l)) return 'critical';
    if (['warn', 'warning'].includes(l)) return 'warn';
    return 'info';
  });

  Handlebars.registerHelper('severityClass', (severity: string | undefined) => {
    const s = String(severity ?? 'low').toLowerCase();
    if (['critical', 'high', 'error'].includes(s)) return 'high';
    if (['medium', 'warn', 'warning'].includes(s)) return 'medium';
    return 'low';
  });

  Handlebars.registerHelper('inc', (index: number) => index + 1);
};

registerHelpers();

const loadTemplate = (name: string): Handlebars.TemplateDelegate => {
  const templatePath = path.join(TEMPLATE_DIR, `${name}.hbs`);
  const source = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(source);
};

// Lazy-load + cache each template on first actual use instead of at module
// import time. A missing/broken .hbs file will now only fail the specific
// report request (with a clear error) instead of crashing the whole process
// on startup before the server can even bind its port.
const templateCache = new Map<string, Handlebars.TemplateDelegate>();

const getTemplate = (name: string): Handlebars.TemplateDelegate => {
  let template = templateCache.get(name);
  if (!template) {
    try {
      template = loadTemplate(name);
    } catch (err) {
      throw new Error(
        `Failed to load report template "${name}" from ${TEMPLATE_DIR}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    templateCache.set(name, template);
  }
  return template;
};

export interface ExecutiveSummaryData {
  incidentId: string;
  threatScore: number;
  status: string;
  severity: string;
  executiveSummary: string;
  findings: string[];
  timeline: Array<{ timestamp: string; event: string; status?: string }>;
  recommendations: string[];
  timestamp: string;
}

export interface TechnicalDeepDiveData {
  incidentId: string;
  threatScore: number;
  autonomyTier: string;
  rootCause: string;
  evidenceChain: Array<{
    observedAt: string;
    summary: string;
    severity: string;
    confidence: number;
    payload?: any;
  }>;
  logSnippets: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  threatIntel?: {
    indicators: Array<{ value: string; type: string; source: string; confidence: number }>;
  };
  mitreTags?: string[];
  remediationActions: Array<{
    actionType: string;
    description: string;
    justification?: string;
  }>;
  lessonsLearned: string[];
}

export const renderExecutiveSummary = (data: ExecutiveSummaryData): string => {
  return getTemplate('executive-summary')(data);
};

export const renderTechnicalDeepDive = (data: TechnicalDeepDiveData): string => {
  return getTemplate('technical-deep-dive')(data);
};

export { Handlebars };