import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth, generateToken, AuthenticatedRequest } from '../config/auth.js';
import { incidentResponseWorkflow } from '../workflows/incident-workflow.js';
import { createInitialIncidentState } from '../schemas/incident-state.js';
import { runReportAgent } from '../agents/report-agent.js';
import {
  saveIncidentState,
  getIncidentState,
  getAllIncidents,
  getWorkflowSteps,
  getTimelineEvents,
  getRiskHistory,
  getDashboardStats,
  getMetricSnapshots,
  getDashboardCharts,
  insertPrediction,
  insertActualOutcome,
  getAccuracyPredictionAccuracy,
  getIncidentsByIds,
} from '../database/database.js';
import { clusterIncidentsHybrid, saveClusterResults, getAllClusterGroups } from '../services/clustering-service.js';
import { getGroupedMetrics } from '../services/group-analysis.js';
import { getDatabase } from '../database/database.js';
import { generateConfusionMatrix, ConfusionMatrix } from '../services/confusion-matrix.js';
import { eventBus } from '../events/event-bus.js';
import { IncidentEventType } from '../events/event-types.js';
import { checkSystemHealth, getLastHealthReport } from '../services/health-monitor.js';
import { getThreatIntelWidgetStats } from '../tools/threat-intel-tools.js';
import { runSimulation, stopActiveSimulation } from '../simulation/simulation-service.js';
import { getFeatherlessService } from '../services/featherless-service.js';
import { generateIncidentPDF, getPDF } from '../services/pdf-service.js';
import { renderExecutiveSummary, renderTechnicalDeepDive } from '../services/report-templates.js';
import { lookupCVE, checkCISAKEV } from '../services/cve-service.js';
import { analyzeConfigFile } from '../services/config-analyzer.js';
import { analyzeEncryptedPayload, xorDecrypt } from '../services/crypto-analysis.js';
import { generateAnsiblePlaybook, executeRemediation } from '../services/remediation-playbooks.js';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory Rate Limiting: 100 req/15min per IP
const rateLimitMap = new Map<string, { startTime: number; count: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;
function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    'unknown-ip';
  // Bypass rate limiting for localhost queries
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === 'unknown-ip') {
    return next();
  }
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);
  if (!bucket || now - bucket.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { startTime: now, count: 1 });
  } else {
    bucket.count++;
    if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
      console.warn(`[Rate Limit] Exceeded for IP ${ip}`);
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again after 15 minutes.',
      });
    }
  }
  next();
}
app.use(rateLimiter);

const PORT = process.env.PORT || 3001;

// ----------------------------------------------------
// PUBLIC ROUTES
// ----------------------------------------------------

/**
 * GET /health
 * Public health check with deep dependency status
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    const report = getLastHealthReport() ?? (await checkSystemHealth());
    const allHealthy = ['sqlite', 'qdrant', 'otel', 'websocket', 'workflow'].every(
      (k) => (report as any)[k] === 'healthy' || (report as any)[k] === 'ready',
    );
    return res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      data: {
        status: allHealthy ? 'ok' : 'degraded',
        timestamp: report.timestamp,
        version: '1.0.0',
        components: report,
      },
    });
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      data: { status: 'unhealthy', error: err.message },
    });
  }
});

/**
 * POST /login
 * Public authentication route for obtaining JWT token
 */
