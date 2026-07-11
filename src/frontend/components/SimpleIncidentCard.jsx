import React from 'react';
import { getStatusEmoji, getTimeAgo, getUrgency } from '../utils/dashboard';

export function SimpleIncidentCard({ incident, onSelect }) {
  const emoji = getStatusEmoji(incident.status);
  const timeAgo = getTimeAgo(incident.createdAt);
  const urgency = getUrgency(incident.threatScore);

  const urgencyStyles = {
    CRITICAL: { color: 'var(--severity-critical)', bg: 'rgba(251, 58, 93, 0.12)', border: 'var(--severity-critical)' },
    HIGH: { color: 'var(--severity-high)', bg: 'rgba(245, 158, 11, 0.12)', border: 'var(--severity-high)' },
    MEDIUM: { color: 'var(--severity-medium)', bg: 'rgba(56, 189, 248, 0.12)', border: 'var(--severity-medium)' },
    LOW: { color: 'var(--severity-low)', bg: 'rgba(45, 212, 191, 0.12)', border: 'var(--severity-low)' }
  };

  return (
    <div 
      className="incident-card bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-4 hover:border-[var(--border-strong)] cursor-pointer transition-all"
      onClick={() => onSelect(incident.incidentId)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center min-w-0">
          <span className="text-2xl mr-2 shrink-0">{emoji}</span>
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
