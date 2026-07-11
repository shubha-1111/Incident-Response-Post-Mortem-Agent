// 1. OpenTelemetry Initialization First (Non-Negotiable)
import { recordBootstrapError, startOpenTelemetry } from './config/otel.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { app } from './api/server.js';
import { getDatabase } from './database/database.js';
import { initializeCollections, qdrantClient, COLLECTIONS } from './config/qdrant.js';
import { deleteExpiredForensicEvents } from './agents/ingest-agent.js';
import { incidentResponseWorkflow, DEMO_LOGS, DEMO_INCIDENT_ID } from './workflows/incident-workflow.js';
import { CohereClient } from 'cohere-ai';
import crypto from 'crypto';
import { setupWebSocketServer, broadcastAnomaly } from './api/websocket.js';
import { registerEventSubscribers } from './events/subscribers/index.js';
import { startHealthMonitor } from './services/health-monitor.js';


const PORT = process.env.PORT || 3001;
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Historical post-mortem documents to seed context for the RCA agent
const HISTORICAL_POST_MORTEMS = [
  {
    incident_id: 'INC-2026-HIST-001',
    title: 'Credential Stuffing containment on db-prod-02',
    timestamp: Date.now() - 10 * 24 * 3600 * 1000,
    root_cause: 'credential_stuffing',
    symptoms: ['High frequency failed login warnings', 'DB authorization alerts'],
    evidence_summary: '5 failed login attempts from IP 192.168.1.105 on database db-prod-02.',
    remediation: 'Initiate rotate_credential for database users and establish MFA rules.',
    action_taken: 'rotate_credential',
    autonomy_tier: 'L4_AUTO_EXECUTE',
    human_approved: false,
    resolution_time_ms: 8500,
    tags: ['auth', 'database', 'credential-stuffing'],
    sop_ref: 'SOP-AUTH-LOCK',
  },
  {
    incident_id: 'INC-2026-HIST-002',
    title: 'Distributed Port Scan block on api-gw-01',
    timestamp: Date.now() - 5 * 24 * 3600 * 1000,
    root_cause: 'port_scan_detected',
    symptoms: ['Spikes in host connection counts', 'Abnormal network discovery probes'],
    evidence_summary: 'Port scan signature detected from source IP 192.168.1.105 targeting api-gw-01.',
    remediation: 'Initiate block_ip action to block the attacker IP address.',
    action_taken: 'block_ip',
    autonomy_tier: 'L4_AUTO_EXECUTE',
    human_approved: false,
    resolution_time_ms: 4200,
    tags: ['network', 'reconnaissance', 'port-scan'],
    sop_ref: 'SOP-NET-BLOCK',
  },
  {
    incident_id: 'INC-2026-HIST-003',
    title: 'SQL Injection containment on api-gw-01',
    timestamp: Date.now() - 2 * 24 * 3600 * 1000,
    root_cause: 'sql_injection_attempt',
    symptoms: ['Exploit syntax in query parameters', 'WAF signature alert'],
    evidence_summary: 'SQL injection attempt detected on parameter id from source IP 192.168.1.105.',
    remediation: 'Initiate patch_rule action to dynamically block matching injection query syntax.',
    action_taken: 'patch_rule',
    autonomy_tier: 'L4_AUTO_EXECUTE',
    human_approved: false,
    resolution_time_ms: 6500,
    tags: ['waf', 'exploit', 'sql-injection'],
    sop_ref: 'SOP-WAF-PATCH',
  },
];

/**
 * Initializes collections and seeds historical incident post-mortem data.
 */
