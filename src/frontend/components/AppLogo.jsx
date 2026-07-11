import React from 'react';

export function AppLogo({ size = 36, className = '' }) {
  const gid = 'appLogoGrad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <filter id="appLogoGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Shield body */}
      <path
        d="M24 3.5 L41 9.5 V23 C41 34 33.5 42 24 44.5 C14.5 42 7 34 7 23 V9.5 Z"
        fill="url(#appLogoGrad)"
        fillOpacity="0.16"
        stroke="url(#appLogoGrad)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        filter="url(#appLogoGlow)"
      />

      {/* Embedded heartbeat / pulse line */}
      <path
        d="M13 24 H19 L21.5 18 L25 30 L28.5 21 L31 24 H35"
        fill="none"
        stroke="url(#appLogoGrad)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Center node */}
      <circle cx="24" cy="24" r="2.1" fill="url(#appLogoGrad)" />
    </svg>
  );
}
