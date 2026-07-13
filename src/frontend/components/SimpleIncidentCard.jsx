import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronRight, Clock, Target, Zap } from 'lucide-react';
import { getTimeAgo, getUrgency } from '../utils/dashboard';

export function SimpleIncidentCard({ incident, onSelect, isSelected }) {
  const [expanded, setExpanded] = useState(false);
  const timeAgo = getTimeAgo(incident.createdAt);
  const urgency = getUrgency(incident.threatScore);

  const urgencyStyles = {
    CRITICAL: { color: 'var(--severity-critical)', bg: 'rgba(251, 58, 93, 0.12)', border: 'var(--severity-critical)' },
    HIGH:     { color: 'var(--severity-high)',     bg: 'rgba(245, 158, 11, 0.12)', border: 'var(--severity-high)' },
    MEDIUM:   { color: '#60A5FA',                  bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.4)' },
    LOW:      { color: '#93C5FD',                  bg: 'rgba(147, 197, 253, 0.12)', border: 'rgba(147, 197, 253, 0.4)' },
  };

  const statusColors = {
    resolved: 'text-emerald-400',
    reported: 'text-emerald-400',
    pending_human_review: 'text-amber-400',
    ingesting: 'text-blue-400',
    analyzing: 'text-blue-400',
    human_denied: 'text-red-400',
    failed_closed: 'text-red-400',
  };

  const handleClick = () => {
    onSelect(incident.incidentId);
  };

  const handleExpandToggle = (e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <div
      className={`incident-card rounded-[10px] cursor-pointer transition-all border ${
        isSelected
          ? 'border-[#3B82F6] bg-gradient-to-r from-blue-950/25 to-blue-900/10 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
          : 'bg-[var(--bg-surface)] border-[var(--border-default)] hover:border-slate-600 hover:shadow-[0_2px_12px_rgba(59,130,246,0.1)]'
      }`}
      onClick={handleClick}
    >
      {/* Main row */}
      <div className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center min-w-0 gap-2">
            <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[var(--text-primary)] font-semibold text-xs tech-mono truncate">{incident.incidentId}</div>
              <div className="text-[var(--text-secondary)] text-[10px] truncate">{incident.targetHost || 'unknown host'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-[5px] border tech-mono"
              style={{
                color: urgencyStyles[urgency].color,
                backgroundColor: urgencyStyles[urgency].bg,
                borderColor: urgencyStyles[urgency].border,
              }}
            >
              {urgency}
            </div>
            <button
              onClick={handleExpandToggle}
              className="text-slate-600 hover:text-slate-300 transition-colors p-0.5"
              title="Expand details"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="text-[var(--text-secondary)] text-[10px] mb-2 line-clamp-2 font-sans leading-relaxed">
          {incident.rootCauseHypothesis || 'Investigation in progress…'}
        </div>

        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
          <span className="tech-mono flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />{timeAgo}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`tech-mono text-[9px] font-semibold uppercase ${statusColors[incident.status] || 'text-slate-400'}`}
            >
              {incident.status?.replace(/_/g, ' ')}
            </span>
            <span className="tech-mono font-bold" style={{ color: urgencyStyles[urgency].color }}>
              {Math.round(incident.threatScore ?? 0)}/100
            </span>
          </div>
        </div>
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div
          className="px-3.5 pb-3.5 pt-0 border-t border-[var(--border-default)] space-y-2 animate-fadeInUp"
          onClick={(e) => e.stopPropagation()}
        >
          {incident.attackType && (
            <div className="flex items-center gap-1.5 text-[10px] pt-2">
              <Target className="w-3 h-3 text-violet-400 shrink-0" />
              <span className="text-slate-500">Attack type:</span>
              <span className="text-violet-300 font-mono font-bold">{incident.attackType}</span>
            </div>
          )}
          {incident.remediationAction?.actionType && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <Zap className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-slate-500">Action:</span>
              <span className="text-amber-300 font-mono font-bold">{incident.remediationAction.actionType}</span>
            </div>
          )}
          {incident.confidenceScore != null && (
            <div className="text-[10px]">
              <div className="flex justify-between mb-1">
                <span className="text-slate-500">Confidence</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {Math.round(incident.confidenceScore * 100)}%
                </span>
              </div>
              <div className="h-1 w-full bg-[var(--bg-base)] rounded-full overflow-hidden border border-[var(--border-default)]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${Math.round(incident.confidenceScore * 100)}%` }}
                />
              </div>
            </div>
          )}
          {incident.autonomyTier && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-slate-500">Autonomy:</span>
              <span className={`font-mono font-bold text-[9px] px-1.5 py-0.5 rounded-[4px] border ${
                incident.autonomyTier.includes('L4')
                  ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40'
                  : 'text-amber-400 bg-amber-950/30 border-amber-900/40'
              }`}>
                {incident.autonomyTier}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
