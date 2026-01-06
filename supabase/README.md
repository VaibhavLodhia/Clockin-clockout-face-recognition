# Supabase Database Setup Guide

This guide will help you set up the complete database for the Employee Clock App on a **new Supabase project**.

## 📋 Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- Access to the Supabase SQL Editor
- Admin access to your Supabase project

## 🚀 Quick Start (3 Steps)

### Step 1: Run the Main Setup Script

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Click **"New Query"**
4. Copy and paste the **entire contents** of `SETUP_DATABASE.sql`
5. Click **"Run"** (or press `Ctrl+Enter`)

**That's it!** This single script sets up:
- ✅ All database tables
- ✅ All functions (is_admin, get_current_work_cycle, etc.)
- ✅ All triggers (auto-create user records)
- ✅ All RLS (Row Level Security) policies
- ✅ All indexes for performance

**Note:** This script is **idempotent** - you can run it multiple times safely. It will drop and recreate everything correctly.

### Step 2: Create Your First Admin User

After running `SETUP_DATABASE.sql`, create an admin user:

1. Go to **Authentication** → **Users** in Supabase Dashboard
2. Click **"Add User"** or **"Create User"**
3. Fill in:
   - **Email**: Your admin email (e.g., `admin@yourcompany.com`)
   - **Password**: Choose a strong password
   - **Auto Confirm User**: ✅ Check this box
4. Click **"Create User"**
5. **Copy the User UUID** (looks like: `123e4567-e89b-12d3-a456-426614174000`)

6. Go back to **SQL Editor** and run:

```sql
-- Replace these values with your actual admin details:
INSERT INTO public.users (id, name, email, role)
VALUES (
  'YOUR_ADMIN_UUID',        -- Paste the UUID from step 5
  'Admin Name',              -- Replace with admin's name
  'admin@yourcompany.com',  -- Replace with admin's email
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET role = 'admin';
```

7. Verify the admin was created:

```sql
SELECT id, name, email, role 
FROM public.users 
WHERE role = 'admin';
```

### Step 3: Configure Environment Variables

In your app's `.env` file (or environment variables), set:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

You can find these in: **Supabase Dashboard** → **Settings** → **API**

## 📁 File Structure

```
supabase/
├── SETUP_DATABASE.sql          # ⭐ MAIN SETUP FILE - Run this first!
├── create_admin.sql            # Simple template for creating admin users
├── CREATE_ADMIN_GUIDE.md       # Detailed guide for creating admin users
└── README.md                   # This file
```

## 🔍 What Gets Created

### Tables
- `users` - Employee and admin user data
- `face_embeddings` - Face recognition data (JSONB format)
- `time_logs` - Clock in/out records
- `admin_codes` - Temporary bypass codes
- `audit_logs` - System audit trail

### Functions
- `is_admin(user_id)` - Check if user is admin
- `get_current_work_cycle()` - Get current work cycle (e.g., "2024-2025")
- `log_audit_event(...)` - Log audit events
- `handle_new_user()` - Auto-create user records on signup

### RLS Policies
All tables have Row Level Security (RLS) enabled with policies for:
- **Employees**: Can only view/edit their own data
- **Admins**: Can view/edit all data
- **System**: Can insert audit logs

## 🧪 Testing the Setup

After setup, test that everything works:

1. **Test Admin Access:**
   ```sql
   SELECT public.is_admin('YOUR_ADMIN_UUID');
   -- Should return: true
   ```

2. **Test RLS Policies:**
   ```sql
   -- As admin, you should be able to see all users
   SELECT COUNT(*) FROM public.users;
   ```

3. **Test Functions:**
   ```sql
   SELECT get_current_work_cycle();
   -- Should return current cycle like "2024-2025"
   ```

## 🔧 Troubleshooting

### "Permission denied" or RLS errors

If you see RLS errors after setup:

1. **Verify you ran `SETUP_DATABASE.sql` completely** - Check the output for any errors
2. **Check if policies exist:**
   ```sql
   SELECT tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'public';
   ```
   You should see multiple policies listed.

3. **Re-run `SETUP_DATABASE.sql`** - It's safe to run multiple times

### Admin can't access dashboard

1. **Verify admin role:**
   ```sql
   SELECT role FROM public.users WHERE email = 'admin@example.com';
   -- Should return: admin
   ```

2. **Check if user is disabled:**
   ```sql
   SELECT disabled FROM public.users WHERE email = 'admin@example.com';
   -- Should return: false
   ```

3. **Verify is_admin function:**
   ```sql
   SELECT public.is_admin('YOUR_ADMIN_UUID');
   -- Should return: true
   ```

### User not created after signup

The `handle_new_user()` trigger should auto-create user records. If it doesn't:

1. **Check if trigger exists:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```

2. **Manually create user record** (if needed):
   ```sql
   INSERT INTO public.users (id, name, email, role)
   VALUES (
     'USER_UUID_FROM_AUTH',
     'User Name',
     'user@example.com',
     'employee'
   );
   ```

## 📝 Additional Notes

### Work Cycle
- Work cycles run from **August 1 to July 31**
- Format: `YYYY-YYYY` (e.g., "2024-2025")
- Current cycle is calculated automatically

### Face Embeddings
- Stored as JSONB (array of arrays)
- Each user can have up to 4 embeddings
- Format: `[[128 numbers], [128 numbers], [128 numbers], [128 numbers]]`

### Admin Codes
- Generated by admins for bypassing face recognition
- Valid for 5 minutes
- Can only be used once
- Automatically cleaned up after expiration

## 🔐 Security Best Practices

1. **Never commit** `.env` files with real keys
2. **Use strong passwords** for admin accounts
3. **Enable 2FA** for Supabase dashboard access
4. **Regularly audit** admin users:
   ```sql
   SELECT * FROM public.users WHERE role = 'admin';
   ```
5. **Review audit logs** periodically:
   ```sql
   SELECT * FROM public.audit_logs 
   ORDER BY created_at DESC 
   LIMIT 100;
   ```

## 🆘 Need Help?

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Review the SQL output for error messages
3. Verify all steps were completed in order
4. Check Supabase logs: **Dashboard** → **Logs** → **Postgres Logs**

## ✅ Verification Checklist

After setup, verify:

- [ ] `SETUP_DATABASE.sql` ran without errors
- [ ] All tables exist (check in **Table Editor**)
- [ ] Admin user created and can login
- [ ] `is_admin()` function returns `true` for admin
- [ ] RLS policies are active (check in **Authentication** → **Policies**)
- [ ] Environment variables are set correctly
- [ ] App can connect to Supabase

---

**Ready to go!** Your database is now set up and ready for the Employee Clock App. 🎉


