-- ============================================================================
-- CREATE ADMIN USER
-- Run this AFTER running SETUP_DATABASE.sql
-- ============================================================================
--
-- STEP 1: Create user in Supabase Auth Dashboard
--   1. Go to Authentication > Users > Add User
--   2. Set email and password
--   3. Check "Auto Confirm User"
--   4. Copy the user's UUID (looks like: 123e4567-e89b-12d3-a456-426614174000)
--
-- STEP 2: Run this SQL (replace the values below)
--   Replace 'YOUR_ADMIN_UUID' with the UUID from Step 1
--   Replace 'Admin Name' with the admin's name
--   Replace 'admin@example.com' with the admin's email
-- ============================================================================

INSERT INTO public.users (id, name, email, role)
VALUES (
  'YOUR_ADMIN_UUID',        -- ⚠️ Replace with UUID from Step 1
  'Admin Name',             -- ⚠️ Replace with admin's name
  'admin@example.com',     -- ⚠️ Replace with admin's email
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET role = 'admin';

-- Verify admin was created:
-- SELECT id, name, email, role FROM public.users WHERE role = 'admin';










