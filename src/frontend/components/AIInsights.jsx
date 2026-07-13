import React, { useState } from 'react';
import { Cpu } from 'lucide-react';

// Map attackType strings → MITRE ATT&CK technique IDs and labels
const MITRE_MAP = {
  credential_stuffing: { id: 'T1110.004', label: 'Credential Stuffing' },
  brute_force:         { id: 'T1110',     label: 'Brute Force' },
  port_scan:           { id: 'T1046',     label: 'Network Service Discovery' },
  port_scan_detected:  { id: 'T1046',     label: 'Network Service Discovery' },
  sql_injection:       { id: 'T1190',     label: 'Exploit Public-Facing Application' },
  data_exfil:          { id: 'T1041',     label: 'Exfiltration Over C2 Channel' },
  data_exfiltration:   { id: 'T1041',     label: 'Exfiltration Over C2 Channel' },
  privilege_escalation:{ id: 'T1068',     label: 'Exploitation for Privilege Escalation' },
  priv_escalation:     { id: 'T1068',     label: 'Exploitation for Privilege Escalation' },
  ransomware:          { id: 'T1486',     label: 'Data Encrypted for Impact' },
  ddos:                { id: 'T1498',     label: 'Network Denial of Service' },
  novel_pattern:       { id: 'T1499',     label: 'Endpoint Denial of Service' },
};

function getMitre(incident) {
  const raw = (incident?.attackType || incident?.rca?.rootCause || '').toLowerCase().replace(/[\s-]/g, '_');
  // Try exact match first, then substring scan
  if (MITRE_MAP[raw]) return MITRE_MAP[raw];
  for (const [key, val] of Object.entries(MITRE_MAP)) {
    if (raw.includes(key) || key.includes(raw)) return val;
  }
  // Fallback: derive from incidentId keywords
  const id = (incident?.incidentId || '').toUpperCase();
  if (id.includes('SCAN'))   return MITRE_MAP.port_scan;
  if (id.includes('SQL'))    return MITRE_MAP.sql_injection;
  if (id.includes('STUFF'))  return MITRE_MAP.credential_stuffing;
  if (id.includes('DDOS'))   return MITRE_MAP.ddos;
  if (id.includes('RANSOM')) return MITRE_MAP.ransomware;
  return { id: 'T1110', label: 'Brute Force' };
}

function getInsightsSummary(incident) {
  if (!incident) {
    return 'No active threats detected. AI copilot stands ready to analyze security flight patterns.';
  }

  // 1. Best source: report-agent plain-language summary
  if (incident.plainLanguageSummary) return incident.plainLanguageSummary;

  // 2. RCA reasoning summary
  if (incident.rca?.reasoningSummary) return incident.rca.reasoningSummary;

  // 3. Root cause hypothesis written by workflow
  if (incident.rootCauseHypothesis && incident.rootCauseHypothesis !== 'unknown') {
    const conf = Math.round((incident.confidenceScore ?? 0) * 100);
    return `AI analysis identified root cause: ${incident.rootCauseHypothesis.replace(/_/g, ' ')}. Confidence: ${conf}%.`;
  }

  // 4. Reasoning log last entry
  if (Array.isArray(incident.reasoningLog) && incident.reasoningLog.length > 0) {
    const last = incident.reasoningLog[incident.reasoningLog.length - 1];
    if (last && last.length > 10) return last;
  }

  // 5. Action justification (autonomy router output)
  if (incident.actionJustification && incident.actionJustification.length > 10) {
    return incident.actionJustification;
  }

  // 6. Status-based fallback
  const status = incident.status || '';
  if (status === 'analyzing' || status === 'retrieving_context') {
    return 'Pipeline running — log agent and anomaly agent are processing forensic events. Awaiting RCA output...';
  }
  if (status === 'pending_human_review') {
    return 'Pattern confidence below threshold. Incident flagged as novel — routing to human review queue.';
  }
  if (status === 'novel_pattern_detected') {
    return 'Novel attack pattern detected. No precedent found in knowledge base. Escalated for manual triage.';
  }
  return 'Analyzing incident patterns against vector threat database...';
}

