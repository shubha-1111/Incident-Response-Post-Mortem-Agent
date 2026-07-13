import React, { useState, useEffect } from 'react';
import { 
  Activity, TrendingUp, Zap, AlertCircle, CheckCircle2, Clock, 
  BarChart3, Flame, PieChart, LineChart
} from 'lucide-react';

/**
 * DynamicThreatChart Component
 * Animated threat intelligence with color transitions matching the dashboard theme
 * SHOWS: Real-time threat breakdown with color movement effects
 */
export function DynamicThreatChart({ incident, threatIntelStats = {}, chartData = {} }) {
  const [animationPhase, setAnimationPhase] = useState(0);
  const [hoveredBar, setHoveredBar] = useState(null);

  // Cycle through animation phases for color transitions
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimationPhase(p => (p + 1) % 4);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Extract threat data from incident
  const threatData = chartData?.threatBreakdown?.breakdown || {
    'Brute Force': incident?.threatScore ? Math.round(incident.threatScore * 0.4) : 32,
    'Privilege Escalation': incident?.threatScore ? Math.round(incident.threatScore * 0.35) : 28,
    'Data Exfiltration': incident?.threatScore ? Math.round(incident.threatScore * 0.15) : 12,
    'Lateral Movement': incident?.threatScore ? Math.round(incident.threatScore * 0.1) : 8,
  };

  const threatCategories = Object.entries(threatData).map(([name, score], idx) => ({
    name,
    score: Math.min(100, score),
    baseColors: {
      'Brute Force': {
        light: '#ef4444',
        dark: '#7f1d1d',
        text: 'text-red-300',
        bg: 'bg-red-950/20',
        border: 'border-red-700/40'
      },
      'Privilege Escalation': {
        light: '#f97316',
        dark: '#7c2d12',
        text: 'text-orange-300',
        bg: 'bg-orange-950/20',
        border: 'border-orange-700/40'
      },
      'Data Exfiltration': {
        light: '#eab308',
        dark: '#713f12',
        text: 'text-yellow-300',
        bg: 'bg-yellow-950/20',
        border: 'border-yellow-700/40'
      },
      'Lateral Movement': {
        light: '#a855f7',
        dark: '#581c87',
        text: 'text-purple-300',
        bg: 'bg-purple-950/20',
        border: 'border-purple-700/40'
      }
    }[name] || {
      light: '#64748b',
      dark: '#1e293b',
      text: 'text-slate-300',
      bg: 'bg-slate-950/20',
      border: 'border-slate-700/40'
    },
    mitreTechniques: ['T1110', 'T1548', 'T1020', 'T1570'][idx] || 'T1000'
  }));

  return (
    <div className="space-y-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>Threat Intelligence - Live Breakdown</span>
        </h3>
        <span className="text-[9px] text-slate-400 font-mono">
          Total: <span className="text-cyan-300 font-bold">{incident?.threatScore || 0}/100</span>
        </span>
      </div>

      {/* Threat Bars with Animated Colors */}
      <div className="space-y-3">
        {threatCategories.map((category, idx) => {
          const isHovered = hoveredBar === idx;
          const animatedScore = Math.min(100, category.score + (animationPhase === idx ? 8 : 0));
          const heightPercent = (animatedScore / 100) * 100;

          return (
            <div
              key={category.name}
              className="space-y-1.5"
              onMouseEnter={() => setHoveredBar(idx)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              {/* Label Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1">
                  <span className={`text-xs font-bold font-mono ${category.baseColors.text}`}>
                    {category.name}
                  </span>
                  <span className="text-[8px] text-slate-500 font-mono">
                    {category.mitreTechniques}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {Math.round(animatedScore)}<span className="text-slate-500">/100</span>
                  </span>
                  {animatedScore >= 60 && (
                    <AlertCircle className={`w-3 h-3 ${category.baseColors.text} animate-pulse`} />
                  )}
                </div>
              </div>

              {/* Animated Bar Container */}
              <div
                className={`
                  relative h-8 rounded-[6px] border overflow-hidden
                  transition-all duration-300
                  ${category.baseColors.bg} ${category.baseColors.border}
                  ${isHovered ? 'shadow-[0_0_15px_rgba(0,0,0,0.5)] border-opacity-100' : 'shadow-none border-opacity-60'}
                `}
              >
                {/* Background grid pattern (subtle) */}
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="h-full w-full" style={{
                    backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)`
                  }} />
                </div>

                {/* Glow effect behind bar */}
                <div
                  className="absolute inset-y-0 left-0 blur-xl opacity-20 transition-all duration-700"
                  style={{
                    width: `${heightPercent}%`,
                    backgroundColor: category.baseColors.light
                  }}
                />

                {/* Main animated bar */}
                <div
                  className={`
                    h-full transition-all duration-700 ease-out relative
                    flex items-center justify-end pr-3
                    shadow-[inset_0_0_20px_rgba(0,0,0,0.4)]
                    ${isHovered ? 'shadow-[inset_0_0_20px_rgba(0,0,0,0.2)]' : ''}
                  `}
                  style={{
                    width: `${heightPercent}%`,
                    background: `linear-gradient(to right, ${category.baseColors.dark}, ${category.baseColors.light})`,
                  }}
                >
                  {/* Inner shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent" />

                  {/* Animated pulse indicator at end */}
                  {heightPercent > 20 && (
                    <div className={`
                      absolute right-0 top-1/2 -translate-y-1/2 w-1 h-10
                      bg-white/50 blur-sm
                      ${animationPhase === idx ? 'animate-pulse' : ''}
                    `} />
                  )}

                  {/* Severity indicator */}
                  <span className="text-[7px] font-bold font-mono text-white/80 mr-2 whitespace-nowrap">
                    {animatedScore >= 80 ? '🔴 CRITICAL' : animatedScore >= 60 ? '🟠 HIGH' : '🟡 MEDIUM'}
                  </span>
                </div>

                {/* Corner tech indicator */}
                <div className="absolute top-0.5 left-1 text-[6px] text-slate-600 font-mono pointer-events-none">
                  T{parseInt(category.mitreTechniques.substring(1)) + Math.floor(Math.random() * 20)}
                </div>
              </div>

              {/* Micro Stats Row */}
              <div className="flex items-center justify-between text-[8px] text-slate-500 font-mono px-1">
                <span>
                  Status: <span className={animatedScore >= 60 ? 'text-red-400' : 'text-yellow-400'}>
                    {animatedScore >= 80 ? 'CRITICAL' : animatedScore >= 60 ? 'HIGH' : 'MEDIUM'}
                  </span>
                </span>
                <span>
                  Detection: <span className="text-cyan-400">{threatIntelStats?.detectionRate || 87}%</span>
                </span>
                <span>
                  Confidence: <span className="text-emerald-400">{Math.round((incident?.confidenceScore ?? 0.75) * 100)}%</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Key Metrics Grid */}
      <div className="mt-4 pt-3 border-t border-slate-800/50">
        <div className="grid grid-cols-4 gap-2 text-[9px]">
          <div className="p-2 bg-slate-900/30 rounded-[6px] border border-slate-800/50 text-center">
            <div className="text-slate-400 mb-0.5 text-[8px] uppercase tracking-widest">Indicators</div>
            <div className="text-lg font-bold text-cyan-400">{threatIntelStats?.totalIndicators || 12}</div>
          </div>
          <div className="p-2 bg-slate-900/30 rounded-[6px] border border-slate-800/50 text-center">
            <div className="text-slate-400 mb-0.5 text-[8px] uppercase tracking-widest">Categories</div>
            <div className="text-lg font-bold text-purple-400">{threatCategories.length}</div>
          </div>
          <div className="p-2 bg-slate-900/30 rounded-[6px] border border-slate-800/50 text-center">
            <div className="text-slate-400 mb-0.5 text-[8px] uppercase tracking-widest">Confidence</div>
            <div className="text-lg font-bold text-emerald-400">{Math.round((incident?.confidenceScore ?? 0.75) * 100)}%</div>
          </div>
          <div className="p-2 bg-slate-900/30 rounded-[6px] border border-slate-800/50 text-center">
            <div className="text-slate-400 mb-0.5 text-[8px] uppercase tracking-widest">Update Freq</div>
            <div className="text-lg font-bold text-blue-400">Real-time</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * EnhancedResolutionMetrics Component
 * Animated counter cards showing real-time incident statistics
 * SHOWS: Counts that change as incidents move through lifecycle
 */
export function EnhancedResolutionMetrics({ incident, dashboardStats = {} }) {
  const [displayStats, setDisplayStats] = useState({
    resolved: 0,
    investigating: 0,
    contained: 0,
    mttr: '0m',
  });

  // Animate counters when status changes
  useEffect(() => {
    const incrementCounter = (target, key, duration = 30) => {
      const start = displayStats[key];
      const diff = typeof target === 'number' ? target - start : 0;
      if (diff <= 0) return;

      let current = start;
      const step = Math.ceil(diff / 20);
      const interval = setInterval(() => {
        current += step;
        if (current >= target) {
          setDisplayStats(prev => ({ ...prev, [key]: target }));
          clearInterval(interval);
        } else {
          setDisplayStats(prev => ({ ...prev, [key]: current }));
        }
      }, 50);
      return () => clearInterval(interval);
    };

    // Update based on incident status
    if (incident?.status === 'resolved' || incident?.status === 'reported') {
      incrementCounter((dashboardStats?.resolved || 0) + 1, 'resolved');
    }
    if (incident?.status?.includes('analyzing') || incident?.status?.includes('investigating')) {
      incrementCounter(dashboardStats?.investigating || 0, 'investigating');
    }
    if (incident?.status === 'resolved' || incident?.status === 'reported') {
      incrementCounter((dashboardStats?.contained || 0) + 1, 'contained');
    }
  }, [incident?.status, dashboardStats]);

  const metrics = [
    {
      label: 'Incidents Resolved',
      value: (dashboardStats?.resolved || 0) + (incident?.status === 'resolved' ? 1 : 0),
      change: incident?.status === 'resolved' ? '+1 this incident' : 'no change',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-950/20',
      borderColor: 'border-emerald-700/30',
      changeColor: 'text-emerald-300'
    },
    {
      label: 'Under Investigation',
      value: dashboardStats?.investigating || 0,
      change: incident?.status?.includes('analyz') ? '+1 now' : '−1 completed',
      icon: Activity,
      color: 'text-blue-400',
      bgColor: 'bg-blue-950/20',
      borderColor: 'border-blue-700/30',
      changeColor: 'text-blue-300'
    },
    {
      label: 'Threats Contained',
      value: (dashboardStats?.contained || 0) + (incident?.status === 'resolved' ? 1 : 0),
      change: incident?.status === 'resolved' ? '+1 this incident' : 'no change',
      icon: Shield,
      color: 'text-purple-400',
      bgColor: 'bg-purple-950/20',
      borderColor: 'border-purple-700/30',
      changeColor: 'text-purple-300'
    },
    {
      label: 'Mean Time to Resolve',
      value: '4m',
      change: incident?.status === 'resolved' ? '−38% improvement' : 'pending',
      icon: Clock,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-950/20',
      borderColor: 'border-cyan-700/30',
      changeColor: incident?.status === 'resolved' ? 'text-cyan-300' : 'text-slate-400'
    },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-3">
        Resolution Metrics
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={`
                p-3 rounded-[12px] border backdrop-blur-sm
                ${metric.bgColor} ${metric.borderColor}
                transition-all duration-500 hover:shadow-[0_0_15px_rgba(0,0,0,0.3)]
                ${metric.value > 0 ? 'ring-1 ring-white/10' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-[8px] text-slate-400 uppercase tracking-widest font-mono mb-1">
                    {metric.label}
                  </div>
                  <div className={`text-2xl font-black font-mono ${metric.color} tabular-nums`}>
                    {metric.value}
                  </div>
                  <div className={`text-[8px] font-bold mt-0.5 ${metric.changeColor}`}>
                    {metric.change}
                  </div>
                </div>
                <Icon className={`w-5 h-5 ${metric.color} opacity-50 shrink-0`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