app.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
    });
  }
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  if (username === adminUsername && password === adminPassword) {
    try {
      const token = await generateToken({ username, role: 'admin' });
      return res.status(200).json({
        success: true,
        data: { token },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Token generation failed: ${err.message}`,
      });
    }
  }
  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Invalid username or password credentials',
  });
});

// ----------------------------------------------------
// PROTECTED ROUTES (requireAuth applied)
// ----------------------------------------------------

/**
 * POST /ingest
 * Trigger the incidentResponseWorkflow for raw logs asynchronously
 */
app.post('/ingest', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { logs, incidentId } = req.body;
  if (!logs || !Array.isArray(logs) || !incidentId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required body fields: "logs" (string array) and "incidentId" (string).',
    });
  }
  let state: any = createInitialIncidentState({ incidentId, rawLogLines: logs });
  state.status = 'ingesting';
  await saveIncidentState(state);
  try {
    const run: any = await incidentResponseWorkflow.createRunAsync();
    run
      .start({ inputData: { logs, incidentId } })
      .then(async (result: any) => {
        const steps = result?.steps;
        const finalState =
          steps?.['observability-step']?.output?.state ||
          steps?.observabilityStep?.output?.state ||
          steps?.['observability-step']?.output ||
          steps?.observabilityStep?.output ||
          steps?.['report-step']?.output?.state ||
          steps?.reportStep?.output?.state ||
          steps?.['report-step']?.output ||
          steps?.reportStep?.output ||
          state;
        await saveIncidentState(finalState);
      })
      .catch(async (error: any) => {
        console.error(`[API Ingest Background Workflow] Error for ${incidentId}: ${error.message}`);
        const cached = await getIncidentState(incidentId);
        if (cached) {
          cached.status = 'pending_human_review';
          cached.autonomyTier = 'L2_HITL_APPROVAL';
          cached.reasoningLog.push(`Workflow crash: ${error.message}`);
          await saveIncidentState(cached);
        }
      });
    return res.status(202).json({
      success: true,
      data: {
        incidentId: state.incidentId,
        status: state.status,
      },
    });
  } catch (error: any) {
    console.error(`[API Ingest] Workflow trigger failed for ${incidentId}: ${error.message}`);
    state.status = 'pending_human_review';
    state.autonomyTier = 'L2_HITL_APPROVAL';
    state.reasoningLog = [...state.reasoningLog, `Workflow error: ${error.message}`];
    await saveIncidentState(state);
    return res.status(202).json({
      success: true,
      data: {
        incidentId: state.incidentId,
        status: state.status,
      },
    });
  }
});

/**
 * POST /api/simulate
 * Start a synthetic incident simulation with staggered log streaming
 */
app.post('/api/simulate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { scenario = 'default', speed = 'realtime' } = req.body;
  if (!['realtime', 'fast'].includes(speed)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid speed. Use "realtime" or "fast".',
    });
  }
  try {
    const result = await runSimulation({ scenario, speed });
    return res.status(202).json({
      success: true,
      data: {
        incidentId: result.incidentId,
        logsGenerated: result.logsGenerated,
      },
    });
  } catch (err: any) {
    console.error(`[API Simulate] Simulation failed: ${err.message}`);
    return res.status(500).json({ success: false, error: `Simulation failed: ${err.message}` });
  }
});

/**
 * POST /api/simulate/stop
 * Stop any active simulation
 */
app.post('/api/simulate/stop', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  stopActiveSimulation();
  return res.status(200).json({ success: true, data: { stopped: true } });
});

/**
 * GET /incident/:id
 * Retrieve a detailed incident state from SQLite
 */
app.get(['/incident/:id', '/api/incidents/:id'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const state = await getIncidentState(id);
  if (!state) {
    return res.status(404).json({
      success: false,
      error: `Incident record not found for ID: ${id}`,
    });
  }
  return res.status(200).json({
    success: true,
    data: state,
  });
});

/**
 * POST /approve/:id or /api/incidents/:id/approve
 * Human override approval endpoint
 */
app.post(['/approve/:id', '/api/incidents/:id/approve'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  let state: any = await getIncidentState(id);
  if (!state) {
    return res.status(404).json({
      success: false,
      error: `Incident record not found: ${id}`,
    });
  }
  try {
    state.autonomyTier = 'L4_AUTO_EXECUTE';
    state.status = 'resolved';
    state.autonomyDecision = 'approved';
    state.humanReview = {
      decision: 'approved',
      reviewerId: req.user?.username || 'human-operator',
      reason: 'SOC manual override approval',
      decidedAt: new Date().toISOString(),
    };
    state.reasoningLog = [
      ...state.reasoningLog,
      `Manual override: Approved by operator ${req.user?.username || 'human-operator'}`,
    ];
    const reportResult = await runReportAgent(state);
    state = reportResult.state;
    await saveIncidentState(state);
    eventBus.emit(IncidentEventType.HITL_APPROVED, { incidentId: id });
    eventBus.emit(IncidentEventType.WORKFLOW_STEP, {
      incidentId: id,
      stepId: 'observability-step',
      status: 'completed',
      state,
      timestamp: Date.now(),
    });
    return res.status(200).json({
      success: true,
      data: state,
    });
  } catch (error: any) {
    console.error(`[API Approve] Manual override failed: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: `Approval action failed: ${error.message}`,
    });
  }
});

