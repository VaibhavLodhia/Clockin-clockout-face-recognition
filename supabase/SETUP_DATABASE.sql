-- ============================================================================
-- COMPLETE DATABASE SETUP - Run this ONCE in Supabase SQL Editor
-- This file sets up EVERYTHING: tables, functions, triggers, and ALL RLS policies
-- SAFE TO RUN MULTIPLE TIMES - It will drop and recreate everything correctly
--
-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Copy and paste this ENTIRE file
-- 3. Click "Run" (or press Ctrl+Enter)
-- 4. Verify no errors in the output
--
-- After running this, create an admin user (see README.md for details)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'admin')),
  cafe_location TEXT CHECK (cafe_location IN ('Hodge Hall', 'Read Cafe')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  disabled BOOLEAN DEFAULT FALSE
);

-- Face embeddings table
CREATE TABLE IF NOT EXISTS public.face_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  embedding JSONB NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'face_recognition_v1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Time logs table
CREATE TABLE IF NOT EXISTS public.time_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
  clock_out TIMESTAMP WITH TIME ZONE,
  work_cycle TEXT NOT NULL,
  verified_by TEXT NOT NULL CHECK (verified_by IN ('face', 'admin_code', 'admin_manual', 'auto')),
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  matched_employee_id UUID REFERENCES public.users(id),
  confidence_score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin codes table
CREATE TABLE IF NOT EXISTS public.admin_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_hash TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL CHECK (action IN ('signup', 'clock_in', 'clock_out')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES public.users(id),
  target_user UUID REFERENCES public.users(id),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON public.time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_work_cycle ON public.time_logs(work_cycle);
CREATE INDEX IF NOT EXISTS idx_time_logs_clock_in ON public.time_logs(clock_in);
CREATE INDEX IF NOT EXISTS idx_admin_codes_code_hash ON public.admin_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_admin_codes_expires_at ON public.admin_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_cafe_location ON public.users(cafe_location);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Helper function to check if user is admin (bypasses RLS using SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_admin_user BOOLEAN := false;
BEGIN
  SELECT (role = 'admin') INTO is_admin_user
  FROM public.users
  WHERE id = user_id;
  
  RETURN COALESCE(is_admin_user, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get current work cycle
CREATE OR REPLACE FUNCTION get_current_work_cycle()
RETURNS TEXT AS $$
DECLARE
  current_date DATE := CURRENT_DATE;
  current_year INTEGER := EXTRACT(YEAR FROM current_date);
  current_month INTEGER := EXTRACT(MONTH FROM current_date);
  cycle_start_year INTEGER;
  cycle_end_year INTEGER;
BEGIN
  IF current_month >= 8 THEN
    cycle_start_year := current_year;
    cycle_end_year := current_year + 1;
  ELSE
    cycle_start_year := current_year - 1;
    cycle_end_year := current_year;
  END IF;
  
  RETURN cycle_start_year || '-' || cycle_end_year;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_action TEXT,
  p_performed_by UUID,
  p_target_user UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (action, performed_by, target_user, metadata)
  VALUES (p_action, p_performed_by, p_target_user, p_metadata)
  RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically create user record when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, cafe_location)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'employee',
    CASE 
      WHEN NEW.raw_user_meta_data->>'cafe_location' IN ('Hodge Hall', 'Read Cafe') 
      THEN NEW.raw_user_meta_data->>'cafe_location'
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO UPDATE
  SET name = COALESCE(EXCLUDED.name, public.users.name),
      cafe_location = COALESCE(EXCLUDED.cafe_location, public.users.cafe_location);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - ENABLE ON ALL TABLES
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;
DROP POLICY IF EXISTS "Admins can delete any user" ON public.users;
DROP POLICY IF EXISTS "Allow user signup" ON public.users;

CREATE POLICY "Users can view their own data"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update any user"
  ON public.users FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete any user"
  ON public.users FOR DELETE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Allow user signup"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- FACE_EMBEDDINGS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own embeddings" ON public.face_embeddings;
DROP POLICY IF EXISTS "Admins can view all embeddings" ON public.face_embeddings;
DROP POLICY IF EXISTS "Users can insert their own embeddings" ON public.face_embeddings;
DROP POLICY IF EXISTS "Admins can update any embeddings" ON public.face_embeddings;
DROP POLICY IF EXISTS "Admins can delete any embeddings" ON public.face_embeddings;

CREATE POLICY "Users can view their own embeddings"
  ON public.face_embeddings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all embeddings"
  ON public.face_embeddings FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own embeddings"
  ON public.face_embeddings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update any embeddings"
  ON public.face_embeddings FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete any embeddings"
  ON public.face_embeddings FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- TIME_LOGS TABLE POLICIES - ALL OPERATIONS INCLUDED
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Admins can view all time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Users can insert their own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Admins can insert any time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Users can update their own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Admins can update any time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Admins can delete any time logs" ON public.time_logs;

CREATE POLICY "Users can view their own time logs"
  ON public.time_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all time logs"
  ON public.time_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own time logs"
  ON public.time_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can insert any time logs"
  ON public.time_logs FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can update their own time logs"
  ON public.time_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update any time logs"
  ON public.time_logs FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete any time logs"
  ON public.time_logs FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- ADMIN_CODES TABLE POLICIES - ALL OPERATIONS INCLUDED
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all admin codes" ON public.admin_codes;
DROP POLICY IF EXISTS "Admins can insert admin codes" ON public.admin_codes;
DROP POLICY IF EXISTS "Admins can update admin codes" ON public.admin_codes;
DROP POLICY IF EXISTS "Admins can delete admin codes" ON public.admin_codes;
DROP POLICY IF EXISTS "Users can validate admin codes" ON public.admin_codes;
DROP POLICY IF EXISTS "Users can mark admin codes as used" ON public.admin_codes;

CREATE POLICY "Admins can view all admin codes"
  ON public.admin_codes FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert admin codes"
  ON public.admin_codes FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update admin codes"
  ON public.admin_codes FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete admin codes"
  ON public.admin_codes FOR DELETE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can validate admin codes"
  ON public.admin_codes FOR SELECT
  USING (expires_at > NOW() AND used = false);

CREATE POLICY "Users can mark admin codes as used"
  ON public.admin_codes FOR UPDATE
  USING (expires_at > NOW() AND used = false)
  WITH CHECK (true);

-- ============================================================================
-- AUDIT_LOGS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can update audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can delete audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update audit logs"
  ON public.audit_logs FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete audit logs"
  ON public.audit_logs FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- VERIFICATION - Shows all policies created
-- ============================================================================

SELECT 
  '✅ SETUP COMPLETE' as status,
  COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public';

-- Show all policies by table
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

