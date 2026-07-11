import React from 'react';
import { Shield } from 'lucide-react';
import { getTimeAgo, getUrgency } from '../utils/dashboard';

export function SimpleIncidentCard({ incident, onSelect, isSelected }) {
  const timeAgo = getTimeAgo(incident.createdAt);
  const urgency = getUrgency(incident.threatScore);

  const urgencyStyles = {
    CRITICAL: { color: 'var(--severity-critical)', bg: 'rgba(251, 58, 93, 0.12)', border: 'var(--severity-critical)' },
    HIGH: { color: 'var(--severity-high)', bg: 'rgba(245, 158, 11, 0.12)', border: 'var(--severity-high)' },
    MEDIUM: { color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.4)' },
    LOW: { color: '#93C5FD', bg: 'rgba(147, 197, 253, 0.12)', border: 'rgba(147, 197, 253, 0.4)' }
  };

  return (
    <div 
      className={`incident-card rounded-[10px] p-4 cursor-pointer transition-all border ${
        isSelected 
          ? 'border-[#3B82F6] bg-gradient-to-r from-blue-950/25 to-blue-900/10 shadow-[0_0_12px_rgba(59,130,246,0.25)]' 
          : 'bg-[var(--bg-surface)] border-[var(--border-default)] hover:border-slate-700'
      }`}
      onClick={() => onSelect(incident.incidentId)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center min-w-0">
          <Shield className="w-4 h-4 mr-2.5 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-[var(--text-primary)] font-semibold text-sm tech-mono truncate">{incident.incidentId}</div>
            <div className="text-[var(--text-secondary)] text-xs truncate">{incident.targetHost || 'unknown'}</div>
          </div>
        </div>
        <div className="text-[9px] font-bold px-2 py-0.5 rounded-[6px] border shrink-0 tech-mono" style={{ color: urgencyStyles[urgency].color, backgroundColor: urgencyStyles[urgency].bg, borderColor: urgencyStyles[urgency].border }}>
          {urgency}
        </div>
      </div>

      <div className="text-[var(--text-secondary)] text-xs mb-3 line-clamp-2">
        {incident.rootCauseHypothesis || 'Investigation in progress...'}
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="tech-mono">{timeAgo}</span>
        <span className="tech-mono">Score: {Math.round(incident.threatScore ?? 0)}/100</span>
      </div>
    </div>
  );
}