async function bootstrapDatabase() {
  try {
    console.log('[DB Bootstrap] Initializing SQLite database...');
    await getDatabase();
    console.log('[DB Bootstrap] Initializing Qdrant collections...');
    await initializeCollections();

    // Check if the incident_knowledge collection already has seeded documents
    const collectionInfo = await qdrantClient.getCollection(COLLECTIONS.INCIDENT_KNOWLEDGE);
    if (collectionInfo && (collectionInfo.points_count ?? 0) > 0) {
      console.log('[DB Bootstrap] Qdrant knowledge base is already seeded.');
      return;
    }

    // Dynamic fetch of CISA KEV Feed
    const seedCollection = [...HISTORICAL_POST_MORTEMS];
    try {
      console.log('[DB Bootstrap] Fetching CISA Known Exploited Vulnerabilities catalog...');
      const feedUrl = process.env.CISA_KEV_FEED_URL || 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
      const cisaRes = await fetch(feedUrl);
      if (cisaRes.ok) {
        const cisaData = await cisaRes.json() as any;
        const vulnerabilities = cisaData.vulnerabilities || [];
        console.log(`[DB Bootstrap] Successfully fetched ${vulnerabilities.length} vulnerabilities from CISA KEV.`);
        
        // Slice top 30 vulnerabilities
        const slice = vulnerabilities.slice(0, 30);
        for (const vuln of slice) {
          seedCollection.push({
            incident_id: vuln.cveID,
            title: vuln.vulnerabilityName,
            root_cause: vuln.shortDescription,
            remediation: vuln.requiredAction,
            sop_ref: 'CISA KEV Catalog Reference',
            tags: ['cisa_kev', vuln.vendorProject.toLowerCase()],
            timestamp: Date.now(),
            symptoms: [],
            evidence_summary: '',
            action_taken: '',
            autonomy_tier: '',
            human_approved: false,
            resolution_time_ms: 0
          });
        }
      } else {
        console.warn(`[DB Bootstrap] CISA KEV feed returned status: ${cisaRes.status}`);
      }
    } catch (fetchErr: any) {
      console.error('[DB Bootstrap] Failed to fetch CISA KEV catalog feed, falling back to built-in post-mortems:', fetchErr.message);
    }

    console.log('[DB Bootstrap] Seeding historical post-mortems for threat intelligence context...');
    try {
      for (const pm of seedCollection) {
        const text = `${pm.title} ${pm.root_cause} ${pm.remediation}`;
        const response = await cohere.embed({
          texts: [text],
          model: 'embed-english-v3.0',
          inputType: 'search_document',
        });

        const embedding = (response.embeddings as any)[0] as number[];
        if (embedding) {
          await qdrantClient.upsert(COLLECTIONS.INCIDENT_KNOWLEDGE, {
            wait: true,
            points: [
              {
                id: crypto.randomUUID(),
                vector: embedding,
                payload: pm as any,
              },
            ],
          });
        }
      }
      console.log('[DB Bootstrap] Qdrant seeding completed.');
    } catch (seedErr: any) {
      console.error('[DB Bootstrap] Seeding failed with detailed error:', seedErr);
      if (
        seedErr.message?.includes('quota') ||
        seedErr.message?.includes('billing') ||
        seedErr.message?.includes('429')
      ) {
        console.warn('[DB Bootstrap] OpenAI Quota Exceeded - Falling back to local mock data matrices');
      } else {
        console.error(`[DB Bootstrap] Seeding failed: ${seedErr.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[DB Bootstrap] Error during initialization/seeding: ${err.message}`);
    try {
      recordBootstrapError(err);
      broadcastAnomaly({ event: 'db_bootstrap_failure', message: err.message });
    } catch (otelErr) {
      console.error('[Telemetry] Failed to record bootstrap error to OTel:', otelErr);
    }
  }
}

// ----------------------------------------------------
// Cron-based Retention Eviction (Every 24 Hours)
// ----------------------------------------------------
const EVICTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const evictionInterval = setInterval(async () => {
  try {
    console.log('[Cron] Enforcing 90-day data retention and compliance limits...');
    const deletedCount = await deleteExpiredForensicEvents();
    console.log(`[Cron] Eviction complete. Removed ${deletedCount} expired forensic events from store.`);
  } catch (err: any) {
    console.error(`[Cron] Retention eviction encountered an error: ${err.message}`);
  }
}, EVICTION_INTERVAL_MS);

if (typeof evictionInterval.unref === 'function') {
  evictionInterval.unref();
}

// ----------------------------------------------------
// Server Launch & Live Demo Simulator
// ----------------------------------------------------
async function main() {
  try {
    await startOpenTelemetry();
    registerEventSubscribers();
    startHealthMonitor();
    await bootstrapDatabase();
  } catch (err: any) {
    console.error(`[System Startup] Database bootstrap failed: ${err.message}`);
    try {
      recordBootstrapError(err);
      broadcastAnomaly({ event: 'db_bootstrap_failure', message: err.message });
    } catch (otelErr) {
      console.error('[Telemetry] Failed to record bootstrap error to OTel:', otelErr);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Incident Response API Gateway running on port ${PORT}`);
  });

  setupWebSocketServer(server);

  // DEVELOPMENT AUTOMATION: Auto-run workflow to populate the dashboard immediately
  if (process.env.NODE_ENV === 'development') {
    console.log('[Dev Startup] Triggering live workflow demo simulation...');
    try {
      const run = await incidentResponseWorkflow.createRunAsync();
      run.start({
        inputData: { logs: DEMO_LOGS, incidentId: DEMO_INCIDENT_ID },
      }).then(() => {
        console.log('[Dev Startup] Live demo incident workflow run complete.');
      }).catch((err) => {
        console.error('[Dev Startup] Live demo incident workflow run failed:', err.message);
      });
    } catch (err: any) {
      console.error(`[Dev Startup] Live demo simulation trigger failed: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(`[System Startup] Bootstrap initialization encountered fatal startup error: ${err.message}`);
  try {
    recordBootstrapError(err);
  } catch (otelErr) {
    console.error('[Telemetry] Failed to record fatal startup error to OTel:', otelErr);
  }
});
