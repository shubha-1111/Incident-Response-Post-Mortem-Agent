import React from 'react';
import { ShieldCheck, Heart } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Area, AreaChart
} from 'recharts';

const PIE_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#6366f1', '#14b8a6', '#a855f7'];

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-[#090E1A] border border-blue-900/40 rounded-lg px-3 py-2 text-[10px] font-mono shadow-xl">
      <div className="font-bold text-white">{payload[0]?.name}</div>
      <div className="text-slate-400 mt-0.5">{payload[0]?.value} incidents</div>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-[#090E1A] border border-blue-900/40 rounded-lg px-3 py-2 text-[10px] font-mono shadow-xl">
      <div className="text-slate-400">{label}</div>
      <div className="font-bold text-white mt-0.5">{payload[0]?.value} incidents</div>
    </div>
  );
};

const ConfidenceTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-[#090E1A] border border-blue-900/40 rounded-lg px-3 py-2 text-[10px] font-mono shadow-xl">
      <div className="text-slate-400">{label}</div>
      <div className="font-bold text-indigo-300 mt-0.5">{payload[0]?.value}% confidence</div>
    </div>
  );
};

export function SystemHealth({
  systemHealth,
  dashboardCharts,
  incident,
  chartData,
  hideChart = false
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
    const s = String(val ?? '').toLowerCase();
    if (s === 'healthy' || s === 'ready' || s === 'online')
      return { dot: '#22c55e', text: 'text-emerald-400', label: 'ONLINE', pulse: true };
    if (s === 'degraded')
      return { dot: '#f59e0b', text: 'text-amber-400', label: 'DEGRADED', pulse: false };
    return { dot: '#ef4444', text: 'text-red-400', label: 'OFFLINE', pulse: false };
  };

  // Confidence curve data
  const curve = (chartData?.confidenceCurve && chartData.confidenceCurve.length > 0)
    ? chartData.confidenceCurve
    : incident
      ? [{ step: 'Current', value: Math.round((incident.confidenceScore ?? 0) * 100) }]
      : [];

  // Pie chart data
  const byStatus = dashboardCharts?.incidentsByStatus ?? {};
  const pieData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  // Bar chart data
  const split = dashboardCharts?.autonomySplit ?? {};
  const barData = [
    { name: 'L4 Auto', value: split.L4 || 0 },
    { name: 'L2 HITL', value: split.L2 || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Confidence Curve */}
      {!hideChart && (
        <div className="glass-panel glow-hover rounded-[12px] p-5 relative shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
          <div className="absolute top-4 left-4 w-8 h-8 rounded-[6px] bg-slate-900 border border-[var(--border-default)] flex items-center justify-center shadow-inner">
            <Heart className="w-4 h-4 text-[var(--accent-violet)]" />
          </div>
          <div className="flex items-center justify-center text-[var(--text-primary)] mb-4 select-none">
            <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">Execution Confidence</h3>
          </div>
          <div className="h-44">
            {curve.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">No confidence data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="confGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis
                    dataKey="step"
                    tick={{ fill: '#64748b', fontSize: 8, fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: '#64748b', fontSize: 8, fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ConfidenceTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#818cf8"
                    strokeWidth={2}
                    fill="url(#confGradient)"
                    dot={{ fill: '#fff', stroke: '#818cf8', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#fff', stroke: '#818cf8', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* System Status */}
      <div className="glass-panel glow-hover rounded-[12px] p-5 flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
        <div className="flex items-center space-x-2 text-[var(--text-primary)] mb-4 border-b border-[var(--border-default)] pb-2 select-none">
          <ShieldCheck className="w-4 h-4 text-[var(--accent-violet)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">System Status</h3>
        </div>
        <div className="space-y-3 font-sans select-none">
          {services.map((svc, idx) => {
            const style = getStatusStyle(svc.val);
            return (
              <div
                key={idx}
                className="flex justify-between items-center text-xs group cursor-default"
                title={`${svc.name}: ${style.label}`}
              >
                <span className="text-[var(--text-secondary)] font-medium group-hover:text-white transition-colors">{svc.name}</span>
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    {style.pulse && (
                      <span className="animate-telemetry-pulse absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: style.dot }} />
                    )}
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: style.dot }} />
                  </span>
                  <span className={`font-mono font-semibold text-[10px] ${style.text}`}>
                    {style.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Operational Metrics — Recharts Pie + Bar */}
      {dashboardCharts && (
        <div className="glass-panel glow-hover rounded-[12px] p-5 select-none shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono mb-4">
            Operational Metrics
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Status Donut */}
            <div className="bg-[#0c121e] rounded-[10px] p-2.5 border border-[var(--border-default)] flex flex-col items-center shadow-inner">
              <span className="text-[9px] text-[var(--text-muted)] font-mono mb-2 text-center uppercase">Incidents Status</span>
              <div className="h-20 w-full">
                {pieData.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <span className="text-[9px] text-slate-700 font-mono">No data</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="80%"
                        dataKey="value"
                        strokeWidth={1}
                        stroke="#0f172a"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Autonomy Split Bar */}
            <div className="bg-[#0c121e] rounded-[10px] p-2.5 border border-[var(--border-default)] flex flex-col items-center shadow-inner">
              <span className="text-[9px] text-[var(--text-muted)] font-mono mb-2 text-center uppercase">Autonomy Split</span>
              <div className="h-20 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#94a3b8', fontSize: 8 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 8 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={14}>
                      <Cell fill="rgba(34,197,94,0.8)" />
                      <Cell fill="rgba(245,158,11,0.8)" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
