-- Learning System Tables
-- Supports user-level learning, correction tracking, and fact provenance

-- ============================================================================
-- User Learning Profile
-- Stores user-specific patterns and preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_learning_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Aggregated patterns learned from user behavior
    patterns JSONB NOT NULL DEFAULT '{}',

    -- Common values the user tends to use (anonymized for aggregation)
    common_values JSONB NOT NULL DEFAULT '{}',

    -- Preferences (e.g., preferred terminology, formatting)
    preferences JSONB NOT NULL DEFAULT '{}',

    -- Statistics
    total_corrections INTEGER NOT NULL DEFAULT 0,
    total_accepted_suggestions INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_learning_profiles_user_id
    ON user_learning_profiles(user_id);

-- ============================================================================
-- User Corrections
-- Tracks when users correct AI suggestions (for learning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- What was corrected
    field_key VARCHAR(255) NOT NULL,
    form_field_id VARCHAR(255),

    -- Original and corrected values
    original_value TEXT,
    corrected_value TEXT NOT NULL,

    -- Context
    correction_source VARCHAR(50) NOT NULL DEFAULT 'form_fill',
    -- form_fill, questionnaire, document_mode, review_mode

    -- AI suggestion metadata (if applicable)
    suggestion_confidence DECIMAL(3, 2),
    suggestion_source VARCHAR(255),

    -- Learning flags
    applied_to_learning BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_corrections_user_id
    ON user_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_corrections_project_id
    ON user_corrections(project_id);
CREATE INDEX IF NOT EXISTS idx_user_corrections_field_key
    ON user_corrections(field_key);
CREATE INDEX IF NOT EXISTS idx_user_corrections_created_at
    ON user_corrections(created_at);
CREATE INDEX IF NOT EXISTS idx_user_corrections_not_applied
    ON user_corrections(applied_to_learning) WHERE applied_to_learning = FALSE;

-- ============================================================================
-- Fact Provenance
-- Tracks the history and sources of facts
-- ============================================================================

CREATE TABLE IF NOT EXISTS fact_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Fact identification
    fact_key VARCHAR(255) NOT NULL,

    -- Current value
    current_value TEXT,

    -- Source information
    primary_source VARCHAR(50) NOT NULL,
    -- document_extraction, wizard_answer, user_input, form_sync, ai_suggestion

    source_document_id UUID,
    source_reference TEXT,

    -- Confidence and verification
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 1.0,
    verified_by_user BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,

    -- Documents/forms that reference this fact
    referenced_by JSONB NOT NULL DEFAULT '[]',
    -- [{"type": "form", "id": "...", "field": "..."}]

    -- Version tracking
    version INTEGER NOT NULL DEFAULT 1,
    previous_value TEXT,
    changed_by_user_id UUID REFERENCES users(id),
    change_reason VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_provenance_project_id
    ON fact_provenance(project_id);
CREATE INDEX IF NOT EXISTS idx_fact_provenance_fact_key
    ON fact_provenance(fact_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_provenance_project_fact
    ON fact_provenance(project_id, fact_key);
CREATE INDEX IF NOT EXISTS idx_fact_provenance_source
    ON fact_provenance(primary_source);

-- ============================================================================
-- Fact History
-- Maintains full history of fact changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS fact_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provenance_id UUID NOT NULL REFERENCES fact_provenance(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fact_key VARCHAR(255) NOT NULL,

    -- Version info
    version INTEGER NOT NULL,

    -- Value at this version
    value TEXT,

    -- Change metadata
    source VARCHAR(50) NOT NULL,
    confidence DECIMAL(3, 2),
    changed_by_user_id UUID REFERENCES users(id),
    change_reason VARCHAR(255),

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_history_provenance_id
    ON fact_history(provenance_id);
CREATE INDEX IF NOT EXISTS idx_fact_history_project_fact
    ON fact_history(project_id, fact_key);
CREATE INDEX IF NOT EXISTS idx_fact_history_created_at
    ON fact_history(created_at);

-- ============================================================================
-- Suggestion Feedback
-- Tracks explicit feedback on AI suggestions (thumbs up/down)
-- ============================================================================

CREATE TABLE IF NOT EXISTS suggestion_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- What was suggested
    suggestion_type VARCHAR(50) NOT NULL,
    -- answer_suggestion, content_generation, form_fill, questionnaire

    field_key VARCHAR(255),
    suggested_value TEXT,

    -- Feedback
    feedback VARCHAR(20) NOT NULL,
    -- accepted, rejected, modified, ignored

    final_value TEXT,

    -- Context
    suggestion_confidence DECIMAL(3, 2),
    suggestion_source VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_user_id
    ON suggestion_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_project_id
    ON suggestion_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_type
    ON suggestion_feedback(suggestion_type);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_feedback
    ON suggestion_feedback(feedback);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at on user_learning_profiles
CREATE OR REPLACE FUNCTION update_user_learning_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_learning_profiles_updated_at ON user_learning_profiles;
CREATE TRIGGER trigger_update_user_learning_profiles_updated_at
    BEFORE UPDATE ON user_learning_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_user_learning_profiles_updated_at();

-- Auto-update updated_at on fact_provenance
CREATE OR REPLACE FUNCTION update_fact_provenance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_fact_provenance_updated_at ON fact_provenance;
CREATE TRIGGER trigger_update_fact_provenance_updated_at
    BEFORE UPDATE ON fact_provenance
    FOR EACH ROW
    EXECUTE FUNCTION update_fact_provenance_updated_at();

-- Auto-insert fact history on provenance update
CREATE OR REPLACE FUNCTION insert_fact_history_on_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.current_value IS DISTINCT FROM NEW.current_value THEN
        INSERT INTO fact_history (
            provenance_id, project_id, fact_key, version,
            value, source, confidence, changed_by_user_id, change_reason
        ) VALUES (
            NEW.id, NEW.project_id, NEW.fact_key, NEW.version,
            NEW.current_value, NEW.primary_source, NEW.confidence,
            NEW.changed_by_user_id, NEW.change_reason
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_insert_fact_history ON fact_provenance;
CREATE TRIGGER trigger_insert_fact_history
    AFTER UPDATE ON fact_provenance
    FOR EACH ROW
    EXECUTE FUNCTION insert_fact_history_on_change();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE user_learning_profiles IS
    'User-level learning profile with patterns and preferences';

COMMENT ON TABLE user_corrections IS
    'Tracks user corrections to AI suggestions for learning';

COMMENT ON TABLE fact_provenance IS
    'Tracks source and history of facts with full provenance';

COMMENT ON TABLE fact_history IS
    'Historical versions of facts for audit trail';

COMMENT ON TABLE suggestion_feedback IS
    'Explicit user feedback on AI suggestions';
