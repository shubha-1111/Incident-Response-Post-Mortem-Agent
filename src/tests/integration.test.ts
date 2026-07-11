import assert from 'assert';
import crypto from 'crypto';
import { qdrantClient, COLLECTIONS } from '../config/qdrant.js';
import { scanInboundLog, validateOutboundAction } from '../config/enkrypt.js';
import { getAssetCriticality } from '../tools/cmdb-tools.js';
import { runLogAgent } from '../agents/log-agent.js';
import { runAnomalyAgent } from '../agents/anomaly-agent.js';
import { runRcaAgent } from '../agents/rca-agent.js';
import { runRemediationAgent } from '../agents/remediation-agent.js';
import { routeAutonomy } from '../workflows/autonomy-router.js';
import {
  createInitialIncidentState,
  validateIncidentState,
  IncidentState,
} from '../schemas/incident-state.js';

// Setup environment variables for test execution
process.env.OPENAI_API_KEY = 'mock-key';
process.env.ENKRYPT_SKILL_SENTINEL_URL = 'http://mock-sentinel/check';
process.env.ENKRYPT_RAYDER_URL = 'http://mock-rayder/check';
process.env.CMDB_API_URL = 'http://mock-cmdb/check';
process.env.CMDB_API_KEY = 'mock-cmdb-key';
process.env.INCIDENT_SINK_URL = 'http://mock-sink/check';

// Store global mocks
let mockSentinelVerdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW' = 'PASS';
let mockRayderVerdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW' = 'PASS';
let mockCmdbCriticality: 'standard' | 'high_impact' = 'standard';
let mockCmdbShouldFail = false;
let mockQdrantKBScore = 0.95;

// Mock global fetch
globalThis.fetch = async (url: any, options: any): Promise<any> => {
  const urlStr = String(url);

  if (urlStr.includes('skill-sentinel') || urlStr.includes('sentinel')) {
    return {
      ok: true,
      json: async () => ({ decision: mockSentinelVerdict }),
    };
  }

  if (urlStr.includes('rayder')) {
    return {
      ok: true,
      json: async () => ({ decision: mockRayderVerdict }),
    };
  }

  if (urlStr.includes('cmdb')) {
    if (mockCmdbShouldFail) {
      return { ok: false, status: 500 };
    }
    return {
      ok: true,
      json: async () => ({ criticality: mockCmdbCriticality }),
    };
  }

  if (urlStr.includes('sink')) {
    return { ok: true };
  }

  return { ok: false, status: 404 };
};

// Mock Qdrant client methods
qdrantClient.search = async (collection: string, options: any): Promise<any[]> => {
  if (collection === COLLECTIONS.INCIDENT_KNOWLEDGE) {
    return [
      {
        id: 'mock-incident-1',
        score: mockQdrantKBScore,
        payload: {
          incident_id: 'INC-999',
          title: 'Brute Force Attack',
          root_cause: 'brute_force_attack',
          remediation: 'block_ip',
        },
      },
    ];
  }
  if (collection === COLLECTIONS.FORENSIC_EVENTS) {
    return [];
  }
  return [];
};

qdrantClient.upsert = async (collection: string, options: any): Promise<any> => {
  return { status: 'ok' };
};

qdrantClient.scroll = async (collection: string, options: any): Promise<any> => {
  return { points: [] };
};

// Mock OpenAI embeddings/chat completions
import OpenAI from 'openai';
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      embeddings: {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        }),
      },
      chat: {
        completions: {
          create: jest.fn().mockImplementation(async (opts: any) => {
            const systemPrompt = opts.messages[0]?.content || '';
            let content = '{}';

            if (systemPrompt.includes('RCA')) {
              // Mock RCA agent completion output
              content = JSON.stringify({
                rootCause: 'brute_force_attack',
                retrievalConfidence: mockQdrantKBScore,
                evidenceChain: [],
                reasoning: 'Repeated authentication failures detected.',
                iterationCount: 2,
              });
            } else if (systemPrompt.includes('Remediation')) {
              // Mock Remediation agent completion output
              content = JSON.stringify({
                action: 'block_ip',
                target: '198.51.100.42',
                justification: 'Block attacker source IP.',
              });
            } else if (systemPrompt.includes('Post-Mortem')) {
              // Mock Post-Mortem agent completion output
              content = JSON.stringify({
                title: 'Incident INC-101 Post-Mortem',
                root_cause_summary: 'Brute force attack',
                remediation_summary: 'Blocked attacker IP',
                preventative_steps: 'Rotate login credentials and establish MFA.',
                tags: ['security', 'brute-force'],
                markdown_report: '# Incident Post-Mortem Report',
              });
            }

            return {
              choices: [{ message: { content } }],
              usage: { prompt_tokens: 10, completion_tokens: 15 },
            };
          }),
        },
      },
    };
  });
});

// Mock opentelemetry api/sdk objects to allow span execution under jest
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: (name: string, fn: any) => fn({
        setAttribute: () => {},
        setStatus: () => {},
        recordException: () => {},
        end: () => {},
      }),
    }),
  },
  context: {},
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

// Mock Otel functions
jest.mock('../config/otel.js', () => ({
  traceAgentStep: async (agentId: string, stepName: string, fn: any) => fn({
    setAttribute: () => {},
    setStatus: () => {},
    recordException: () => {},
    end: () => {},
  }),
  traceWorkflowStep: async (workflowId: string, stepName: string, id: any, fn: any) => fn({
    setAttribute: () => {},
    setStatus: () => {},
    recordException: () => {},
    end: () => {},
  }),
  recordConfidenceScore: () => {},
  recordFailClosed: () => {},
  recordTokenUsage: () => {},
}));

