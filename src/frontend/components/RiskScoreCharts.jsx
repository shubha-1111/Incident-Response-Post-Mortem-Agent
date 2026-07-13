import React, { useState } from 'react';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const score = payload[0]?.value ?? 0;
  const color = score >= 80 ? '#FB3A5D' : score >= 40 ? '#F59E0B' : '#93C5FD';
  return (
    <div className="bg-[#090E1A] border border-blue-900/40 rounded-lg px-3 py-2 text-[10px] font-mono shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="font-bold" style={{ color }}>
        Risk Score: {score}/100
      </div>
    </div>
  );
};

export function RiskScoreCharts({ incident, riskHistory, days = 30, onDaysChange }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const historyPoints = riskHistory && riskHistory.length > 0
    ? riskHistory
    : incident
      ? [{ timestamp: incident.createdAt || Date.now(), riskScore: incident.threatScore ?? 0 }]
      : [];

  const data = historyPoints.map((p) => ({
    time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    score: p.riskScore ?? 0,
  }));

  const currentScore = incident?.threatScore ?? (data[data.length - 1]?.score ?? 0);
  const prevScore = data.length >= 2 ? data[data.length - 2]?.score ?? currentScore : currentScore;
  const delta = currentScore - prevScore;
  const scoreColor = currentScore >= 80 ? '#FB3A5D' : currentScore >= 40 ? '#F59E0B' : '#93C5FD';
  const gradientId = 'riskGradient';

  return (
    <div className="glass-panel glow-hover rounded-[12px] p-5 flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 select-none">
        <div className="flex items-center space-x-2 text-[var(--text-primary)]">
          <div className="w-8 h-8 rounded-[6px] bg-slate-900 border border-[var(--border-default)] flex items-center justify-center">
            <Activity className="w-4 h-4 text-[var(--accent-violet)]" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">Risk Over Time</h3>
            {incident && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-lg font-black font-mono leading-none" style={{ color: scoreColor }}>
                  {currentScore}
                </span>
                <span className="text-[9px] text-slate-500 font-mono">/100</span>
                {delta !== 0 && (
                  <span className={`flex items-center text-[9px] font-mono font-bold ${delta > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {delta > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                )}
              </div>
            )}
          </div>
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

      {/* Chart */}
      <div className="flex-1 relative min-h-[180px]">
        {data.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">No risk history yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={scoreColor} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={scoreColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#64748b', fontSize: 8, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 8, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={80} stroke="rgba(251,58,93,0.2)" strokeDasharray="4 4" label={{ value: 'HIGH', fill: 'rgba(251,58,93,0.4)', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
              <ReferenceLine y={40} stroke="rgba(245,158,11,0.2)" strokeDasharray="4 4" label={{ value: 'MED', fill: 'rgba(245,158,11,0.4)', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
              <Area
                type="monotone"
                dataKey="score"
                stroke={scoreColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={{ fill: '#fff', stroke: scoreColor, strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5, fill: '#fff', stroke: scoreColor, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
