# Quick Start Guide - Supabase Setup

## For New Supabase Projects

### Step 1: Run Setup Script (5 minutes)

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy **entire** `SETUP_DATABASE.sql` file
3. Paste and click **"Run"**
4. ✅ Done! All tables, functions, and RLS policies are created

### Step 2: Create Admin User (2 minutes)

1. Go to **Authentication** → **Users** → **Add User**
2. Create user with email/password
3. Copy the **User UUID**
4. Run `create_admin.sql` (replace UUID and details)
5. ✅ Admin user created!

### Step 3: Set Environment Variables

Add to your `.env` file:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Files You Need

- ✅ `SETUP_DATABASE.sql` - **Run this first!**
- ✅ `create_admin.sql` - For creating admin users
- 📖 `README.md` - Full documentation
- 📖 `CREATE_ADMIN_GUIDE.md` - Detailed admin creation guide

## That's It!

Your database is ready. The app will work for both employees and admins.

---

**Need help?** See `README.md` for troubleshooting.


