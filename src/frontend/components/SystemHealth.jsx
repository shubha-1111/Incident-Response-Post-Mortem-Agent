import React from 'react';
import { ShieldCheck, Heart } from 'lucide-react';

export function SystemHealth({ 
  systemHealth, 
  dashboardCharts 
}) {
  const health = systemHealth ?? {};
  
  const services = [
    { name: 'Qdrant (Vector DB)', key: 'qdrant', val: health.qdrant },
    { name: 'SQLite (Data Store)', key: 'sqlite', val: health.sqlite },
    { name: 'OpenTelemetry Tracer', key: 'otel', val: health.otel },
    { name: 'Threat Intel Feeds', key: 'threatFeeds', val: health.threatFeeds },
    { name: 'Workflow Orchestrator', key: 'workflow', val: health.workflow ?? 'ready' }
  ];

  const getStatusStyle = (val) => {
    const s = String(val).toLowerCase();
    if (s === 'healthy' || s === 'ready' || s === 'online') {
      return { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'ONLINE' };
    }
    if (s === 'degraded') {
      return { dot: 'bg-amber-500', text: 'text-amber-400', label: 'DEGRADED' };
    }
    return { dot: 'bg-red-500', text: 'text-red-400', label: 'OFFLINE' };
  };

  return (
    <div className="space-y-6">
      {/* Execution Confidence Chart */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-5 relative">
        {/* Heart logo in top-left corner */}
        <div className="absolute top-4 left-4 w-8 h-8 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
          <Heart className="w-4 h-4 text-[var(--accent-violet)]" />
        </div>
        
        <div className="flex items-center justify-center text-[var(--text-primary)] mb-4 select-none">
          <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">Execution Confidence</h3>
        </div>

        {/* Confidence Curve Canvas */}
        <div className="h-44 relative bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[10px] p-2">
          <canvas id="confidenceCurveChart"></canvas>
        </div>
      </div>

      {/* System Status Table */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-5 flex flex-col">
        <div className="flex items-center space-x-2 text-[var(--text-primary)] mb-4 border-b border-[var(--border-default)] pb-2 select-none">
          <ShieldCheck className="w-4 h-4 text-[var(--accent-violet)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">System Status</h3>
        </div>

        <div className="space-y-3 font-sans select-none">
          {services.map((svc, idx) => {
            const style = getStatusStyle(svc.val);
            return (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className="text-[var(--text-secondary)] font-medium">{svc.name}</span>
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    {style.label === 'ONLINE' && (
                      <span className="animate-telemetry-pulse absolute inline-flex h-full w-full rounded-full bg-[var(--status-success)] opacity-75"></span>
                    )}
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: style.dot }}></span>
                  </span>
                  <span className="font-mono font-semibold text-[10px]" style={{ color: style.text }}>
                    {style.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Donut Charts Area */}
      {dashboardCharts && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-5 select-none">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono mb-4">
            Operational Metrics
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--bg-base)] rounded-[10px] p-2.5 border border-[var(--border-default)] flex flex-col items-center">
              <span className="text-[9px] text-[var(--text-muted)] font-mono mb-2 text-center uppercase">Incidents Status</span>
              <div className="h-20 w-full relative">
                <canvas id="statusDonutChart"></canvas>
              </div>
            </div>
            <div className="bg-[var(--bg-base)] rounded-[10px] p-2.5 border border-[var(--border-default)] flex flex-col items-center">
              <span className="text-[9px] text-[var(--text-muted)] font-mono mb-2 text-center uppercase">Autonomy Split</span>
              <div className="h-20 w-full relative">
                <canvas id="autonomySplitChart"></canvas>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