/**
 * POST /reject/:id or /api/incidents/:id/reject
 * Human override rejection endpoint
 */
app.post(['/reject/:id', '/api/incidents/:id/reject'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const state: any = await getIncidentState(id);
  if (!state) {
    return res.status(404).json({
      success: false,
      error: `Incident record not found: ${id}`,
    });
  }
  state.status = 'human_denied';
  state.humanReview = {
    decision: 'denied',
    reviewerId: req.user?.username || 'human-operator',
    reason: 'SOC manual rejection override',
    decidedAt: new Date().toISOString(),
  };
  state.reasoningLog = [
    ...state.reasoningLog,
    `Manual override: Rejected by operator ${req.user?.username || 'human-operator'}`,
  ];
  await saveIncidentState(state);
  eventBus.emit(IncidentEventType.WORKFLOW_STEP, {
    incidentId: id,
    stepId: 'observability-step',
    status: 'failed',
    state,
    timestamp: Date.now(),
  });
  return res.status(200).json({
    success: true,
    data: state,
  });
});

/**
 * GET /api/incidents/:id/steps
 * Fetch status of the execution pipeline steps
 */
app.get('/api/incidents/:id/steps', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const steps = await getWorkflowSteps(id);
    return res.status(200).json({
      success: true,
      data: steps,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch steps: ${err.message}`,
    });
  }
});

/**
 * GET /api/incidents/:id/timeline
 * Fetch structured audit trail events for an incident
 */
app.get('/api/incidents/:id/timeline', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const timeline = await getTimelineEvents(id);
    return res.status(200).json({
      success: true,
      data: timeline,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch timeline: ${err.message}`,
    });
  }
});

/**
 * GET /dashboard
 * Returns summaries of all active incidents from SQL db
 */
app.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summaries = await getAllIncidents();
    return res.status(200).json({
      success: true,
      data: summaries,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Failed to load dashboard: ${err.message}`,
    });
  }
});

/**
 * GET /api/dashboard/stats
 * SQL-backed dashboard counters
 */
app.get('/api/dashboard/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getDashboardStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load stats: ${err.message}` });
  }
});

/**
 * GET /api/dashboard/risk-history
 * Risk score time series for line charts
 */
app.get('/api/dashboard/risk-history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit ?? '30'), 10) || 30);
    const incidentId = req.query.incidentId ? String(req.query.incidentId) : undefined;
    const history = await getRiskHistory({ incidentId, limit });
    return res.status(200).json({ success: true, data: history });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load risk history: ${err.message}` });
  }
});

/**
 * GET /api/dashboard/threat-intel-stats
 * Free threat feed lookup success rates
 */
app.get('/api/dashboard/threat-intel-stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getThreatIntelWidgetStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load threat intel stats: ${err.message}` });
  }
});

/**
 * POST /api/incidents/filter
 * Multi-criteria incident filtering
 */
app.post('/api/incidents/filter', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filterIncidents } = await import('../services/filter-engine.js');
    const results = await filterIncidents(req.body);
    return res.status(200).json({ success: true, data: results });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Filter failed: ${err.message}` });
  }
});

/**
 * GET /api/threat-intel/ioc/:ioc
 * IOC lookup endpoint
 */
app.get('/api/threat-intel/ioc/:ioc', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { ioc } = req.params;
  const { iocType } = req.query;
  
  try {
    const { processIOC } = await import('../services/ioc-pipeline.js');
    const detectedType = iocType as string || detectIOCType(ioc);
    const result = await processIOC(ioc, detectedType);
    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `IOC lookup failed: ${err.message}` });
  }
});

function detectIOCType(value: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return 'ip';
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return 'domain';
  if (/^[a-fA-F0-9]{32,64}$/.test(value)) return 'hash';
  if (/^[^@]+@[^@]+\.[^@]+$/.test(value)) return 'email';
  if (/^https?:\/\//i.test(value)) return 'url';
  return 'unknown';
}

/**
 * GET /api/health/deep
 * Deep health ping of all platform dependencies
 */
app.get('/api/health/deep', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await checkSystemHealth();
    return res.status(200).json({ success: true, data: report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Health check failed: ${err.message}` });
  }
});

