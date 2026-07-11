import React from 'react';
import { Bell, Search, ChevronDown, ShieldCheck, Timer, AlertTriangle, CheckCircle, GitBranch } from 'lucide-react';

export function Header({ 
  username, 
  handleLogout, 
  isConnected, 
  dashboardStats, 
  incidents 
}) {
  const activeCount = dashboardStats?.activeIncidents ?? incidents.filter(i => !['resolved', 'reported', 'human_denied'].includes(i.status)).length;
  const resolvedCount = dashboardStats?.resolvedToday ?? 0;
  const mitreSeen = dashboardStats?.mitreTechniquesSeen ?? 0;
  
  let avgResolutionText = '0s';
  if (dashboardStats?.avgResolutionMs) {
    const mins = Math.round(dashboardStats.avgResolutionMs / 60000);
    avgResolutionText = mins > 0 ? `${mins}m` : `${Math.round(dashboardStats.avgResolutionMs / 1000)}s`;
  }

  const kpis = [
    { 
      label: 'Active Incidents', 
      value: activeCount, 
      desc: 'Investigations in progress',
      icon: AlertTriangle,
      img: '/images/squares.png',
      color: 'text-[#E8EBF3]'
    },
    { 
      label: 'Resolved Today', 
      value: resolvedCount, 
      desc: 'Incidents closed',
      icon: CheckCircle,
      img: '/images/squares.png',
      color: 'text-[#E8EBF3]'
    },
    { 
      label: 'Active Techniques', 
      value: mitreSeen, 
      desc: 'MITRE techniques detected',
      icon: GitBranch,
      img: '/images/squares.png',
      color: 'text-[#E8EBF3]'
    },
    { 
      label: 'Avg. Resolution Time', 
      value: avgResolutionText, 
      desc: 'Mean time to resolve',
      icon: Timer,
      color: 'text-[#E8EBF3]'
    }
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
            <p className="text-[10px] text-[#888D9A] mt-0.5 leading-none">AI-Powered • Fast • Intelligent</p>
          </div>
        </div>

        {/* Right Section Controls */}
        <div className="flex items-center gap-4">
          <button className="px-3 py-1.5 rounded-full text-[10px] font-medium text-[#A0A8B3] border border-[#0A0E1A] bg-[#0A0D15] flex items-center gap-1.5">
            SYSTEM: {isConnected ? 'OPERATIONS' : 'OFFLINE'} <ChevronDown className="w-3 h-3" />
          </button>
          
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888D9A]" />
            <input 
              type="text" 
              placeholder="Search incidents, threats..." 
              className="bg-[#0A0D15] border border-[#0A0E1A] rounded-full pl-8 pr-4 py-1.5 text-[11px] w-52 focus:outline-none focus:border-[#3B82F6] text-[#FFFFFF] placeholder-[#888D9A]"
              readOnly
            />
          </div>

          <div className="relative cursor-pointer">
            <Bell className="w-4.5 h-4.5 text-[#8892A6]" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#EF4444] rounded-full text-[8px] text-white flex items-center justify-center font-bold">2</span>
          </div>

          <div className="flex items-center gap-2 border-l border-[#0A0E1A] pl-3">
            <div className="w-7 h-7 rounded-full accent-gradient flex items-center justify-center text-[10px] text-white font-bold">
              {username ? username.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-[#FFFFFF] font-medium leading-none">{username}</p>
              <p className="text-[9px] text-[#888D9A] mt-0.5 leading-none">Administrator</p>
            </div>
            <ChevronDown className="w-3 h-3 text-[#888D9A] cursor-pointer" onClick={handleLogout} />
          </div>
        </div>
      </header>

      {/* KPI Stats Grid Row */}
      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-4 gap-4 select-none">
        {kpis.map((kpi, idx) => {
          const IconComp = kpi.icon;
          return (
            <div key={idx} className="canva-card card-panel p-4 flex items-center gap-3">
              <div className="icon-tile w-10 h-10 flex items-center justify-center flex-shrink-0">
                {kpi.img ? (
                  <img src={kpi.img} className="w-5 h-5 object-contain" alt="icon" onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }} />
                ) : null}
                <IconComp className="w-5 h-5 text-[#3B82F6]" style={kpi.img ? { display: 'none' } : {}} />
              </div>
              <div>
                <p className="text-[10px] text-[#8892A6] uppercase tracking-wider leading-none">{kpi.label}</p>
                <p className="text-xl font-bold text-[#E8EBF3] mt-1.5 leading-none">{kpi.value}</p>
                <p className="text-[9px] text-[#5C6478] mt-1 leading-none">{kpi.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
