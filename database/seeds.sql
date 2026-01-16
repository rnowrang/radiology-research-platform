-- Radiology Research Platform - Seed Data
-- This file creates initial test data for development

-- =============================================================================
-- TEST USERS
-- =============================================================================

-- Password for all test users: password123 (bcrypt hashed)
-- Hash generated with bcrypt, 12 rounds

INSERT INTO users (id, email, password_hash, full_name, role, is_active, email_verified) VALUES
-- Admin user
('a0000000-0000-0000-0000-000000000001', 'admin@example.com', '$2b$12$Au6IV6e2oJVgnWuzgh1JCOCfP59EFXBazBI0.b/KVQcIyEh2lOvfS', 'Admin User', 'admin', true, true),
-- Reviewer user
('a0000000-0000-0000-0000-000000000002', 'reviewer@example.com', '$2b$12$Au6IV6e2oJVgnWuzgh1JCOCfP59EFXBazBI0.b/KVQcIyEh2lOvfS', 'Jane Reviewer', 'reviewer', true, true),
-- Researcher users
('a0000000-0000-0000-0000-000000000003', 'researcher@example.com', '$2b$12$Au6IV6e2oJVgnWuzgh1JCOCfP59EFXBazBI0.b/KVQcIyEh2lOvfS', 'John Researcher', 'researcher', true, true),
('a0000000-0000-0000-0000-000000000004', 'researcher2@example.com', '$2b$12$Au6IV6e2oJVgnWuzgh1JCOCfP59EFXBazBI0.b/KVQcIyEh2lOvfS', 'Sarah Scientist', 'researcher', true, true);

-- =============================================================================
-- EMAIL PREFERENCES
-- =============================================================================

INSERT INTO email_preferences (user_id, approval_requests, status_changes, comments, reminders, task_assignments) VALUES
('a0000000-0000-0000-0000-000000000001', true, true, true, true, true),
('a0000000-0000-0000-0000-000000000002', true, true, true, true, true),
('a0000000-0000-0000-0000-000000000003', true, true, true, true, true),
('a0000000-0000-0000-0000-000000000004', true, true, true, true, true);

-- =============================================================================
-- SAMPLE PROJECTS
-- =============================================================================

INSERT INTO projects (id, title, description, project_type, department, principal_investigator_id, status, start_date, end_date) VALUES
('b0000000-0000-0000-0000-000000000001', 'MRI Brain Imaging Study', 'A comprehensive study on brain imaging patterns using advanced MRI techniques', 'prospective', 'Radiology', 'a0000000-0000-0000-0000-000000000003', 'active', '2024-01-01', '2025-12-31'),
('b0000000-0000-0000-0000-000000000002', 'Retrospective Cancer Imaging Analysis', 'Analysis of historical cancer imaging data for pattern recognition', 'retrospective', 'Oncology', 'a0000000-0000-0000-0000-000000000004', 'draft', '2024-06-01', '2025-06-30');

-- =============================================================================
-- PROJECT COLLABORATORS
-- =============================================================================

INSERT INTO project_collaborators (project_id, user_id, role) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'co_investigator');

-- =============================================================================
-- SAMPLE TEMPLATES (will be populated by seed script with actual schemas)
-- =============================================================================

-- These are placeholder templates - actual schemas will be loaded from JSON files
INSERT INTO templates (name, description, version, original_file_name, schema, is_active, is_published) VALUES
('IRB Application - Standard', 'Standard IRB application for research studies involving drugs, biologics, devices, or greater than minimal risk procedures.', '1.0', 'irb-application-standard.docx', '{"sections": [], "fields": [], "rules": []}'::jsonb, true, true),
('IRB Application for Minimal Risk Studies', 'Application for minimal risk research studies including surveys, interviews, and observational studies.', '1.0', 'irb-application-minimal-risk.docx', '{"sections": [], "fields": [], "rules": []}'::jsonb, true, true),
('IRB Application for Anonymous Survey', 'Application for research involving anonymous surveys with minimal risk.', '1.0', 'irb-anonymous-survey.docx', '{"sections": [], "fields": [], "rules": []}'::jsonb, true, true),
('IRB Application for Archival/Retrospective Research', 'Application for research using existing archived or retrospective data.', '1.0', 'irb-archival-retrospective.docx', '{"sections": [], "fields": [], "rules": []}'::jsonb, true, true);

-- =============================================================================
-- TASK DEFINITIONS
-- =============================================================================

