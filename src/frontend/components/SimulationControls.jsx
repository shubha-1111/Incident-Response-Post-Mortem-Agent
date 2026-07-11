import React from 'react';
import { Play } from 'lucide-react';

export function SimulationControls({ triggerSimulation }) {
  const simulations = [
    { label: 'Simulate Credential Stuffing', type: 'stuffing', color: 'hover:border-red-500/35 hover:text-red-400' },
    { label: 'Simulate Port Scan', type: 'scan', color: 'hover:border-purple-500/35 hover:text-purple-400' },
    { label: 'Simulate SQL Injection', type: 'sql', color: 'hover:border-amber-500/35 hover:text-amber-400' }
  ];

  return (
    <div className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[18px] p-5 h-[160px] flex flex-col justify-between select-none">
      <div className="flex items-center space-x-2 text-white border-b border-[rgba(255,255,255,0.06)] pb-2.5">
        <Play className="w-4 h-4 text-purple-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider font-sans">Simulation Controls</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {simulations.map((sim, idx) => (
          <button
            key={idx}
            onClick={() => triggerSimulation(sim.type)}
            className={`w-full py-2.5 px-3 bg-slate-950/40 border border-[rgba(255,255,255,0.04)] rounded-[12px] text-[10.5px] font-mono text-slate-400 font-semibold transition-all active:scale-[0.98] ${sim.color}`}
          >
            {sim.label}
          </button>
        ))}
      </div>
    </div>
  );
}