/**
 * GET /api/decisions/:incidentId
 * Evaluate decision rules for an incident
 */
app.get('/api/decisions/:incidentId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { incidentId } = req.params;
  try {
    const state = await getIncidentState(incidentId);
    if (!state) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }
    const { evaluateDecision } = await import('../services/decision-engine.js');
    const decision = evaluateDecision(state);
    return res.status(200).json({ success: true, data: decision });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Decision evaluation failed: ${err.message}` });
  }
});

/**
 * GET /api/incidents/:id/charts
 * Per-incident chart data: confidence curve + threat score breakdown
 */
app.get('/api/incidents/:id/charts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const state: any = await getIncidentState(id);
    if (!state) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }
    const snapshots = await getMetricSnapshots(id);
    const threatBreakdown = state.threatBreakdown || {};
    const totalBreakdown = Object.values(threatBreakdown).reduce(
      (s: number, v: any) => s + (typeof v === 'number' ? v : 0),
      0,
    );
    return res.status(200).json({
      success: true,
      data: {
        confidenceCurve: snapshots.map((s: any) => ({
          step: formatStepName(s.stepName),
          value: Math.round((s.confidence ?? 0) * 100),
          timestamp: s.timestamp,
        })),
        currentConfidence: Math.round((state.confidenceScore ?? 0) * 100),
        currentRetrievalConfidence: Math.round((state.retrievalConfidence ?? 0) * 100),
        threatBreakdown: {
          total: state.threatScore ?? 0,
          breakdown: threatBreakdown,
          totalBreakdown,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load charts: ${err.message}` });
  }
});

/**
 * GET /api/dashboard/charts
 * Platform-wide chart data: status donut, autonomy split, MITRE frequencies
 */
app.get('/api/dashboard/charts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const charts = await getDashboardCharts();
    return res.status(200).json({ success: true, data: charts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load dashboard charts: ${err.message}` });
  }
});

/**
 * GET /api/groups
 * List all incident groups/clusters
 */
app.get('/api/groups', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const groups = await getAllClusterGroups();
    return res.status(200).json({ success: true, data: groups });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load groups: ${err.message}` });
  }
});

/**
 * GET /api/groups/:groupId
 * Get details of a specific incident group
 */
app.get('/api/groups/:groupId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const db = await getDatabase();
    const row = await db.get(
      `SELECT group_id, name, incident_ids, cluster_method, created_at, metadata_json
       FROM incident_groups
       WHERE group_id = ?`,
      [groupId]
    );
    if (!row) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    return res.status(200).json({
      success: true,
      data: {
        ...row,
        incidentIds: JSON.parse(row.incident_ids || '[]'),
        metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load group: ${err.message}` });
  }
});

/**
 * GET /api/groups/:groupId/analysis
 * Get aggregated analysis for a group of incidents
 */
app.get('/api/groups/:groupId/analysis', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const db = await getDatabase();
    const row = await db.get(
      `SELECT group_id, name, incident_ids, cluster_method, created_at, metadata_json
       FROM incident_groups
       WHERE group_id = ?`,
      [groupId]
    );
    if (!row) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    const incidentIds = JSON.parse(row.incident_ids || '[]');
    const incidents = await getIncidentsByIds(incidentIds);
    const metrics = await getGroupedMetrics(incidents);

    const timeline = incidents
      .map((inc: any) => ({
        incidentId: inc.incidentId,
        timestamp: inc.createdAt,
        status: inc.status,
        threatScore: inc.threatScore,
        attackType: (() => {
          try {
            const state = typeof inc.state_json === 'string' ? JSON.parse(inc.state_json) : inc.state_json;
            return state.attackType || 'unknown';
          } catch { return 'unknown'; }
        })(),
      }))
      .sort((a: { timestamp: string }, b: { timestamp: string }) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return res.status(200).json({
      success: true,
      data: {
        groupId: row.group_id,
        name: row.name,
        clusterMethod: row.cluster_method,
        incidentCount: incidentIds.length,
        metrics,
        timeline,
        incidents: incidents.map((inc: any) => ({
          incidentId: inc.incidentId,
          status: inc.status,
          targetHost: inc.targetHost,
          threatScore: inc.threatScore,
          confidenceScore: inc.confidenceScore,
          createdAt: inc.createdAt,
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to analyze group: ${err.message}` });
  }
});

