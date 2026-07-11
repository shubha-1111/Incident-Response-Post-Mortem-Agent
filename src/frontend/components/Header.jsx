import React from 'react';
import { Bell, Search, LogOut } from 'lucide-react';
import { AppLogo } from './AppLogo';

export function Header({ 
  username, 
  handleLogout, 
  isConnected, 
  dashboardStats, 
  incidents 
}) {
  // Compute KPI values
  const activeCount = dashboardStats?.activeIncidents ?? incidents.filter(i => !['resolved', 'reported', 'human_denied'].includes(i.status)).length;
  const resolvedCount = dashboardStats?.resolvedToday ?? 0;
  const mitreSeen = dashboardStats?.mitreTechniquesSeen ?? 0;
  
  let avgResolutionText = '18m';
  if (dashboardStats?.avgResolutionMs) {
    const mins = Math.round(dashboardStats.avgResolutionMs / 60000);
    avgResolutionText = mins > 0 ? `${mins}m` : `${Math.round(dashboardStats.avgResolutionMs / 1000)}s`;
  }

  const kpis = [
    { label: 'Active Incidents', value: activeCount, color: 'var(--severity-critical)', bg: 'rgba(251, 58, 93, 0.12)', border: 'var(--severity-critical)' },
    { label: 'Resolved Today', value: resolvedCount, color: 'var(--status-success)', bg: 'rgba(52, 211, 153, 0.12)', border: 'var(--status-success)' },
    { label: 'MITRE Techniques', value: mitreSeen, color: 'var(--accent-violet)', bg: 'rgba(167, 139, 250, 0.12)', border: 'var(--accent-violet)' },
    { label: 'Avg. Resolution', value: avgResolutionText, color: 'var(--accent-cyan)', bg: 'rgba(103, 232, 249, 0.12)', border: 'var(--accent-cyan)' }
  ];

  return (
    <div className="w-full shrink-0 flex flex-col">
      {/* 72px Top Bar */}
      <header className="h-[72px] border-b border-[var(--border-default)] bg-[var(--bg-base)] px-6 flex items-center justify-between sticky top-0 z-40 select-none">
        {/* Left: Project branding */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="shrink-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
              <AppLogo size={24} />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide font-sans truncate">Postmortem Incident Response Agent</h1>
            <p className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest uppercase truncate">Autonomous Threat Mitigation</p>
          </div>
        </div>

        {/* Right: Status, Search, Notifications, Profile */}
        <div className="flex items-center space-x-4">
          {/* Status Badge */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface)] border border-[var(--border-default)] px-3.5 py-1.5 rounded-[6px] text-[10px] font-mono">
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-[var(--status-success)] animate-telemetry-pulse' : 'bg-[var(--severity-critical)] animate-telemetry-pulse'}`} />
            <span className="text-[var(--text-secondary)] font-semibold uppercase">
              {isConnected ? 'SYSTEM OPERATIONAL' : 'OFFLINE'}
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search threat events..."
              className="input-modern rounded-[6px] pl-10 pr-4 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] w-[240px]"
              readOnly
            />
          </div>

          {/* Notifications */}
          <button className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[6px] transition-all">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--severity-critical)"></span>
          </button>

          {/* Profile snippet */}
          <div className="flex items-center space-x-2 border-l border-[var(--border-default)] pl-4">
            <div className="flex flex-col text-right">
              <span className="text-xs font-semibold text-[var(--text-primary)]">{username}</span>
              <span className="text-[9px] text-[var(--text-muted)] font-mono">Analyst</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--severity-critical)] transition-all"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* KPI Cards Row (Spanning Full Width) */}
      <div className="px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi, idx) => (
          <div 
            key={idx} 
            className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-4 flex flex-col gap-1"
          >
            <span className="tech-mono text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</span>
            <span className="text-[24px] md:text-[28px] font-medium tracking-tight text-[var(--text-primary)]">
              {kpi.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
