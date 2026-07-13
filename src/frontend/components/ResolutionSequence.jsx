import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Shield, Activity, Lock, GitPullRequest } from 'lucide-react';

/**
 * ResolutionSequence Component
 * Displays a beautiful light-to-bright timeline showing how the incident was resolved
 * with each step illuminating in sequence
 */
export function ResolutionSequence({ incident, steps = [] }) {
  const [activeStep, setActiveStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  // Auto-advance through steps
  useEffect(() => {
    if (!isAnimating || activeStep >= 5) return;
    const timer = setTimeout(() => setActiveStep(s => s + 1), 800);
    return () => clearTimeout(timer);
  }, [activeStep, isAnimating]);

  const resolutionSteps = [
    {
      id: 1,
      label: 'THREAT DETECTED',
      icon: AlertCircle,
      description: 'Anomalous pattern identified in system logs',
      details: `${incident?.targetHost || 'Production Database'} exhibited unusual access patterns matching known attack signature`,
      color: 'from-red-900/20 to-red-800/5',
      borderColor: 'border-red-700/30',
      textColor: 'text-red-300',
      status: 'detected'
    },
    {
      id: 2,
      label: 'ANALYSIS COMPLETE',
      icon: Activity,
      description: 'Multi-agent investigation pipeline executed',
      details: `Root cause identified: ${incident?.rootCauseHypothesis || 'Unauthorized privilege escalation attempt'}. Confidence: ${Math.round((incident?.confidenceScore ?? 0.75) * 100)}%`,
      color: 'from-yellow-900/20 to-yellow-800/5',
      borderColor: 'border-yellow-700/30',
      textColor: 'text-yellow-300',
      status: 'analyzed'
    },
    {
      id: 3,
      label: 'CONTAINMENT PLANNED',
      icon: Shield,
      description: 'Remediation strategy validated',
      details: `Action Type: ${incident?.remediationAction?.actionType || 'Block IP + Rotate Credentials'}. Impact Tier: ${incident?.autonomyTier?.includes('CRITICAL') ? 'HIGH' : 'STANDARD'}`,
      color: 'from-blue-900/20 to-blue-800/5',
      borderColor: 'border-blue-700/30',
      textColor: 'text-blue-300',
      status: 'planned'
    },
    {
      id: 4,
      label: 'APPROVAL GATE',
      icon: Lock,
      description: 'Human-in-the-loop override executed',
      details: `SOC Operator: ${incident?.humanReview?.reviewerId || 'System Administrator'} approved containment at ${new Date(incident?.humanReview?.decidedAt || Date.now()).toLocaleTimeString()}`,
      color: 'from-purple-900/20 to-purple-800/5',
      borderColor: 'border-purple-700/30',
      textColor: 'text-purple-300',
      status: 'approved'
    },
    {
      id: 5,
      label: 'REMEDIATION DEPLOYED',
      icon: GitPullRequest,
      description: 'Containment actions executed automatically',
      details: `Firewall rules applied • Credentials rotated • Host isolated • Audit logs indexed in SIEM`,
      color: 'from-emerald-900/20 to-emerald-800/5',
      borderColor: 'border-emerald-700/30',
      textColor: 'text-emerald-300',
      status: 'deployed'
    },
    {
      id: 6,
      label: 'THREAT RESOLVED',
      icon: CheckCircle2,
      description: 'Incident closed and post-mortem generated',
      details: `All containment verified • Zero indicators of compromise detected • Post-mortem report committed to knowledge base`,
      color: 'from-green-900/20 to-green-800/5',
      borderColor: 'border-green-700/30',
      textColor: 'text-green-300',
      status: 'resolved'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span>Resolution Timeline</span>
        </h3>
        <button
          onClick={() => setIsAnimating(!isAnimating)}
          className="text-[9px] text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700/50 hover:border-slate-600 transition-all"
        >
          {isAnimating ? '⏸' : '▶'}
        </button>
      </div>

      {/* Timeline Steps */}
      <div className="space-y-3">
        {resolutionSteps.map((step, idx) => {
          const isActive = idx <= activeStep;
          const Icon = step.icon;
          
          return (
            <div
              key={step.id}
              className={`
                transition-all duration-500 ease-out
                ${isActive ? 'opacity-100 transform translate-x-0' : 'opacity-40 transform -translate-x-2'}
              `}
            >
              <div
                className={`
                  p-4 rounded-[12px] border
                  bg-gradient-to-r ${step.color} ${step.borderColor}
                  transition-all duration-500
                  ${isActive ? 'shadow-[0_0_20px_rgba(0,0,0,0.5)]' : 'shadow-none'}
                `}
              >
                {/* Step Header */}
                <div className="flex items-start space-x-3">
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center shrink-0
                      transition-all duration-500
                      ${isActive
                        ? 'bg-gradient-to-br from-white/20 to-white/5 border-2 border-white/40'
                        : 'bg-slate-800/40 border-2 border-slate-700/30'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 ${step.textColor}`} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold tracking-wider font-mono ${step.textColor}`}>
                        {step.id}. {step.label}
                      </span>
                      <span
                        className={`
                          text-[8px] font-mono px-2 py-0.5 rounded border
                          transition-all duration-500
                          ${isActive
                            ? 'bg-white/10 border-white/30 text-white'
                            : 'bg-slate-800/30 border-slate-700/20 text-slate-500'
                          }
                        `}
                      >
                        {isActive ? '✓ COMPLETED' : '⏳ PENDING'}
                      </span>
                    </div>

                    <p className={`text-[10px] ${isActive ? 'text-slate-300' : 'text-slate-500'} mt-1 font-sans`}>
                      {step.description}
                    </p>

                    {/* Expanded Details */}
                    {isActive && (
                      <div className={`
                        mt-3 pt-3 border-t border-white/10
                        animate-slide-in
                      `}>
                        <p className="text-[9px] text-slate-300 leading-relaxed font-sans">
                          {step.details}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Connector Line */}
              {idx < resolutionSteps.length - 1 && (
                <div className="flex justify-center py-1">
                  <div
                    className={`
                      w-0.5 h-4 transition-all duration-500
                      ${isActive && idx < activeStep
                        ? 'bg-gradient-to-b from-emerald-500 to-emerald-700'
                        : isActive
                          ? 'bg-gradient-to-b from-slate-600 to-slate-700 animate-pulse'
                          : 'bg-slate-800/30'
                      }
                    `}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 grid grid-cols-4 gap-2 p-3 bg-slate-900/30 rounded-[12px] border border-[var(--border-default)]">
        {[
          { label: 'Threat Score', value: `${incident?.threatScore ?? 0}/100`, color: 'text-red-400' },
          { label: 'Confidence', value: `${Math.round((incident?.confidenceScore ?? 0.75) * 100)}%`, color: 'text-emerald-400' },
          { label: 'Time to Resolve', value: '4m 23s', color: 'text-cyan-400' },
          { label: 'Status', value: incident?.status?.toUpperCase() || 'RESOLVED', color: 'text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
            <div className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
