-- Radiology Research Platform - Unified Database Schema
-- Version: 1.0.0
-- Compatible with PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS & AUTHENTICATION
-- =============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'reviewer', 'researcher')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    sso_provider VARCHAR(50),
    sso_id VARCHAR(255),
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- =============================================================================
-- RESEARCH PROJECTS
-- =============================================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    project_type VARCHAR(100),
    department VARCHAR(255),
    principal_investigator_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    start_date DATE,
    end_date DATE,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_pi ON projects(principal_investigator_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

CREATE TABLE project_collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('co_investigator', 'research_assistant', 'coordinator')),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_collaborators_project ON project_collaborators(project_id);
CREATE INDEX idx_project_collaborators_user ON project_collaborators(user_id);

-- =============================================================================
-- FORM TEMPLATES
-- =============================================================================

CREATE TABLE templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    original_file_path VARCHAR(500),
    original_file_name VARCHAR(255),
    schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_templates_is_active ON templates(is_active);
CREATE INDEX idx_templates_is_published ON templates(is_published);

-- =============================================================================
-- FORM INSTANCES
-- =============================================================================

CREATE TABLE form_instances (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates(id),
    project_id UUID REFERENCES projects(id),
    owner_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'needs_changes', 'approved', 'rejected', 'locked')),
    current_version_number INTEGER DEFAULT 1,
    completion_percentage INTEGER DEFAULT 0,
    submitted_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_form_instances_template ON form_instances(template_id);
CREATE INDEX idx_form_instances_project ON form_instances(project_id);
CREATE INDEX idx_form_instances_owner ON form_instances(owner_id);
CREATE INDEX idx_form_instances_status ON form_instances(status);
CREATE INDEX idx_form_instances_created_at ON form_instances(created_at DESC);

-- Form working data (current editable state)
CREATE TABLE form_data (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER UNIQUE NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}'::jsonb,
    conditional_state JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_form_data_form_instance ON form_data(form_instance_id);

-- =============================================================================
-- FORM VERSIONS (Immutable Snapshots)
-- =============================================================================

CREATE TABLE form_versions (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_label VARCHAR(100),
    data_snapshot JSONB NOT NULL,
    conditional_state_snapshot JSONB,
    status_at_creation VARCHAR(50),
    change_summary TEXT,
    generated_docx_path VARCHAR(500),
    generated_pdf_path VARCHAR(500),
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(form_instance_id, version_number)
);

CREATE INDEX idx_form_versions_form_instance ON form_versions(form_instance_id);
CREATE INDEX idx_form_versions_created_at ON form_versions(created_at DESC);

-- =============================================================================
-- FIELD-LEVEL CHANGE HISTORY (Audit Trail)
-- =============================================================================

