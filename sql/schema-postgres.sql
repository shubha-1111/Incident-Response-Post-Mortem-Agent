-- ===========================================================================
-- Production schema for the Real-Time Threat Intelligence System
-- Target: PostgreSQL 15 + TimescaleDB 2.x
-- Applied automatically by docker-compose via the initdb volume mount.
-- Also runnable manually: psql "$DATABASE_URL" -f sql/schema-postgres.sql
-- ===========================================================================

-- Enable TimescaleDB extension when available. On a vanilla PostgreSQL
-- instance (e.g. managed Postgres without the extension) this is skipped so
-- the schema still applies; the table simply stays a regular relation.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb;
  RAISE NOTICE 'timescaledb extension enabled.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'timescaledb extension not available (%), continuing without hypertables.', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- Incidents (hypertable partitioned on created_at for time-series queries)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
  incident_id           TEXT PRIMARY KEY,
  status                TEXT NOT NULL,
  target_host           TEXT,
  confidence_score      DOUBLE PRECISION,
  retrieval_confidence  DOUBLE PRECISION,
  autonomy_tier         TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  state_json            JSONB NOT NULL,
  threat_score          DOUBLE PRECISION,
  threat_breakdown_json JSONB
);

-- Convert to a hypertable only when the TimescaleDB extension is present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    IF NOT EXISTS (
      SELECT 1 FROM timescaledb_information.hypertables
      WHERE hypertable_name = 'incidents'
    ) THEN
      PERFORM create_hypertable('incidents', 'created_at');
      RAISE NOTICE 'incidents converted to hypertable.';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping hypertable creation (timescaledb not installed).';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_state_json ON incidents USING GIN(state_json);

-- ---------------------------------------------------------------------------
-- Workflow step tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_steps (
  id           BIGSERIAL PRIMARY KEY,
  incident_id  TEXT NOT NULL,
  step_name    TEXT NOT NULL,
  status       TEXT NOT NULL,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  duration_ms  BIGINT,
  metadata_json JSONB,
  UNIQUE(incident_id, step_name)
);
CREATE INDEX IF NOT EXISTS idx_steps_incident ON workflow_steps(incident_id);

-- ---------------------------------------------------------------------------
-- Incident timeline / audit ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timeline_events (
  id            BIGSERIAL PRIMARY KEY,
  incident_id   TEXT NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL,
  actor         TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  summary       TEXT NOT NULL,
  severity      TEXT,
  metadata_json JSONB
);
CREATE INDEX IF NOT EXISTS idx_timeline_incident ON timeline_events(incident_id, timestamp);
-- Natural-key unique constraint makes re-running the migration idempotent.
ALTER TABLE timeline_events
  ADD CONSTRAINT uq_timeline_event UNIQUE (incident_id, timestamp, event_type, summary);

-- ---------------------------------------------------------------------------
-- Risk score history (for dashboard line charts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_history (
  id           BIGSERIAL PRIMARY KEY,
  incident_id  TEXT NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL,
  risk_score   DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_history_incident ON risk_history(incident_id, timestamp);
-- Natural-key unique constraints make re-running the migration idempotent
-- (timeline_events / risk_history have no stable PK in the source SQLite).
ALTER TABLE risk_history
  ADD CONSTRAINT uq_risk_incident_timestamp UNIQUE (incident_id, timestamp);

-- ---------------------------------------------------------------------------
-- Threat intelligence lookup cache (24h TTL enforced by expires_at)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threat_intel_cache (
  cache_key    TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  lookup_key   TEXT NOT NULL,
  result_json  JSONB NOT NULL,
  success      BOOLEAN NOT NULL DEFAULT TRUE,
  confidence   DOUBLE PRECISION,
  created_at   TIMESTAMPTZ NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threat_cache_source ON threat_intel_cache(source, expires_at);

-- ---------------------------------------------------------------------------
-- Per-step metric snapshots (confidence curves + threat breakdown)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id                  BIGSERIAL PRIMARY KEY,
  incident_id         TEXT NOT NULL,
  step_name           TEXT NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL,
  confidence          DOUBLE PRECISION,
  threat_score        DOUBLE PRECISION,
  retrieval_confidence DOUBLE PRECISION,
  UNIQUE(incident_id, step_name)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_incident ON metric_snapshots(incident_id, timestamp);

-- ---------------------------------------------------------------------------
-- Incident groups for clustered analysis (Phase 7)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_groups (
  group_id      TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  incident_ids  JSONB NOT NULL,
  cluster_method TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  metadata_json JSONB
);
CREATE INDEX IF NOT EXISTS idx_groups_method ON incident_groups(cluster_method);

-- ---------------------------------------------------------------------------
-- Incident correlation tables (for similarity clustering and grouping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_correlations (
  id SERIAL PRIMARY KEY,
  incident_id_1 TEXT NOT NULL,
  incident_id_2 TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  correlation_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(incident_id_1, incident_id_2)
);

CREATE INDEX IF NOT EXISTS idx_correlations_incident_1 ON incident_correlations(incident_id_1);
CREATE INDEX IF NOT EXISTS idx_correlations_incident_2 ON incident_correlations(incident_id_2);
CREATE INDEX IF NOT EXISTS idx_correlations_similarity ON incident_correlations(similarity_score DESC);

CREATE TABLE IF NOT EXISTS correlation_cache (
  cache_key TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  similar_incidents JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_correlation_cache_expires ON correlation_cache(expires_at);

-- ---------------------------------------------------------------------------
-- Saved filter presets (Phase 6.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS filter_presets (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  filter_json JSONB NOT NULL,
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_filter_presets_user ON filter_presets(user_id);

-- ---------------------------------------------------------------------------
-- Prediction accuracy tracking (Phase 5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predictions (
  prediction_id   TEXT PRIMARY KEY,
  incident_id     TEXT NOT NULL REFERENCES incidents(incident_id),
  model_version   TEXT NOT NULL,
  predicted_label TEXT NOT NULL,
  confidence_score DOUBLE PRECISION,
  metadata_json   JSONB,
  predicted_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_model ON predictions(model_version);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(predicted_at);

CREATE TABLE IF NOT EXISTS outcomes (
  prediction_id TEXT PRIMARY KEY REFERENCES predictions(prediction_id),
  actual_label  TEXT NOT NULL,
  observed_at   TIMESTAMPTZ NOT NULL,
  validated_by  TEXT
);
