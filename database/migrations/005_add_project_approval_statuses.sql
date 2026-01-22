-- Migration: Add approval workflow statuses to projects table
-- Adds pending_approval, approved, rejected, and needs_changes to the status constraint

-- Drop the existing constraint
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- Add the new constraint with additional statuses for approval workflow
ALTER TABLE projects ADD CONSTRAINT projects_status_check
    CHECK (status IN (
        'draft',
        'pending_approval',
        'approved',
        'rejected',
        'needs_changes',
        'active',
        'completed',
        'archived'
    ));

COMMENT ON COLUMN projects.status IS 'Project status: draft, pending_approval, approved, rejected, needs_changes, active, completed, archived';
