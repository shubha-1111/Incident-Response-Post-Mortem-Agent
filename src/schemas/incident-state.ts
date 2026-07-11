import { z } from "zod";

export const TopologyNodeIdSchema = z.enum([
  "ingest-agent",
  "log-source",
  "forensic-events-store",
  "log-agent",
  "anomaly-agent",
  "rca-agent",
  "incident-knowledge-store",
  "remediation-agent",
  "cmdb-registry",
  "enkrypt-gate",
  "autonomy-router",
  "human-operator",
  "report-agent",
  "retrieval-confidence-check",
  "novel-pattern-handler",
  "hitl-decision-card",
  "incident-sink",
]);

export const TopologyTierIdSchema = z.enum([
  "ingestion-tier",
  "analysis-tier",
  "governance-tier",
  "reasoning-tier",
  "reporting-tier",
  "remediation-tier",
]);

export const IncidentStatusSchema = z.enum([
  "received",
  "ingesting",
  "analyzing",
  "retrieving_context",
  "root_cause_identified",
  "remediation_planned",
  "remediation_proposed",
  "safety_reviewed",
  "auto_executing",
  "pending_human_review",
  "human_approved",
  "human_denied",
  "resolved",
  "reported",
  "failed_closed",
  "novel_pattern_detected",
]);

export const IncidentSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const AssetCriticalitySchema = z.enum([
  "low_impact",
  "medium_impact",
  "high_impact",
]);

export const RemediationActionSchema = z.enum([
  "block_ip",
  "isolate_host",
  "rotate_credential",
  "patch_rule",
]);

export const EnkryptDecisionSchema = z.enum(["PASS", "FAIL", "NEEDS_REVIEW"]);

export const HumanDecisionSchema = z.enum([
  "approved",
  "denied",
  "needs_more_context",
  "not_requested",
]);

export const AutonomyDecisionSchema = z.enum([
  "l4_auto_execute",
  "l2_hitl_approval",
  "pending_human_review",
  "approved",
]);

export const EvidenceKindSchema = z.enum([
  "raw_log",
  "scrubbed_log",
  "forensic_event",
  "pattern_match",
  "anomaly",
  "retrieval_match",
  "rca_hypothesis",
  "remediation_plan",
  "cmdb_lookup",
  "enkrypt_review",
  "human_review",
  "execution_result",
  "post_mortem",
]);

export const StrictIsoTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .describe("ISO-8601 timestamp with timezone offset.");

export const ConfidenceScoreSchema = z.number().min(0).max(1);

export const TopologyTierSchema = z
  .object({
    id: TopologyTierIdSchema,
    label: z.string().min(1),
    children: z.array(TopologyNodeIdSchema).min(1),
  })
  .strict();

export const TopologyNodeSchema = z
  .object({
    id: TopologyNodeIdSchema,
    tierId: TopologyTierIdSchema,
    label: z.string().min(1),
  })
  .strict();

export const IncidentKnowledgePayloadSchema = z
  .object({
    incident_id: z.string().min(1),
    title: z.string().min(1),
    root_cause: z.string().min(1),
    remediation: z.string().min(1),
    sop_ref: z.string().min(1),
    tags: z.array(z.string().min(1)),
    timestamp: StrictIsoTimestampSchema,
  })
  .strict();

export const ForensicEventPayloadSchema = z
  .object({
    event_id: z.string().min(1),
    incident_id: z.string().min(1),
    timestamp: StrictIsoTimestampSchema,
    ttl_expires_at: StrictIsoTimestampSchema,
    host: z.string().min(1),
    process: z.string().min(1),
    severity: IncidentSeveritySchema,
    sequence_no: z.number().int().nonnegative(),
  })
  .strict();

export const CollectionConfigSchema = z
  .object({
    name: z.enum(["incident_knowledge", "forensic_events"]),
    vectorSize: z.literal(1536),
    distance: z.literal("Cosine"),
    retrieval: z.enum(["MMR", "metadata_filtered_vector_search"]),
    indexedPayloadFields: z.array(z.string().min(1)),
  })
  .strict();