/**
 * POST /api/groups/generate
 * Generate incident clusters using hybrid approach
 */
app.post('/api/groups/generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { timeBucketHours = 24, minIncidentsPerCluster = 2 } = req.body;
    const clusters = await clusterIncidentsHybrid({ timeBucketHours, minIncidentsPerCluster });
    await saveClusterResults(clusters);
    return res.status(200).json({ success: true, data: clusters });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to generate clusters: ${err.message}` });
  }
});

/**
 * GET /api/incidents/:id/correlations
 * Get correlation data for network graph
 */
app.get('/api/incidents/:id/correlations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { getSimilarIncidents } = await import('../database/correlation-db.js');
    const similar = await getSimilarIncidents(id);
    return res.status(200).json({ success: true, data: similar });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load correlations: ${err.message}` });
  }
});

/**
 * GET /api/incidents/:id/similar
 * Get similar incidents for network graph
 */
app.get('/api/incidents/:id/similar', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { findTemporalCorrelations } = await import('../services/temporal-correlation.js');
    const temporal = await findTemporalCorrelations(id);
    return res.status(200).json({ success: true, data: temporal });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to load similar incidents: ${err.message}` });
  }
});

/**
 * POST /api/explain-term
 * Plain-language explanation of a cybersecurity term via Featherless
 */
app.post('/api/explain-term', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { term } = req.body;
  if (!term || typeof term !== 'string') {
    return res.status(400).json({ success: false, error: 'term (string) is required' });
  }
  try {
    const featherless = getFeatherlessService();
    const explanation = await featherless.explainTerm(term.trim());
    return res.json({ success: true, data: { term: term.trim(), explanation } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Explain-term failed: ${err.message}` });
  }
});

function formatStepName(stepName: string): string {
  return stepName
    .replace(/-step$/, '')
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * GET /api/vulnerability/cve/:id
 * Lookup CVE details from NVD and check CISA KEV status
 */
app.get('/api/vulnerability/cve/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!id || !/^CVE-\d{4}-\d{4,}$/i.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid CVE ID format. Expected: CVE-YYYY-NNNN' });
  }
  try {
    const [cveDetails, kevStatus] = await Promise.all([
      lookupCVE(id),
      checkCISAKEV(id),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        cve: cveDetails,
        inCISAKEV: !!kevStatus,
        kevDetails: kevStatus,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `CVE lookup failed: ${err.message}` });
  }
});

/**
 * POST /api/vulnerability/config-analyze
 * Analyze configuration file content for security issues
 */
app.post('/api/vulnerability/config-analyze', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { filePath, content } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ success: false, error: 'filePath (string) is required' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'content (string) is required' });
  }
  try {
    const result = await analyzeConfigFile(filePath, content);
    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Config analysis failed: ${err.message}` });
  }
});

/**
 * POST /api/vulnerability/crypto-analyze
 * Analyze encrypted payload for potential weaknesses
 */
app.post('/api/vulnerability/crypto-analyze', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { payload } = req.body;
  if (!payload || typeof payload !== 'string') {
    return res.status(400).json({ success: false, error: 'payload (string) is required' });
  }
  try {
    const analysis = await analyzeEncryptedPayload(payload);
    return res.status(200).json({ success: true, data: analysis });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Crypto analysis failed: ${err.message}` });
  }
});

/**
 * POST /api/vulnerability/crypto-decrypt
 * XOR decrypt a payload with given key
 */
