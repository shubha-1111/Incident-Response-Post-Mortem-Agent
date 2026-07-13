import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Terminal, Shield, AlertTriangle, CheckCircle, Activity, Globe, Cpu, RefreshCw, 
  LogIn, LogOut, ChevronRight, Check, X, FileText, BarChart2, Eye, ShieldAlert, 
  Workflow, GitPullRequest, ArrowRight, Database, Lock, Clock, ExternalLink,
  PanelLeftClose, PanelLeftOpen, Plus, User, MessageSquare, Trash2
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
import { IncidentGroupsView } from './components/IncidentGroupsView';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { SecurityToolkit } from './components/SecurityToolkit';
import { ReportGenerator } from './components/ReportGenerator';


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
  ],
  ddos: [
    "web-prod-01,nginx,CRITICAL,Rate limit exceeded: 429 Too Many Requests from 203.0.113.88",
    "web-prod-01,nginx,HIGH,Upstream server temporarily unavailable",
    "web-prod-01,syslog,CRITICAL,SYN flood threshold exceeded 10kpps"
  ],
  ransom: [
    "fileserv-01,sshd,CRITICAL,Multiple failed SSH logins from root",
    "fileserv-01,kernel,CRITICAL,Cryptographic activity detected on /shared/docs",
    "fileserv-01,auditd,CRITICAL,Mass file modification event on sensitive volumes"
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
              <FileText className="w-4 h-4 mr-2 text-blue-300" />
              {cleanLine.substring(2)}
            </h1>
          );
        }
        
        // H2 Headers
        if (cleanLine.startsWith('## ')) {
          return (
            <h2 key={idx} className="text-xs font-bold text-white mt-4 font-mono border-l-2 border-blue-400 pl-2 uppercase tracking-wide">
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
              <span className="text-blue-300 select-none mt-1">•</span>
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
              <span className="text-blue-300 select-none font-bold">{prefix}</span>
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

const ThreatScoreGauge = ({ score }) => {
  const normalizedScore = typeof score === 'number' ? score : 30;
  const r = 50;
  const c = Math.PI * r; // 157.08
  const offset = c - (normalizedScore / 100) * c;
  
  const getRiskLabel = (s) => {
    if (s >= 80) return { text: 'HIGH RISK', color: 'text-rose-500' };
    if (s >= 40) return { text: 'MEDIUM RISK', color: 'text-amber-500' };
    return { text: 'LOW RISK', color: 'text-[#93C5FD]' };
  };
  
  const risk = getRiskLabel(normalizedScore);

  return (
    <div className="glass-panel p-5 rounded-[12px] flex flex-col items-center justify-center space-y-3 shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
      <h3 className="w-full text-xs font-bold text-white uppercase tracking-wider font-sans text-left border-b border-[var(--border-default)] pb-2 select-none">
        Threat Score
      </h3>
      <div className="relative flex items-center justify-center w-full h-24 mt-2">
        <svg className="w-36 h-20 transform translate-y-1" viewBox="0 0 120 70">
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#93c5fd" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 select-none">
          <span className="text-2xl font-black text-white font-mono">{normalizedScore}<span className="text-xs text-slate-400 font-normal">/100</span></span>
          <span className={`text-[10px] font-bold tracking-widest font-mono mt-0.5 ${risk.color}`}>{risk.text}</span>
        </div>
      </div>
    </div>
  );
};

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
  const [selectedId, setSelectedId] = useState(null);
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
  const [riskDays, setRiskDays] = useState(30);

  
  // Custom log ingestion modal state
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [customIncidentId, setCustomIncidentId] = useState('INC-2026-STUFF-002');
  const [customLogs, setCustomLogs] = useState('db-prod-02,mysqld,HIGH,Failed login from 192.168.1.105\ndb-prod-02,mysqld,CRITICAL,Unauthorized access detected');
  const [isIngesting, setIsIngesting] = useState(false);

  const terminalEndRef = useRef(null);

  // Extract details defensively
  const incident = selectedIncident || incidents.find(i => i.incidentId === selectedId);
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
    }
    const sc = document.getElementById('app-scroll');
    if (sc) sc.scrollTo({ top: 0, behavior: 'auto' });
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
        const loaded = body.data || [];
        setIncidents(loaded);
        setIsConnected(true);
        if (loaded.length > 0 && !selectedId) {
          setSelectedId(loaded[0].incidentId);
        }
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

  const fetchRiskHistory = async (incidentId, days = riskDays) => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ limit: String(days) });
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


  // Poll summaries every 15 seconds (reduced from 4s to avoid rate limit exhaustion)
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
    }, 15000);
    return () => clearInterval(interval);
  }, [token]);

  // Poll selected incident details every 5 seconds if not fully resolved/denied
  useEffect(() => {
    if (!token || !selectedId) return;
    setLiveLogs([]);
    fetchIncidentDetails(selectedId);
    fetchRiskHistory(selectedId, riskDays);
    fetchIncidentCharts(selectedId);
    
    const interval = setInterval(() => {
      if (incident && ['resolved', 'reported', 'human_denied', 'failed_closed'].includes(incident.status)) {
        clearInterval(interval);
        return;
      }
      fetchIncidentDetails(selectedId);
      fetchRiskHistory(selectedId, riskDays);
      fetchIncidentCharts(selectedId);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedId, token, incident?.status]);

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

  // Clear all incidents from the queue
  const handleClearIncidents = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/incidents`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const body = await res.json();
      if (body.success) {
        setIncidents([]);
        setSelectedId('');
        setSelectedIncident(null);
        setSteps([]);
        setTimeline([]);
        setRiskHistory([]);
        setChartData(null);
        setLiveLogs([]);
      } else {
        console.error('Clear incidents failed:', body.error);
      }
    } catch (err) {
      console.error('Clear incidents error:', err.message);
    }
  };

  // Trigger a fresh correlation analysis for the selected incident
  const triggerCorrelation = async (incidentId) => {
    if (!token || !incidentId) return;
    try {
      await fetch(`${API_BASE}/api/incidents/${incidentId}/correlations`, {
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
      return { icon: '⚙️', color: 'border-blue-500 text-blue-300 bg-blue-950/20 shadow-glowBlue animate-pulse', text: 'INVESTIGATING', spinner: true };
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#000000] p-4 font-sans select-none relative overflow-hidden">
        {/* Glow orbit background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] rounded-full border border-blue-500/5 opacity-40"></div>
          <div className="absolute -bottom-1/4 -right-1/4 w-[600px] h-[600px] rounded-full border border-blue-500/5 opacity-40"></div>
        </div>

        <div className="w-full max-w-md flex flex-col items-center space-y-6 relative z-10 animate-scale-in">
          {/* Logo Diagram */}
          <img 
            src="/images/shield-check.png" 
            className="w-[680px] h-[80px] object-contain -mb-8" 
            style={{ mixBlendMode: 'screen' }}
            alt="Shield Security Diagram" 
            onError={(e) => { e.target.style.display = 'none'; }}
          />

          <div className="text-center -mt-10">
            <h1 className="text-2xl font-black text-white tracking-tight flex flex-col items-center leading-tight">
              <span>Incident Response</span>
              <span className="gradient-text font-bold">Postmortem Agent</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-sans tracking-wide mt-1.5 uppercase font-medium">Autonomous Incident Response & Mitigation</p>
          </div>

          <div className="w-full max-w-sm card-panel p-8 shadow-2xl relative">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Username</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#030712]/60 border border-[#1b2233] rounded-xl pl-11 pr-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#3b82f6] font-sans transition-all"
                    placeholder="admin"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#030712]/60 border border-[#1b2233] rounded-xl pl-11 pr-12 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#3b82f6] font-sans transition-all"
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-all">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
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
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 border border-blue-500/30 text-white font-semibold py-3.5 px-4 rounded-xl transition-all text-xs uppercase tracking-wider font-sans flex items-center justify-center space-x-2 shadow-[0_0_15px_rgba(59,130,246,0.25)] hover:shadow-[0_0_25px_rgba(59,130,246,0.45)] disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-500 font-sans mt-8">
            <Shield className="w-3.5 h-3.5 text-slate-600" />
            <span>Secured by Enkrypt AI • Mastra Powered</span>
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

  const renderContent = () => {
    switch (activeNav) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* COLUMN 1: Active Incidents, Risk trend chart, Similar incidents */}
            <div className="lg:col-span-4 space-y-6">
              <ActiveIncidents 
                incidents={incidents}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                setSelectedIncident={setSelectedIncident}
                setShowIngestModal={setShowIngestModal}
                onClearQueue={handleClearIncidents}
              />
              <RiskScoreCharts 
                incident={incident}
                riskHistory={riskHistory}
                days={riskDays}
                onDaysChange={(d) => { setRiskDays(d); fetchRiskHistory(selectedId, d); }}
              />
              <div className="glass-panel glow-hover rounded-[12px] p-5 space-y-3 shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
                <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-2 select-none">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2 font-mono">
                    <Database className="w-4 h-4 text-blue-300" />
                    <span>Similar Incidents</span>
                  </h3>
                  <button
                    onClick={() => triggerCorrelation(selectedId)}
                    className="text-[10px] text-slate-400 hover:text-white uppercase tracking-wide font-mono"
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
            </div>

            {/* COLUMN 2: Workflow pipeline, Threat Score gauge, Decision support */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel glow-hover-violet rounded-[18px] flex flex-col overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
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
              {/* Compact threat metrics strip (replaces static gauge) */}
              <div className="glass-panel rounded-[12px] px-5 py-3 grid grid-cols-4 gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp select-none">
                {[
                  { label: 'Threat Score', value: incident?.threatScore != null ? `${incident.threatScore}/100` : '—', color: (incident?.threatScore ?? 0) >= 80 ? 'text-rose-400' : (incident?.threatScore ?? 0) >= 40 ? 'text-amber-400' : 'text-blue-300' },
                  { label: 'Confidence', value: incident?.confidenceScore != null ? `${Math.round(incident.confidenceScore * 100)}%` : '—', color: 'text-emerald-400' },
                  { label: 'Autonomy', value: incident?.autonomyTier || 'L2_HITL', color: 'text-violet-400' },
                  { label: 'Attack Type', value: incident?.attackType || '—', color: 'text-cyan-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className={`text-xs font-bold font-mono truncate ${color}`}>{value}</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <div className="glass-panel glow-hover rounded-[12px] p-5 space-y-3 shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-fadeInUp">
                <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-2 select-none">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4 text-orange-400" />
                    <span>Decision Support</span>
                  </h3>
                </div>
                <DecisionSupportPanel incident={incident} token={token} apiBase={API_BASE} />
              </div>
            </div>

            {/* COLUMN 3: Live events stream, Threat Intel feeds, System status */}
            <div className="lg:col-span-3 space-y-6">
              <LiveEventStream 
                liveLogs={liveLogs}
                timeline={timeline}
                evidenceChain={evidenceChain}
              />
              <ThreatIntel 
                incident={incident}
                evidenceChain={evidenceChain}
                threatIntelStats={threatIntelStats}
                chartData={chartData}
              />
              <SystemHealth 
                systemHealth={systemHealth}
                dashboardCharts={dashboardCharts}
                incident={incident}
                chartData={chartData}
                hideChart={true}
              />
            </div>

          </div>
        );

      case 'incidents':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4">
              <ActiveIncidents 
                incidents={incidents}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                setSelectedIncident={setSelectedIncident}
                setShowIngestModal={setShowIngestModal}
                onClearQueue={handleClearIncidents}
              />
            </div>
            <div className="lg:col-span-8">
              <SimilarIncidentsPanel
                incidentId={selectedId}
                token={token}
                apiBase={API_BASE}
                onSelectIncident={setSelectedId}
              />
            </div>
          </div>
        );

      case 'investigation':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Active Incident Header Banner */}
            <div className="lg:col-span-12 glass-panel p-4 rounded-[12px] flex items-center justify-between border border-[var(--border-default)] select-none">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono font-bold bg-blue-950/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-900/30">
                    ACTIVE CASE
                  </span>
                  <span className="text-xs text-slate-400 font-mono font-bold">
                    {incident?.incidentId || selectedId}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white mt-1 uppercase tracking-wider font-mono">
                  {incident?.incidentId?.includes('STUFF') ? 'Credential Stuffing' : incident?.incidentId?.includes('SCAN') ? 'Distributed Port Scan' : incident?.incidentId?.includes('SQL') ? 'SQL Injection' : incident?.incidentId?.includes('DDOS') ? 'HTTP Flood DDoS' : incident?.incidentId?.includes('RANSOM') ? 'Ransomware Compromise' : 'General Threat Analysis'} — {incident?.targetHost || 'db-prod-02'}
                </h2>
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold bg-blue-950/40 text-blue-300 px-3 py-1 rounded-full border border-blue-900/30 uppercase tracking-widest">
                  STATUS: {incident?.status || 'INGESTED'}
                </span>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <DecisionSupportPanel incident={incident} token={token} apiBase={API_BASE} />
              <AIInsights incident={incident} />
            </div>
            <div className="lg:col-span-6">
              <LiveEventStream 
                liveLogs={liveLogs}
                timeline={timeline}
                evidenceChain={evidenceChain}
              />
            </div>
          </div>
        );

      case 'evidence':
        return (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="card-panel p-5 space-y-2">
              <h4 className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider font-mono">Evidence Vault Briefing</h4>
              <p className="text-[11px] text-[#A0A8B3] leading-relaxed font-sans">
                The Evidence Vault acts as a cryptographically secure repository storing real-time forensic pointers collected by autonomous agents. Each payload block contains target hostname, threat signature metrics, source timestamps, and raw process telemetry. Pointers mapped here are ingested into our Qdrant memory collections to serve as vectors for post-mortem learning loops.
              </p>
            </div>
            
            <div className="glass-panel p-6 rounded-[18px]">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
                <Database className="w-5 h-5 text-blue-300" />
                <span>Evidence Vault ({evidenceChain.length} pointers)</span>
              </h3>
              <div className="space-y-4">
                {evidenceChain.map((entry, idx) => (
                  <div key={idx} className="bg-slate-900/60 p-4 border border-[var(--border-default)] rounded-[12px] flex justify-between items-center">
                    <div>
                      <div className="font-mono text-xs text-white font-bold">{entry.payload?.host || 'host-system'}</div>
                      <div className="text-xs text-slate-400 mt-1">{entry.summary}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono font-bold bg-blue-950/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-900/30">
                        CONF: {Math.round(entry.confidence * 100)}%
                      </span>
                      <div className="text-[9px] text-slate-500 mt-1">{new Date(entry.observedAt).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'intel': {
        const liveTechniques = (() => {
          const raw = incident?.mitreTechniques || incident?.attackTechniques || [];
          if (Array.isArray(raw) && raw.length > 0) return raw;
          const fromEvidence = evidenceChain
            .flatMap(e => e.payload?.mitreTechniques || e.payload?.techniques || [])
            .filter(Boolean);
          if (fromEvidence.length > 0) return [...new Set(fromEvidence)];
          return [];
        })();
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6">
              <ThreatIntel 
                incident={incident}
                evidenceChain={evidenceChain}
                threatIntelStats={threatIntelStats}
                chartData={chartData}
              />
            </div>
            <div className="lg:col-span-6 glass-panel p-6 rounded-[18px] h-fit">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 font-mono">MITRE ATT&CK Mapping Matrix</h3>
              {liveTechniques.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {liveTechniques.map((tech, idx) => (
                    <div key={idx} className="bg-slate-900/40 border border-[var(--border-default)] p-3 rounded-[8px] text-center">
                      <div className="text-[10px] text-cyan-400 font-mono font-bold">MITRE ATT&CK</div>
                      <div className="text-xs font-bold text-white mt-1 font-mono">{typeof tech === 'string' ? tech : tech.id || tech.techniqueId}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-slate-600 text-[11px] font-mono uppercase tracking-wider">
                    {selectedId ? 'No MITRE techniques mapped for this incident yet' : 'Select an incident to view MITRE mappings'}
                  </div>
                  {incident?.attackType && (
                    <div className="mt-3 inline-block bg-cyan-950/30 text-cyan-400 text-[10px] font-mono px-3 py-1.5 rounded border border-cyan-900/30">
                      Attack Type: {incident.attackType}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'mitre': {
        const mitreTechs = (() => {
          const raw = incident?.mitreTechniques || incident?.attackTechniques || [];
          if (Array.isArray(raw) && raw.length > 0) return raw;
          const fromEvidence = evidenceChain
            .flatMap(e => e.payload?.mitreTechniques || e.payload?.techniques || [])
            .filter(Boolean);
          return [...new Set(fromEvidence)];
        })();
        return (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="glass-panel p-6 rounded-[18px] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">MITRE ATT&CK Mapping Details</h3>
                {incident?.incidentId && (
                  <span className="text-[9px] font-mono bg-blue-950/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-900/30">
                    {incident.incidentId}
                  </span>
                )}
              </div>
              {incident?.attackType && (
                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-[10px] border border-[var(--border-default)]">
                  <span className="text-[10px] text-slate-400 font-mono">Detected Attack Class:</span>
                  <span className="text-xs font-bold text-cyan-400 font-mono">{incident.attackType}</span>
                  {incident.rootCauseHypothesis && (
                    <span className="text-[10px] text-slate-400 font-sans ml-2 truncate">{incident.rootCauseHypothesis}</span>
                  )}
                </div>
              )}
              {mitreTechs.length > 0 ? (
                <div className="space-y-3">
                  {mitreTechs.map((tech, idx) => {
                    const techId = typeof tech === 'string' ? tech : tech.id || tech.techniqueId;
                    const techName = typeof tech === 'object' ? (tech.name || tech.techniqueName || '') : '';
                    const techDesc = typeof tech === 'object' ? (tech.description || tech.desc || '') : '';
                    return (
                      <div key={idx} className="bg-slate-900/50 p-4 border border-[var(--border-default)] rounded-[12px]">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-white font-mono">{techId}{techName ? ` — ${techName}` : ''}</span>
                          <span className="text-[9px] bg-cyan-950/30 text-cyan-400 font-bold px-2 py-0.5 rounded border border-cyan-900/30">MAPPED</span>
                        </div>
                        {techDesc && <p className="text-[11px] text-slate-400 mt-2 font-sans leading-relaxed">{techDesc}</p>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center text-center">
                  <Shield className="w-8 h-8 text-slate-700 mb-3" />
                  <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wider">
                    {selectedId ? 'No MITRE techniques mapped yet for this incident' : 'Select an active incident to view MITRE mappings'}
                  </p>
                  <p className="text-[10px] text-slate-600 font-sans mt-1">Techniques are automatically extracted by the AI analysis pipeline during incident triage.</p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'timeline':
        return (
          <div className="max-w-3xl mx-auto">
            <RecentActivity timeline={timeline} liveLogs={liveLogs} />
          </div>
        );

      case 'postmortems': {
        const resolvedIncidents = incidents.filter(i => ['resolved', 'reported'].includes(i.status));
        return (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Header row */}
            <div className="glass-panel rounded-[12px] p-4 flex items-center justify-between select-none">
              <div className="flex items-center space-x-3">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">SRE Post-Mortem Reports</span>
                <span className="text-[9px] bg-purple-950/40 text-purple-300 px-2 py-0.5 rounded-full border border-purple-900/30 font-mono">
                  {resolvedIncidents.length} COMPLETED
                </span>
              </div>
            </div>

            {resolvedIncidents.length === 0 ? (
              <div className="glass-panel rounded-[12px] p-12 flex flex-col items-center justify-center text-center">
                <RefreshCw className="w-8 h-8 text-slate-600 mb-3" />
                <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">No completed post-mortems yet</p>
                <p className="text-[11px] text-slate-600 font-sans mt-2">Ingest an incident and let the pipeline complete to generate a post-mortem report.</p>
              </div>
            ) : (
              <>
                {/* Incident switcher — only shown when multiple resolved incidents exist */}
                {resolvedIncidents.length > 1 && (
                  <div className="glass-panel rounded-[12px] p-4 space-y-2 select-none">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Select Incident</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {resolvedIncidents.map(inc => (
                        <button
                          key={inc.incidentId}
                          onClick={() => { setSelectedId(inc.incidentId); setSelectedIncident(null); }}
                          className={`px-3 py-1.5 rounded-[6px] text-[10px] font-mono font-bold border transition-all ${
                            selectedId === inc.incidentId
                              ? 'bg-purple-950/60 text-purple-300 border-purple-700/40'
                              : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-300'
                          }`}
                        >
                          {inc.incidentId}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* If selected incident isn't resolved, switch to first resolved one automatically */}
                {!['resolved', 'reported'].includes(status) && resolvedIncidents.length > 0 && (() => {
                  // Side-effect: switch selection to first resolved incident
                  const first = resolvedIncidents[0];
                  if (first.incidentId !== selectedId) {
                    setTimeout(() => { setSelectedId(first.incidentId); setSelectedIncident(null); }, 0);
                  }
                  return null;
                })()}

                {/* Post-mortem viewer */}
                <div className="h-[700px]">
                  <ExecutionPipeline 
                    middleTab="postmortem"
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
              </>
            )}
          </div>
        );
      }

      case 'kb': {
        const qdrantStatus = systemHealth?.qdrant ?? null;
        const qdrantOnline = qdrantStatus === 'healthy' || qdrantStatus === 'ready' || qdrantStatus === 'online';
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 card-panel p-5 space-y-2">
              <h4 className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider font-mono">AI Insights & Knowledge Base Briefing</h4>
              <p className="text-[11px] text-[#A0A8B3] leading-relaxed font-sans">
                AI Insights leverage Cohere semantic embeddings combined with Qdrant vector store indexing. When an active containment event triggers, the system automatically runs hybrid RAG queries against historical post-mortems and the CISA Known Exploited Vulnerabilities (KEV) feed. This provides real-time containment recommendations and maps techniques to target SOP mitigation templates.
              </p>
            </div>
            
            <div className="lg:col-span-8">
              <AIInsights incident={incident} />
            </div>
            <div className="lg:col-span-4 glass-panel p-6 rounded-[18px] space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Qdrant Memory Status</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-mono">Vector Store:</span>
                  <span className={`font-bold font-mono flex items-center gap-1.5 ${qdrantOnline ? 'text-emerald-400' : qdrantStatus === null ? 'text-slate-500' : 'text-red-400'}`}>
                    <span className={`inline-flex w-1.5 h-1.5 rounded-full ${qdrantOnline ? 'bg-emerald-400 animate-pulse' : qdrantStatus === null ? 'bg-slate-600' : 'bg-red-400'}`} />
                    {qdrantStatus === null ? 'Loading…' : qdrantOnline ? 'ONLINE' : String(qdrantStatus).toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-mono">Collections:</span>
                  <span className="font-bold text-white font-mono">
                    {qdrantOnline ? '2 active' : qdrantStatus === null ? '—' : 'Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-mono">Embeddings:</span>
                  <span className="font-bold text-white font-mono">Cohere (1024-dim)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-mono">SQLite Store:</span>
                  <span className={`font-bold font-mono ${systemHealth?.sqlite === 'healthy' ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {systemHealth?.sqlite ? String(systemHealth.sqlite).toUpperCase() : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-mono">Workflow Engine:</span>
                  <span className={`font-bold font-mono ${systemHealth?.workflow === 'ready' || systemHealth?.workflow === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {systemHealth?.workflow ? String(systemHealth.workflow).toUpperCase() : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-mono">Incidents Tracked:</span>
                  <span className="font-bold text-white font-mono">{dashboardStats?.total ?? incidents.length}</span>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'reports':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 card-panel p-5 space-y-2">
              <h4 className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider font-mono">Operations Report & Risk Profiler Briefing</h4>
              <p className="text-[11px] text-[#A0A8B3] leading-relaxed font-sans">
                Operations and Threat Risk Profiler dashboards compile real-time telemetry metrics across microservices, databases, and message queues (Redis / Kafka). The risk score index dynamically calculates incident severities, tracking cumulative host-level compromises over time. Historical logs are aggregated into detailed report cards to optimize future response SLA gates.
              </p>
            </div>

            <div className="lg:col-span-6">
              <SystemHealth 
                systemHealth={systemHealth}
                dashboardCharts={dashboardCharts}
                incident={incident}
                chartData={chartData}
              />
            </div>
            <div className="lg:col-span-6">
              <RiskScoreCharts 
                incident={incident}
                riskHistory={riskHistory}
                days={riskDays}
                onDaysChange={(d) => { setRiskDays(d); fetchRiskHistory(selectedId, d); }}
              />
            </div>
            <div className="lg:col-span-12">
              <ReportGenerator incident={incident} token={token} apiBase={API_BASE} />
            </div>
          </div>
        );

      case 'groups':
        return (
          <IncidentGroupsView
            token={token}
            apiBase={API_BASE}
            selectedId={selectedId}
            onSelectIncident={setSelectedId}
          />
        );

      case 'analytics':
        return <AnalyticsPanel token={token} apiBase={API_BASE} />;

      case 'toolkit':
        return <SecurityToolkit token={token} apiBase={API_BASE} />;

      case 'settings':
        return (
          <div className="max-w-4xl mx-auto space-y-6">
            <SimulationControls triggerSimulation={triggerDirectSimulation} />
            <div className="glass-panel p-6 rounded-[18px]">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-4">SOC Orchestrator Credentials</h3>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3 bg-slate-900/50 border border-[var(--border-default)] rounded-[8px]">
                  <span className="text-slate-500">API Endpoint:</span>
                  <div className="text-cyan-400 mt-1 select-all">{API_BASE}</div>
                </div>
                <div className="p-3 bg-slate-900/50 border border-[var(--border-default)] rounded-[8px]">
                  <span className="text-slate-500">WS Gateway:</span>
                  <div className="text-violet-400 mt-1 select-all">{WS_BASE}</div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return <div>Select a navigation item</div>;
    }
  };

  return (
    <div className="w-full flex text-[#E8EBF3] text-xs overflow-hidden h-screen font-sans page-bg select-none relative">
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

        {/* Render page sections dynamically based on sidebar navigation selection */}
        <div id="app-scroll" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 terminal-scroll select-none">
          {renderContent()}

          {/* Footer */}
          <div className="text-center text-[9px] text-[#5C6478] py-2">
            © 2025 IR Agent. All rights reserved.
          </div>
        </div>
      </div>

      {/* CUSTOM LOG INGESTION DIALOG MODAL */}
      {showIngestModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-xl glass-panel rounded-2xl p-6 shadow-2xl space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto terminal-scroll">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-[6px] bg-slate-900 border border-[var(--border-default)] flex items-center justify-center shadow-inner">
                  <Database className="w-4 h-4 text-blue-300" />
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
                  type="button"
                  onClick={() => applyLogsPreset('stuffing')}
                  className="btn-approve-glow px-4 py-2 rounded-xl transition-all"
                >
                  Credential Stuffing — db-prod-02
                </button>
                <button 
                  type="button"
                  onClick={() => applyLogsPreset('scan')}
                  className="btn-approve-glow px-4 py-2 rounded-xl transition-all"
                >
                  Distributed Port Scan — api-gw-01
                </button>
                <button 
                  type="button"
                  onClick={() => applyLogsPreset('sql')}
                  className="btn-approve-glow px-4 py-2 rounded-xl transition-all"
                >
                  SQL Injection — web-01 (WAF)
                </button>
                <button 
                  type="button"
                  onClick={() => applyLogsPreset('ddos')}
                  className="btn-approve-glow px-4 py-2 rounded-xl transition-all"
                >
                  HTTP Flood DDoS — web-prod-01
                </button>
                <button 
                  type="button"
                  onClick={() => applyLogsPreset('ransom')}
                  className="btn-approve-glow px-4 py-2 rounded-xl transition-all"
                >
                  Ransomware Compromise — fileserv-01
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
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono transition-all"
                  placeholder="INC-2026-STUFF-002"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">Raw log lines — format: host, process, severity, message</label>
                <textarea 
                  value={customLogs}
                  onChange={(e) => setCustomLogs(e.target.value)}
                  className="w-full h-44 bg-slate-950/50 border border-white/10 rounded-xl p-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono leading-relaxed transition-all resize-none"
                  placeholder={`db-prod-02,mysqld,HIGH,Failed login from 192.168.1.105\ndb-prod-02,mysqld,CRITICAL,Unauthorized access detected`}
                  required
                />
              </div>

              <div className="flex space-x-3 pt-4 border-t border-white/10">
                <button 
                  type="submit" 
                  disabled={isIngesting || !customIncidentId || !customLogs}
                  className="flex-1 btn-approve-glow text-white font-bold py-3.5 px-4 rounded-xl transition-all text-xs uppercase tracking-wide flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
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
