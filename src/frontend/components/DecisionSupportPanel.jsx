import React, { useState, useEffect } from 'react';

function DecisionSupportPanel({ incident, token, apiBase }) {
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_BASE = apiBase || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : `${window.location.protocol}//${window.location.host}`);

  useEffect(() => {
    if (incident?.incidentId) {
      fetchDecision();
    }
  }, [incident?.incidentId]);

  const fetchDecision = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/decisions/${incident.incidentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDecision(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch decision:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-slate-400 text-xs">Analyzing...</div>;
  if (!decision) return null;

const priorityColors = {
    CRITICAL: 'red',
    HIGH: 'orange',
    MEDIUM: 'yellow',
    LOW: 'green',
  };

  const getActionLabel = (action) => {
    switch (action) {
      case 'HITL_REQUIRED': return 'Human Review Required';
      case 'AUTO_EXECUTE': return 'Automatic Response';
      case 'NEEDS_MORE_CONTEXT': return 'Needs More Context';
      default: return action;
    }
  };

  const handleOverride = async (action, justification) => {
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incident.incidentId}/${action.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ justification })
      });
      const body = await res.json();
      if (body.success) {
        setDecision(body.data);
      }
    } catch (error) {
      console.error(`Failed to ${action} override:`, error);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Decision Recommendation</h3>
        <span className={`text-xs px-2 py-1 rounded bg-${priorityColors[decision.priority]}-500/20 text-${priorityColors[decision.priority]}-400`}>
          {decision.priority}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center">
          <span className="text-slate-400 text-sm w-24">Action:</span>
          <span className="text-white font-medium text-sm">
            {getActionLabel(decision.action)}
          </span>
        </div>

        <div className="flex items-start">
          <span className="text-slate-400 text-sm w-24">Reason:</span>
          <span className="text-slate-300 text-xs leading-relaxed">
            {decision.justification}
          </span>
        </div>

        {decision.escalation && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2">
            <p className="text-orange-400 text-xs">
              ⚠️ This incident will be escalated to on-call security team
            </p>
          </div>
        )}

        {decision.action === 'HITL_REQUIRED' && (
          <div className="flex space-x-2 mt-4">
            <button
              onClick={() => handleOverride('APPROVE', decision.justification)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-xs"
            >
              Approve
            </button>
            <button
              onClick={() => handleOverride('REJECT', 'Manual rejection')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-xs"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { DecisionSupportPanel };
