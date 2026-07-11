import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

export type DecisionAction = 'HITL_REQUIRED' | 'AUTO_EXECUTE' | 'NEEDS_MORE_CONTEXT';
export type DecisionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface DecisionRule {
  name: string;
  id: string;
  priority: DecisionPriority;
  condition: any;
  action: DecisionAction;
  justification: string;
  escalation: boolean;
}

export interface DecisionResult {
  action: DecisionAction;
  justification: string;
  priority: DecisionPriority;
  escalation: boolean;
  matchedRule: string;
}

const DEFAULT_RULES: DecisionRule[] = [
  {
    name: 'Critical Production Database',
    id: 'rule-001',
    priority: 'CRITICAL',
    condition: {
      and: [
        { field: 'assetCriticality', operator: '==', value: 'high_impact' },
        { field: 'threatScore', operator: '>', value: 80 },
      ],
    },
    action: 'HITL_REQUIRED',
    justification: 'High-impact asset with elevated threat score requires human approval',
    escalation: true,
  },
  {
    name: 'Zero-Day Vulnerability',
    id: 'rule-002',
    priority: 'CRITICAL',
    condition: {
      and: [
        { field: 'attackType', operator: '==', value: 'zero_day' },
        { field: 'exploitAvailable', operator: '==', value: true },
      ],
    },
    action: 'HITL_REQUIRED',
    justification: 'Zero-day exploit detected - immediate human review required',
    escalation: true,
  },
  {
    name: 'Ransomware Detection',
    id: 'rule-003',
    priority: 'CRITICAL',
    condition: { field: 'attackType', operator: '==', value: 'ransomware' },
    action: 'HITL_REQUIRED',
    justification: 'Ransomware detected - containment requires human approval',
    escalation: true,
  },
  {
    name: 'Low Risk Standard Incident',
    id: 'rule-004',
    priority: 'LOW',
    condition: {
      and: [
        { field: 'threatScore', operator: '<', value: 40 },
        { field: 'assetCriticality', operator: '==', value: 'low_impact' },
      ],
    },
    action: 'AUTO_EXECUTE',
    justification: 'Low risk incident on non-critical asset - safe to auto-execute',
    escalation: false,
  },
];

// Mutable so loadDecisionRules() can swap in rules from YAML at runtime.
export let decisionRules: DecisionRule[] = DEFAULT_RULES;

/**
 * Loads decision rules from a YAML file. Falls back to the built-in defaults
 * if the file is missing or unpar. Safe to call repeatedly (e.g. on startup).
 */
export function loadDecisionRules(rulesPath?: string): void {
  const resolved = rulesPath || process.env.DECISION_RULES_PATH || './config/decision-rules.yaml';
  try {
    const fileContents = fs.readFileSync(resolved, 'utf8');
    const config = yaml.load(fileContents) as { rules?: DecisionRule[] } | null;
    if (config?.rules?.length) {
      decisionRules = config.rules;
      console.log(`[decision-engine] Loaded ${decisionRules.length} decision rules from ${resolved}`);
    } else {
      console.warn('[decision-engine] YAML had no rules; keeping defaults.');
    }
  } catch (err: any) {
    console.warn(`[decision-engine] Could not load rules from ${resolved} (${err.message}); using defaults.`);
  }
}

// Auto-load rules at module init (best-effort; defaults remain if it fails).
loadDecisionRules();

/** Returns the currently active decision rules (for API exposure). */
export function getDecisionRules(): DecisionRule[] {
  return decisionRules;
}

const PRIORITY_ORDER: Record<DecisionPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Normalizes an IncidentState (or flat object) to the shape expected by decision rules.
 * Extracts fields from nested IncidentState (e.g., remediationPlan.assetCriticality) and
 * derives plausible values for attackType and exploitAvailable when missing.
 */
export function normalizeIncidentState(incident: any): any {
  if (!incident || typeof incident !== 'object') return incident;
  // Clone to avoid mutating input
  const normalized = { ...incident };

  // Ensure threatScore exists (rules expect a number 0-100)
  if (typeof normalized.threatScore !== 'number') {
    normalized.threatScore = 0;
  }

  // Asset criticality from remediationPlan (if present)
  normalized.assetCriticality =
    normalized.remediationPlan?.assetCriticality ?? normalized.assetCriticality ?? 'high_impact';

  // Derive attackType from IncidentState where possible
  let attackType = normalized.attackType ?? 'unknown';

  // Heuristic extraction from known fields
  if (attackType === 'unknown') {
    const src = [
      normalized.rca?.rootCause,
      normalized.rca?.title,
      normalized.remediationPlan?.action,
      normalized.anomalySignals?.[0]?.description,
    ].filter(Boolean).join(' ').toLowerCase();

    if (src.includes('ransomware')) attackType = 'ransomware';
    else if (/zero-day|zero day/.test(src)) attackType = 'zero_day';
    else if (src.includes('apt') || src.includes('advanced persistent')) attackType = 'apt';
    else if (src.includes('credential stuffing') || src.includes('brute force')) attackType = 'credential_stiming';
    else if (src.includes('sql injection') || src.includes('sql')) attackType = 'sql_injection';
    else if (src.includes('ddos') || src.includes('denial of service')) attackType = 'ddos';
    else if (src.includes('phishing')) attackType = 'phishing';
    else if (src.includes('supply chain') || src.includes('supply-chain')) attackType = 'supply_chain';
  }

  normalized.attackType = attackType;

  // Exploit availability – try explicit field, otherwise infer from threatIntelReport
  if (typeof normalized.exploitAvailable !== 'boolean') {
    const exploitFlag =
      normalized.threatBreakdown?.exploitAvailable ??
      normalized.evidenceChain?.some((e: any) => e.payload?.threatIntelReport?.exploitable) ??
      false;
    normalized.exploitAvailable = Boolean(exploitFlag);
  }

  return normalized;
}

export function evaluateDecision(incident: any): DecisionResult {
  // Normalize incoming incident to rule‑friendly flat shape
  const flat = normalizeIncidentState(incident);

  const sorted = [...decisionRules].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  for (const rule of sorted) {
    if (evaluateCondition(rule.condition, flat)) {
      return {
        action: rule.action,
        justification: rule.justification,
        priority: rule.priority,
        escalation: rule.escalation,
        matchedRule: rule.id,
      };
    }
  }

  return {
    action: 'HITL_REQUIRED',
    justification: 'No matching rule – default to human review',
    priority: 'MEDIUM',
    escalation: false,
    matchedRule: 'default',
  };
}

function evaluateCondition(condition: any, incident: any): boolean {
  if (!condition) return false;
  if (condition.and) {
    return condition.and.every((c: any) => evaluateCondition(c, incident));
  }
  if (condition.or) {
    return condition.or.some((c: any) => evaluateCondition(c, incident));
  }
  if (condition.field && condition.operator && condition.value !== undefined) {
    const fieldValue = getFieldValue(incident, condition.field);
    return compareValues(fieldValue, condition.operator, condition.value);
  }
  return false;
}

function getFieldValue(obj: any, field: string): any {
  return field.split('.').reduce((o: any, k: string) => (o == null ? o : o[k]), obj);
}

function compareValues(actual: any, operator: string, expected: any): boolean {
  switch (operator) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return actual > expected;
    case '<':
      return actual < expected;
    case '>=':
      return actual >= expected;
    case '<=':
      return actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    default:
      return false;
  }
}
