-- Migration: 008_coherence_conflicts
-- Description: Create coherence_conflicts table for storing detected conflicts

-- Coherence conflicts table
CREATE TABLE IF NOT EXISTS coherence_conflicts (
    conflict_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Rule that detected this conflict
    rule_id VARCHAR(100) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',

    -- What's conflicting
    fact_key VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    values JSONB DEFAULT '{}',
    sources JSONB DEFAULT '[]',

    -- Status and resolution
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    resolution_options JSONB DEFAULT '[]',

    -- Resolution details
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution VARCHAR(50),
    resolution_value TEXT,
    resolution_note TEXT,

    -- Timestamps
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_severity CHECK (severity IN ('error', 'warning', 'info')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'resolved', 'deferred', 'overridden'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_project_id
    ON coherence_conflicts(project_id);

CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_status
    ON coherence_conflicts(status);

CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_project_status
    ON coherence_conflicts(project_id, status);

CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_rule_id
    ON coherence_conflicts(rule_id);

CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_detected_at
    ON coherence_conflicts(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_severity
    ON coherence_conflicts(severity);

-- Unique constraint to prevent duplicate active conflicts
CREATE UNIQUE INDEX IF NOT EXISTS idx_coherence_conflicts_unique_active
    ON coherence_conflicts(project_id, rule_id, fact_key)
    WHERE status = 'active';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_coherence_conflicts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coherence_conflicts_updated_at ON coherence_conflicts;
CREATE TRIGGER coherence_conflicts_updated_at
    BEFORE UPDATE ON coherence_conflicts
    FOR EACH ROW
    EXECUTE FUNCTION update_coherence_conflicts_updated_at();

-- Comments for documentation
COMMENT ON TABLE coherence_conflicts IS 'Stores detected coherence conflicts across project documents';
COMMENT ON COLUMN coherence_conflicts.severity IS 'error = must fix, warning = should fix, info = suggestion';
COMMENT ON COLUMN coherence_conflicts.status IS 'active = needs resolution, resolved = fixed, deferred = later, overridden = intentional';
COMMENT ON COLUMN coherence_conflicts.values IS 'JSON map of source -> value showing conflicting values';
