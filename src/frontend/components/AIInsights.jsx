import React from 'react';
import { Cpu } from 'lucide-react';

export function AIInsights({ incident }) {
  const getInsightsSummary = () => {
    if (!incident) {
      return 'No active threats detected. AI copilot stands ready to analyze security flight patterns.';
    }

    const type = incident.incidentId || '';
    if (type.includes('STUFF') || type.includes('stuffing')) {
      return 'Credential stuffing signature detected. Multiple failed logins to MySQL database db-prod-02 mapped to malicious IP blocks.';
    }
    if (type.includes('SCAN') || type.includes('scan')) {
      return 'Horizontal port scan signature detected. Nmap probe sequences originating from external IP. Automated firewall rule proposed.';
    }
    if (type.includes('SQL') || type.includes('sql')) {
      return 'SQL injection signature matched. Union select payloads filtered at WAF tier. Remediation path: sanitize parameter id.';
    }
    
    return incident.rootCauseHypothesis 
      ? `AI anomaly matching suggests: ${incident.rootCauseHypothesis}. Confidence score evaluated at ${(incident.confidenceScore * 100).toFixed(0)}%.`
      : 'Analyzing incident patterns against vector threat database...';
  };

  const summary = getInsightsSummary();

  return (
    <div className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[18px] p-5 h-[160px] flex flex-col justify-between select-none">
      <div className="flex items-center space-x-2 text-white border-b border-[rgba(255,255,255,0.06)] pb-2.5">
        <Cpu className="w-4 h-4 text-purple-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider font-sans">AI Insights</h3>
      </div>

      <div className="flex items-center space-x-4 mt-2">
        {/* Glowing Brain SVG mesh illustration */}
        <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center bg-purple-950/40 rounded-xl border border-purple-800/30 filter drop-shadow-[0_0_6px_rgba(124,58,237,0.4)]">
          <svg className="w-8 h-8 text-purple-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {/* Left Hemisphere */}
            <path d="M12 4C9 4 7 6 7 9C7 10 7.5 11 8 12C7 13 6.5 14 7 16C7.5 18 9 20 12 20" strokeLinecap="round" strokeLinejoin="round" />
            {/* Right Hemisphere */}
            <path d="M12 4C15 4 17 6 17 9C17 10 16.5 11 16 12C17 13 17.5 14 17 16C16.5 18 15 20 12 20" strokeLinecap="round" strokeLinejoin="round" />
            {/* Inner Neural Connections */}
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
          <p className="text-[10px] text-slate-300 font-sans leading-relaxed line-clamp-2">
            {summary}
          </p>
          <button className="text-left text-[9px] font-bold text-purple-400 hover:text-purple-300 uppercase tracking-widest mt-1 transition-all">
            Review Insights →
          </button>
        </div>
      </div>
    </div>
  );
}
