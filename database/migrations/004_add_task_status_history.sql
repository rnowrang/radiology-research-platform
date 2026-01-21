-- Migration: Add task_status_history table
-- This table tracks status changes for tasks to provide an audit trail

CREATE TABLE IF NOT EXISTS task_status_history (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    performed_by_id UUID REFERENCES users(id),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient lookup by task_id
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);

-- Index for chronological ordering
CREATE INDEX IF NOT EXISTS idx_task_status_history_created_at ON task_status_history(created_at);

-- Add task_id column to files table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'files' AND column_name = 'task_id'
    ) THEN
        ALTER TABLE files ADD COLUMN task_id INTEGER REFERENCES tasks(id);
        CREATE INDEX idx_files_task ON files(task_id);
    END IF;
END $$;

COMMENT ON TABLE task_status_history IS 'Tracks task status changes for audit trail';
COMMENT ON COLUMN task_status_history.task_id IS 'Reference to the task';
COMMENT ON COLUMN task_status_history.status IS 'The status that was set';
COMMENT ON COLUMN task_status_history.performed_by_id IS 'User who performed the status change';
COMMENT ON COLUMN task_status_history.comments IS 'Optional comments explaining the status change';
COMMENT ON COLUMN task_status_history.created_at IS 'When the status change occurred';