app.post('/api/vulnerability/crypto-decrypt', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { ciphertext, key } = req.body;
  if (!ciphertext || typeof ciphertext !== 'string') {
    return res.status(400).json({ success: false, error: 'ciphertext (string) is required' });
  }
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ success: false, error: 'key (string) is required' });
  }
  try {
    const result = await xorDecrypt(ciphertext, key);
    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `XOR decrypt failed: ${err.message}` });
  }
});

/**
 * POST /api/vulnerability/remediate
 * Generate and execute remediation playbook for an action
 */
app.post('/api/vulnerability/remediate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { action } = req.body;
  if (!action || !action.actionType) {
    return res.status(400).json({ success: false, error: 'action object with actionType is required' });
  }
  try {
    const playbook = await generateAnsiblePlaybook(action);
    const result = await executeRemediation(playbook);
    return res.status(200).json({ success: true, data: { playbook, result } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Remediation failed: ${err.message}` });
  }
});

/**
 * GET /api/incidents/:id/report
 * Generate executive summary or technical deep-dive report
 */
app.get('/api/incidents/:id/report', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { type = 'executive-summary' } = req.query;

  const state: any = await getIncidentState(id);
  if (!state) {
    return res.status(404).json({ success: false, error: 'Incident not found' });
  }

  if (type === 'executive-summary') {
    const data = {
      incidentId: state.incidentId,
      threatScore: state.threatScore || 0,
      status: state.status,
      severity: state.threatScore >= 80 ? 'high' : state.threatScore >= 50 ? 'medium' : 'low',
      executiveSummary: state.rootCauseHypothesis || 'No summary available.',
      findings: state.reasoningLog?.slice(-5) || [],
      timeline: state.evidenceChain?.map((e: any) => ({
        timestamp: e.observedAt,
        event: e.summary,
        status: e.payload?.confidence > 0.7 ? 'resolved' : 'detected',
      })) || [],
      recommendations: ['Monitor for recurrence', 'Review access controls', 'Update detection rules'],
      timestamp: new Date().toISOString(),
    };
    const html = renderExecutiveSummary(data);
    return res.status(200).json({ success: true, data: { html, type: 'executive-summary' } });
  }

  if (type === 'technical-deep-dive') {
    const data = {
      incidentId: state.incidentId,
      threatScore: state.threatScore || 0,
      autonomyTier: state.autonomyTier || 'L2_HITL_APPROVAL',
      rootCause: state.rootCauseHypothesis || 'Unknown',
      evidenceChain: state.evidenceChain || [],
      logSnippets: state.rawLogLines?.slice(0, 100).map((l: string, i: number) => ({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: l,
      })) || [],
      threatIntel: {
        indicators: state.evidenceChain
          ?.filter((e: any) => e.payload?.threatIntelReport)
          .map((e: any) => ({
            value: e.payload.threatIntelReport?.abuseIPDB?.ip || 'unknown',
            type: 'IP',
            source: 'AbuseIPDB',
            confidence: e.payload.threatIntelReport?.abuseIPDB?.abuseConfidenceScore || 0.5,
          })) || [],
      },
      mitreTags: ['T1110.004', 'T1068', 'T1041'],
      remediationActions: [{ actionType: state.remediationAction?.actionType || 'none', description: 'Remediation applied' }],
      lessonsLearned: ['Review authentication controls', 'Update detection signatures'],
    };
    const html = renderTechnicalDeepDive(data);
    return res.status(200).json({ success: true, data: { html, type: 'technical-deep-dive' } });
  }

  return res.status(400).json({ success: false, error: 'Invalid report type. Use "executive-summary" or "technical-deep-dive".' });
});

/**
 * POST /api/incidents/:id/report/pdf
 * Generate and download PDF report
 */
app.post('/api/incidents/:id/report/pdf', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { type = 'executive-summary' } = req.body;

  const state: any = await getIncidentState(id);
  if (!state) {
    return res.status(404).json({ success: false, error: 'Incident not found' });
  }

  const result = await generateIncidentPDF(id, type as 'executive-summary' | 'technical-deep-dive', state);
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  const pdfBuffer = getPDF(`report-${id}-${type}`);
  if (!pdfBuffer) {
    return res.status(500).json({ success: false, error: 'PDF not found' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${id}-${type}-report.pdf"`);
  return res.status(200).send(pdfBuffer);
});

// ----------------------------------------------------
// ACCURACY ANALYTICS ROUTES
// ----------------------------------------------------

/**
 * GET /api/analytics/accuracy
 * Returns overall accuracy metrics including precision, recall, F1 by label
 */
app.get('/api/analytics/accuracy', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const modelVersion = req.query.modelVersion ? String(req.query.modelVersion) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
    const metrics = await getAccuracyPredictionAccuracy({ modelVersion, startDate, endDate });
    return res.status(200).json({ success: true, data: metrics });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to fetch accuracy metrics: ${err.message}` });
  }
});

/**
 * GET /api/analytics/confusion-matrix
 * Returns confusion matrix for model predictions
 */
app.get('/api/analytics/confusion-matrix', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const modelVersion = req.query.modelVersion ? String(req.query.modelVersion) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
    const matrix = await generateConfusionMatrix({ modelVersion, startDate, endDate });
    return res.status(200).json({ success: true, data: matrix });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to fetch confusion matrix: ${err.message}` });
  }
});

