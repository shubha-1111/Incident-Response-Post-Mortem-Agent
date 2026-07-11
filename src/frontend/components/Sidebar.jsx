import React from 'react';
import { 
  LayoutDashboard, ShieldAlert, Cpu, Database, Globe, Shield, Clock, 
  FileText, BarChart2, Settings, ChevronLeft, ChevronRight, LogOut, User 
} from 'lucide-react';
import { HeartbeatLogo } from './HeartbeatLogo';

export function Sidebar({ 
  isSidebarOpen, 
  setIsSidebarOpen, 
  middleTab, 
  setMiddleTab, 
  activeNav, 
  onNavigate, 
  username, 
  handleLogout, 
  incidentCount 
}) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tab: 'pipeline' },
    { id: 'incidents', label: 'Active Incidents', icon: ShieldAlert, tab: 'pipeline', badge: incidentCount },
    { id: 'investigation', label: 'AI Investigation', icon: Cpu, tab: 'pipeline' },
    { id: 'evidence', label: 'Evidence Vault', icon: Database, tab: 'pipeline' },
    { id: 'intel', label: 'Threat Intelligence', icon: Globe, tab: 'pipeline' },
    { id: 'mitre', label: 'MITRE ATT&CK', icon: Shield, tab: 'pipeline' },
    { id: 'timeline', label: 'Timeline', icon: Clock, tab: 'pipeline' },
    { id: 'postmortems', label: 'Postmortems', icon: FileText, tab: 'postmortem' },
    { id: 'kb', label: 'Knowledge Base', icon: Database, tab: 'pipeline' },
    { id: 'reports', label: 'Reports', icon: BarChart2, tab: 'pipeline' },
    { id: 'settings', label: 'Settings', icon: Settings, tab: 'pipeline' }
  ];

  return (
    <aside 
      className={`border-r border-[var(--border-default)] bg-[var(--bg-base)] flex flex-col transition-all duration-300 ease-in-out shrink-0 select-none h-screen ${
        isSidebarOpen ? 'w-[260px]' : 'w-[72px]'
      }`}
    >
      {/* Header / Logo Section */}
      <div className="h-[72px] border-b border-[var(--border-default)] flex items-center justify-between px-4 shrink-0 overflow-hidden">
        {isSidebarOpen ? (
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
              <HeartbeatLogo />
            </div>
            <div className="flex flex-col select-none">
              <span className="text-sm font-semibold text-[var(--text-primary)] tracking-wide leading-none">IR Agent</span>
              <span className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">SOC Orchestrator</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto">
            <div className="w-10 h-10 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
              <HeartbeatLogo />
            </div>
          </div>
        )}
        {isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-[var(--bg-surface)] rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all ml-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto terminal-scroll">
        {navItems.map((item) => {
          const Icon = item.icon;
          // Determine active status: postmortem tab matches 'postmortems' link; else active if dashboard/pipeline/etc.
          const isActive = activeNav === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center p-2.5 rounded-[6px] text-xs transition-all font-sans ${
                isActive 
                  ? 'bg-[var(--bg-surface)] border border-[var(--accent-cyan)] text-[var(--text-primary)] font-semibold' 
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] border border-transparent'
              } ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}
              title={item.label}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {isSidebarOpen && <span className="truncate">{item.label}</span>}
              </div>
              {isSidebarOpen && item.badge > 0 && (
                <span className="text-[var(--text-primary)] text-[10px] font-mono px-2 py-0.5 rounded-[6px] font-bold shrink-0 bg-[var(--severity-critical)]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Trigger for Collapsed Sidebar */}
      {!isSidebarOpen && (
        <div className="flex justify-center py-2 border-t border-[var(--border-default)]">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-[var(--bg-surface)] rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bottom Area: Agent Online Status */}
      <div className="p-3 border-t border-[var(--border-default)] shrink-0">
        {isSidebarOpen ? (
          <div className="bg-[var(--bg-surface)] rounded-[10px] p-2.5 flex items-center space-x-2.5 select-none border border-[var(--border-default)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-telemetry-pulse absolute inline-flex h-full w-full rounded-full bg-[var(--status-success)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-success)]"></span>
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-[var(--text-primary)] leading-none">Agent Online</span>
              <span className="text-[8px] text-[var(--text-muted)] mt-0.5 truncate">All systems nominal</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center p-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-telemetry-pulse absolute inline-flex h-full w-full rounded-full bg-[var(--status-success)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--status-success)]"></span>
            </span>
          </div>
        )}

        {/* Profile/Operator area */}
        <div className="mt-3 flex items-center justify-between min-w-0">
          {isSidebarOpen ? (
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-primary)] shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate leading-none">{username}</div>
                <div className="text-[9px] text-[var(--text-muted)] mt-0.5 font-mono truncate uppercase">Analyst</div>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-8 h-8 rounded-full bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-primary)] shrink-0">
              <User className="w-4 h-4" />
            </div>
          )}

          {isSidebarOpen && (
            <button 
              onClick={handleLogout}
              className="text-[var(--text-muted)] hover:text-[var(--severity-critical)] p-2 rounded-[6px] hover:bg-[var(--bg-surface)] transition-all shrink-0"
              title="Terminate session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
