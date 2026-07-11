import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

export function LiveEventStream({ 
  liveLogs, 
  timeline, 
  evidenceChain 
}) {
  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);

  // Only auto-scroll when the user is already pinned to the bottom,
  // so reading earlier logs isn't interrupted by incoming events.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 40;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [liveLogs, timeline, evidenceChain]);

  const renderLogs = () => {
    if (liveLogs.length > 0) {
      return liveLogs.map((entry, idx) => {
        let colorClass = 'text-cyan-400';
        const level = String(entry.level).toLowerCase();
        if (level === 'critical' || level === 'error') {
          colorClass = 'text-red-400 font-semibold';
        } else if (level === 'warn' || level === 'warning') {
          colorClass = 'text-amber-400 font-semibold';
        } else if (level === 'info') {
          colorClass = 'text-emerald-400';
        }
        return (
          <div key={idx} className="border-b border-[var(--border-default)] pb-1.5 last:border-b-0 last:pb-0 select-text break-words">
            <span className="text-[var(--text-muted)] font-medium select-none">
              [{new Date(entry.timestamp || Date.now()).toLocaleTimeString()}]
            </span>
            <span className="text-[var(--accent-violet)] ml-1.5 font-semibold">
              [{entry.stepId ? entry.stepId.replace('-step', '') : 'system'}]
            </span>
            <span className={`ml-1.5 ${colorClass} break-words`}>{entry.message}</span>
          </div>
        );
      });
    }

    if (timeline.length > 0) {
      return timeline.map((entry, idx) => {
        let colorClass = 'text-slate-300';
        if (entry.severity === 'high' || entry.severity === 'critical') {
          colorClass = 'text-red-400 font-semibold';
        } else if (entry.severity === 'medium') {
          colorClass = 'text-amber-400 font-semibold';
        } else if (entry.severity === 'low') {
          colorClass = 'text-emerald-400';
        }
        
        return (
          <div key={idx} className="border-b border-[var(--border-default)] pb-1.5 last:border-b-0 last:pb-0 select-text">
            <span className="text-[var(--text-muted)] font-medium select-none">
              [{new Date(entry.timestamp || Date.now()).toLocaleTimeString()}]
            </span>
            <span className="text-[var(--accent-violet)] ml-1.5 font-semibold">[{entry.actor || 'system'}]</span>
            <span className={`ml-1.5 ${colorClass}`}>{entry.summary}</span>
          </div>
        );
      });
    }

    if (evidenceChain.length > 0) {
      return evidenceChain.map((entry, idx) => {
        const colorClass = entry.confidence > 0.8
          ? 'text-red-400 font-semibold' 
          : entry.confidence > 0.5 
            ? 'text-amber-400 font-semibold' 
            : 'text-emerald-400';
        return (
          <div key={idx} className="border-b border-[var(--border-default)] pb-1.5 last:border-b-0 last:pb-0 select-text">
            <span className="text-[var(--text-muted)] font-medium select-none">
              [{new Date(entry.observedAt || Date.now()).toLocaleTimeString()}]
            </span>
            <span className="text-[var(--text-secondary)] ml-1.5 font-semibold">{entry.payload?.host || 'host'}</span>
            <span className={`ml-1.5 ${colorClass}`}>{entry.summary}</span>
          </div>
        );
      });
    }

    return (
      <div className="text-[var(--text-muted)] italic text-[10px] text-center pt-20">
        Waiting for live event stream…
      </div>
    );
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-5 flex flex-col h-[280px]">
      <div className="flex items-center space-x-2 text-[var(--text-primary)] mb-3 pb-2 border-b border-[var(--border-default)] select-none">
        <Terminal className="w-4 h-4 text-[var(--accent-cyan)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider font-sans">Live Event Stream</h3>
      </div>
      
      {/* Terminal scroll block */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[10px] p-3 font-mono text-[9px] overflow-y-auto overflow-x-hidden terminal-scroll space-y-2.5"
      >
        {renderLogs()}

        {/* Blinking cursor */}
        <span className="animate-telemetry-pulse text-[var(--accent-cyan)] font-semibold block mt-1">█</span>
      </div>
    </div>
  );
}
