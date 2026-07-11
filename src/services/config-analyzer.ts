export interface ConfigRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'authentication' | 'authorization' | 'encryption' | 'network' | 'logging' | 'general';
  pattern?: string;
}

export const CONFIG_RULES: ConfigRule[] = [
  {
    id: 'AUTH-001',
    name: 'Disable Default Credentials',
    description: 'Check if default credentials are disabled',
    severity: 'critical',
    category: 'authentication',
    pattern: 'default.?password|admin.?admin|changeme',
  },
  {
    id: 'AUTH-002',
    name: 'Enforce Strong Password Policy',
    description: 'Verify password complexity requirements',
    severity: 'high',
    category: 'authentication',
    pattern: 'minLength.*[0-7]|maxAge.*[1-9][0-9]*.*[dihms]',
  },
  {
    id: 'AUTH-003',
    name: 'Multi-Factor Authentication Required',
    description: 'Check for MFA enforcement',
    severity: 'critical',
    category: 'authentication',
    pattern: 'mfa|multi.?factor|2fa|totp',
  },
  {
    id: 'AUTH-004',
    name: 'Session Timeout Configured',
    description: 'Verify session timeout is configured',
    severity: 'medium',
    category: 'authentication',
    pattern: 'session.?timeout|idle.?timeout.*[0-9]+.*[mhs]',
  },
  {
    id: 'AUTHZ-001',
    name: 'Principle of Least Privilege',
    description: 'Check for over-privileged accounts',
    severity: 'critical',
    category: 'authorization',
    pattern: 'admin|administrator|root|sudo.*NOPASSWD',
  },
  {
    id: 'AUTHZ-002',
    name: 'Disable Guest/Anonymous Access',
    description: 'Ensure guest access is disabled',
    severity: 'high',
    category: 'authorization',
    pattern: 'anonymous|guest|AllowAnonymous.*[tT]rue',
  },
  {
    id: 'CRYPTO-001',
    name: 'Use Strong Encryption',
    description: 'Verify TLS 1.2+ or strong cipher usage',
    severity: 'critical',
    category: 'encryption',
    pattern: 'TLSv?1\\.[01]|SSLv[23]|cipher.*',
  },
  {
    id: 'CRYPTO-002',
    name: 'Disable Weak Protocols',
    description: 'Check for disabled weak protocols',
    severity: 'high',
    category: 'encryption',
    pattern: 'TLSv?1\\.[2-9]|SSLv[23]|WeakCipherException',
  },
  {
    id: 'NET-001',
    name: 'Firewall Enabled',
    description: 'Verify firewall configuration',
    severity: 'critical',
    category: 'network',
    pattern: 'firewall|ufw|iptables|firewalld.*enabled',
  },
  {
    id: 'NET-002',
    name: 'Unused Ports Closed',
    description: 'Check for open unnecessary ports',
    severity: 'high',
    category: 'network',
    pattern: 'EXPOSE|listen|port.*[0-9]+.*open',
  },
  {
    id: 'LOG-001',
    name: 'Logging Enabled',
    description: 'Verify audit logging configuration',
    severity: 'high',
    category: 'logging',
    pattern: 'logging|log.?level|audit.?enabled',
  },
  {
    id: 'LOG-002',
    name: 'Log Retention Policy',
    description: 'Check log retention settings',
    severity: 'medium',
    category: 'logging',
    pattern: 'retention|log.*keep|expire.*[0-9]+.*[dhms]',
  },
  {
    id: 'GEN-001',
    name: 'Debug Mode Disabled',
    description: 'Ensure debug mode is off in production',
    severity: 'high',
    category: 'general',
    pattern: 'debug.*true|DEBUG.*1|development.*true',
  },
  {
    id: 'GEN-002',
    name: 'Security Headers Configured',
    description: 'Check for security headers',
    severity: 'medium',
    category: 'general',
    pattern: 'X-Frame-Options|X-Content-Type-Options|Content-Security-Policy',
  },
];

export interface ConfigAnalysisResult {
  file: string;
  rulesChecked: number;
  findings: Array<{
    ruleId: string;
    ruleName: string;
    severity: string;
    category: string;
    passed: boolean;
    message: string;
    line?: number;
    recommendation?: string;
  }>;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export async function analyzeConfigFile(
  filePath: string,
  content: string
): Promise<ConfigAnalysisResult> {
  const findings: ConfigAnalysisResult['findings'] = [];
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  for (const rule of CONFIG_RULES) {
    const regex = new RegExp(rule.pattern!, 'i');
    const match = content.match(regex);
    const passed = !match;
    let lineNumber = 0;
    let message = `Configuration follows ${rule.name}`;
    let recommendation: string | undefined;

    if (match) {
      const idx = match.index ?? 0;
      lineNumber = content.substring(0, idx).split('\n').length;
      message = `Potential violation of ${rule.name} found`;
      recommendation = getRecommendation(rule.id);
    }

    if (!passed) {
      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        category: rule.category,
        passed: false,
        message,
        line: lineNumber || undefined,
        recommendation,
      });
      summary[rule.severity]++;
    }
  }

  return {
    file: filePath,
    rulesChecked: CONFIG_RULES.length,
    findings,
    summary,
  };
}

function getRecommendation(ruleId: string): string {
  const recommendations: Record<string, string> = {
    'AUTH-001': 'Remove default credentials and enforce password change on first login',
    'AUTH-002': 'Configure minimum password length of 12+ characters with complexity requirements',
    'AUTH-003': 'Enable multi-factor authentication for all user accounts',
    'AUTH-004': 'Set session timeout to 15 minutes or less for sensitive applications',
    'AUTHZ-001': 'Remove unnecessary admin privileges and implement least privilege access',
    'AUTHZ-002': 'Disable guest and anonymous access in production environments',
    'CRYPTO-001': 'Upgrade to TLS 1.2+ and disable weak ciphers',
    'CRYPTO-002': 'Disable SSLv2, SSLv3, and TLSv1.0/v1.1 protocols',
    'NET-001': 'Enable host-based firewall with restrictive rules',
    'NET-002': 'Close all non-essential ports and services',
    'LOG-001': 'Enable comprehensive audit logging for security events',
    'LOG-002': 'Set log retention to minimum 90 days for compliance',
    'GEN-001': 'Disable debug mode in production environments',
    'GEN-002': 'Add security headers: X-Frame-Options, CSP, HSTS',
  };
  return recommendations[ruleId] || 'Review and remediate configuration';
}

export function getConfigRules(): ConfigRule[] {
  return CONFIG_RULES;
}