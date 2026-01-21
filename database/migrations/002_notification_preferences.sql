-- Migration: 002_notification_preferences
-- Description: Create notification_preferences table for user notification settings
-- Created: 2026-01-20

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, notification_type)
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id
ON notification_preferences(user_id);

-- Create index for notification_type queries
CREATE INDEX IF NOT EXISTS idx_notification_preferences_type
ON notification_preferences(notification_type);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trigger_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Insert default preferences for existing users (all notification types enabled)
-- Notification types: approval_request, status_change, comment, task_assigned, mention, reminder
INSERT INTO notification_preferences (user_id, notification_type, in_app_enabled, email_enabled)
SELECT
    u.id,
    nt.type,
    true,
    true
FROM users u
CROSS JOIN (
    SELECT unnest(ARRAY[
        'approval_request',
        'status_change',
        'comment',
        'task_assigned',
        'mention',
        'reminder'
    ]) AS type
) nt
ON CONFLICT (user_id, notification_type) DO NOTHING;

-- Comment: To rollback this migration, run:
-- DROP TABLE IF EXISTS notification_preferences CASCADE;
-- DROP FUNCTION IF EXISTS update_notification_preferences_updated_at() CASCADE;