INSERT INTO task_definitions (id, name, description, task_type, template_id, file_category, auto_submit, default_required, display_order, is_active) VALUES
-- Form completion tasks
(1, 'Submit IRB Application', 'Complete and submit the IRB application form for your research study', 'form_completion', 1, NULL, false, true, 1, true),
-- Document upload tasks
(2, 'Upload Research Proposal', 'Upload your detailed research proposal document', 'document_upload', NULL, 'proposal', false, true, 2, true),
(3, 'Upload Study Abstract', 'Upload a brief abstract summarizing your research study', 'document_upload', NULL, 'abstract', false, true, 3, true),
(4, 'Upload Study Protocol', 'Upload the detailed study protocol document', 'document_upload', NULL, 'protocol', false, true, 4, true),
(5, 'Upload Consent Form', 'Upload the informed consent form for study participants', 'document_upload', NULL, 'consent_form', false, true, 5, true),
-- Approval tasks
(6, 'IRB Committee Review', 'IRB committee review and approval required', 'approval_required', NULL, NULL, false, true, 6, true),
(7, 'Department Chair Approval', 'Obtain approval from department chair', 'approval_required', NULL, NULL, false, true, 7, true),
-- Additional document upload tasks
(8, 'Upload CITI Training Certificate', 'Upload your CITI training completion certificate', 'document_upload', NULL, 'citi_certificate', false, true, 8, true),
(9, 'Upload Funding Documentation', 'Upload funding documentation or grant information', 'document_upload', NULL, 'funding', false, false, 9, true),
(10, 'Upload Data Management Plan', 'Upload your data management plan document', 'document_upload', NULL, 'data_management', false, true, 10, true);

-- =============================================================================
-- PROJECT TYPE TASK MAPPINGS
-- =============================================================================

-- Retrospective studies: IRB App, Proposal, Abstract, Protocol, Data Mgmt Plan
INSERT INTO project_type_task_mappings (project_type, task_definition_id, is_required, display_order) VALUES
('retrospective', 1, true, 1),   -- Submit IRB Application
('retrospective', 2, true, 2),   -- Upload Research Proposal
('retrospective', 3, true, 3),   -- Upload Study Abstract
('retrospective', 4, true, 4),   -- Upload Study Protocol
('retrospective', 10, true, 5);  -- Upload Data Management Plan

-- Prospective studies: IRB App, Proposal, Abstract, Protocol, Consent Form, CITI Training
INSERT INTO project_type_task_mappings (project_type, task_definition_id, is_required, display_order) VALUES
('prospective', 1, true, 1),     -- Submit IRB Application
('prospective', 2, true, 2),     -- Upload Research Proposal
('prospective', 3, true, 3),     -- Upload Study Abstract
('prospective', 4, true, 4),     -- Upload Study Protocol
('prospective', 5, true, 5),     -- Upload Consent Form
('prospective', 8, true, 6);     -- Upload CITI Training Certificate

-- Clinical trials: IRB App, Proposal, Abstract, Protocol, Consent Form, CITI Training, Funding, IRB Review, Dept Chair Approval
INSERT INTO project_type_task_mappings (project_type, task_definition_id, is_required, display_order) VALUES
('clinical_trial', 1, true, 1),  -- Submit IRB Application
('clinical_trial', 2, true, 2),  -- Upload Research Proposal
('clinical_trial', 3, true, 3),  -- Upload Study Abstract
('clinical_trial', 4, true, 4),  -- Upload Study Protocol
('clinical_trial', 5, true, 5),  -- Upload Consent Form
('clinical_trial', 8, true, 6),  -- Upload CITI Training Certificate
('clinical_trial', 9, false, 7), -- Upload Funding Documentation (optional)
('clinical_trial', 6, true, 8),  -- IRB Committee Review
('clinical_trial', 7, true, 9);  -- Department Chair Approval

-- Quality improvement: Proposal, Abstract, Protocol, Dept Chair Approval
INSERT INTO project_type_task_mappings (project_type, task_definition_id, is_required, display_order) VALUES
('quality_improvement', 2, true, 1),  -- Upload Research Proposal
('quality_improvement', 3, true, 2),  -- Upload Study Abstract
('quality_improvement', 4, true, 3),  -- Upload Study Protocol
('quality_improvement', 7, true, 4);  -- Department Chair Approval

-- Educational research: IRB App, Proposal, Abstract, Consent Form
INSERT INTO project_type_task_mappings (project_type, task_definition_id, is_required, display_order) VALUES
('educational_research', 1, true, 1),  -- Submit IRB Application
('educational_research', 2, true, 2),  -- Upload Research Proposal
('educational_research', 3, true, 3),  -- Upload Study Abstract
('educational_research', 5, true, 4);  -- Upload Consent Form

-- Other projects: Proposal, Abstract
INSERT INTO project_type_task_mappings (project_type, task_definition_id, is_required, display_order) VALUES
('other', 2, true, 1),  -- Upload Research Proposal
('other', 3, true, 2);  -- Upload Study Abstract

-- =============================================================================
-- NOTES
-- =============================================================================
--
-- Default credentials:
--   Admin:      admin@example.com / password123
--   Reviewer:   reviewer@example.com / password123
--   Researcher: researcher@example.com / password123
--   Researcher: researcher2@example.com / password123
--
-- The actual JSON schemas will be loaded by the seed script from:
--   forms-service/app/data/schemas/*.json
--
