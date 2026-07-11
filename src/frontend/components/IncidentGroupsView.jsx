import React, { useEffect, useState } from 'react';
import { Layers, RefreshCw, Sparkles, Network } from 'lucide-react';
import { IncidentNetworkGraph } from './IncidentNetworkGraph';

export function IncidentGroupsView({ token, apiBase, selectedId, onSelectIncident }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [groupAnalysis, setGroupAnalysis] = useState(null);
  const [graphNodes, setGraphNodes] = useState([]);
  const [graphLinks, setGraphLinks] = useState([]);

  const loadGroups = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBase}/api/groups`, { headers: authHeaders });
      const body = await res.json();
      if (body.success) {
        setGroups(body.data || []);
        if (body.data?.length && !activeGroupId) setActiveGroupId(body.data[0].group_id || body.data[0].groupId);
      } else setError(body.error);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const generateGroups = async () => {
    setGenerating(true); setError(null);
    try {
      const res = await fetch(`${apiBase}/api/groups/generate`, { method: 'POST', headers: authHeaders, body: JSON.stringify({}) });
      const body = await res.json();
      if (body.success) { await loadGroups(); } else setError(body.error);
    } catch (err) { setError(err.message); } finally { setGenerating(false); }
  };

  const loadGroupAnalysis = async (groupId) => {
    if (!groupId) return;
    try {
      const res = await fetch(`${apiBase}/api/groups/${groupId}/analysis`, { headers: authHeaders });
      const body = await res.json();
      if (body.success) setGroupAnalysis(body.data); else setGroupAnalysis(null);
    } catch { setGroupAnalysis(null); }
  };

  const loadNetworkGraph = async () => {
    if (!selectedId) { setGraphNodes([]); setGraphLinks([]); return; }
    try {
      const [corrRes, simRes] = await Promise.all([
        fetch(`${apiBase}/api/incidents/${selectedId}/correlations`, { headers: authHeaders }),
        fetch(`${apiBase}/api/incidents/${selectedId}/similar`, { headers: authHeaders }),
      ]);
      const corrBody = await corrRes.json();
      const simBody = await simRes.json();
      const correlated = corrBody.success ? (corrBody.data || []) : [];
      const similar = simBody.success ? (simBody.data || []) : [];

      const nodeMap = new Map();
      nodeMap.set(selectedId, { id: selectedId, incidentId: selectedId, status: 'analyzing', threatScore: 60, targetHost: selectedId });
      const links = [];
      [...correlated, ...similar].forEach((item) => {
        const otherId = item.incidentId || item.id || item.relatedIncidentId;
        if (!otherId) return;
        if (!nodeMap.has(otherId)) {
          nodeMap.set(otherId, {
            id: otherId,
            incidentId: otherId,
            status: item.status || 'received',
            threatScore: item.threatScore ?? 40,
            targetHost: item.targetHost || otherId,
          });
        }
        links.push({ source: selectedId, target: otherId, score: item.score ?? item.similarity ?? 0.5, correlationType: item.correlationType || 'similar' });
      });
      setGraphNodes(Array.from(nodeMap.values()));
      setGraphLinks(links);
    } catch (err) {
      setGraphNodes([]); setGraphLinks([]);
    }
  };

  useEffect(() => { loadGroups(); }, [token, apiBase]);
  useEffect(() => { loadGroupAnalysis(activeGroupId); }, [activeGroupId]);
  useEffect(() => { loadNetworkGraph(); }, [selectedId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-12 card-panel p-5 space-y-2">
        <h4 className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider font-mono">Incident Correlation & Grouping Briefing</h4>
        <p className="text-[11px] text-[#A0A8B3] leading-relaxed font-sans">
          Clusters related incidents by attack pattern and timing (hybrid clustering) and visualizes correlation/similarity links for the currently selected incident as a force-directed network graph.
        </p>
      </div>

      <div className="lg:col-span-4 glass-panel p-6 rounded-[18px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" /> Incident Groups
          </h3>
          <div className="flex gap-1">
            <button onClick={loadGroups} className="text-slate-500 hover:text-white p-1">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={generateGroups} disabled={generating} className="text-slate-500 hover:text-cyan-400 p-1" title="Generate clusters">
              <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        </div>
        {error && <div className="text-red-400 text-[11px] font-mono mb-2">{error}</div>}
        {groups.length === 0 && !loading && (
          <div className="text-slate-500 text-[11px]">No groups yet. Click the sparkle icon to generate clusters from active incidents.</div>
        )}
        <div className="space-y-2">
          {groups.map((g) => {
            const id = g.group_id || g.groupId;
            const count = g.incidentIds?.length || JSON.parse(g.incident_ids || '[]').length || 0;
            return (
              <button
                key={id}
                onClick={() => setActiveGroupId(id)}
                className={`w-full text-left p-3 rounded-[8px] border text-[11px] font-mono transition-all ${activeGroupId === id ? 'border-cyan-500/60 bg-cyan-950/20 text-cyan-300' : 'border-[var(--border-default)] text-slate-300 hover:border-slate-600'}`}
              >
                <div className="font-bold truncate">{g.name || id}</div>
                <div className="text-slate-500">{count} incidents · {g.cluster_method || g.clusterMethod || 'hybrid'}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-8 glass-panel p-6 rounded-[18px] min-h-[280px]">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-4">Group Analysis</h3>
        {!groupAnalysis && <div className="text-slate-500 text-[11px]">Select a group to view aggregated metrics and timeline.</div>}
        {groupAnalysis && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
              <div className="bg-slate-900/50 p-3 rounded-[8px] border border-[var(--border-default)]">
                <div className="text-slate-500">Incidents</div>
                <div className="text-white font-bold text-sm">{groupAnalysis.incidentCount}</div>
              </div>
              <div className="bg-slate-900/50 p-3 rounded-[8px] border border-[var(--border-default)]">
                <div className="text-slate-500">Cluster Method</div>
                <div className="text-white font-bold text-sm">{groupAnalysis.clusterMethod}</div>
              </div>
              <div className="bg-slate-900/50 p-3 rounded-[8px] border border-[var(--border-default)]">
                <div className="text-slate-500">Avg Threat</div>
                <div className="text-white font-bold text-sm">{groupAnalysis.metrics?.avgThreatScore ?? '—'}</div>
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto terminal-scroll">
              {groupAnalysis.incidents?.map((inc) => (
                <button
                  key={inc.incidentId}
                  onClick={() => onSelectIncident?.(inc.incidentId)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/40 rounded-[6px] border border-[var(--border-default)] hover:border-cyan-600/40 text-[11px] font-mono"
                >
                  <span className="text-white">{inc.incidentId}</span>
                  <span className="text-slate-400">{inc.targetHost}</span>
                  <span className="text-cyan-400">{inc.threatScore}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-12 glass-panel p-6 rounded-[18px]">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
          <Network className="w-4 h-4 text-violet-400" /> Correlation Network — {selectedId || 'no incident selected'}
        </h3>
        {graphNodes.length <= 1 ? (
          <div className="text-slate-500 text-[11px]">No correlated or similar incidents found for this selection yet.</div>
        ) : (
          <IncidentNetworkGraph
            incidents={graphNodes}
            links={graphLinks}
            selectedIncidentId={selectedId}
            onNodeClick={onSelectIncident}
            width={900}
            height={420}
          />
        )}
      </div>
    </div>
  );
}

export default IncidentGroupsView;
