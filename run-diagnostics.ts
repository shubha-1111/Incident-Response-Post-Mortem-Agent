import 'dotenv/config';
import { qdrantClient, COLLECTIONS, initializeCollections } from './src/config/qdrant.js';
import { incidentResponseWorkflow, DEMO_LOGS, DEMO_INCIDENT_ID } from './src/workflows/incident-workflow.js';
import { CohereClient } from 'cohere-ai';
import crypto from 'crypto';

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

async function embedText(input: string): Promise<number[]> {
  const response = await cohere.embed({
    texts: [input],
    model: 'embed-english-v3.0',
    inputType: 'search_document',
  });
  return response.embeddings[0] as number[];
}

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

async function run() {
  console.log('=== Stage 4: Qdrant Seeding Verification ===');
  await initializeCollections();

  // Seeding
  const collectionInfo = await qdrantClient.getCollection(COLLECTIONS.INCIDENT_KNOWLEDGE);
  const count = collectionInfo?.points_count ?? 0;
  console.log(`[Qdrant] Current points in incident_knowledge: ${count}`);

  if (count === 0) {
    console.log('[Qdrant] Seeding 3 past post-mortems...');
    for (const pm of HISTORICAL_POST_MORTEMS) {
      const text = `${pm.title} ${pm.root_cause} ${pm.evidence_summary} ${pm.remediation}`;
      const vector = await embedText(text);
      await qdrantClient.upsert(COLLECTIONS.INCIDENT_KNOWLEDGE, {
        wait: true,
        points: [
          {
            id: crypto.randomUUID(),
            vector,
            payload: pm as any,
          },
        ],
      });
    }
    console.log('[Qdrant] Seeding completed.');
  } else {
    console.log('[Qdrant] Collection already seeded.');
  }

  // Similarity Search Read-Back
  console.log('\n[Qdrant] Executing read-back query for similar incidents...');
  const searchQuery = 'credential stuffing brute force unauthorized login attack';
  const searchVector = await embedText(searchQuery);
  const searchResults = await qdrantClient.search(COLLECTIONS.INCIDENT_KNOWLEDGE, {
    vector: searchVector,
    limit: 3,
  });

  console.log('[Qdrant] Similarity Search Results Payloads:');
  searchResults.forEach((res, idx) => {
    const payload = res.payload as any;
    console.log(`  Match #${idx + 1} (Score: ${res.score?.toFixed(4)}):`);
    console.log(`    Title: ${payload?.title}`);
    console.log(`    Root Cause: ${payload?.root_cause}`);
    console.log(`    Incident ID: ${payload?.incident_id}`);
  });

  try {
    console.log(`[Workflow] Starting execution of incidentResponseWorkflow for ID: ${DEMO_INCIDENT_ID}`);
    const run = await incidentResponseWorkflow.createRunAsync();

    // Register step transition watcher on the run instance
    const completedSteps = new Set<string>();
    const unwatch = run.watch((event: any) => {
      const results = event.results || {};
      Object.keys(results).forEach((stepId) => {
        if (completedSteps.has(stepId)) return;
        const stepRes = results[stepId];
        if (stepRes?.status === 'success') {
          completedSteps.add(stepId);
          const outputState = stepRes.output?.state;
          console.log(`\n--------------------------------------------------`);
          console.log(`📊 STEP COMPLETED: [${stepId}]`);
          console.log(`--------------------------------------------------`);
          if (outputState) {
            console.log(JSON.stringify({
              incidentId: outputState.incidentId,
              status: outputState.status,
              confidenceScore: outputState.confidenceScore,
              rootCauseHypothesis: outputState.rootCauseHypothesis,
              autonomyTier: outputState.autonomyTier,
              remediationAction: outputState.remediationAction,
              evidenceChainLength: outputState.evidenceChain?.length ?? 0,
            }, null, 2));
          } else {
            console.log('Step output has no state property.');
          }
        }
      });
    });

    const finalResult = await run.start({
      inputData: { logs: DEMO_LOGS, incidentId: DEMO_INCIDENT_ID },
    });
    console.log('\n=== Workflow execution completed successfully ===');
    unwatch();
  } catch (err: any) {
    console.error('\n❌ Workflow execution failed:', err.message);
  }
}

run().catch(console.error);
