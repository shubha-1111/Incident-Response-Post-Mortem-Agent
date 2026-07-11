import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import Chart from 'chart.js/auto';
import { 
  Terminal, Shield, AlertTriangle, CheckCircle, Activity, Globe, Cpu, RefreshCw, 
  LogIn, LogOut, ChevronRight, Check, X, FileText, BarChart2, Eye, ShieldAlert, 
  Workflow, GitPullRequest, ArrowRight, Database, Lock, Clock, ExternalLink,
  PanelLeftClose, PanelLeftOpen, Plus, User, MessageSquare
} from 'lucide-react';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ActiveIncidents } from './components/ActiveIncidents';
import { RiskScoreCharts } from './components/RiskScoreCharts';
import { ExecutionPipeline } from './components/ExecutionPipeline';
import { LiveEventStream } from './components/LiveEventStream';
import { ThreatIntel } from './components/ThreatIntel';
import { SystemHealth } from './components/SystemHealth';
import { SimulationControls } from './components/SimulationControls';
import { RecentActivity } from './components/RecentActivity';
import { AIInsights } from './components/AIInsights';
import { SimilarIncidentsPanel } from './components/SimilarIncidentsPanel';
import { OnboardingTour } from './components/OnboardingTour';
import { DecisionSupportPanel } from './components/DecisionSupportPanel';


// Dynamic host resolution for API Gateway and WebSocket stream
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : `${window.location.protocol}//${window.location.host}`;

const WS_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'ws://localhost:3001'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

const DEMO_LOGS_PRESET = {
  stuffing: [
    "db-prod-02,mysqld,HIGH,Failed login from 192.168.1.105",
    "db-prod-02,mysqld,HIGH,Failed login from 192.168.1.106", 
    "db-prod-02,mysqld,HIGH,Failed login from 192.168.1.107",
    "db-prod-02,mysqld,CRITICAL,Unauthorized access detected",
    "db-prod-02,auditd,CRITICAL,Privilege escalation attempt"
  ],
  scan: [
    "api-gw-01,network,HIGH,Port scan detected nmap from 203.0.113.42",
    "api-gw-01,firewall,HIGH,Multiple port probe attempts",
    "api-gw-01,ids,CRITICAL,Masscan signature detected"
  ],
  sql: [
    "web-01,nginx,HIGH,SQL injection attempt UNION SELECT FROM users",
    "web-01,app,CRITICAL,DROP TABLE attempt detected in parameter id",
    "web-01,waf,HIGH,XSS payload detected in request body"
  ]
};

/**
 * A safe, lightweight React component to parse and render SRE Markdown reports
 * without introducing dangerous external script executions.
 */
