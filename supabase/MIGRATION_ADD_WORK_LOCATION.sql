-- ============================================================================
-- MIGRATION: Add work_location to time_logs table
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add work_location column to time_logs (if it doesn't exist)
ALTER TABLE public.time_logs 
ADD COLUMN IF NOT EXISTS work_location TEXT CHECK (work_location IN ('Hodge Hall', 'Read Cafe'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_time_logs_work_location ON public.time_logs(work_location);

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'time_logs' 
  AND column_name = 'work_location';