export function AIInsights({ incident }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const summary   = getInsightsSummary(incident);
  const mitre     = getMitre(incident);
  const conf      = Math.round((incident?.confidenceScore ?? 0) * 100);
  const retConf   = Math.round((incident?.retrievalConfidence ?? 0) * 100);

  // Remediation action label
  const actionRaw = incident?.remediationPlan?.action || incident?.remediationAction?.actionType || '';
  const actionLabel = actionRaw ? actionRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;

  return (
    <div className={`glass-panel rounded-[18px] p-5 flex flex-col justify-between select-none shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp transition-all duration-300 ${isExpanded ? 'min-h-[280px]' : 'h-[160px]'}`}>
      <div className="flex items-center space-x-2 text-white border-b border-[rgba(255,255,255,0.06)] pb-2.5">
        <Cpu className="w-4 h-4 text-blue-300" />
        <h3 className="text-xs font-bold uppercase tracking-wider font-sans">AI Insights</h3>
      </div>

      <div className="flex items-start space-x-4 mt-3">
        {/* Glowing Brain SVG */}
        <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center bg-blue-950/40 rounded-xl border border-blue-800/30 filter drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]">
          <svg className="w-8 h-8 text-blue-300 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 4C9 4 7 6 7 9C7 10 7.5 11 8 12C7 13 6.5 14 7 16C7.5 18 9 20 12 20" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 4C15 4 17 6 17 9C17 10 16.5 11 16 12C17 13 17.5 14 17 16C16.5 18 15 20 12 20" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 7V17M9 10H15M8.5 14H15.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
            <circle cx="12" cy="7" r="1" fill="currentColor" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
            <circle cx="8.5" cy="14" r="1" fill="currentColor" />
            <circle cx="15.5" cy="14" r="1" fill="currentColor" />
          </svg>
        </div>

        {/* Insight details */}
        <div className="flex-1 min-w-0 pr-1 flex flex-col justify-between">
          <p className="text-[10px] text-slate-300 font-sans leading-relaxed line-clamp-3">
            {summary}
          </p>

          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)] text-[9px] font-mono text-slate-400 space-y-1.5 animate-fadeInUp">
              <div className="flex justify-between">
                <span>Confidence Score:</span>
                <span className={`font-bold ${conf >= 70 ? 'text-emerald-400' : conf >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{conf}%</span>
              </div>
              <div className="flex justify-between">
                <span>KB Retrieval Match:</span>
                <span className={`font-bold ${retConf >= 50 ? 'text-white' : 'text-yellow-400'}`}>
                  {retConf > 0 ? `${retConf}% similarity` : 'No match / novel pattern'}
                </span>
              </div>
              {actionLabel && (
                <div className="flex justify-between">
                  <span>Recommended Action:</span>
                  <span className="text-orange-300 font-bold">{actionLabel}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>MITRE ATT&amp;CK:</span>
                <a
                  href={`https://attack.mitre.org/techniques/${mitre.id.replace('.', '/')}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 font-bold hover:text-blue-200 hover:underline"
                >
                  {mitre.id} · {mitre.label}
                </a>
              </div>
              {incident?.autonomyTier && (
                <div className="flex justify-between">
                  <span>Autonomy Tier:</span>
                  <span className="text-purple-300 font-bold">{incident.autonomyTier.replace(/_/g, ' ')}</span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-left text-[9px] font-bold text-blue-300 hover:text-blue-200 uppercase tracking-widest mt-2.5 transition-all cursor-pointer"
          >
            {isExpanded ? 'Collapse Insights ↑' : 'Review Insights →'}
          </button>
        </div>
      </div>
    </div>
  );
}
