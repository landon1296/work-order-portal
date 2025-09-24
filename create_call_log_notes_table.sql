-- Create call_log_notes table for storing multiple notes per call log
CREATE TABLE IF NOT EXISTS call_log_notes (
    id SERIAL PRIMARY KEY,
    call_log_id INTEGER NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_call_log_notes_call_log_id ON call_log_notes(call_log_id);
CREATE INDEX IF NOT EXISTS idx_call_log_notes_created_at ON call_log_notes(created_at);
