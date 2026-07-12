import React, { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';
import Chart from 'chart.js/auto';

export function RiskScoreCharts({ incident, riskHistory, days = 30, onDaysChange }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current;
    const historyPoints = riskHistory && riskHistory.length > 0
      ? riskHistory
      : [{ timestamp: incident?.createdAt || Date.now(), riskScore: incident?.threatScore ?? 0 }];
    
    const labels = historyPoints.map((p) =>
      new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    const scores = historyPoints.map((p) => p.riskScore ?? 0);

    const context = ctx.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(251, 58, 93, 0.22)');
    gradient.addColorStop(1, 'rgba(251, 58, 93, 0.0)');

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Risk Score',
          data: scores,
          borderColor: '#FB3A5D',
          backgroundColor: gradient,
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#FB3A5D',
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
            borderColor: 'rgba(251, 58, 93, 0.3)',
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
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [incident, riskHistory]);

  return (
    <div className="h-full">
      {/* Risk Over Time Card */}
      <div className="glass-panel glow-hover rounded-[12px] p-5 h-full flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
        <div className="flex items-center justify-between mb-4 select-none">
          <div className="flex items-center space-x-2 text-[var(--text-primary)]">
            <div className="w-8 h-8 rounded-[6px] bg-slate-900 border border-[var(--border-default)] flex items-center justify-center">
              <Activity className="w-4 h-4 text-[var(--accent-violet)]" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">Risk Over Time</h3>
          </div>
          <select 
            className="input-modern text-slate-400 text-[10px] px-2 py-1 rounded-lg focus:outline-none cursor-pointer"
            value={days}
            onChange={(e) => onDaysChange && onDaysChange(Number(e.target.value))}
          >
            <option value="7">7 Days</option>
            <option value="14">14 Days</option>
            <option value="30">30 Days</option>
          </select>
        </div>

        {/* Chart Canvas Area */}
        <div className="flex-1 relative bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[10px] p-2 min-h-[300px]">
          <canvas ref={chartRef}></canvas>
        </div>
      </div>
    </div>
  );
}
