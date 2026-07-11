import React from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';
import { SimpleIncidentCard } from './SimpleIncidentCard';

const urgencyConfig = {
  CRITICAL: {
    icon: ShieldAlert,
    color: 'var(--severity-critical)',
    bg: 'rgba(251, 58, 93, 0.12)',
    border: 'var(--severity-critical)',
    label: 'Critical - Immediate Action Required'
  },
  HIGH: {
    icon: ShieldAlert,
    color: 'var(--severity-high)',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'var(--severity-high)',
    label: 'High - Needs Attention'
  },
  MEDIUM: {
    icon: ShieldQuestion,
    color: 'var(--severity-medium)',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'var(--severity-medium)',
    label: 'Medium - Monitor'
  },
  LOW: {
    icon: ShieldCheck,
    color: 'var(--severity-low)',
    bg: 'rgba(45, 212, 191, 0.12)',
    border: 'var(--severity-low)',
    label: 'Low - Informational'
  }
};

export function IncidentGroup({ title, incidents, onSelect, colorKey }) {
  const config = urgencyConfig[colorKey];

  return (
    <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
      <div className="flex items-center space-x-2 px-5 py-3 border-b border-[var(--border-default)]">
        <config.icon className="w-4 h-4" style={{ color: config.color }} />
        <h3 className="text-xs font-semibold uppercase tracking-wider font-sans text-[var(--text-primary)]">
          {title}
        </h3>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-[6px] border tech-mono" style={{ color: config.color, backgroundColor: config.bg, borderColor: config.border }}>
          {incidents.length}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {incidents.map((inc) => (
          <SimpleIncidentCard
            key={inc.incidentId}
            incident={inc}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
