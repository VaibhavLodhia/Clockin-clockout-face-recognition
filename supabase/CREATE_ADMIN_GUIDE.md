# How to Create an Admin User in Supabase

Follow these steps to create an admin user for your Employee Clock App.

## Method 1: Using Supabase Dashboard (Recommended)

### Step 1: Create User in Authentication

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add User"** or **"Create User"**
4. Fill in:
   - **Email**: `admin@yourcompany.com` (or your preferred admin email)
   - **Password**: Choose a strong password
   - **Auto Confirm User**: ✅ Check this box (so they can login immediately)
5. Click **"Create User"**
6. **IMPORTANT**: Copy the **User UUID** (it looks like: `123e4567-e89b-12d3-a456-426614174000`)

### Step 2: Set Admin Role in Database

1. Go to **SQL Editor** in Supabase Dashboard
2. Click **"New Query"**
3. Copy and paste this SQL (replace the values):

```sql
-- Replace these values:
-- YOUR_ADMIN_UUID: The UUID you copied from Step 1
-- Admin Name: The admin's full name
-- admin@yourcompany.com: The email you used in Step 1

INSERT INTO public.users (id, name, email, role)
VALUES (
  'YOUR_ADMIN_UUID',  -- Paste the UUID from Step 1 here
  'Admin Name',       -- Replace with admin's name
  'admin@yourcompany.com', -- Replace with admin's email
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET role = 'admin';
```

4. Click **"Run"** to execute the query

### Step 3: Verify Admin User

Run this query to verify the admin was created:

```sql
SELECT id, name, email, role, created_at 
FROM public.users 
WHERE role = 'admin';
```

You should see your admin user listed.

## Method 2: All-in-One SQL Script (Alternative)

If you prefer to do everything in SQL, you can use this script:

```sql
-- Step 1: Create auth user (requires service_role key or manual creation first)
-- Note: This requires the Supabase service_role key which is sensitive
-- It's safer to create the user via Dashboard (Method 1)

-- Step 2: After creating auth user, get the UUID and run:
INSERT INTO public.users (id, name, email, role)
VALUES (
  'YOUR_ADMIN_UUID',  -- Replace with actual UUID
  'Admin Name',       -- Replace with admin's name
  'admin@yourcompany.com', -- Replace with admin's email
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET role = 'admin',
    name = EXCLUDED.name,
    email = EXCLUDED.email;
```

## Method 3: Convert Existing User to Admin

If you already have a user and want to make them admin:

1. Find their UUID:
   ```sql
   SELECT id, name, email 
   FROM public.users 
   WHERE email = 'user@example.com';
   ```

2. Update their role:
   ```sql
   UPDATE public.users
   SET role = 'admin'
   WHERE email = 'user@example.com';
   ```

## Testing Admin Access

1. Open your app
2. Login with the admin credentials:
   - Email: The email you used
   - Password: The password you set
3. You should be redirected to the **Admin Dashboard** (`/admin`)

## Troubleshooting

### Admin can't access dashboard
- Verify the role is set correctly: `SELECT role FROM public.users WHERE email = 'admin@example.com';`
- Check if user is disabled: `SELECT disabled FROM public.users WHERE email = 'admin@example.com';`
- Make sure you're using the correct email/password

### User not found after creating auth user
- Wait a few seconds (the trigger might need time)
- Check if the trigger exists: The `handle_new_user()` trigger should auto-create the user record
- Manually insert if needed using the SQL from Step 2

### Permission errors
- Make sure RLS policies are set up correctly (run `schema.sql` if not done)
- Verify the `is_admin()` function exists and works

## Security Notes

- **Never share admin credentials**
- Use strong passwords
- Consider enabling 2FA for admin accounts
- Regularly audit admin users: `SELECT * FROM public.users WHERE role = 'admin';`


