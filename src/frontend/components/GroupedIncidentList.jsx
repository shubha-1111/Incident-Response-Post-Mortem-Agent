import React from 'react';
import { IncidentGroup } from './IncidentGroup';

export function GroupedIncidentList({ incidents, onSelect }) {
  const critical = incidents.filter(i => (i.threatScore ?? 0) >= 80);
  const high = incidents.filter(i => {
    const s = i.threatScore ?? 0;
    return s >= 60 && s < 80;
  });
  const medium = incidents.filter(i => {
    const s = i.threatScore ?? 0;
    return s >= 40 && s < 60;
  });
  const low = incidents.filter(i => (i.threatScore ?? 0) < 40);

  return (
    <div className="incident-list space-y-4">
      {critical.length > 0 && (
        <IncidentGroup 
          title="Critical - Immediate Action Required"
          incidents={critical} 
          onSelect={onSelect}
          colorKey="CRITICAL"
        />
      )}
      {high.length > 0 && (
        <IncidentGroup 
          title="High - Needs Attention"
          incidents={high} 
          onSelect={onSelect}
          colorKey="HIGH"
        />
      )}
      {medium.length > 0 && (
        <IncidentGroup 
          title="Medium - Monitor"
          incidents={medium} 
          onSelect={onSelect}
          colorKey="MEDIUM"
        />
      )}
      {low.length > 0 && (
        <IncidentGroup 
          title="Low - Informational"
          incidents={low} 
          onSelect={onSelect}
          colorKey="LOW"
        />
      )}
    </div>
  );
}
