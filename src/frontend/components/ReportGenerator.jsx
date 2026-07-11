import React, { useState } from 'react';
import { FileDown, Loader2, FileText } from 'lucide-react';

export function ReportGenerator({ incident, token, apiBase }) {
  const [type, setType] = useState('executive-summary');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const incidentId = incident?.incidentId;

  const loadPreview = async () => {
    if (!incidentId) return;
    setLoadingPreview(true); setError(null); setPreview(null);
    try {
      const res = await fetch(`${apiBase}/api/incidents/${incidentId}/report?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (body.success) setPreview(body.data.html); else setError(body.error);
    } catch (err) { setError(err.message); } finally { setLoadingPreview(false); }
  };

  const downloadPdf = async () => {
    if (!incidentId) return;
    setDownloading(true); setError(null);
    try {
      const res = await fetch(`${apiBase}/api/incidents/${incidentId}/report/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${incidentId}-${type}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); } finally { setDownloading(false); }
  };

  return (
    <div className="glass-panel p-6 rounded-[18px] space-y-4">
      <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
        <FileText className="w-4 h-4 text-cyan-400" /> Incident Report Generator
      </h3>
      {!incidentId && <div className="text-slate-500 text-[11px]">Select an incident to generate a report.</div>}
      {incidentId && (
        <>
          <div className="flex items-center gap-3">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="bg-slate-900/60 border border-[var(--border-default)] rounded-[8px] px-3 py-2 text-xs text-white"
            >
              <option value="executive-summary">Executive Summary</option>
              <option value="technical-deep-dive">Technical Deep Dive</option>
            </select>
            <button onClick={loadPreview} disabled={loadingPreview} className="px-3 py-2 rounded-[8px] text-[11px] font-bold uppercase bg-slate-800/60 text-slate-200 border border-[var(--border-default)] hover:bg-slate-700/60 flex items-center gap-2">
              {loadingPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Preview'}
            </button>
            <button onClick={downloadPdf} disabled={downloading} className="px-3 py-2 rounded-[8px] text-[11px] font-bold uppercase bg-cyan-950/40 text-cyan-300 border border-cyan-900/40 hover:bg-cyan-900/40 flex items-center gap-2">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><FileDown className="w-3.5 h-3.5" /> Download PDF</>}
            </button>
          </div>
          {error && <div className="text-red-400 text-[11px] font-mono">{error}</div>}
          {preview && (
            <div
              className="bg-white rounded-[8px] p-4 max-h-96 overflow-y-auto text-black text-[11px]"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default ReportGenerator;
