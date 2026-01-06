# Complete Database Setup

## One-Time Setup

Run the **`supabase/complete_setup.sql`** file in Supabase SQL Editor **ONCE** to set up everything:

1. All tables
2. All functions (including `is_admin()`)
3. All triggers
4. All RLS policies

This file is idempotent - it's safe to run multiple times. It will:
- Create tables if they don't exist
- Drop and recreate all policies to ensure they're correct
- Ensure the `is_admin()` function works correctly

## What This Fixes

- ✅ Proper RLS policies for admin access
- ✅ Simplified `is_admin()` function that directly checks the `users` table
- ✅ All policies properly configured
- ✅ No need to manually run scripts in Supabase after initial setup

## After Running the Setup

1. Create your admin user (see `supabase/CREATE_ADMIN_GUIDE.md`)
2. The admin should now be able to see all employees regardless of cafe location
3. All RLS policies are properly configured

## Troubleshooting

If employees still don't show up:

1. Verify admin user exists and has `role = 'admin'`:
   ```sql
   SELECT id, name, email, role FROM public.users WHERE role = 'admin';
   ```

2. Test the `is_admin()` function:
   ```sql
   SELECT public.is_admin('YOUR_ADMIN_UUID'::uuid);
   ```
   Should return `true`.

3. Check console logs in the app - they will show detailed RLS debugging information.


