import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface IncidentNode {
  id: string;
  incidentId: string;
  status: string;
  threatScore: number;
  targetHost: string;
  createdAt: string;
  group?: string;
}

interface IncidentLink {
  source: string;
  target: string;
  score: number;
  correlationType: string;
}

interface IncidentNetworkGraphProps {
  incidents: IncidentNode[];
  links: IncidentLink[];
  selectedIncidentId?: string;
  onNodeClick?: (incidentId: string) => void;
  width?: number;
  height?: number;
}

const STATUS_COLORS: Record<string, string> = {
  resolved: '#22c55e',
  reported: '#22c55e',
  pending_human_review: '#f59e0b',
  human_approved: '#3b82f6',
  human_denied: '#ef4444',
  remediation_proposed: '#8b5cf6',
  root_cause_identified: '#06b6d4',
  analyzing: '#6366f1',
  ingesting: '#6366f1',
  received: '#64748b',
  failed_closed: '#ef4444',
};

const SEVERITY_SCALE = d3.scaleLinear<number, number>()
  .domain([0, 50, 100])
  .range([6, 20]);

export function IncidentNetworkGraph({
  incidents,
  links,
  selectedIncidentId,
  onNodeClick,
  width = 600,
  height = 400,
}: IncidentNetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [simulation, setSimulation] = useState<d3.Simulation<IncidentNode, IncidentLink> | null>(null);

  useEffect(() => {
    if (!svgRef.current || incidents.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('font-family', 'monospace');

    const defs = container.append('defs');

    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#64748b');

    const link = container.append('g')
      .attr('stroke', '#64748b')
      .attr('stroke-opacity', 0.4)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', d => Math.max(1, d.score * 3))
      .attr('marker-end', 'url(#arrowhead)')
      .style('stroke-dasharray', d => d.correlationType === 'temporal' ? '4,2' : 'none');

    const node = container.append('g')
      .selectAll('g')
      .data(incidents)
      .join('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClick?.(d.incidentId);
      });

    node.append('circle')
      .attr('r', d => SEVERITY_SCALE(d.threatScore))
      .attr('fill', d => STATUS_COLORS[d.status] || '#64748b')
      .attr('stroke', d => d.incidentId === selectedIncidentId ? '#f59e0b' : '#1e293b')
      .attr('stroke-width', d => d.incidentId === selectedIncidentId ? 3 : 1.5)
      .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');

    node.append('text')
      .attr('dy', d => SEVERITY_SCALE(d.threatScore) + 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#e2e8f0')
      .text(d => d.incidentId.length > 18 ? d.incidentId.slice(0, 16) + '..' : d.incidentId);

    node.append('title')
      .text(d => [
        `Incident: ${d.incidentId}`,
        `Host: ${d.targetHost}`,
        `Status: ${d.status}`,
        `Threat Score: ${d.threatScore}`,
        `Created: ${new Date(d.createdAt).toLocaleString()}`,
      ].join('\n'));

    const sim = d3.forceSimulation<IncidentNode, IncidentLink>(incidents)
      .force('link', d3.forceLink<IncidentNode, IncidentLink>(links)
        .id(d => d.incidentId)
        .distance(d => 100 + (1 - d.score) * 100)
        .strength(0.7)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => SEVERITY_SCALE(d.threatScore) + 8))
      .alphaDecay(0.02);

    setSimulation(sim);

    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as IncidentNode).x!)
        .attr('y1', d => (d.source as IncidentNode).y!)
        .attr('x2', d => (d.target as IncidentNode).x!)
        .attr('y2', d => (d.target as IncidentNode).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
      setSimulation(null);
    };
  }, [incidents, links, width, height, selectedIncidentId, onNodeClick]);

  return (
    <div className="bg-slate-950/50 border border-slate-800/50 rounded-xl overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}

export function useIncidentNetworkGraph(
  incidentId: string | null,
  apiBase: string,
  token: string
) {
  const [incidents, setIncidents] = useState<IncidentNode[]>([]);
  const [links, setLinks] = useState<IncidentLink[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!incidentId) return;

    const fetchNetwork = async () => {
      setLoading(true);
      try {
        const [corrRes, similarRes] = await Promise.all([
          fetch(`${apiBase}/api/incidents/${incidentId}/correlations`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiBase}/api/incidents/${incidentId}/similar`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const [corrData, similarData] = await Promise.all([
          corrRes.json(),
          similarRes.json(),
        ]);

        const allIncidents = new Map<string, IncidentNode>();
        const allLinks: IncidentLink[] = [];

        const addIncident = (inc: any, group?: string) => {
          if (!allIncidents.has(inc.incidentId)) {
            allIncidents.set(inc.incidentId, {
              id: inc.incidentId,
              incidentId: inc.incidentId,
              status: inc.status || 'unknown',
              threatScore: inc.threatScore || inc.threat_score || 0,
              targetHost: inc.targetHost || inc.target_host || 'unknown',
              createdAt: inc.createdAt || inc.created_at || new Date().toISOString(),
              group,
            });
          }
        };

        addIncident({ incidentId, group: 'center' });

        if (corrData.success && corrData.data) {
          for (const c of corrData.data) {
            addIncident(c, 'correlation');
            allLinks.push({
              source: incidentId,
              target: c.incidentId,
              score: c.score || c.similarityScore || 0.5,
              correlationType: c.correlationType || 'vector',
            });
          }
        }

        if (similarData.success && similarData.data) {
          for (const s of similarData.data) {
            addIncident(s, 'similar');
            allLinks.push({
              source: incidentId,
              target: s.incidentId,
              score: s.similarityScore || s.score || 0.5,
              correlationType: s.correlationType || 'vector',
            });
          }
        }

        setIncidents(Array.from(allIncidents.values()));
        setLinks(allLinks);
      } catch (error) {
        console.error('Failed to fetch network graph:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNetwork();
  }, [incidentId, apiBase, token]);

  return { incidents, links, loading };
}