export const EvidenceEntrySchema = z
  .object({
    evidenceId: z.string().min(1),
    incidentId: z.string().min(1),
    sequenceNo: z.number().int().nonnegative(),
    kind: EvidenceKindSchema,
    sourceNodeId: TopologyNodeIdSchema,
    observedAt: StrictIsoTimestampSchema,
    recordedAt: StrictIsoTimestampSchema,
    summary: z.string().min(1),
    payload: z.record(z.unknown()),
    hash: z.string().min(1),
  })
  .strict();

export const EvidencePointerSchema = z
  .object({
    eventId: z.string().min(1),
    timestamp: StrictIsoTimestampSchema,
    host: z.string().min(1),
    reason: z.string().min(1),
    confidence: ConfidenceScoreSchema,
    payload: z.record(z.unknown()).optional(),
  })
  .strict();

export const RetrievedContextSchema = z
  .object({
    collection: z.enum(["incident_knowledge", "forensic_events"]),
    id: z.string().min(1),
    score: ConfidenceScoreSchema,
    payload: z.record(z.unknown()),
  })
  .strict();

export const LogPatternSchema = z
  .object({
    patternId: z.string().min(1),
    description: z.string().min(1),
    matchedEventIds: z.array(z.string().min(1)),
    confidenceScore: ConfidenceScoreSchema,
  })
  .strict();

export const AnomalySignalSchema = z
  .object({
    anomalyId: z.string().min(1),
    description: z.string().min(1),
    eventIds: z.array(z.string().min(1)),
    confidenceScore: ConfidenceScoreSchema,
  })
  .strict();

export const RootCauseAnalysisSchema = z
  .object({
    title: z.string().min(1),
    rootCause: z.string().min(1),
    affectedAssets: z.array(z.string().min(1)),
    matchedPrecedentIds: z.array(z.string().min(1)),
    confidenceScore: ConfidenceScoreSchema,
    reasoningSummary: z.string().min(1),
  })
  .strict();

export const RemediationPlanSchema = z
  .object({
    action: RemediationActionSchema,
    target: z.string().min(1),
    assetId: z.string().min(1),
    assetCriticality: AssetCriticalitySchema,
    justification: z.string().min(1),
    requiresHumanApproval: z.boolean(),
  })
  .strict();

export const EnkryptReviewSchema = z
  .object({
    skillSentinel: z
      .object({
        decision: EnkryptDecisionSchema,
        scrubbedLineCount: z.number().int().nonnegative(),
        findings: z.array(z.string()),
      })
      .strict()
      .optional(),
    rayder: z
      .object({
        decision: EnkryptDecisionSchema,
        policyFindings: z.array(z.string()),
      })
      .strict()
      .optional(),
  })
  .strict();

export const HumanReviewSchema = z
  .object({
    decision: HumanDecisionSchema,
    reviewerId: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
    decidedAt: StrictIsoTimestampSchema.optional(),
  })
  .strict();

export const FailClosedReasonSchema = z.enum([
  "zod_validation_failed",
  "enkrypt_failed",
  "enkrypt_needs_review",
  "cmdb_lookup_missing",
  "retrieval_confidence_below_threshold",
  "rca_iteration_limit_exceeded",
]);

export const FailClosedEventSchema = z
  .object({
    reason: FailClosedReasonSchema,
    sourceNodeId: TopologyNodeIdSchema,
    message: z.string().min(1),
    occurredAt: StrictIsoTimestampSchema,
  })
  .strict();

