-- Migration: 003_update_files_category_constraint
-- Description: Update the files table category check constraint to include all application categories
-- Created: 2026-01-20

-- Drop the existing check constraint
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_category_check;

-- Add the updated check constraint with all categories used by the application
-- Categories from fileService.ts: proposal, abstract, protocol, consent_form, citi_certificate,
-- funding, data_management, irb_document, data, result, other
-- Plus categories from schema: template, generated
ALTER TABLE files ADD CONSTRAINT files_category_check
CHECK (category IN (
    'proposal',
    'abstract',
    'protocol',
    'consent_form',
    'citi_certificate',
    'funding',
    'data_management',
    'irb_document',
    'data',
    'result',
    'template',
    'generated',
    'other'
));

-- Comment: To rollback this migration, run:
-- ALTER TABLE files DROP CONSTRAINT IF EXISTS files_category_check;
-- ALTER TABLE files ADD CONSTRAINT files_category_check
--     CHECK (category IN ('proposal', 'irb_document', 'consent_form', 'protocol', 'data', 'result', 'template', 'generated', 'other'));
