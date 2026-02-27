-- Add unique constraint to prevent duplicate workstream assignments per user
ALTER TABLE user_workstreams 
ADD CONSTRAINT user_workstreams_user_workstream_unique 
UNIQUE (user_id, workstream_id);