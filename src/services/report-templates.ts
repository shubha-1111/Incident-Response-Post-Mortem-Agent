import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';

const TEMPLATE_DIR = path.join(process.cwd(), 'config', 'report-templates');

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
};

const loadTemplate = (name: string): Handlebars.TemplateDelegate => {
  const templatePath = path.join(TEMPLATE_DIR, `${name}.hbs`);
  const source = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(source);
};

const executiveSummaryTemplate = loadTemplate('executive-summary');
const technicalDeepDiveTemplate = loadTemplate('technical-deep-dive');

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
  return executiveSummaryTemplate(data);
};

export const renderTechnicalDeepDive = (data: TechnicalDeepDiveData): string => {
  return technicalDeepDiveTemplate(data);
};

export { Handlebars };