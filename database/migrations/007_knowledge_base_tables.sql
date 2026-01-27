-- Migration: Add project knowledge base tables for intelligent form filling
-- Date: 2026-01-27
-- Description: Creates tables for project knowledge base, embeddings, corrections, and patterns

-- Project Knowledge Base - Main knowledge store per project
CREATE TABLE IF NOT EXISTS project_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Structured protocol data (fast queries for common fields)
    protocol_data JSONB DEFAULT '{}',

    -- Flexible fact store (key-value for anything)
    facts JSONB DEFAULT '[]',  -- [{key, value, source, confidence, extracted_at}]

    -- Source documents
    documents JSONB DEFAULT '[]',  -- [{doc_id, filename, type, extracted_at}]

    -- Wizard answers (structured)
    wizard_answers JSONB DEFAULT '{}',

    -- Questionnaire state
    questionnaire_complete BOOLEAN DEFAULT FALSE,
    completion_percentage DECIMAL(5,2) DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT uq_project_knowledge_base UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_project ON project_knowledge_base(project_id);

-- Knowledge Embeddings - Vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID REFERENCES project_knowledge_base(id) ON DELETE CASCADE,

    content TEXT NOT NULL,           -- The text that was embedded
    content_type VARCHAR(50),        -- 'fact', 'document_chunk', 'wizard_answer'
    source_key VARCHAR(255),         -- Reference back to source

    embedding vector(1536),          -- OpenAI ada-002 dimension

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_kb ON knowledge_embeddings(knowledge_base_id);
-- Create IVFFlat index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON knowledge_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Form Fill Corrections - Track corrections for learning
CREATE TABLE IF NOT EXISTS form_fill_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Context
    user_id UUID REFERENCES users(id),
    project_id UUID REFERENCES projects(id),
    institution_id UUID,
    form_template_id INTEGER,

    -- The correction
    field_id VARCHAR(255) NOT NULL,
    field_label TEXT,
    field_type VARCHAR(50),

    original_value JSONB,        -- What AI suggested
    corrected_value JSONB,       -- What user changed to

    -- Evidence context
    source_evidence TEXT,        -- What AI used to make suggestion
    knowledge_base_keys JSONB,   -- Which KB facts were used

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_user ON form_fill_corrections(user_id, field_id);
CREATE INDEX IF NOT EXISTS idx_corrections_institution ON form_fill_corrections(institution_id, field_id);
CREATE INDEX IF NOT EXISTS idx_corrections_project ON form_fill_corrections(project_id, field_id);

-- Institution Patterns - Common entity patterns (PI info, procedures, etc.)
CREATE TABLE IF NOT EXISTS institution_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,

    pattern_type VARCHAR(50),    -- 'pi_info', 'procedure', 'department', 'standard_language'
    pattern_key VARCHAR(255),    -- e.g., 'dr_smith_contact'
    pattern_value JSONB,         -- The actual values

    usage_count INTEGER DEFAULT 1,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_institution ON institution_patterns(institution_id, pattern_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_unique ON institution_patterns(institution_id, pattern_type, pattern_key);

-- Add comments for documentation
COMMENT ON TABLE project_knowledge_base IS 'Stores all extracted and user-provided knowledge for a research project';
COMMENT ON TABLE knowledge_embeddings IS 'Vector embeddings for semantic search within project knowledge';
COMMENT ON TABLE form_fill_corrections IS 'Tracks user corrections to AI-suggested form fills for learning';
COMMENT ON TABLE institution_patterns IS 'Common entity patterns learned at the institution level';
