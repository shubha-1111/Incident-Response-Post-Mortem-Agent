import React from 'react';
import { Activity } from 'lucide-react';

export function RiskScoreCharts({ incident, riskHistory }) {
  const threatScore = incident?.threatScore ?? 0;

  return (
    <div className="h-full">
      {/* Risk Over Time Card */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4 select-none">
          <div className="flex items-center space-x-2 text-[var(--text-primary)]">
            <div className="w-8 h-8 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
              <Activity className="w-4 h-4 text-[var(--accent-violet)]" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">Risk Over Time</h3>
          </div>
          <select 
            className="input-modern text-slate-400 text-[10px] px-2 py-1 rounded-lg focus:outline-none"
            defaultValue="30"
            disabled
          >
            <option value="30">30 Days</option>
          </select>
        </div>

        {/* Chart Canvas Area */}
        <div className="flex-1 relative bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[10px] p-2 min-h-[300px]">
          <canvas id="severityTrendChart"></canvas>
        </div>
      </div>
    </div>
  );
}
