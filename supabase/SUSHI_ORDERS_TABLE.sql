-- ============================================================================
-- SUSHI ORDERS TABLE - Orders from Sushi King website (bulk order form)
-- Run this in the SAME Supabase project used by the clockin-out admin dashboard.
-- Then add SUSHI_ORDERS_SUPABASE_URL and SUSHI_ORDERS_SUPABASE_ANON_KEY
-- (same as your clockin-out Supabase) to the Sushi King website .env.local
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sushi_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sushi_orders ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (Sushi King website uses anon key to submit orders)
CREATE POLICY "Allow public insert sushi_orders"
  ON public.sushi_orders FOR INSERT WITH CHECK (true);

-- Allow authenticated users to read (admin dashboard)
CREATE POLICY "Allow authenticated read sushi_orders"
  ON public.sushi_orders FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to delete delivered orders (admin dashboard)
CREATE POLICY "Allow authenticated delete sushi_orders"
  ON public.sushi_orders FOR DELETE TO authenticated USING (true);
