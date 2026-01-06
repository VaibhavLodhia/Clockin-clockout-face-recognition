# Database Setup Instructions

## ONE-TIME SETUP - NO MORE RLS ISSUES

**You only need to run ONE file ONCE to set up EVERYTHING:**

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the ENTIRE contents of `supabase/SETUP_DATABASE.sql`
3. Click "Run"
4. Done! ✅

**This file includes ALL RLS policies for ALL operations. After running this, you will NEVER need to run any other SQL queries.**

## What This Does

This single file sets up:
- ✅ All database tables
- ✅ All functions (is_admin, work_cycle, audit logging)
- ✅ All triggers (auto-create user records)
- ✅ **ALL RLS policies** (including admin permissions for everything)
- ✅ All indexes

## Important Notes

- **Safe to run multiple times** - It will drop and recreate policies correctly
- **RLS is REQUIRED** - Supabase uses Row Level Security by default. This is a security feature, not a bug. You cannot disable it, but this file configures it correctly.
- **After running this file, all admin buttons will work** - Clock In, Clock Out, Add Time, Edit Time, Delete Time

## Creating Admin Users

After running `SETUP_DATABASE.sql`, create an admin user:

1. Go to Supabase Dashboard → Authentication → Users → Add User
2. Create a user with email and password
3. Copy the user's UUID
4. Run `supabase/create_admin.sql` (replace UUID and details in the file)

## Troubleshooting

If you get any RLS errors after running this:
1. Make sure you ran the ENTIRE file (all 300+ lines)
2. Check that you're logged in as an admin user
3. Verify your user has `role = 'admin'` in the `users` table

## For Client Handoff

Give your client:
1. This README file
2. The `supabase/SETUP_DATABASE.sql` file
3. The `supabase/create_admin.sql` file (for creating admin users)
4. Instructions: "Run SETUP_DATABASE.sql once in Supabase SQL Editor"

That's it! Only 2 SQL files needed.

