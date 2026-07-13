import React, { useState, useEffect, useRef } from 'react';
import { Bell, Search, ChevronDown, Timer, AlertTriangle, CheckCircle, GitBranch, Zap } from 'lucide-react';

/**
 * Animated counter — counts from 0 to `target` on mount and when target changes.
 * For string values (like "5m"), shows them directly.
 */
function AnimatedCounter({ value, suffix = '' }) {
  const [displayed, setDisplayed] = useState(typeof value === 'number' ? 0 : value);
  const rafRef = useRef(null);
  const prevValue = useRef(typeof value === 'number' ? 0 : value);

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplayed(value);
      return;
    }
    const start = typeof prevValue.current === 'number' ? prevValue.current : 0;
    const end = value;
    if (start === end) return;

    const duration = 600;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplayed(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(end);
        prevValue.current = end;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [value]);

  if (typeof value !== 'number') return <>{value}{suffix}</>;
  return <>{displayed}{suffix}</>;
}

export function Header({
  username,
  handleLogout,
  isConnected,
  dashboardStats,
  incidents
}) {
  const activeCount = dashboardStats?.activeIncidents ??
    incidents.filter(i => !['resolved', 'reported', 'human_denied'].includes(i.status)).length;
  const resolvedCount = dashboardStats?.resolvedToday ?? 0;
  const mitreSeen = dashboardStats?.mitreTechniquesSeen ?? 0;

  let avgResolutionText = '—';
  if (dashboardStats?.avgResolutionMs) {
    const mins = Math.round(dashboardStats.avgResolutionMs / 60000);
    avgResolutionText = mins > 0 ? `${mins}m` : `${Math.round(dashboardStats.avgResolutionMs / 1000)}s`;
  }

  // Urgency colour for active incidents counter
  const activeColor = activeCount >= 5 ? '#FB3A5D' : activeCount >= 2 ? '#F59E0B' : '#93C5FD';

  const kpis = [
    {
      label: 'Active Incidents',
      value: activeCount,
      desc: 'Investigations in progress',
      icon: AlertTriangle,
      accentColor: activeColor,
      tooltip: 'Incidents currently under investigation',
    },
    {
      label: 'Resolved Today',
      value: resolvedCount,
      desc: 'Incidents closed',
      icon: CheckCircle,
      accentColor: '#34D399',
      tooltip: 'Incidents resolved in the past 24 hours',
    },
    {
      label: 'Active Techniques',
      value: mitreSeen,
      desc: 'MITRE techniques detected',
      icon: GitBranch,
      accentColor: '#818CF8',
      tooltip: 'Unique MITRE ATT&CK technique IDs seen across all incidents',
    },
    {
      label: 'Avg. Resolution',
      value: avgResolutionText,
      desc: 'Mean time to resolve',
      icon: Timer,
      accentColor: '#38BDF8',
      tooltip: 'Average time from ingest to resolution',
    },
  ];

  return (
    <div className="w-full shrink-0 flex flex-col">
      {/* Header Top Bar */}
      <header className="canva-header flex items-center justify-between px-6 py-3 border-b border-[#0A0E1A] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <p className="font-bold text-sm text-[#FFFFFF] tracking-wide leading-tight">
              Incident Response Postmortem Agent
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[10px] text-[#888D9A] leading-none">AI-Powered • Mastra • Qdrant</p>
              <span className={`flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                isConnected
                  ? 'text-emerald-400 border-emerald-900/50 bg-emerald-950/20'
                  : 'text-red-400 border-red-900/50 bg-red-950/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Section Controls */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888D9A]" />
            <input
              type="text"
              placeholder="Search incidents, threats..."
              className="bg-[#0A0D15] border border-[#0A0E1A] rounded-full pl-8 pr-4 py-1.5 text-[11px] w-48 focus:outline-none focus:border-[#3B82F6] text-[#FFFFFF] placeholder-[#888D9A] transition-all"
              readOnly
            />
          </div>

          <div className="relative cursor-pointer">
            <Bell className="w-4 h-4 text-[#8892A6]" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#EF4444] rounded-full text-[8px] text-white flex items-center justify-center font-bold animate-pulse">
                {Math.min(activeCount, 9)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 border-l border-[#0A0E1A] pl-3">
            <div className="w-7 h-7 rounded-full accent-gradient flex items-center justify-center text-[10px] text-white font-bold">
              {username ? username.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-[#FFFFFF] font-medium leading-none">{username}</p>
              <p className="text-[9px] text-[#888D9A] mt-0.5 leading-none">Administrator</p>
            </div>
            <ChevronDown
              className="w-3 h-3 text-[#888D9A] cursor-pointer hover:text-red-400 transition-colors"
              onClick={handleLogout}
              title="Sign out"
            />
          </div>
        </div>
      </header>

      {/* KPI Stats Grid Row */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 select-none">
        {kpis.map((kpi, idx) => {
          const IconComp = kpi.icon;
          return (
            <div
              key={idx}
              className="card-panel p-4 flex items-center gap-3 group cursor-default"
              data-tooltip={kpi.tooltip}
            >
              <div
                className="icon-tile w-10 h-10 flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-110"
                style={{ boxShadow: `0 0 10px ${kpi.accentColor}30` }}
              >
                <IconComp className="w-5 h-5" style={{ color: kpi.accentColor }} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[#8892A6] uppercase tracking-wider leading-none truncate">{kpi.label}</p>
                <p
                  className="text-xl font-black mt-1 leading-none font-mono animate-count-up"
                  style={{ color: kpi.accentColor }}
                >
                  <AnimatedCounter value={kpi.value} />
                </p>
                <p className="text-[9px] text-[#5C6478] mt-1 leading-none truncate">{kpi.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
