import React, { useState } from 'react';
import { ShieldAlert, Plus, MessageSquare } from 'lucide-react';
import { GroupedIncidentList } from './GroupedIncidentList';
import { MultiSelectFilter } from './MultiSelectFilter';

export function ActiveIncidents({ 
  incidents, 
  selectedId, 
  setSelectedId, 
  setSelectedIncident, 
  setShowIngestModal 
}) {
  const handleSelect = (incidentId) => {
    setSelectedId(incidentId);
    setSelectedIncident(null);
  };

  return (
    <div className="glass-panel glow-hover rounded-[12px] p-5 flex flex-col h-[380px] shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
        <div className="flex items-center space-x-2 text-[var(--text-primary)]">
          <div className="w-8 h-8 rounded-[6px] bg-slate-900 border border-[var(--border-default)] flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-4 h-4 text-[var(--severity-critical)]" />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-wider font-sans">Active Incidents</h2>
        </div>
        <button 
          onClick={() => setShowIngestModal(true)}
          className="btn-approve-glow flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold select-none cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          <span>Ingest</span>
        </button>
      </div>

      {/* Grouped incident list */}
      <div className="flex-1 overflow-y-auto pr-1 terminal-scroll select-none">
        <GroupedIncidentList 
          incidents={incidents} 
          onSelect={handleSelect}
          selectedId={selectedId}
        />
      </div>

      {/* Footer link */}
      <div className="pt-3 border-t border-[var(--border-default)] mt-3 text-right">
        <button className="text-[10px] text-[var(--accent-cyan)] hover:text-[var(--accent-violet)] font-semibold inline-flex items-center space-x-1 font-mono transition-all">
          <span>View All Incidents</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