function MarkdownRenderer({ content }) {
  if (!content) return <div className="text-slate-500 italic text-[10px]">No post-mortem report content generated yet.</div>;
  
  const lines = content.split('\n');
  return (
    <div className="space-y-4 text-xs text-slate-300 font-sans leading-relaxed">
      {lines.map((line, idx) => {
        const cleanLine = line.trim();
        
        // H1 Headers
        if (cleanLine.startsWith('# ')) {
          return (
            <h1 key={idx} className="text-lg font-black text-white border-b border-slate-800 pb-2 mt-4 font-mono flex items-center">
              <FileText className="w-4 h-4 mr-2 text-indigo-400" />
              {cleanLine.substring(2)}
            </h1>
          );
        }
        
        // H2 Headers
        if (cleanLine.startsWith('## ')) {
          return (
            <h2 key={idx} className="text-xs font-bold text-white mt-4 font-mono border-l-2 border-indigo-500 pl-2 uppercase tracking-wide">
              {cleanLine.substring(3)}
            </h2>
          );
        }
        
        // Bold Key Value
        if (cleanLine.startsWith('**') && cleanLine.includes(':**')) {
          const parts = cleanLine.split(':**');
          const key = parts[0].replaceAll('**', '');
          const val = parts[1] || '';
          return (
            <div key={idx} className="flex justify-between border-b border-slate-900 pb-1.5 pt-0.5">
              <span className="text-slate-500 font-medium">{key}:</span>
              <span className="font-bold text-slate-300 font-mono">{val}</span>
            </div>
          );
        }
        
        // standard Bold
        if (cleanLine.startsWith('**') && cleanLine.endsWith('**')) {
          return <p key={idx} className="font-bold text-slate-200 mt-2">{cleanLine.replaceAll('**', '')}</p>;
        }
        
        // Bullet lists
        if (cleanLine.startsWith('- ')) {
          return (
            <div key={idx} className="flex items-start space-x-2 pl-3">
              <span className="text-indigo-400 select-none mt-1">•</span>
              <span>{cleanLine.substring(2)}</span>
            </div>
          );
        }
        
        // Numbered lists
        if (/^\d+\./.test(cleanLine)) {
          const match = cleanLine.match(/^\d+\./);
          const prefix = match ? match[0] : '';
          const remainder = cleanLine.replace(/^\d+\.\s*/, '');
          return (
            <div key={idx} className="flex items-start space-x-2 pl-3 font-mono">
              <span className="text-indigo-400 select-none font-bold">{prefix}</span>
              <span>{remainder}</span>
            </div>
          );
        }
        
        // Empty space
        if (cleanLine === '') {
          return <div key={idx} className="h-1" />;
        }
        
        return <p key={idx} className="font-sans text-slate-300 pl-1">{cleanLine}</p>;
      })}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(sessionStorage.getItem('token') || '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [username, setUsername] = useState('admin');

  const [password, setPassword] = useState('admin');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [activeNav, setActiveNav] = useState('dashboard');

  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState('INC-2026-DEMO-001');
  const [selectedIncident, setSelectedIncident] = useState(null);
  
  const [middleTab, setMiddleTab] = useState('pipeline'); // 'pipeline' or 'postmortem'
  const [anomalyAlerts, setAnomalyAlerts] = useState([]); // WebSocket runtime anomalies
  const [steps, setSteps] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [liveLogs, setLiveLogs] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [threatIntelStats, setThreatIntelStats] = useState(null);
  const [riskHistory, setRiskHistory] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [dashboardCharts, setDashboardCharts] = useState(null);

  
  // Custom log ingestion modal state
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [customIncidentId, setCustomIncidentId] = useState('');
  const [customLogs, setCustomLogs] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  const terminalEndRef = useRef(null);

  // Extract details defensively
  const incident = selectedIncident;
  const evidenceChain = Array.isArray(incident?.evidenceChain) ? incident.evidenceChain : [];
  const status = incident?.status || 'received';
  const targetHost = incident?.targetHost || 'db-prod-02';
  const confidence = incident?.confidenceScore ?? 0;
  const rootCause = incident?.rootCauseHypothesis || '';
  const remediationAction = incident?.remediationAction?.actionType || '';
  const actionJustification = incident?.actionJustification || '';
  const incidentIdVal = incident?.incidentId || selectedId;

  const hasThreatIntel = evidenceChain.some(entry => entry.payload?.threatIntelReport !== null && entry.payload?.threatIntelReport !== undefined);

  const getGroupedIncidents = () => {
    const today = [];
    const yesterday = [];
    const earlier = [];

    incidents.forEach(inc => {
      const incDate = new Date(inc.createdAt || Date.now());
      const todayDate = new Date();
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);

      if (incDate.toDateString() === todayDate.toDateString()) {
        today.push(inc);
      } else if (incDate.toDateString() === yesterdayDate.toDateString()) {
        yesterday.push(inc);
      } else {
        earlier.push(inc);
      }
    });

    return { today, yesterday, earlier };
  };


  // Auto scroll logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [evidenceChain]);

  // Logout handler
  const handleLogout = () => {
    sessionStorage.removeItem('token');
    setToken('');
    setIncidents([]);
    setSelectedIncident(null);
  };

  // Sidebar navigation: scroll to the relevant section (or switch to post-mortem tab)
  const SECTION_MAP = {
    incidents: 'section-incidents',
    investigation: 'section-pipeline',
    evidence: 'section-evidence',
    intel: 'section-intel',
    mitre: 'section-intel',
    timeline: 'section-timeline',
    kb: 'section-kb',
    reports: 'section-reports'
  };

  const handleNavigate = (navId) => {
    setActiveNav(navId);
    if (navId === 'postmortems') {
      setMiddleTab('postmortem');
      return;
    }
    if (navId === 'dashboard' || navId === 'settings') {
      const sc = document.getElementById('app-scroll');
      if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const targetId = SECTION_MAP[navId];
    const el = targetId ? document.getElementById(targetId) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Keep the sidebar highlight in sync when the post-mortem tab is opened internally
  useEffect(() => {
    if (middleTab === 'postmortem') setActiveNav('postmortems');
  }, [middleTab]);

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        sessionStorage.setItem('token', data.data.token);
        setToken(data.data.token);
      } else {
        setAuthError(data.error || 'Authentication rejected');
      }
    } catch (err) {
      setAuthError('Connection failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Fetch dashboard summaries
  const fetchDashboard = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const body = await res.json();
      if (body.success) {
        setIncidents(body.data || []);
        setIsConnected(true);
      }
    } catch (err) {
      console.error('Connection failure:', err);
      setIsConnected(false);
    }
  };

  const fetchDashboardStats = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) setDashboardStats(body.data);
      }
    } catch (err) {
      console.error('Stats fetch failed:', err);
    }
  };

  const fetchRiskHistory = async (incidentId) => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (incidentId) params.set('incidentId', incidentId);
      const res = await fetch(`${API_BASE}/api/dashboard/risk-history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) setRiskHistory(body.data || []);
      }
    } catch (err) {
      console.error('Risk history fetch failed:', err);
    }
  };

  const fetchSystemHealth = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/health/deep`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) setSystemHealth(body.data);
      }
    } catch (err) {
      console.error('Health fetch failed:', err);
    }
  };

  const fetchThreatIntelStats = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/threat-intel-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) setThreatIntelStats(body.data);
      }
    } catch (err) {
      console.error('Threat intel stats fetch failed:', err);
    }
  };

  const fetchIncidentCharts = async (incidentId) => {
    if (!token || !incidentId) return;
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incidentId}/charts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) setChartData(body.data);
      }
    } catch (err) {
      console.error('Charts fetch failed:', err);
    }
  };

  const fetchDashboardCharts = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/charts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) setDashboardCharts(body.data);
      }
    } catch (err) {
      console.error('Dashboard charts fetch failed:', err);
    }
  };

  // Fetch incident details
  const fetchIncidentDetails = async (id) => {
    if (!token || !id) return;
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const body = await res.json();
      if (body.success) {
        setSelectedIncident(body.data);
      }

      // Fetch workflow steps
      const stepsRes = await fetch(`${API_BASE}/api/incidents/${id}/steps`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (stepsRes.ok) {
        const stepsBody = await stepsRes.json();
        if (stepsBody.success) {
          setSteps(stepsBody.data || []);
        }
      }

      // Fetch timeline events
      const timelineRes = await fetch(`${API_BASE}/api/incidents/${id}/timeline`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (timelineRes.ok) {
        const timelineBody = await timelineRes.json();
        if (timelineBody.success) {
          setTimeline(timelineBody.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching incident details, steps, or timeline:', err);
    }
  };


  // WebSocket Reconnection Engine with Exponential Backoff
  useEffect(() => {
    if (!token) return;

    let socket;
    let reconnectDelay = 1000;
    const maxReconnectDelay = 30000;
    let reconnectTimer;

    function connect() {
      console.log('🔌 Connecting to WebSocket anomaly stream...');
      socket = new WebSocket(WS_BASE);

      socket.onopen = () => {
        console.log('🟢 WebSocket anomaly stream connected');
        reconnectDelay = 1000;
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Live pipeline step synchronization
          if (message.type === 'anomaly') {
            const data = message.data;
            if (data.event === 'workflow_progress') {
              console.log('📡 Step update received:', data.stepId, data.status);
              
              // If the progress event matches the active selected incident, update immediately!
              if (data.incidentId === selectedId) {
                setSelectedIncident(data.state);
                fetchIncidentDetails(data.incidentId);
              }

              // Refresh summaries too
              fetchDashboard();
            } else if (data.event === 'STREAM_LOG') {
              console.log('📡 Streaming log received:', data.message);
              if (data.incidentId === selectedId) {
                setLiveLogs((prev) => [...prev.slice(-200), data]);
              }
            } else if (data.event === 'SYSTEM_HEALTH') {
              setSystemHealth(data);
            } else if (data.event === 'THREAT_SCORE') {
              if (data.incidentId === selectedId) {
                fetchRiskHistory(selectedId);
              }
            } else {
              // Add to general alerts list
              setAnomalyAlerts((prev) => [data, ...prev].slice(0, 5));
            }
          }
        } catch (err) {
          console.error('[WS Message Error]', err);
        }
      };

      socket.onclose = (event) => {
        console.warn(`🔴 WebSocket connection closed. Reconnecting...`);
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
          connect();
        }, reconnectDelay);
      };

      socket.onerror = (err) => {
        console.error('❌ WebSocket error:', err);
        socket.close();
      };
    }

    connect();

    return () => {
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [token, selectedId]);

  // Auto-scroll forensic logs terminal on new line updates
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs]);


  // Poll summaries every 4 seconds
  useEffect(() => {
    if (!token) return;
    fetchDashboard();
    fetchDashboardStats();
    fetchSystemHealth();
    fetchThreatIntelStats();
    fetchDashboardCharts();
    const interval = setInterval(() => {
      fetchDashboard();
      fetchDashboardStats();
      fetchSystemHealth();
      fetchThreatIntelStats();
      fetchDashboardCharts();
    }, 4000);
    return () => clearInterval(interval);
  }, [token]);

  // Poll selected incident details every 2 seconds if not fully resolved/denied
  useEffect(() => {
    if (!token || !selectedId) return;
    setLiveLogs([]);
    fetchIncidentDetails(selectedId);
    fetchRiskHistory(selectedId);
    fetchIncidentCharts(selectedId);
    
    const interval = setInterval(() => {
      if (incident && ['resolved', 'reported', 'human_denied', 'failed_closed'].includes(incident.status)) {
        clearInterval(interval);
        return;
      }
      fetchIncidentDetails(selectedId);
      fetchRiskHistory(selectedId);
      fetchIncidentCharts(selectedId);
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedId, token, incident?.status]);

  // Render/update Chart.js gauges and lines dynamically (create-once, update-thereafter).
  // Incident charts and dashboard charts use SEPARATE refs so switching incidents
  // doesn't destroy the dashboard donut charts.
  const incidentChartRef = useRef({ charts: {}, lastIncidentId: null });
  const dashChartRef = useRef({ charts: {} });

  useEffect(() => {
    if (!incident) return;

    const currentIncidentId = incident.incidentId;
    if (incidentChartRef.current.lastIncidentId !== currentIncidentId) {
      Object.values(incidentChartRef.current.charts).forEach((c) => c && c.destroy());
      incidentChartRef.current.charts = {};
      incidentChartRef.current.lastIncidentId = currentIncidentId;
    }

    const ensure = (canvasId, create, update) => {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const existing = incidentChartRef.current.charts[canvasId];
      if (existing) {
        update(existing);
        existing.update('none');
      } else {
        incidentChartRef.current.charts[canvasId] = create(el);
      }
    };

    // 2. Risk Score Over Time Line Chart (from SQLite risk_history)
    ensure('severityTrendChart',
      (ctx) => {
        const historyPoints = riskHistory.length > 0
          ? riskHistory
          : [{ timestamp: incident.createdAt, riskScore: incident.threatScore ?? 0 }];
        const labels = historyPoints.map((p) =>
          new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
        const scores = historyPoints.map((p) => p.riskScore ?? 0);
        return new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Risk Score',
              data: scores,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true,
              borderWidth: 1.5,
              pointRadius: 3,
              pointBackgroundColor: '#ef4444'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 8 }, maxTicksLimit: 6 } },
              y: { min: 0, max: 100, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 8 } } }
            }
          }
        });
      },
      (chart) => {
        const historyPoints = riskHistory.length > 0
          ? riskHistory
          : [{ timestamp: incident.createdAt, riskScore: incident.threatScore ?? 0 }];
        chart.data.labels = historyPoints.map((p) =>
          new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
        chart.data.datasets[0].data = historyPoints.map((p) => p.riskScore ?? 0);
      }
    );

    // 3. Confidence Curve over workflow steps (from metric_snapshots via /charts)
    ensure('confidenceCurveChart',
      (ctx) => {
        const curve = (chartData?.confidenceCurve && chartData.confidenceCurve.length > 0)
          ? chartData.confidenceCurve
          : (incident ? [{ step: 'Current', value: Math.round((incident.confidenceScore ?? 0) * 100) }] : []);
        return new Chart(ctx, {
          type: 'line',
          data: {
            labels: curve.map((c) => c.step),
            datasets: [{
              label: 'Confidence %',
              data: curve.map((c) => c.value),
              borderColor: '#818cf8',
              backgroundColor: 'rgba(129, 140, 248, 0.12)',
              tension: 0.35,
              fill: true,
              borderWidth: 1.5,
              pointRadius: 3,
              pointBackgroundColor: '#818cf8'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 8 }, maxTicksLimit: 6 } },
              y: { min: 0, max: 100, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 8 } } }
            }
          }
        });
      },
      (chart) => {
        const curve = (chartData?.confidenceCurve && chartData.confidenceCurve.length > 0)
          ? chartData.confidenceCurve
          : (incident ? [{ step: 'Current', value: Math.round((incident.confidenceScore ?? 0) * 100) }] : []);
        chart.data.labels = curve.map((c) => c.step);
        chart.data.datasets[0].data = curve.map((c) => c.value);
      }
    );

    // 4. Threat Score Breakdown
    ensure('threatBreakdownChart',
      (ctx) => {
        const bd = chartData?.threatBreakdown?.breakdown ?? {};
        const keys = Object.keys(bd);
        if (keys.length === 0) return null;
        return new Chart(ctx, {
          type: 'bar',
          data: {
            labels: keys.map((k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())),
            datasets: [{
              data: keys.map((k) => bd[k] ?? 0),
              backgroundColor: ['rgba(239, 68, 68, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(99, 102, 241, 0.8)', 'rgba(34, 197, 94, 0.8)', 'rgba(168, 85, 247, 0.8)', 'rgba(14, 165, 233, 0.8)'],
              borderWidth: 1,
              borderColor: '#0f172a',
              barThickness: 10
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { min: 0, max: 100, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 8 } } },
              y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 8 } } }
            }
          }
        });
      },
      (chart) => {
        const bd = chartData?.threatBreakdown?.breakdown ?? {};
        const keys = Object.keys(bd);
        chart.data.labels = keys.map((k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
        chart.data.datasets[0].data = keys.map((k) => bd[k] ?? 0);
      }
    );
  }, [incident?.incidentId, status, riskHistory, threatIntelStats, evidenceChain, chartData]);

  // Render platform-wide dashboard charts
  useEffect(() => {
    if (!dashboardCharts) return;

    const ensurePd = (canvasId, create, update) => {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const existing = dashChartRef.current.charts[canvasId];
      if (existing) {
        update(existing);
        existing.update('none');
      } else {
        dashChartRef.current.charts[canvasId] = create(el);
      }
    };

    ensurePd('statusDonutChart',
      (ctx) => {
        const byStatus = dashboardCharts.incidentsByStatus || {};
        const labels = Object.keys(byStatus);
        const data = labels.map((k) => byStatus[k]);
        const palette = ['#ef4444', '#f59e0b', '#22c55e', '#6366f1', '#14b8a', '#a855f7'];
        return new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{ data, backgroundColor: palette.slice(0, labels.length), borderWidth: 1, borderColor: '#0f172a' }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            cutout: '65%'
          }
        });
      },
      (chart) => {
        const byStatus = dashboardCharts.incidentsByStatus || {};
        chart.data.labels = Object.keys(byStatus);
        chart.data.datasets[0].data = Object.keys(byStatus).map((k) => byStatus[k]);
      }
    );

    ensurePd('autonomySplitChart',
      (ctx) => {
        const split = dashboardCharts.autonomySplit || { L4: 0, L2: 0 };
        return new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['L4 Auto', 'L2 HITL'],
            datasets: [{
              data: [split.L4 || 0, split.L2 || 0],
              backgroundColor: ['rgba(34,197,94,0.8)', 'rgba(245,158,11,0.8)'],
              borderWidth: 1,
              borderColor: ['#16a34a', '#b45309'],
              barThickness: 14
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 8 } } },
              y: { beginAtZero: true, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 8 }, precision: 0 } }
            }
          }
        });
      },
      (chart) => {
        const split = dashboardCharts.autonomySplit || { L4: 0, L2: 0 };
        chart.data.datasets[0].data = [split.L4 || 0, split.L2 || 0];
      }
    );
  }, [dashboardCharts]);

  useEffect(() => {
    return () => {
      Object.values(incidentChartRef.current.charts).forEach((c) => c && c.destroy());
      Object.values(dashChartRef.current.charts).forEach((c) => c && c.destroy());
    };
  }, []);

  // Custom Ingestion Submission
  const handleIngestLogsSubmit = async (e) => {
    e.preventDefault();
    if (!customIncidentId || !customLogs) return;
    setIsIngesting(true);
    try {
      const lines = customLogs.split('\n').filter(l => l.trim() !== '');
      const res = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          incidentId: customIncidentId,
          logs: lines
        })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedId(customIncidentId);
        setShowIngestModal(false);
        setCustomLogs('');
        setCustomIncidentId('');
      } else {
        alert(`Ingestion failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Network connection error: ${err.message}`);
    } finally {
      setIsIngesting(false);
    }
  };

  // Trigger preset logs
  const applyLogsPreset = (type) => {
    setCustomIncidentId(`INC-2026-${type.toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`);
    setCustomLogs(DEMO_LOGS_PRESET[type].join('\n'));
  };

  const triggerDirectSimulation = async (type) => {
    const customId = `INC-2026-${type.toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const logs = DEMO_LOGS_PRESET[type];
    try {
      const res = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          incidentId: customId,
          logs
        })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedId(customId);
        setSelectedIncident(null);
        setMiddleTab('pipeline');
      } else {
        alert(`Simulation ingestion failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Simulation network error: ${err.message}`);
    }
  };

  // Approve override action
  const handleApprove = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${selectedId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const body = await res.json();
      if (body.success) {
        setSelectedIncident(body.data);
      }
    } catch (err) {
      console.error('Approve call failed:', err);
    }
  };

  // Reject override action
  const handleReject = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${selectedId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const body = await res.json();
      if (body.success) {
        setSelectedIncident(body.data);
      }
    } catch (err) {
      console.error('Reject call failed:', err);
    }
  };

  // Trigger a fresh correlation analysis for the selected incident
  const triggerCorrelation = async (incidentId) => {
    if (!token || !incidentId) return;
    try {
      await fetch(`${API_BASE}/api/incidents/${incidentId}/correlate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Correlation trigger failed:', err);
    }
  };

  // Helpers to resolve execution workflow node colors
  const getTierStatus = (tierNum) => {
    if (!incident) return { icon: '⏳', color: 'border-slate-800 text-slate-500 bg-slate-900/10', text: 'AWAITING LOGS', spinner: false };
    
    const stepMapping = {
      1: 'ingestion-gate-step',
      2: 'log-analysis-step',
      3: 'anomaly-analysis-step',
      4: 'remediation-step',
      5: 'autonomy-routing-step',
      6: 'report-step'
    };

    const stepName = stepMapping[tierNum];
    const dbStep = steps.find(s => s.stepName === stepName);
    let dbStatus = dbStep ? dbStep.status : 'NOT_STARTED';

    // Backwards compatibility/fallback: if steps array is empty, resolve via incident status mapping
    if (steps.length === 0) {
      const statusMap = {
        1: { name: 'ingest-agent', status: ['ingesting', 'analyzing', 'retrieving_context', 'root_cause_identified', 'remediation_proposed', 'resolved', 'reported'] },
        2: { name: 'log-agent', status: ['analyzing', 'retrieving_context', 'root_cause_identified', 'remediation_proposed', 'resolved', 'reported'] },
        3: { name: 'rca-agent', status: ['retrieving_context', 'root_cause_identified', 'remediation_proposed', 'resolved', 'reported'] },
        4: { name: 'remediation-agent', status: ['remediation_proposed', 'resolved', 'reported'] },
        5: { name: 'autonomy-router', status: ['resolved', 'reported', 'pending_human_review', 'human_approved', 'human_denied'] },
        6: { name: 'report-agent', status: ['resolved', 'reported'] }
      };
      
      const config = statusMap[tierNum];
      const currentNode = incident.currentNodeId;
      
      if (currentNode === config.name) {
        dbStatus = 'RUNNING';
      } else if (config.status.includes(status)) {
        dbStatus = 'COMPLETED';
      } else if (status === 'pending_human_review' && tierNum === 5) {
        dbStatus = 'WAITING';
      } else if (status === 'human_denied' && tierNum === 5) {
        dbStatus = 'FAILED';
      } else {
        dbStatus = 'NOT_STARTED';
      }
    }

    if (dbStatus === 'RUNNING') {
      return { icon: '⚙️', color: 'border-indigo-500 text-indigo-400 bg-indigo-950/20 shadow-glowBlue animate-pulse', text: 'INVESTIGATING', spinner: true };
    }
    if (dbStatus === 'COMPLETED') {
      return { icon: '🟢', color: 'border-emerald-500/80 text-emerald-400 bg-emerald-950/10', text: 'COMPLETE', spinner: false };
    }
    if (dbStatus === 'FAILED') {
      if (tierNum === 5) {
        return { icon: '🔴', color: 'border-red-500 text-red-400 bg-red-950/20', text: 'BLOCKED BY SOC', spinner: false };
      }
      return { icon: '🔴', color: 'border-rose-500 text-rose-400 bg-rose-950/20', text: 'FAILED', spinner: false };
    }
    if (dbStatus === 'WAITING') {
      if (tierNum === 5) {
        return { icon: '🍊', color: 'border-amber-500 text-amber-400 bg-amber-950/25 animate-pulse shadow-glowRed', text: 'OVERRIDE REQUIRED', spinner: false };
      }
      return { icon: '⏳', color: 'border-amber-500/50 text-amber-400/80 bg-amber-950/10', text: 'WAITING', spinner: false };
    }

    return { icon: '⏳', color: 'border-slate-800 text-slate-600 bg-slate-950/10', text: 'QUEUED', spinner: false };
  };


  // Authentication Interface
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg p-4 font-sans select-none relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl animate-blob"></div>
          <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-accent-purple/20 rounded-full blur-3xl animate-blob" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-accent-pink/20 rounded-full blur-3xl animate-blob" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="w-full max-w-sm glass rounded-3xl p-8 shadow-glass-lg space-y-6 relative z-10 animate-scale-in">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-accent-purple border border-white/10 text-white shadow-glowBlue mb-3 animate-float">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-black font-outfit text-gradient tracking-tight">Threat Console</h1>
            <p className="text-sm text-slate-400 font-mono">Autonomous Incident Response & Mitigation</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 font-sans">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">Username</label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 font-mono transition-all"
                placeholder="admin"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 font-mono transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            {authError && (
              <div className="p-3 bg-danger-500/10 border border-danger-500/30 rounded-xl flex items-center space-x-2 text-xs text-danger-400 font-mono animate-slide-in">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isAuthenticating}
              className="w-full btn-primary text-white font-bold py-3.5 px-4 rounded-xl transition-all text-xs uppercase tracking-wider font-mono flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isAuthenticating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <LogIn className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-white/5 text-center">
            <p className="text-[10px] text-slate-500 font-mono">Secured by Enkrypt AI • Mastra Powered</p>
          </div>
        </div>
      </div>
    );
  }
  const getPostmortemProgress = () => {
    const reportLogs = liveLogs.filter(log => log.stepId === 'report-step');
    if (reportLogs.length > 0) {
      const lastLog = reportLogs[reportLogs.length - 1];
      const match = lastLog.message.match(/(\d+)% progress/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    const reportStep = steps.find(s => s.stepName === 'report-step');
    if (reportStep?.status === 'RUNNING') {
      return 20;
    }
    return 0;
  };

  return (
    <div className="h-screen w-screen mesh-gradient text-slate-100 flex font-sans select-none overflow-hidden relative">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-primary-900/10 via-transparent to-accent-purple/10"></div>
        <div className="absolute top-20 right-20 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-accent-purple/10 rounded-full blur-3xl animate-blob" style={{ animationDelay: '3s' }}></div>
      </div>

      <OnboardingTour />

      {/* Left Sidebar */}
      <Sidebar 
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        middleTab={middleTab}
        setMiddleTab={setMiddleTab}
        activeNav={activeNav}
        onNavigate={handleNavigate}
        username={username}
        handleLogout={handleLogout}
        incidentCount={incidents.filter(i => !['resolved', 'reported', 'human_denied'].includes(i.status)).length}
      />

      {/* Main Content Workspace Container (Header + Body + Bottom Grid) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">
        {/* Sticky Header with statistics KPI row */}
        <Header 
          username={username}
          handleLogout={handleLogout}
          isConnected={isConnected}
          dashboardStats={dashboardStats}
          incidents={incidents}
        />

        {/* 3-Column main body and bottom sections in a scrollable container */}
        <div id="app-scroll" className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 terminal-scroll select-none">
          {/* Main 3-Column Grid Split: Column 1 (30%), Column 2 (45%), Column 3 (25%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* COLUMN 1: Active Incidents list & Risk scoring charts (lg:col-span-4 / 30% equivalent) */}
            <div className="lg:col-span-4 space-y-6">
              <div id="section-incidents">
                <ActiveIncidents 
                  incidents={incidents}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  setSelectedIncident={setSelectedIncident}
                  setShowIngestModal={setShowIngestModal}
                />
              </div>
              <RiskScoreCharts 
                incident={incident}
                riskHistory={riskHistory}
              />
            </div>

            {/* COLUMN 2: Workflow execution pipeline & Post-mortem tab (lg:col-span-5 / 45% equivalent) */}
            <div id="section-pipeline" className="lg:col-span-5 bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[18px] flex flex-col h-[784px] overflow-hidden">
              <ExecutionPipeline 
                middleTab={middleTab}
                setMiddleTab={setMiddleTab}
                status={status}
                incident={incident}
                steps={steps}
                getTierStatus={getTierStatus}
                handleApprove={handleApprove}
                handleReject={handleReject}
                getPostmortemProgress={getPostmortemProgress}
                liveLogs={liveLogs}
                MarkdownRenderer={MarkdownRenderer}
              />
            </div>

            {/* COLUMN 3: Live events stream, Threat feeds stats, System health status (lg:col-span-3 / 25% equivalent) */}
            <div className="lg:col-span-3 space-y-6">
              <div id="section-evidence">
                <LiveEventStream 
                  liveLogs={liveLogs}
                  timeline={timeline}
                  evidenceChain={evidenceChain}
                />
              </div>
              <div id="section-intel">
                <ThreatIntel 
                  incident={incident}
                  evidenceChain={evidenceChain}
                  threatIntelStats={threatIntelStats}
                />
              </div>

              {/* Similar Incidents correlation panel */}
              <div className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[18px] p-4 space-y-3">                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                    <Database className="w-4 h-4 text-indigo-400" />
                    <span>Similar Incidents</span>
                  </h3>
                  <button
                    onClick={() => triggerCorrelation(selectedId)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 uppercase tracking-wide"
                  >
                    Re-run
                  </button>
                </div>
<SimilarIncidentsPanel
                   incidentId={selectedId}
                   token={token}
                   apiBase={API_BASE}
                   onSelectIncident={setSelectedId}
                 />
               </div>

               {/* Decision Support Panel */}
               <div className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[18px] p-4 space-y-3">
                 <div className="flex items-center justify-between">
                   <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                     <ShieldAlert className="w-4 h-4 text-orange-400" />
                     <span>Decision Support</span>
                   </h3>
                 </div>
                 <DecisionSupportPanel incident={incident} token={token} apiBase={API_BASE} />
               </div>

               <div id="section-reports">
                <SystemHealth 
                  systemHealth={systemHealth}
                  dashboardCharts={dashboardCharts}
                />
              </div>
            </div>

          </div>

          {/* Bottom Utility Row (3 Columns: Simulation Controls, Recent Activity, AI Insights) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SimulationControls triggerSimulation={triggerDirectSimulation} />
            <div id="section-timeline"><RecentActivity timeline={timeline} liveLogs={liveLogs} /></div>
            <div id="section-kb"><AIInsights incident={incident} /></div>
          </div>
        </div>
      </div>

      {/* CUSTOM LOG INGESTION DIALOG MODAL */}
      {showIngestModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-xl glass rounded-2xl p-6 shadow-glass-lg space-y-5 animate-scale-in">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-primary-600 flex items-center justify-center">
                  <Workflow className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Run Mitigation Pipeline</h2>
              </div>
              <button 
                onClick={() => setShowIngestModal(false)}
                className="text-slate-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Presets Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">Preset Attack Log Patterns</label>
              <div className="flex flex-wrap gap-2 text-[10px] font-mono font-bold">
                <button 
                  onClick={() => applyLogsPreset('stuffing')}
                  className="bg-slate-950/50 hover:bg-slate-900/50 border border-white/10 text-accent-purple px-4 py-2 rounded-xl transition-all hover:border-accent-purple/50 hover:shadow-glowPurple"
                >
                  Credential Stuffing — db-prod-02
                </button>
                <button 
                  onClick={() => applyLogsPreset('scan')}
                  className="bg-slate-950/50 hover:bg-slate-900/50 border border-white/10 text-accent-purple px-4 py-2 rounded-xl transition-all hover:border-accent-purple/50 hover:shadow-glowPurple"
                >
                  Distributed Port Scan — api-gw-01
                </button>
                <button 
                  onClick={() => applyLogsPreset('sql')}
                  className="bg-slate-950/50 hover:bg-slate-900/50 border border-white/10 text-accent-purple px-4 py-2 rounded-xl transition-all hover:border-accent-purple/50 hover:shadow-glowPurple"
                >
                  SQL Injection — web-01 (WAF)
                </button>
              </div>
            </div>

            <form onSubmit={handleIngestLogsSubmit} className="space-y-4 font-mono text-xs">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">Incident ID</label>
                <input 
                  type="text" 
                  value={customIncidentId}
                  onChange={(e) => setCustomIncidentId(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-accent-purple focus:ring-2 focus:ring-accent-purple/20 font-mono transition-all"
                  placeholder="INC-2026-STUFF-002"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">Raw log lines — format: host, process, severity, message</label>
                <textarea 
                  value={customLogs}
                  onChange={(e) => setCustomLogs(e.target.value)}
                  className="w-full h-44 bg-slate-950/50 border border-white/10 rounded-xl p-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-accent-purple focus:ring-2 focus:ring-accent-purple/20 font-mono leading-relaxed transition-all resize-none"
                  placeholder={`db-prod-02,mysqld,HIGH,Failed login from 192.168.1.105\ndb-prod-02,mysqld,CRITICAL,Unauthorized access detected`}
                  required
                />
              </div>

              <div className="flex space-x-3 pt-4 border-t border-white/10">
                <button 
                  type="submit" 
                  disabled={isIngesting || !customIncidentId || !customLogs}
                  className="flex-1 btn-primary text-white font-bold py-3.5 px-4 rounded-xl transition-all text-xs uppercase tracking-wide flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isIngesting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Start Analysis</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );

}

// Fail-safe main entry point load listener
window.addEventListener('DOMContentLoaded', () => {
  try {
    const rootElement = document.getElementById('root');
    if (rootElement) {
      const root = ReactDOM.createRoot(rootElement);
      root.render(<App />);
    } else {
      console.error('Fatal: Root container element #root not found.');
    }
  } catch (initErr) {
    console.error('Fatal: Failed to initialize React application:', initErr);
  }
});
