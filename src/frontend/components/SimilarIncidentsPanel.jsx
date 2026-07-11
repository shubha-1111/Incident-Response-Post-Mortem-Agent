import React, { useState, useEffect } from 'react';

function SimilarIncidentsPanel({ incidentId, token, apiBase, onSelectIncident }) {
  const [similarIncidents, setSimilarIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSimilarIncidents();
  }, [incidentId]);

  const fetchSimilarIncidents = async () => {
    if (!incidentId) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/incidents/${incidentId}/similar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSimilarIncidents(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch similar incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-slate-400 text-xs">Loading similar incidents...</div>;
  if (similarIncidents.length === 0) return <div className="text-slate-400 text-xs">No similar incidents found</div>;

  return (
    <div className="space-y-3">
      {similarIncidents.map((similar) => (
        <div
          key={similar.incidentId}
          className="bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 cursor-pointer"
          onClick={() => onSelectIncident && onSelectIncident(similar.incidentId)}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-medium text-sm">{similar.incidentId}</span>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">
                {Math.round((similar.similarityScore ?? similar.score ?? 0) * 100)}% similar
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                similar.correlationType === 'vector' ? 'bg-indigo-500/20 text-indigo-400' :
                similar.correlationType === 'temporal' ? 'bg-green-500/20 text-green-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {similar.correlationType}
              </span>
            </div>
          </div>
          {similar.metadata && (
            <div className="text-xs text-slate-500">
              {similar.metadata.asset && `Asset: ${similar.metadata.asset}`}
              {similar.metadata.asset && similar.metadata.timeDeltaHours !== undefined && ' · '}
              {similar.metadata.timeDeltaHours !== undefined && `Time delta: ${similar.metadata.timeDeltaHours.toFixed(1)}h`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export { SimilarIncidentsPanel };