/**
 * GET /api/analytics/precision-recall
 * Returns precision and recall curve data for threshold analysis
 */
app.get('/api/analytics/precision-recall', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const modelVersion = req.query.modelVersion ? String(req.query.modelVersion) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
    const metrics = await getAccuracyPredictionAccuracy({ modelVersion, startDate, endDate });
    return res.status(200).json({
      success: true,
      data: {
        precisionByLabel: metrics.precisionByLabel,
        recallByLabel: metrics.recallByLabel,
        f1ByLabel: metrics.f1ByLabel,
        macroPrecision: metrics.macroPrecision,
        macroRecall: metrics.macroRecall,
        macroF1: metrics.macroF1,
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to fetch precision/recall data: ${err.message}` });
  }
});

/**
 * POST /api/analytics/predictions
 * Record a model prediction for accuracy tracking
 */
app.post('/api/analytics/predictions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { predictionId, incidentId, modelVersion, predictedLabel, confidenceScore, metadata } = req.body;
  if (!predictionId || !incidentId || !modelVersion || !predictedLabel) {
    return res.status(400).json({ success: false, error: 'predictionId, incidentId, modelVersion, and predictedLabel are required' });
  }
  try {
    await insertPrediction(predictionId, incidentId, modelVersion, predictedLabel, confidenceScore || 0, metadata);
    return res.status(201).json({ success: true, data: { predictionId } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to record prediction: ${err.message}` });
  }
});

/**
 * POST /api/analytics/outcomes
 * Record the actual outcome for a prediction
 */
app.post('/api/analytics/outcomes', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { predictionId, actualLabel, validatedBy } = req.body;
  if (!predictionId || !actualLabel) {
    return res.status(400).json({ success: false, error: 'predictionId and actualLabel are required' });
  }
  try {
    await insertActualOutcome(predictionId, actualLabel, validatedBy);
    return res.status(201).json({ success: true, data: { predictionId } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Failed to record outcome: ${err.message}` });
  }
});

// ----------------------------------------------------
// STATIC FRONTEND SERVING (single-service deploys, e.g. Railway)
// ----------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(__dirname, '../../src/frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback: any GET that isn't an API route or a static asset falls through to index.html
  app.get(/^\/(?!api\/|login$|dashboard$|ingest$|approve\/|reject\/|incident\/|health$).*/, (req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.warn('[Static] Frontend build not found at', frontendDist, '- run `npm run build:frontend` before deploying.');
}

// ----------------------------------------------------
// GLOBAL ERROR HANDLER MIDDLEWARE
// ----------------------------------------------------
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API Gateway Error]:', err);
  return res.status(500).json({
    success: false,
    error: err.message || 'Internal server error occurred.',
  });
});

export function startServer() {
  return app.listen(PORT, () => {
    console.log(`🚀 Incident Response API Gateway running on port ${PORT}`);
  });
}

export { app };
