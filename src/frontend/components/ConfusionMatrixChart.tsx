import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface ConfusionMatrixData {
  labels: string[];
  matrix: number[][];
  truePositives: Record<string, number>;
  falsePositives: Record<string, number>;
  falseNegatives: Record<string, number>;
  trueNegatives: Record<string, number>;
}

interface ConfusionMatrixChartProps {
  predictionId?: string;
}

const CELL_SIZE = 70;
const MARGIN_LEFT = 80;
const MARGIN_TOP = 40;
const LEGEND_HEIGHT = 30;

export function ConfusionMatrixChart({ predictionId }: ConfusionMatrixChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<ConfusionMatrixData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [predictionId]);

  async function fetchData() {
    setLoading(true);
    try {
      const response = await fetch('/api/analytics/confusion-matrix');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch confusion matrix:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!svgRef.current || !data || data.labels.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const n = data.labels.length;
    const width = MARGIN_LEFT + CELL_SIZE * (n + 1) + 20;
    const height = MARGIN_TOP + CELL_SIZE * (n + 1) + LEGEND_HEIGHT + 20;

    const container = svg
      .attr('width', width)
      .attr('height', height)
      .style('font-family', 'monospace');

    const maxCount = Math.max(...data.matrix.flat());
    const colorScale = d3.scaleLinear<string>()
      .domain([0, maxCount * 0.5, maxCount])
      .range(['#1e293b', '#334155', '#22c55e']);

    // Title
    container.append('text')
      .attr('x', width / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e2e8f0')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text('Confusion Matrix');

    // Column labels (Predicted)
    container.selectAll('.col-label')
      .data(data.labels)
      .enter()
      .append('text')
      .attr('class', 'col-label')
      .attr('x', (_, i) => MARGIN_LEFT + CELL_SIZE * (i + 0.5) + CELL_SIZE / 2)
      .attr('y', MARGIN_TOP - 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .text(d => d.length > 12 ? d.slice(0, 10) + '..' : d);

    // Row labels (Actual)
    container.selectAll('.row-label')
      .data(data.labels)
      .enter()
      .append('text')
      .attr('class', 'row-label')
      .attr('x', MARGIN_LEFT - 10)
      .attr('y', (_, i) => MARGIN_TOP + CELL_SIZE * (i + 0.5) + CELL_SIZE / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .text(d => d.length > 12 ? d.slice(0, 10) + '..' : d);

    // Predicted label
    container.append('text')
      .attr('x', MARGIN_LEFT + CELL_SIZE * (n / 2) + CELL_SIZE / 2)
      .attr('y', MARGIN_TOP - 28)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e2e8f0')
      .attr('font-size', '11px')
      .text('Predicted');

    // Actual label
    container.append('text')
      .attr('x', 15)
      .attr('y', MARGIN_TOP + CELL_SIZE * (n / 2) + CELL_SIZE / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e2e8f0')
      .attr('font-size', '11px')
      .attr('transform', `rotate(-90, 15, ${MARGIN_TOP + CELL_SIZE * (n / 2) + CELL_SIZE / 2 + 4})`)
      .text('Actual');

    // Matrix cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const value = data.matrix[i][j];
        const x = MARGIN_LEFT + CELL_SIZE * j;
        const y = MARGIN_TOP + CELL_SIZE * i;

        container.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', CELL_SIZE)
          .attr('height', CELL_SIZE)
          .attr('fill', colorScale(value))
          .attr('stroke', i === j ? '#f59e0b' : '#334155')
          .attr('stroke-width', i === j ? 2 : 1);

        container.append('text')
          .attr('x', x + CELL_SIZE / 2)
          .attr('y', y + CELL_SIZE / 2 + 4)
          .attr('text-anchor', 'middle')
          .attr('fill', '#e2e8f0')
          .attr('font-size', '12px')
          .attr('font-weight', i === j ? 'bold' : 'normal')
          .text(value > 0 ? value : '');

        container.append('title')
          .text(`Actual: ${data.labels[i]}\nPredicted: ${data.labels[j]}\nCount: ${value}`);
      }
    }
  }, [data]);

  if (loading) {
    return <div className="text-slate-400 p-4">Loading confusion matrix...</div>;
  }

  if (!data || data.labels.length === 0) {
    return <div className="text-slate-400 p-4">No prediction data available</div>;
  }

  return (
    <div className="bg-slate-950/50 border border-slate-800/50 rounded-xl p-4 overflow-x-auto">
      <svg ref={svgRef} className="w-full" />
      <div className="mt-2 text-xs text-slate-400">
        Diagonal cells (gold border) represent correct predictions
      </div>
    </div>
  );
}

export default ConfusionMatrixChart;