// ----------------------------------------------------
// INTEGRATION TESTS
// ----------------------------------------------------

async function runTests() {
  console.log('🚀 Running Integration Test Suite...');

  // --- Test 1: Ingest log safety and quarantine triggers ---
  console.log('🧪 Test 1: Ingestion safety filtering (Skill Sentinel)...');
  mockSentinelVerdict = 'FAIL';
  const decisionFail = await scanInboundLog('some raw log line');
  assert.strictEqual(decisionFail, 'FAIL', 'Sentinel verdict should be FAIL.');

  mockSentinelVerdict = 'PASS';
  const decisionPass = await scanInboundLog('normal log message');
  assert.strictEqual(decisionPass, 'PASS', 'Sentinel verdict should be PASS.');
  console.log('✅ Test 1 Passed.');

  // --- Test 2: Parallel Analysis Core (Log and Anomaly Agent) ---
  console.log('🧪 Test 2: Concurrency & parallel agent validation...');
  const mockEvents = [
    {
      event_id: 'e1',
      incident_id: 'INC-101',
      timestamp: Date.now(),
      expires_at: Date.now() + 10000,
      host: 'api-gw-01',
      process: 'sshd',
      severity: 'CRITICAL' as const,
      raw_message: 'failed password for root from 192.168.1.10',
      sequence_no: 1,
    },
  ];

  const logAgentResult = await runLogAgent(mockEvents, 'INC-101');
  const anomalyAgentResult = await runAnomalyAgent(mockEvents, 'INC-101');

  assert.ok(logAgentResult.evidence.length > 0, 'Log Agent should identify signature.');
  assert.ok(anomalyAgentResult.evidence.length > 0, 'Anomaly Agent should find critical severity.');
  console.log('✅ Test 2 Passed.');

  // --- Test 3: RCA Agent fail-closed and novel pattern pathing ---
  console.log('🧪 Test 3: RCA ReAct Loop and Novel Pattern fail-safe triggers...');
  const testState = createInitialIncidentState({ incidentId: 'INC-101' });
  testState.confidenceScore = 0.8;

  // Set KB similarity to < 0.5 to trigger a novel pattern
  mockQdrantKBScore = 0.45;
  const rcaNovelResult = await runRcaAgent(testState, []);
  assert.ok(rcaNovelResult?.isNovelPattern, 'RCA should classify score < 0.5 as novel.');
  assert.strictEqual(rcaNovelResult?.rootCause, null, 'Novel pattern must not output rootCause.');

  // Set KB similarity to > 0.92 to trigger early exit logic
  mockQdrantKBScore = 0.96;
  const rcaSuccessResult = await runRcaAgent(testState, []);
  assert.strictEqual(rcaSuccessResult?.isNovelPattern, false, 'Successful RCA pattern match.');
  assert.strictEqual(rcaSuccessResult?.rootCause, 'brute_force_attack', 'RCA should extract matching root cause.');
  console.log('✅ Test 3 Passed.');

  // --- Test 4: CMDB registry default-deny triggers ---
  console.log('🧪 Test 4: CMDB registry default-deny verification...');
  mockCmdbCriticality = 'standard';
  const cmdbStandard = await getAssetCriticality('db-prod-02');
  assert.strictEqual(cmdbStandard, 'standard', 'Standard host returns standard.');

  mockCmdbShouldFail = true;
  const cmdbFailPost = await getAssetCriticality('db-prod-02');
  assert.strictEqual(cmdbFailPost, 'high_impact', 'Failed CMDB lookups must default-deny to high_impact.');
  mockCmdbShouldFail = false;
  console.log('✅ Test 4 Passed.');

  // --- Test 5: Remediation Rayder safety gate and fail-closed state mutations ---
  console.log('🧪 Test 5: Remediation safety gate & fail-closed mutations...');
  let incidentState = createInitialIncidentState({ incidentId: 'INC-101' });
  incidentState.rca = {
    title: 'RCA findings',
    rootCause: 'brute_force_attack',
    affectedAssets: ['api-gw-01'],
    matchedPrecedentIds: [],
    confidenceScore: 0.9,
    reasoningSummary: 'RCA completed successfully.',
  };

  mockRayderVerdict = 'FAIL';
  const remediationRes = await runRemediationAgent(incidentState);
  incidentState = remediationRes.state;
  assert.strictEqual(incidentState.status, 'pending_human_review', 'Failed Rayder gate mutates status to pending_human_review.');
  assert.strictEqual((incidentState as any).autonomy_tier, 'L2_HITL_APPROVAL', 'Rayder gate violation triggers L2 human approval.');
  console.log('✅ Test 5 Passed.');

  // --- Test 6: Zod safeParse Schema Boundaries & Graceful recovery ---
  console.log('🧪 Test 6: Zod safeParse boundary and graceful recovery...');
  const malformedState = {
    incidentId: 'INC-MALFORMED',
    status: 'invalid_status_value', // Invalid status value to fail validation
  };

  const validationResult = validateIncidentState(malformedState);
  assert.strictEqual(validationResult.success, false, 'Validation should fail on malformed data shapes.');
  assert.strictEqual(validationResult.data.status, 'pending_human_review', 'Invalid states must degrade safely to human review.');
  assert.ok(validationResult.data.reasoningLog[0]?.includes('Fail-closed: zod_validation_failed'), 'Zod validation error logged.');
  console.log('✅ Test 6 Passed.');

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! Your 6-tier architecture is ready for the Build Sprint.');
}

runTests().catch((err) => {
  console.error('\n❌ INTEGRATION TEST SUITE ENCOUNTERED A FAILURE:\n', err);
  process.exit(1);
});
