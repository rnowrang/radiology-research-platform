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
