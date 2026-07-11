import React, { useState } from 'react';
import { Search, Bug, FileCode, KeyRound, HelpCircle, Loader2 } from 'lucide-react';

function ToolCard({ icon: Icon, title, children }) {
  return (
    <div className="glass-panel p-5 rounded-[16px] space-y-3">
      <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
        <Icon className="w-4 h-4 text-cyan-400" /> {title}
      </h3>
      {children}
    </div>
  );
}

function ResultBlock({ data, error }) {
  if (error) return <div className="text-red-400 text-[11px] font-mono whitespace-pre-wrap">{error}</div>;
  if (!data) return null;
  return (
    <pre className="bg-slate-950/60 border border-[var(--border-default)] rounded-[8px] p-3 text-[10px] text-emerald-300 font-mono overflow-x-auto max-h-64">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

const inputCls = "w-full bg-slate-900/60 border border-[var(--border-default)] rounded-[8px] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60";
const btnCls = "px-3 py-2 rounded-[8px] text-[11px] font-bold uppercase tracking-wide bg-cyan-950/40 text-cyan-300 border border-cyan-900/40 hover:bg-cyan-900/40 transition-all disabled:opacity-50 flex items-center gap-2";

export function SecurityToolkit({ token, apiBase }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // IOC lookup
  const [ioc, setIoc] = useState('');
  const [iocResult, setIocResult] = useState(null);
  const [iocError, setIocError] = useState(null);
  const [iocLoading, setIocLoading] = useState(false);

  // CVE lookup
  const [cveId, setCveId] = useState('');
  const [cveResult, setCveResult] = useState(null);
  const [cveError, setCveError] = useState(null);
  const [cveLoading, setCveLoading] = useState(false);

  // Config analyzer
  const [configPath, setConfigPath] = useState('nginx.conf');
  const [configContent, setConfigContent] = useState('');
  const [configResult, setConfigResult] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Crypto decrypt
  const [ciphertext, setCiphertext] = useState('');
  const [cryptoKey, setCryptoKey] = useState('');
  const [cryptoResult, setCryptoResult] = useState(null);
  const [cryptoError, setCryptoError] = useState(null);
  const [cryptoLoading, setCryptoLoading] = useState(false);

  // Explain term
  const [term, setTerm] = useState('');
  const [explanation, setExplanation] = useState(null);
  const [explainError, setExplainError] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const runIocLookup = async () => {
    if (!ioc.trim()) return;
    setIocLoading(true); setIocError(null); setIocResult(null);
    try {
      const res = await fetch(`${apiBase}/api/threat-intel/ioc/${encodeURIComponent(ioc.trim())}`, {
        headers: authHeaders,
      });
      const body = await res.json();
      if (body.success) setIocResult(body.data); else setIocError(body.error);
    } catch (err) { setIocError(err.message); } finally { setIocLoading(false); }
  };

  const runCveLookup = async () => {
    if (!cveId.trim()) return;
    setCveLoading(true); setCveError(null); setCveResult(null);
    try {
      const res = await fetch(`${apiBase}/api/vulnerability/cve/${encodeURIComponent(cveId.trim())}`, {
        headers: authHeaders,
      });
      const body = await res.json();
      if (body.success) setCveResult(body.data); else setCveError(body.error);
    } catch (err) { setCveError(err.message); } finally { setCveLoading(false); }
  };

  const runConfigAnalyze = async () => {
    if (!configContent.trim()) { setConfigError('Paste config file content first.'); return; }
    setConfigLoading(true); setConfigError(null); setConfigResult(null);
    try {
      const res = await fetch(`${apiBase}/api/vulnerability/config-analyze`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ filePath: configPath, content: configContent }),
      });
      const body = await res.json();
      if (body.success) setConfigResult(body.data); else setConfigError(body.error);
    } catch (err) { setConfigError(err.message); } finally { setConfigLoading(false); }
  };

  const runCryptoDecrypt = async () => {
    if (!ciphertext.trim() || !cryptoKey.trim()) { setCryptoError('Provide both ciphertext and key.'); return; }
    setCryptoLoading(true); setCryptoError(null); setCryptoResult(null);
    try {
      const res = await fetch(`${apiBase}/api/vulnerability/crypto-decrypt`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ciphertext: ciphertext.trim(), key: cryptoKey.trim() }),
      });
      const body = await res.json();
      if (body.success) setCryptoResult(body.data); else setCryptoError(body.error);
    } catch (err) { setCryptoError(err.message); } finally { setCryptoLoading(false); }
  };

  const runExplainTerm = async () => {
    if (!term.trim()) return;
    setExplainLoading(true); setExplainError(null); setExplanation(null);
    try {
      const res = await fetch(`${apiBase}/api/explain-term`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ term: term.trim() }),
      });
      const body = await res.json();
      if (body.success) setExplanation(body.data.explanation); else setExplainError(body.error);
    } catch (err) { setExplainError(err.message); } finally { setExplainLoading(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-12 card-panel p-5 space-y-2">
        <h4 className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider font-mono">Security Toolkit Briefing</h4>
        <p className="text-[11px] text-[#A0A8B3] leading-relaxed font-sans">
          Direct access to the same threat-intel, vulnerability, and AI-explainer services the autonomous agents use during triage — IOC reputation lookups, CVE/CISA-KEV cross-referencing, config-file scanning, XOR payload decryption, and plain-language term explanations.
        </p>
      </div>

      <div className="lg:col-span-6">
        <ToolCard icon={Search} title="IOC Reputation Lookup">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="IP, domain, hash, URL or email" value={ioc} onChange={(e) => setIoc(e.target.value)} />
            <button className={btnCls} onClick={runIocLookup} disabled={iocLoading}>
              {iocLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Lookup'}
            </button>
          </div>
          <ResultBlock data={iocResult} error={iocError} />
        </ToolCard>
      </div>

      <div className="lg:col-span-6">
        <ToolCard icon={Bug} title="CVE / CISA-KEV Lookup">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="CVE-2024-12345" value={cveId} onChange={(e) => setCveId(e.target.value)} />
            <button className={btnCls} onClick={runCveLookup} disabled={cveLoading}>
              {cveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Lookup'}
            </button>
          </div>
          <ResultBlock data={cveResult} error={cveError} />
        </ToolCard>
      </div>

      <div className="lg:col-span-6">
        <ToolCard icon={FileCode} title="Config File Analyzer">
          <input className={inputCls} placeholder="File path e.g. nginx.conf" value={configPath} onChange={(e) => setConfigPath(e.target.value)} />
          <textarea className={`${inputCls} h-24 font-mono`} placeholder="Paste config file content..." value={configContent} onChange={(e) => setConfigContent(e.target.value)} />
          <button className={btnCls} onClick={runConfigAnalyze} disabled={configLoading}>
            {configLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Analyze'}
          </button>
          <ResultBlock data={configResult} error={configError} />
        </ToolCard>
      </div>

      <div className="lg:col-span-6">
        <ToolCard icon={KeyRound} title="XOR Payload Decrypt">
          <input className={inputCls} placeholder="Ciphertext (hex/base64)" value={ciphertext} onChange={(e) => setCiphertext(e.target.value)} />
          <input className={inputCls} placeholder="Key" value={cryptoKey} onChange={(e) => setCryptoKey(e.target.value)} />
          <button className={btnCls} onClick={runCryptoDecrypt} disabled={cryptoLoading}>
            {cryptoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Decrypt'}
          </button>
          <ResultBlock data={cryptoResult} error={cryptoError} />
        </ToolCard>
      </div>

      <div className="lg:col-span-12">
        <ToolCard icon={HelpCircle} title="Explain a Security Term">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="e.g. lateral movement, credential stuffing..." value={term} onChange={(e) => setTerm(e.target.value)} />
            <button className={btnCls} onClick={runExplainTerm} disabled={explainLoading}>
              {explainLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Explain'}
            </button>
          </div>
          {explainError && <div className="text-red-400 text-[11px] font-mono">{explainError}</div>}
          {explanation && <div className="text-[12px] text-slate-200 leading-relaxed font-sans bg-slate-950/60 border border-[var(--border-default)] rounded-[8px] p-3">{explanation}</div>}
        </ToolCard>
      </div>
    </div>
  );
}

export default SecurityToolkit;
