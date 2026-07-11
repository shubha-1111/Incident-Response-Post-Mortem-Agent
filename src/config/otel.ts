import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { trace, Span, SpanStatusCode, context, ROOT_CONTEXT } from '@opentelemetry/api';

const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME;
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

let sdk: NodeSDK | null = null;
let tracer: ReturnType<typeof trace.getTracer> | null = null;

function getTracer() {
  if (!tracer) {
    tracer = trace.getTracer(OTEL_SERVICE_NAME || 'noop');
  }
  return tracer;
}

export async function startOpenTelemetry(): Promise<void> {
  if (!OTEL_SERVICE_NAME || !OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.warn('[Telemetry] OTel environment variables not configured; telemetry disabled.');
    return;
  }

  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  sdk = new NodeSDK({
    serviceName: OTEL_SERVICE_NAME,
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  try {
    await sdk.start();
    console.log(`[Telemetry] OpenTelemetry SDK initialized successfully for service: ${OTEL_SERVICE_NAME}`);
  } catch (error) {
    console.error('[Telemetry] Error starting OpenTelemetry SDK:', error);
  }

  process.on('SIGTERM', () => {
    if (!sdk) return;
    sdk.shutdown()
      .then(() => console.log('[Telemetry] OpenTelemetry SDK gracefully terminated.'))
      .catch((error) => console.error('[Telemetry] Error terminating OpenTelemetry SDK:', error))
      .finally(() => process.exit(0));
  });
}

export function recordBootstrapError(error: Error): void {
  try {
    const span = getTracer().startSpan('system.bootstrap_error');
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || 'System bootstrap error occurred',
    });
    span.recordException(error);
    span.end();
  } catch {
    // telemetry recording is best-effort
  }
}

export async function traceAgentStep<T>(
  agentId: string,
  stepName: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return getTracer().startActiveSpan(`agent_step:${agentId}.${stepName}`, async (span) => {
    span.setAttribute('component.type', 'agent');
    span.setAttribute('agent.id', agentId);
    span.setAttribute('agent.step_name', stepName);

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Agent processing error occurred',
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export async function traceWorkflowStep<T>(
  workflowId: string,
  stepName: string,
  incidentId: string | undefined,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return getTracer().startActiveSpan(`workflow_step:${workflowId}.${stepName}`, async (span) => {
    span.setAttribute('component.type', 'workflow');
    span.setAttribute('workflow.id', workflowId);
    span.setAttribute('workflow.step_name', stepName);

    if (incidentId) {
      span.setAttribute('incident.id', incidentId);
    }

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Workflow step boundary error occurred',
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export function recordConfidenceScore(
  span: Span,
  anomalyConfidence: number,
  retrievalConfidence: number
): void {
  span.setAttribute('metrics.confidence.anomaly', anomalyConfidence);
  span.setAttribute('metrics.confidence.retrieval', retrievalConfidence);
  span.setAttribute('metrics.confidence.aggregated_score', (anomalyConfidence + retrievalConfidence) / 2);
}

export function recordFailClosed(
  span: Span,
  reason: string,
  triggeredBy: string
): void {
  span.setAttribute('security.policy.compliance', 'FAIL_CLOSED');
  span.setAttribute('security.policy.violation_reason', reason);
  span.setAttribute('security.policy.triggered_by', triggeredBy);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: `Security intercept: Execution paused. Routed to human operator review due to: ${reason}`,
  });
}

export function recordTokenUsage(
  span: Span,
  promptTokens: number,
  completionTokens: number,
  agentId: string
): void {
  span.setAttribute('llm.token_usage.prompt', promptTokens);
  span.setAttribute('llm.token_usage.completion', completionTokens);
  span.setAttribute('llm.token_usage.total', promptTokens + completionTokens);
  span.setAttribute('llm.agent_id', agentId);
}
