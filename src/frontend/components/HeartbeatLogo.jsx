import React from 'react';

export function HeartbeatLogo() {
  return (
    <div className="flex items-center space-x-1 filter drop-shadow-[0_0_8px_rgba(239,68,68,0.75)]">
      <svg className="w-16 h-8 text-red-500" viewBox="0 0 160 80" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* Glow path */}
        <path 
          d="M 5,40 L 35,40 L 40,30 L 44,50 L 48,40 L 55,40 L 61,10 L 67,70 L 71,40 L 75,40" 
          className="stroke-red-500 opacity-30" 
          strokeWidth="6"
        />
        {/* Core path */}
        <path 
          d="M 5,40 L 35,40 L 40,30 L 44,50 L 48,40 L 55,40 L 61,10 L 67,70 L 71,40 L 75,40" 
          className="stroke-red-500" 
        />
        {/* Heart shape in the middle */}
        <path 
          d="M 85,38 C 85,34 81.5,31 77.5,31 C 73.5,31 71,34.5 71,38 C 71,43.5 76,47.5 85,53.5 C 94,47.5 99,43.5 99,38 C 99,34.5 96.5,31 92.5,31 C 88.5,31 85,34 85,38 Z"
          fill="currentColor"
          className="text-red-500"
        />
        {/* Heartbeat pulse on the right */}
        <path 
          d="M 95,40 L 103,40 L 107,32 L 111,48 L 115,40 L 122,40 L 128,20 L 134,60 L 138,40 L 155,40" 
          className="stroke-red-500 opacity-30" 
          strokeWidth="6"
        />
        <path 
          d="M 95,40 L 103,40 L 107,32 L 111,48 L 115,40 L 122,40 L 128,20 L 134,60 L 138,40 L 155,40" 
          className="stroke-red-500" 
        />
      </svg>
    </div>
  );
}
