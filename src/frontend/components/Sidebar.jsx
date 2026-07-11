import React from 'react';
import { 
  LayoutDashboard, ShieldAlert, Cpu, Database, Globe, Shield, Clock, 
  FileText, BarChart2, Settings, ChevronLeft, ChevronRight, LogOut, User, Bell,
  Layers, Wrench, TrendingUp
} from 'lucide-react';

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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'incidents', label: 'Active Incidents', icon: ShieldAlert, badge: incidentCount },
    { id: 'investigation', label: 'Investigation', icon: Cpu },
    { id: 'evidence', label: 'Evidence Vault', icon: Database },
    { id: 'intel', label: 'Threat Intelligence', icon: Globe },
    { id: 'mitre', label: 'MITRE ATT&CK', icon: Shield },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'postmortems', label: 'Postmortems', icon: FileText },
    { id: 'kb', label: 'Knowledge Base', icon: Database },
    { id: 'groups', label: 'Incident Groups', icon: Layers },
    { id: 'analytics', label: 'Model Analytics', icon: TrendingUp },
    { id: 'toolkit', label: 'Security Toolkit', icon: Wrench },
    { id: 'reports', label: 'Reports', icon: BarChart2 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <aside 
      className={`canva-sidebar flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out select-none h-screen ${
        isSidebarOpen ? 'w-60' : 'w-[72px]'
      }`}
    >
      {/* Header / Logo Section */}
      <div className="p-4 flex items-center justify-between border-b border-[#151B2B] h-[72px] overflow-hidden shrink-0">
        {isSidebarOpen ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black shadow-[0_0_12px_rgba(59,130,246,0.4)] overflow-hidden">
              <img 
                src="/images/shield-check.png" 
                className="w-8 h-8 object-contain scale-[1.75]" 
                style={{ mixBlendMode: 'screen' }} 
                alt="Logo" 
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }} 
              />
              <Shield className="w-5 h-5 text-white hidden" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#FFFFFF] leading-tight font-sans">IR Agent</p>
              <p className="text-[10px] text-[#888D9A] leading-none mt-0.5">Incident Response Agent</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-9 h-9 rounded-lg flex items-center justify-center bg-black shadow-[0_0_12px_rgba(59,130,246,0.4)] overflow-hidden">
            <img 
              src="/images/shield-check.png" 
              className="w-8 h-8 object-contain scale-[1.75]" 
              style={{ mixBlendMode: 'screen' }} 
              alt="Logo" 
            />
          </div>
        )}
        {isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 hover:bg-[#0A0D15] rounded text-[#888D9A] hover:text-[#FFFFFF] transition-all ml-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto terminal-scroll">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`nav-item w-full flex items-center px-3 py-2 rounded-lg text-left text-xs ${
                isActive ? 'active text-[#E8EBF3]' : 'text-[#8892A6]'
              } ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}
              title={isSidebarOpen ? undefined : item.label}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`nav-icon w-4 h-4 ${isActive ? 'text-[#3B82F6]' : 'text-[#8892A6]'}`} />
                {isSidebarOpen && <span className="truncate">{item.label}</span>}
              </div>
              {isSidebarOpen && item.badge > 0 && (
                <span className="badge-blue rounded-full px-2 py-0.5 text-[9px] text-[#3B82F6] font-medium font-mono shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Trigger for Collapsed Sidebar */}
      {!isSidebarOpen && (
        <div className="flex justify-center py-2 border-t border-[#0A0E1A]">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-[#0A0D15] rounded text-[#888D9A] hover:text-[#FFFFFF] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bottom Area: Profile & Notification Toggle */}
      <div className="p-3 border-t border-[#0A0E1A] space-y-2 shrink-0">
        {isSidebarOpen && (
          <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[10px] text-[#A0A8B3] hover:bg-[#0A0D15] transition-all">
            <span className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5" />
              <span>Alert Other Teams & Channels</span>
            </span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}

        <div className="flex items-center justify-between px-3 py-1">
          {isSidebarOpen ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full accent-gradient flex items-center justify-center text-[10px] text-white font-bold shrink-0">
                {username ? username.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="overflow-hidden">
                <p className="text-[11px] text-[#FFFFFF] font-medium truncate leading-tight">{username}</p>
                <p className="text-[9px] text-[#888D9A] leading-none mt-0.5">Administrator</p>
              </div>
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full accent-gradient flex items-center justify-center text-[10px] text-white font-bold mx-auto">
              {username ? username.charAt(0).toUpperCase() : 'A'}
            </div>
          )}
          
          {isSidebarOpen && (
            <button 
              onClick={handleLogout}
              className="text-[#888D9A] hover:text-[#EF4444] p-1.5 rounded hover:bg-[#0A0D15] transition-all shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