CREATE TABLE field_changes (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    version_id INTEGER REFERENCES form_versions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    field_id VARCHAR(255) NOT NULL,
    field_label VARCHAR(500),
    old_value JSONB,
    new_value JSONB,
    action_type VARCHAR(50) DEFAULT 'update',
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_field_changes_form_instance ON field_changes(form_instance_id);
CREATE INDEX idx_field_changes_user ON field_changes(user_id);
CREATE INDEX idx_field_changes_field_id ON field_changes(field_id);
CREATE INDEX idx_field_changes_created_at ON field_changes(created_at DESC);

-- =============================================================================
-- REVIEW WORKFLOW
-- =============================================================================

CREATE TABLE review_stages (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sequence_order INTEGER NOT NULL,
    default_deadline_days INTEGER DEFAULT 7,
    requires_all_previous BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE form_reviews (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    review_stage_id INTEGER REFERENCES review_stages(id),
    reviewer_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'approved', 'rejected', 'revision_required')),
    deadline DATE,
    overall_comments TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_form_reviews_form_instance ON form_reviews(form_instance_id);
CREATE INDEX idx_form_reviews_reviewer ON form_reviews(reviewer_id);
CREATE INDEX idx_form_reviews_status ON form_reviews(status);

CREATE TABLE review_actions (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    version_id INTEGER REFERENCES form_versions(id),
    performed_by_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('submit_for_review', 'request_changes', 'approve', 'reject', 'return_to_draft')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_review_actions_form_instance ON review_actions(form_instance_id);
CREATE INDEX idx_review_actions_performed_by ON review_actions(performed_by_id);
CREATE INDEX idx_review_actions_created_at ON review_actions(created_at DESC);

-- =============================================================================
-- COLLABORATION
-- =============================================================================

CREATE TABLE form_collaborators (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('editor', 'viewer', 'commenter')),
    section_assignments JSONB,
    added_by_id UUID REFERENCES users(id),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(form_instance_id, user_id)
);

CREATE INDEX idx_form_collaborators_form ON form_collaborators(form_instance_id);
CREATE INDEX idx_form_collaborators_user ON form_collaborators(user_id);

CREATE TABLE comment_threads (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    field_id VARCHAR(255),
    section_id VARCHAR(255),
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comment_threads_form ON comment_threads(form_instance_id);
CREATE INDEX idx_comment_threads_field ON comment_threads(field_id);
CREATE INDEX idx_comment_threads_is_resolved ON comment_threads(is_resolved);

CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES comments(id),
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_thread ON comments(thread_id);
CREATE INDEX idx_comments_author ON comments(author_id);

CREATE TABLE comment_mentions (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comment_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX idx_comment_mentions_user ON comment_mentions(mentioned_user_id);

CREATE TABLE editing_locks (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    section_id VARCHAR(255),
    locked_by_id UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_editing_locks_form ON editing_locks(form_instance_id);
CREATE INDEX idx_editing_locks_expires ON editing_locks(expires_at);

-- =============================================================================
-- AMENDMENTS (Post-Approval Changes)
-- =============================================================================

CREATE TABLE amendments (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    amendment_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    description TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    submitted_by_id UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_amendments_form ON amendments(form_instance_id);
CREATE INDEX idx_amendments_status ON amendments(status);

CREATE TABLE amendment_field_changes (
    id SERIAL PRIMARY KEY,
    amendment_id INTEGER NOT NULL REFERENCES amendments(id) ON DELETE CASCADE,
    field_id VARCHAR(255) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    justification TEXT
);

CREATE INDEX idx_amendment_changes_amendment ON amendment_field_changes(amendment_id);

-- =============================================================================
-- FILES
-- =============================================================================

CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    form_instance_id INTEGER REFERENCES form_instances(id),
    uploaded_by_id UUID NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    category VARCHAR(100) CHECK (category IN ('proposal', 'irb_document', 'consent_form', 'protocol', 'data', 'result', 'template', 'generated', 'other')),
    storage_path VARCHAR(500) NOT NULL,
    checksum VARCHAR(64),
    is_encrypted BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_form ON files(form_instance_id);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by_id);
CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_is_deleted ON files(is_deleted);

-- =============================================================================
-- TASKS
-- =============================================================================

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    form_instance_id INTEGER REFERENCES form_instances(id),
    assigned_to_id UUID REFERENCES users(id),
    created_by_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    task_type VARCHAR(100) CHECK (task_type IN ('document_upload', 'form_completion', 'review', 'approval', 'general')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_form ON tasks(form_instance_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL CHECK (type IN ('approval_request', 'status_change', 'comment', 'reminder', 'mention', 'task_assigned', 'system')),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- =============================================================================
-- HIPAA AUDIT LOGS (Append-Only)
-- =============================================================================

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL CHECK (action IN ('login', 'logout', 'login_failed', 'create', 'read', 'update', 'delete', 'download', 'upload', 'approve', 'reject', 'submit', 'export', 'password_change', 'password_reset')),
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    session_id VARCHAR(255),
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prevent updates and deletes on audit_logs
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_session ON audit_logs(session_id);

-- =============================================================================
-- EMAIL PREFERENCES
-- =============================================================================

CREATE TABLE email_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approval_requests BOOLEAN DEFAULT true,
    status_changes BOOLEAN DEFAULT true,
    comments BOOLEAN DEFAULT true,
    reminders BOOLEAN DEFAULT true,
    task_assignments BOOLEAN DEFAULT true,
    weekly_digest BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS FOR updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_form_instances_updated_at BEFORE UPDATE ON form_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_form_data_updated_at BEFORE UPDATE ON form_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_preferences_updated_at BEFORE UPDATE ON email_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- DEFAULT REVIEW STAGES
-- =============================================================================

INSERT INTO review_stages (code, name, description, sequence_order, default_deadline_days) VALUES
('initial_review', 'Initial Review', 'Initial review by assigned reviewer', 1, 7),
('department_review', 'Department Review', 'Review by department head', 2, 5),
('irb_review', 'IRB Board Review', 'Final review by IRB board', 3, 14);
