-- Migration: Add pgvector extension and embedding column for semantic search
-- Date: 2026-01-25
-- Description: Enables vector similarity search for knowledge base documents

-- Enable pgvector extension (requires superuser or extension already installed)
-- Note: In managed databases (e.g., RDS, Supabase), pgvector may need to be enabled
-- through the cloud console first.
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to knowledge_documents table
-- Using 1536 dimensions for OpenAI's text-embedding-ada-002 model
ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for efficient similarity search
-- Using IVFFlat index for balance of speed and accuracy
-- lists = sqrt(num_rows) is a good starting point
CREATE INDEX IF NOT EXISTS ix_knowledge_documents_embedding
ON knowledge_documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create feature flags table if not exists
CREATE TABLE IF NOT EXISTS feature_flags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50),
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    rollout_percentage FLOAT DEFAULT 100.0,
    rollout_groups JSONB,
    flag_metadata JSONB,
    flag_type VARCHAR(20) DEFAULT 'boolean',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    depends_on JSONB
);

CREATE INDEX IF NOT EXISTS ix_feature_flags_category ON feature_flags(category);
CREATE INDEX IF NOT EXISTS ix_feature_flags_enabled ON feature_flags(is_enabled);

-- Create feature flag overrides table
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
    id SERIAL PRIMARY KEY,
    flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    institution_id UUID,
    user_id UUID,
    is_enabled BOOLEAN NOT NULL,
    custom_config JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    reason TEXT,
    CONSTRAINT uq_flag_institution UNIQUE (flag_id, institution_id),
    CONSTRAINT uq_flag_user UNIQUE (flag_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_feature_flag_overrides_flag ON feature_flag_overrides(flag_id);
CREATE INDEX IF NOT EXISTS ix_feature_flag_overrides_institution ON feature_flag_overrides(institution_id);
CREATE INDEX IF NOT EXISTS ix_feature_flag_overrides_user ON feature_flag_overrides(user_id);

-- Create feature flag audit table
CREATE TABLE IF NOT EXISTS feature_flag_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_email VARCHAR(255),
    previous_value JSONB,
    new_value JSONB,
    institution_id UUID,
    user_id UUID,
    reason TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_feature_flag_audit_flag_name ON feature_flag_audit(flag_name);
CREATE INDEX IF NOT EXISTS ix_feature_flag_audit_created_at ON feature_flag_audit(created_at);
CREATE INDEX IF NOT EXISTS ix_feature_flag_audit_actor ON feature_flag_audit(actor_id);

-- Seed default feature flags
INSERT INTO feature_flags (name, description, category, is_enabled)
VALUES
    ('semantic_search', 'Enable vector-based semantic search in knowledge base', 'ai', false),
    ('auto_rollback', 'Automatically rollback prompts when quality drops', 'ai', true),
    ('quality_monitoring', 'Enable real-time quality monitoring with alerts', 'ai', true),
    ('prompt_playground', 'Enable prompt testing playground in admin UI', 'admin', true),
    ('cost_alerts', 'Enable cost threshold alerts', 'admin', true),
    ('ab_testing', 'Enable A/B testing for prompts', 'ai', true),
    ('bulk_generation', 'Enable bulk document generation', 'generation', true),
    ('stream_responses', 'Enable streaming responses for chat', 'ux', true),
    ('export_analytics', 'Enable analytics export functionality', 'admin', false),
    ('compliance_reports', 'Enable automated compliance report generation', 'admin', false),
    ('advanced_rag', 'Enable advanced RAG features (hybrid search, reranking)', 'ai', false),
    ('multi_llm', 'Enable multi-LLM provider support', 'ai', false)
ON CONFLICT (name) DO NOTHING;

-- Add comment for documentation
COMMENT ON COLUMN knowledge_documents.embedding IS 'Vector embedding from OpenAI text-embedding-ada-002 (1536 dimensions)';
