import React, { useEffect, useRef } from 'react';
import { ShieldCheck, Heart } from 'lucide-react';
import Chart from 'chart.js/auto';

export function SystemHealth({ 
  systemHealth, 
  dashboardCharts,
  incident,
  chartData,
  hideChart = false
}) {
  const confidenceCurveRef = useRef(null);
  const statusDonutRef = useRef(null);
  const autonomySplitRef = useRef(null);

  const confidenceChartInstance = useRef(null);
  const statusDonutInstance = useRef(null);
  const autonomySplitInstance = useRef(null);

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

  // 1. Confidence Curve Chart Effect
  useEffect(() => {
    if (!confidenceCurveRef.current) return;

    if (confidenceChartInstance.current) {
      confidenceChartInstance.current.destroy();
    }

    const curve = (chartData?.confidenceCurve && chartData.confidenceCurve.length > 0)
      ? chartData.confidenceCurve
      : (incident ? [{ step: 'Current', value: Math.round((incident.confidenceScore ?? 0) * 100) }] : []);

    const ctx = confidenceCurveRef.current;
    const context = ctx.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(129, 140, 248, 0.22)');
    gradient.addColorStop(1, 'rgba(129, 140, 248, 0.0)');

    confidenceChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: curve.map((c) => c.step),
        datasets: [{
          label: 'Confidence %',
          data: curve.map((c) => c.value),
          borderColor: '#818cf8',
          backgroundColor: gradient,
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#818cf8',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 20, 32, 0.9)',
            titleFont: { family: 'JetBrains Mono', size: 9 },
            bodyFont: { family: 'JetBrains Mono', size: 9 },
            borderColor: 'rgba(129, 140, 248, 0.3)',
            borderWidth: 1,
            padding: 8,
            cornerRadius: 6
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 8 }, maxTicksLimit: 6 } },
          y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 8 } } }
        }
      }
    });

    return () => {
      if (confidenceChartInstance.current) {
        confidenceChartInstance.current.destroy();
        confidenceChartInstance.current = null;
      }
    };
  }, [incident, chartData]);

  // 2. Status Donut & Autonomy Split Charts Effect
  useEffect(() => {
    if (!dashboardCharts) return;

    // Status Donut
    if (statusDonutRef.current) {
      if (statusDonutInstance.current) {
        statusDonutInstance.current.destroy();
      }
      const ctx = statusDonutRef.current;
      const byStatus = dashboardCharts.incidentsByStatus || {};
      const labels = Object.keys(byStatus);
      const data = labels.map((k) => byStatus[k]);
      const palette = ['#ef4444', '#f59e0b', '#22c55e', '#6366f1', '#14b8a6', '#a855f7'];

      statusDonutInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data, backgroundColor: palette.slice(0, labels.length), borderWidth: 1, borderColor: '#0f172a' }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          cutout: '65%'
        }
      });
    }

    // Autonomy Split
    if (autonomySplitRef.current) {
      if (autonomySplitInstance.current) {
        autonomySplitInstance.current.destroy();
      }
      const ctx = autonomySplitRef.current;
      const split = dashboardCharts.autonomySplit || { L4: 0, L2: 0 };

      autonomySplitInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['L4 Auto', 'L2 HITL'],
          datasets: [{
            data: [split.L4 || 0, split.L2 || 0],
            backgroundColor: ['rgba(34,197,94,0.8)', 'rgba(245,158,11,0.8)'],
            borderWidth: 1,
            borderColor: ['#16a34a', '#b45309'],
            barThickness: 14
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 8 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#94a3b8', font: { size: 8 }, precision: 0 } }
          }
        }
      });
    }

    return () => {
      if (statusDonutInstance.current) {
        statusDonutInstance.current.destroy();
        statusDonutInstance.current = null;
      }
      if (autonomySplitInstance.current) {
        autonomySplitInstance.current.destroy();
        autonomySplitInstance.current = null;
      }
    };
  }, [dashboardCharts]);

  return (
    <div className="space-y-6">
      {!hideChart && (
        <div className="glass-panel glow-hover rounded-[12px] p-5 relative shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
          {/* Heart logo in top-left corner */}
          <div className="absolute top-4 left-4 w-8 h-8 rounded-[6px] bg-slate-900 border border-[var(--border-default)] flex items-center justify-center shadow-inner">
            <Heart className="w-4 h-4 text-[var(--accent-violet)]" />
          </div>
          
          <div className="flex items-center justify-center text-[var(--text-primary)] mb-4 select-none">
            <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">Execution Confidence</h3>
          </div>

          {/* Confidence Curve Canvas */}
          <div className="h-44 relative bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[10px] p-2">
            <canvas ref={confidenceCurveRef}></canvas>
          </div>
        </div>
      )}

      {/* System Status Table */}
      <div className="glass-panel glow-hover rounded-[12px] p-5 flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
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
        <div className="glass-panel glow-hover rounded-[12px] p-5 select-none shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono mb-4">
            Operational Metrics
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0c121e] rounded-[10px] p-2.5 border border-[var(--border-default)] flex flex-col items-center shadow-inner">
              <span className="text-[9px] text-[var(--text-muted)] font-mono mb-2 text-center uppercase">Incidents Status</span>
              <div className="h-20 w-full relative">
                <canvas ref={statusDonutRef}></canvas>
              </div>
            </div>
            <div className="bg-[#0c121e] rounded-[10px] p-2.5 border border-[var(--border-default)] flex flex-col items-center shadow-inner">
              <span className="text-[9px] text-[var(--text-muted)] font-mono mb-2 text-center uppercase">Autonomy Split</span>
              <div className="h-20 w-full relative">
                <canvas ref={autonomySplitRef}></canvas>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