export const IncidentStateSchema = z
  .object({
    incidentId: z.string().min(1),
    status: IncidentStatusSchema,
    currentNodeId: TopologyNodeIdSchema,
    currentTierId: TopologyTierIdSchema,
    topology: z
      .object({
        tiers: z.array(TopologyTierSchema).length(6),
        nodes: z.array(TopologyNodeSchema).length(17),
      })
      .strict(),
    rawLogLines: z.array(z.string()),
    scrubbedLogLines: z.array(z.string()),
    forensicEvents: z.array(ForensicEventPayloadSchema),
    evidenceChain: z.array(EvidenceEntrySchema),
    logPatterns: z.array(LogPatternSchema),
    anomalySignals: z.array(AnomalySignalSchema),
    retrievedContext: z.array(RetrievedContextSchema),
    rca: RootCauseAnalysisSchema.optional(),
    remediationPlan: RemediationPlanSchema.optional(),
    enkryptReview: EnkryptReviewSchema,
    autonomyDecision: AutonomyDecisionSchema,
    humanReview: HumanReviewSchema,
    reasoningLog: z.array(z.string()),
    confidenceScore: ConfidenceScoreSchema,
    retrievalConfidence: ConfidenceScoreSchema,
    actionJustification: z.string(),
    iterationCount: z.number().int().nonnegative().max(4),
    failClosedEvents: z.array(FailClosedEventSchema),
    targetHost: z.string().optional(),
    rootCauseHypothesis: z.string().optional(),
    remediationAction: z.any().optional(),
    autonomyTier: z.string().optional(),
    postMortemRef: z.string().optional(),
    aiObservability: z.any().optional(),
    postMortem: z.any().optional(),
    threatScore: z.number().optional(),
    threatBreakdown: z.any().optional(),
    attackType: z.string().optional(),
    attackConfidence: z.number().optional(),
    plainLanguageSummary: z.string().optional(),
    threatIntelAssessment: z.any().optional(),
    createdAt: StrictIsoTimestampSchema,
    updatedAt: StrictIsoTimestampSchema,
  })
  .strict();

export const remediationActionSchema = z.object({
  actionType: RemediationActionSchema,
  params: z.record(z.string()),
  justification: z.string().min(1),
  confidenceScore: ConfidenceScoreSchema,
}).strict();

export type TopologyNodeId = z.infer<typeof TopologyNodeIdSchema>;
export type TopologyTierId = z.infer<typeof TopologyTierIdSchema>;
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;
export type AssetCriticality = z.infer<typeof AssetCriticalitySchema>;
export type RemediationAction = z.infer<typeof remediationActionSchema>;
export type EnkryptDecision = z.infer<typeof EnkryptDecisionSchema>;
export type EvidenceEntry = z.infer<typeof EvidenceEntrySchema>;
export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;
export type FailClosedReason = z.infer<typeof FailClosedReasonSchema>;
export type FailClosedEvent = z.infer<typeof FailClosedEventSchema>;
export type IncidentState = z.infer<typeof IncidentStateSchema>;

export const INCIDENT_KNOWLEDGE_COLLECTION: z.infer<typeof CollectionConfigSchema> = {
  name: "incident_knowledge",
  vectorSize: 1536,
  distance: "Cosine",
  retrieval: "MMR",
  indexedPayloadFields: [
    "incident_id",
    "title",
    "root_cause",
    "remediation",
    "sop_ref",
    "tags",
    "timestamp",
  ],
};

export const FORENSIC_EVENTS_COLLECTION: z.infer<typeof CollectionConfigSchema> = {
  name: "forensic_events",
  vectorSize: 1536,
  distance: "Cosine",
  retrieval: "metadata_filtered_vector_search",
  indexedPayloadFields: ["timestamp", "host"],
};

const topologyNodeLabels: Record<TopologyNodeId, string> = {
  "ingest-agent": "Ingest Agent",
  "log-source": "Log Source",
  "forensic-events-store": "forensic_events",
  "log-agent": "Log Agent",
  "anomaly-agent": "Anomaly Agent",
  "rca-agent": "RCA Agent",
  "incident-knowledge-store": "incident_knowledge",
  "remediation-agent": "Remediation Agent",
  "cmdb-registry": "CMDB/Asset Registry",
  "enkrypt-gate": "Enkrypt Gate",
  "autonomy-router": "Autonomy Router",
  "human-operator": "Human Operator (L2)",
  "report-agent": "Report Agent",
  "retrieval-confidence-check": "Retrieval Confidence Check",
  "novel-pattern-handler": "Novel Pattern Handler",
  "hitl-decision-card": "HITL Decision Card",
  "incident-sink": "Incident Status Sink",
};

