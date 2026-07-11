import React from 'react';
import { 
  Workflow, FileText, Check, X, ShieldAlert, CheckCircle, Eye, 
  RefreshCw, GitPullRequest, ExternalLink, Play 
} from 'lucide-react';

export function ExecutionPipeline({
  middleTab,
  setMiddleTab,
  status,
  incident,
  steps,
  getTierStatus,
  handleApprove,
  handleReject,
  getPostmortemProgress,
  liveLogs,
  MarkdownRenderer
}) {
  
  const pipelineTiers = [
    { num: 1, name: 'Ingest Agent', desc: 'PII scrubbing & telemetry log ingestion checks' },
    { num: 2, name: 'Log Signature Agent', desc: 'Regex warning & credential/scan pattern parsing' },
    { num: 3, name: 'Anomaly Detection Agent', desc: 'WebSocket signal spike check & historical searches' },
    { num: 4, name: 'Remediation Planner', desc: 'Blast radius calculation and CMDB lookup checks' },
    { num: 5, name: 'Autonomy Lifespan Router', desc: 'Enkrypt policy validation & override checks' },
    { num: 6, name: 'SRE Report Compiler', desc: 'Markdown post-mortem assembly & GitHub sync' }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {/* Tab selection header */}
      <div className="h-14 border-b border-[var(--border-default)] px-6 flex items-center justify-between shrink-0">
        <div className="flex space-x-6 text-xs font-mono">
          <button 
            onClick={() => setMiddleTab('pipeline')}
            className={`py-4 px-1 border-b-2 font-semibold transition-all uppercase flex items-center space-x-1.5 ${
              middleTab === 'pipeline' 
                ? 'border-[#3B82F6] text-white' 
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Workflow Pipeline</span>
          </button>
          
          <button 
            onClick={() => setMiddleTab('postmortem')}
            disabled={!['resolved', 'reported'].includes(status)}
            className={`py-4 px-1 border-b-2 font-semibold transition-all uppercase flex items-center space-x-1.5 disabled:opacity-25 ${
              middleTab === 'postmortem' 
                ? 'border-[#3B82F6] text-white' 
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>SRE Post-Mortem</span>
          </button>
        </div>

        {incident && (
          <div className="text-[10px] font-mono text-[var(--text-muted)] flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-telemetry-pulse" />
            <span>Autonomy: {incident.autonomyTier || 'L2_HITL'}</span>
          </div>
        )}
      </div>

      {/* Content Area - workflow-pipeline for onboarding tour */}
      <div className="workflow-pipeline flex-1 p-6 overflow-y-auto space-y-6 terminal-scroll">
        
        {/* VIEW A: PIPELINE FLOW */}
        {middleTab === 'pipeline' && (
          <div className="space-y-6">
            
            {/* IDLE STATE - No incident selected */}
            {!incident && (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[var(--border-default)] rounded-[10px] bg-[var(--bg-surface)] p-8 text-center min-h-[400px]">
                <div className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-telemetry-pulse mb-3" />
                <p className="tech-mono text-[12px] uppercase tracking-widest text-[var(--text-muted)]">
                  AWAITING INGEST LOG STREAM OPERATOR DATA
                </p>
              </div>
            )}
            
            {/* Operator Approval / Override Banner */}
            {status === 'pending_human_review' && (
              <div className="card-panel p-5 space-y-4">
                <div className="flex items-start space-x-3.5">
                  <div className="w-10 h-10 rounded-[6px] bg-slate-900 border border-slate-700 text-white flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold font-mono text-[var(--text-primary)] uppercase tracking-wider">Operator Action Required</h4>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-sans">
                      The execution loop has paused at the Governance Gate. Autonomy route suspended for high-impact host protection. Click approve to authorize containment blocks.
                    </p>
                  </div>
                </div>

                <div className="flex space-x-3 pt-2 border-t border-[var(--border-default)]">
                  <button 
                    onClick={handleApprove}
                    className="btn-approve-glow px-5 py-2.5 rounded-lg flex items-center gap-2 text-xs font-semibold select-none cursor-pointer"
                  >
                    <img 
                      src="/images/btn-approve.png" 
                      className="w-4 h-4 object-contain" 
                      style={{ mixBlendMode: 'screen' }} 
                      alt="Check" 
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span>Approve</span>
                  </button>
                  <button 
                    onClick={handleReject}
                    className="bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] text-[var(--severity-critical)] border border-[var(--border-default)] font-semibold text-[10px] font-mono px-5 py-2.5 rounded-[6px] transition-all flex items-center space-x-1.5 uppercase"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject Execution</span>
                  </button>
                </div>
              </div>
            )}

            {status === 'human_denied' && (
              <div className="card-panel p-5">
                <div>
                  <h4 className="text-xs font-semibold font-mono text-[var(--text-primary)] uppercase tracking-wider">Containment Block Rejected</h4>
                  <p className="text-[11px] text-[var(--text-secondary)] font-sans mt-0.5 leading-relaxed">
                    Manual override: rejected. The response loop was halted at Governance Gate. Controls returned safely to human SOC operators.
                  </p>
                </div>
              </div>
            )}

            {['resolved', 'reported'].includes(status) && (
              <div className="card-panel p-5 flex justify-between items-center">
                <div className="flex items-center space-x-3.5">
                  <div>
                    <h4 className="text-xs font-semibold font-mono text-[var(--text-primary)] uppercase tracking-wider">Incident Mitigation Completed</h4>
                    <p className="text-[11px] text-[var(--text-secondary)] font-sans mt-0.5 leading-relaxed">
                      All steps executed successfully. An incident post-mortem SRE document has been generated and pushed to source control.
                    </p>
                  </div>
                </div>
                
                <button 
                  onClick={() => setMiddleTab('postmortem')}
                  className="bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] text-[var(--status-success)] border border-[var(--border-default)] px-4 py-2 rounded-[6px] text-[10px] font-mono font-semibold flex items-center space-x-1.5 uppercase transition-all"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Read Report</span>
                </button>
              </div>
            )}

            {/* Workflow nodes graph */}
            {incident && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] p-6 space-y-6 flex flex-col items-center">
                {/* Glowing Star Visual Diagram from template */}
                <div className="w-full flex justify-center mb-2">
                  <img 
                    src="/images/workflow.png" 
                    className="w-48 h-28 object-contain" 
                    style={{ mixBlendMode: 'screen' }}
                    alt="Workflow Graph" 
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
                
                <div className="w-full pb-3 border-b border-[var(--border-default)] flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider font-sans text-[var(--text-primary)]">Execution Pipeline</h3>
                  <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">Live graph status</span>
                </div>

                {/* Vertical timelines layout */}
                <div className="relative pl-8 space-y-6">
                  {/* Flow line */}
                  <div className="absolute left-[15px] top-4 bottom-4 w-0.5 border-l-2 border-dashed border-[var(--border-default)]" />

                {pipelineTiers.map((tier) => {
                  const stateInfo = getTierStatus(tier.num);
                  const isRunning = stateInfo.text === 'INVESTIGATING' || stateInfo.text === 'OVERRIDE REQUIRED';
                  const isCompleted = stateInfo.text === 'COMPLETE';
                  const isFailed = stateInfo.text === 'FAILED' || stateInfo.text === 'BLOCKED BY SOC';
                  
                  // Color bullet
                  let bulletColor = 'bg-[var(--border-default)] border-[var(--border-strong)]';
                  if (isRunning) bulletColor = 'bg-[var(--accent-cyan)] border-[var(--accent-cyan)] animate-telemetry-pulse ring-4 ring-[var(--accent-cyan)]/20';
                  else if (isCompleted) bulletColor = 'bg-[var(--status-success)] border-[var(--status-success)]';
                  else if (isFailed) bulletColor = 'bg-[var(--severity-critical)] border-[var(--severity-critical)]';

                  return (
                    <div key={tier.num} className="relative flex items-center justify-between group">
                      {/* Left side node dot */}
                      <span className={`absolute -left-[31px] w-4.5 h-4.5 rounded-full border-2 z-10 flex items-center justify-center ${bulletColor}`}>
                        {isCompleted && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                        {isFailed && <X className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </span>

                      {/* Content block */}
                      <div className="flex-1 pr-4">
                        <h4 className="text-xs font-semibold text-[var(--text-primary)] font-sans">{tier.name}</h4>
                        <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">{tier.desc}</p>
                      </div>

                      {/* Badge status */}
                      <span className="text-[8.5px] font-mono font-semibold px-2 py-1 rounded-[6px] uppercase tech-mono" style={{
                        color: isCompleted ? 'var(--status-success)' :
                               isRunning ? 'var(--accent-cyan)' :
                               isFailed ? 'var(--severity-critical)' :
                               'var(--text-muted)',
                        backgroundColor: isCompleted ? 'rgba(147, 197, 253, 0.12)' :
                                         isRunning ? 'rgba(147, 197, 253, 0.12)' :
                                         isFailed ? 'rgba(251, 58, 93, 0.12)' :
                                         'rgba(91, 100, 120, 0.12)',
                        borderColor: isCompleted ? 'var(--status-success)' :
                                    isRunning ? 'var(--accent-cyan)' :
                                    isFailed ? 'var(--severity-critical)' :
                                    'var(--border-default)'
                      }}>
                        {stateInfo.text}
                      </span>
                    </div>
                  );
                })}
                </div>
              </div>
            )}

            {/* Post-Mortem Draft Switcher button when finished */}
            {['resolved', 'reported'].includes(status) && (
              <button 
                onClick={() => setMiddleTab('postmortem')}
                className="w-full bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] border border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-primary)] font-semibold py-3.5 px-4 rounded-[10px] transition-all flex items-center justify-center space-x-2 font-mono text-xs uppercase"
              >
                <span>View Post-Mortem Draft</span>
                <span>→</span>
              </button>
            )}
          </div>
        )}

        {/* VIEW B: POST-MORTEM SRE REPORT */}
        {middleTab === 'postmortem' && ['resolved', 'reported'].includes(status) && (
          <div className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[18px] p-6 space-y-6">
            
            {/* Commit bar details */}
            {incident?.postMortem?.publish_url && (
              <div className="bg-purple-600/5 border border-purple-500/25 rounded-[12px] p-4 flex justify-between items-center select-none">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-xl flex items-center justify-center shrink-0">
                    <GitPullRequest className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-white font-mono uppercase">GitHub Commit Sync Completed</h4>
                    <p className="text-[9px] text-slate-400 mt-0.5">Post-mortem report committed to target repository.</p>
                  </div>
                </div>

                <a 
                  href={incident.postMortem.publish_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-purple-900/70 hover:bg-purple-800 text-purple-300 border border-purple-700/40 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold flex items-center space-x-1 uppercase transition-all shadow"
                >
                  <span>View File</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* SRE markdown container */}
            <div className="border border-[rgba(255,255,255,0.04)] bg-slate-950/40 p-5 rounded-[12px] select-text">
              <MarkdownRenderer content={incident?.postMortem?.markdown_report} />
            </div>
          </div>
        )}

        {/* VIEW C: REPORT GENERATING */}
        {middleTab === 'postmortem' && !['resolved', 'reported'].includes(status) && (
          <div className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[18px] p-6 min-h-[300px] flex flex-col justify-center items-center">
            {getPostmortemProgress() > 0 ? (
              <div className="w-full max-w-sm text-center space-y-4">
                <RefreshCw className="animate-spin inline-block w-8 h-8 text-purple-400" />
                <div>
                  <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">Generating Post-Mortem Report</h4>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {liveLogs.filter(log => log.stepId === 'report-step').pop()?.message || 'Compiling timeline events...'}
                  </p>
                </div>
                <div className="w-full bg-slate-950 border border-[rgba(255,255,255,0.06)] rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-purple-500 h-full transition-all duration-500 rounded-full" 
                    style={{ width: `${getPostmortemProgress()}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-500 font-bold block">{getPostmortemProgress()}% COMPLETE</span>
              </div>
            ) : (
              <div className="text-slate-500 italic text-[11px] text-center font-mono">
                Post-Mortem generation is queued. Handoff to SRE is initiated once containment blocks are verified.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
