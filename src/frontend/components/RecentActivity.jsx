import React from 'react';
import { Clock } from 'lucide-react';

export function RecentActivity({ timeline, liveLogs }) {
  // Extract recent activities from timeline or liveLogs
  const getActivities = () => {
    if (timeline && timeline.length > 0) {
      return timeline.slice(0, 3).map((item) => {
        const time = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          time,
          message: item.summary || 'Incident update recorded',
          actor: item.actor || 'system'
        };
      });
    }

    if (liveLogs && liveLogs.length > 0) {
      // Get unique log messages or just the last few
      return liveLogs.slice(-3).reverse().map((item) => {
        const time = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          time,
          message: item.message,
          actor: item.stepId ? item.stepId.replace('-step', '') : 'system'
        };
      });
    }

    // Default mock activities if empty
    return [
      { time: '09:41', message: 'New incident ingested into system', actor: 'ingest' },
      { time: '09:41', message: 'Log normalization pipeline running', actor: 'normalize' },
      { time: '09:41', message: 'Analysis engine signature matching triggered', actor: 'analyze' }
    ];
  };

  const activities = getActivities();

  return (
    <div className="glass-panel glow-hover rounded-[18px] p-5 h-[160px] flex flex-col justify-between select-none shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2.5">
        <div className="flex items-center space-x-2 text-white">
          <Clock className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider font-sans">Recent Activity</h3>
        </div>
        <button className="text-[9px] font-semibold text-slate-500 hover:text-white transition-all font-mono">
          View All →
        </button>
      </div>

      <div className="flex-1 mt-2.5 space-y-2 overflow-y-auto terminal-scroll pr-1">
        {activities.map((act, idx) => (
          <div key={idx} className="flex items-start space-x-3 text-[11px]">
            <span className="text-slate-500 font-mono font-bold shrink-0">{act.time}</span>
            <div className="flex-1 text-slate-300 font-sans leading-tight truncate">
              <span className="text-purple-400 font-mono font-bold mr-1.5 uppercase">[{act.actor}]</span>
              {act.message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