export const TOPOLOGY_TIERS: z.infer<typeof TopologyTierSchema>[] = [
  {
    id: "ingestion-tier",
    label: "Ingestion & Forensic Tier",
    children: ["log-source", "ingest-agent", "forensic-events-store"],
  },
  {
    id: "analysis-tier",
    label: "Analysis Tier",
    children: ["log-agent", "anomaly-agent", "novel-pattern-handler"],
  },
  {
    id: "governance-tier",
    label: "Governance & HITL Tier",
    children: ["autonomy-router", "human-operator", "hitl-decision-card"],
  },
  {
    id: "reasoning-tier",
    label: "Reasoning & Knowledge Tier",
    children: [
      "rca-agent",
      "incident-knowledge-store",
      "retrieval-confidence-check",
    ],
  },
  {
    id: "reporting-tier",
    label: "Reporting & Learning Tier",
    children: ["report-agent", "incident-sink"],
  },
  {
    id: "remediation-tier",
    label: "Remediation & Safety Tier",
    children: ["remediation-agent", "cmdb-registry", "enkrypt-gate"],
  },
];

export const TOPOLOGY_NODES: z.infer<typeof TopologyNodeSchema>[] =
  TOPOLOGY_TIERS.flatMap((tier) =>
    tier.children.map((nodeId) => ({
      id: nodeId,
      tierId: tier.id,
      label: topologyNodeLabels[nodeId],
    })),
  );

export const DEFAULT_TOPOLOGY = {
  tiers: TOPOLOGY_TIERS,
  nodes: TOPOLOGY_NODES,
};

export const FAIL_CLOSED_STATUS: IncidentStatus = "pending_human_review";
export const RCA_MAX_ITERATIONS = 4;
export const RCA_EARLY_EXIT_SIMILARITY = 0.92;
export const NOVEL_PATTERN_RETRIEVAL_THRESHOLD = 0.5;
export const UNKNOWN_ASSET_CRITICALITY: AssetCriticality = "high_impact";

export function createInitialIncidentState(input: {
  incidentId: string;
  rawLogLines?: string[];
  createdAt?: string;
}): IncidentState {
  const now = input.createdAt ?? new Date().toISOString();
  const candidate: IncidentState = {
    incidentId: input.incidentId,
    status: "received",
    currentNodeId: "log-source",
    currentTierId: "ingestion-tier",
    topology: DEFAULT_TOPOLOGY,
    rawLogLines: input.rawLogLines ?? [],
    scrubbedLogLines: [],
    forensicEvents: [],
    evidenceChain: [],
    logPatterns: [],
    anomalySignals: [],
    retrievedContext: [],
    enkryptReview: {},
    autonomyDecision: "pending_human_review",
    humanReview: {
      decision: "not_requested",
    },
    reasoningLog: [],
    confidenceScore: 0,
    retrievalConfidence: 0,
    actionJustification: "",
    iterationCount: 0,
    failClosedEvents: [],
    createdAt: now,
    updatedAt: now,
  };

  const result = IncidentStateSchema.safeParse(candidate);
  if (!result.success) {
    return failClosedIncidentState(candidate, {
      reason: "zod_validation_failed",
      sourceNodeId: "log-source",
      message: result.error.message,
      occurredAt: now,
    });
  }

  return result.data;
}

export function validateIncidentState(candidate: unknown):
  | { success: true; data: IncidentState }
  | { success: false; data: IncidentState; error: z.ZodError } {
  const result = IncidentStateSchema.safeParse(candidate);
  if (result.success) {
    return result;
  }

  const fallbackBase = buildFallbackIncidentState(candidate);
  return {
    success: false,
    data: failClosedIncidentState(fallbackBase, {
      reason: "zod_validation_failed",
      sourceNodeId: fallbackBase.currentNodeId,
      message: result.error.message,
      occurredAt: new Date().toISOString(),
    }),
    error: result.error,
  };
}

export function appendEvidence(
  state: IncidentState,
  entry: Omit<EvidenceEntry, "sequenceNo">,
): IncidentState {
  const nextEntry: EvidenceEntry = {
    ...entry,
    sequenceNo: state.evidenceChain.length,
  };

  const candidate: IncidentState = {
    ...state,
    evidenceChain: [...state.evidenceChain, nextEntry],
    updatedAt: new Date().toISOString(),
  };

  const result = IncidentStateSchema.safeParse(candidate);
  if (!result.success) {
    return failClosedIncidentState(state, {
      reason: "zod_validation_failed",
      sourceNodeId: state.currentNodeId,
      message: result.error.message,
      occurredAt: new Date().toISOString(),
    });
  }

  return result.data;
}

