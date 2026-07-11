import React, { useEffect, useState } from 'react';
import { BarChart2, RefreshCw, Target } from 'lucide-react';
import { ConfusionMatrixChart } from './ConfusionMatrixChart';

function MetricRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[var(--border-default)] last:border-b-0">
      <span className="text-[11px] text-slate-400 font-mono">{label}</span>
      <span className="text-xs font-bold text-white font-mono">{value}</span>
    </div>
  );
}

export function AnalyticsPanel({ token, apiBase }) {
  const [accuracy, setAccuracy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/analytics/accuracy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (body.success) {
        setAccuracy(body.data);
      } else {
        setError(body.error || 'Failed to load accuracy metrics');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, apiBase]);

  const labels = accuracy ? Object.keys(accuracy.precisionByLabel || {}) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-12 card-panel p-5 space-y-2">
        <h4 className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider font-mono">Model Accuracy Analytics Briefing</h4>
        <p className="text-[11px] text-[#A0A8B3] leading-relaxed font-sans">
          Tracks classifier performance for threat-type predictions against validated human/agent outcomes: macro precision/recall/F1, per-label breakdown, and a confusion matrix of predicted vs. actual labels.
        </p>
      </div>

      <div className="lg:col-span-4 glass-panel p-6 rounded-[18px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" /> Macro Metrics
          </h3>
          <button onClick={load} className="text-slate-500 hover:text-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {error && <div className="text-red-400 text-[11px] font-mono">{error}</div>}
        {accuracy && (
          <div className="space-y-1">
            <MetricRow label="Macro Precision" value={`${Math.round((accuracy.macroPrecision || 0) * 100)}%`} />
            <MetricRow label="Macro Recall" value={`${Math.round((accuracy.macroRecall || 0) * 100)}%`} />
            <MetricRow label="Macro F1" value={`${Math.round((accuracy.macroF1 || 0) * 100)}%`} />
            <MetricRow label="Total Predictions" value={accuracy.totalPredictions ?? labels.length} />
          </div>
        )}
        {!accuracy && !loading && !error && (
          <div className="text-slate-500 text-[11px]">No accuracy data recorded yet.</div>
        )}
      </div>

      <div className="lg:col-span-8 glass-panel p-6 rounded-[18px]">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-violet-400" /> Precision / Recall by Label
        </h3>
        {labels.length === 0 && <div className="text-slate-500 text-[11px]">No per-label data available.</div>}
        {labels.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-slate-500 uppercase text-left border-b border-[var(--border-default)]">
                  <th className="py-2 pr-4">Label</th>
                  <th className="py-2 pr-4">Precision</th>
                  <th className="py-2 pr-4">Recall</th>
                  <th className="py-2">F1</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => (
                  <tr key={label} className="border-b border-[var(--border-default)]/50">
                    <td className="py-2 pr-4 text-white font-bold">{label}</td>
                    <td className="py-2 pr-4 text-cyan-400">{Math.round((accuracy.precisionByLabel[label] || 0) * 100)}%</td>
                    <td className="py-2 pr-4 text-violet-400">{Math.round((accuracy.recallByLabel?.[label] || 0) * 100)}%</td>
                    <td className="py-2 text-emerald-400">{Math.round((accuracy.f1ByLabel?.[label] || 0) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="lg:col-span-12 glass-panel p-6 rounded-[18px]">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-4">Confusion Matrix</h3>
        <ConfusionMatrixChart apiBase={apiBase} token={token} />
      </div>
    </div>
  );
}

export default AnalyticsPanel;