export function failClosedIncidentState(
  state: IncidentState,
  event: FailClosedEvent,
): IncidentState {
  const candidate: IncidentState = {
    ...state,
    status: FAIL_CLOSED_STATUS,
    autonomyDecision: "pending_human_review",
    actionJustification:
      event.message || "Fail-closed rule triggered; routing to human review.",
    reasoningLog: [
      ...state.reasoningLog,
      `[${event.sourceNodeId}] Fail-closed: ${event.reason}. ${event.message}`,
    ],
    failClosedEvents: [...state.failClosedEvents, event],
    updatedAt: event.occurredAt,
  };

  const result = IncidentStateSchema.safeParse(candidate);
  if (result.success) {
    return result.data;
  }

  return {
    incidentId: state.incidentId || "unknown-incident",
    status: FAIL_CLOSED_STATUS,
    currentNodeId: event.sourceNodeId,
    currentTierId: tierForNode(event.sourceNodeId),
    topology: DEFAULT_TOPOLOGY,
    rawLogLines: Array.isArray(state.rawLogLines) ? state.rawLogLines : [],
    scrubbedLogLines: Array.isArray(state.scrubbedLogLines)
      ? state.scrubbedLogLines
      : [],
    forensicEvents: [],
    evidenceChain: [],
    logPatterns: [],
    anomalySignals: [],
    retrievedContext: [],
    enkryptReview: {},
    autonomyDecision: "pending_human_review",
    humanReview: {
      decision: "not_requested",
    },
    reasoningLog: [`[${event.sourceNodeId}] Fail-closed: ${event.reason}.`],
    confidenceScore: 0,
    retrievalConfidence: 0,
    actionJustification: event.message,
    iterationCount: 0,
    failClosedEvents: [event],
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
  };
}

export function shouldFailClosedForEnkrypt(
  decision: EnkryptDecision,
): decision is "FAIL" | "NEEDS_REVIEW" {
  return decision === "FAIL" || decision === "NEEDS_REVIEW";
}

export function shouldFailClosedForRetrieval(
  retrievalConfidence: number,
): boolean {
  return retrievalConfidence < NOVEL_PATTERN_RETRIEVAL_THRESHOLD;
}

export function shouldFailClosedForRcaIteration(iterationCount: number): boolean {
  return iterationCount >= RCA_MAX_ITERATIONS;
}

export function shouldEarlyExitRca(similarity: number): boolean {
  return similarity > RCA_EARLY_EXIT_SIMILARITY;
}

export function tierForNode(nodeId: TopologyNodeId): TopologyTierId {
  const tier = TOPOLOGY_TIERS.find((candidate) =>
    candidate.children.includes(nodeId),
  );
  return tier?.id ?? "governance-tier";
}

function buildFallbackIncidentState(candidate: unknown): IncidentState {
  if (isRecord(candidate) && typeof candidate.incidentId === "string") {
    const now = new Date().toISOString();
    const nodeCandidate = TopologyNodeIdSchema.safeParse(candidate.currentNodeId);
    const currentNodeId = nodeCandidate.success
      ? nodeCandidate.data
      : "human-operator";

    return {
      incidentId: candidate.incidentId || "unknown-incident",
      status: "pending_human_review",
      currentNodeId,
      currentTierId: tierForNode(currentNodeId),
      topology: DEFAULT_TOPOLOGY,
      rawLogLines: stringArrayOrEmpty(candidate.rawLogLines),
      scrubbedLogLines: stringArrayOrEmpty(candidate.scrubbedLogLines),
      forensicEvents: [],
      evidenceChain: [],
      logPatterns: [],
      anomalySignals: [],
      retrievedContext: [],
      enkryptReview: {},
      autonomyDecision: "pending_human_review",
      humanReview: {
        decision: "not_requested",
      },
      reasoningLog: stringArrayOrEmpty(candidate.reasoningLog),
      confidenceScore: 0,
      retrievalConfidence: 0,
      actionJustification: "Invalid incident state shape.",
      iterationCount: 0,
      failClosedEvents: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  return createInitialIncidentState({
    incidentId: "unknown-incident",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArrayOrEmpty(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
