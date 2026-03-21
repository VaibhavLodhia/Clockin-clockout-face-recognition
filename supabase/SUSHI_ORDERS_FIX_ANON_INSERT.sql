-- Run this in Supabase SQL Editor if orders from the website never appear in the dashboard.
-- The original policy may not apply to the `anon` role used by the Sushi King API.

DROP POLICY IF EXISTS "Allow public insert sushi_orders" ON public.sushi_orders;

CREATE POLICY "Allow anon insert sushi_orders"
  ON public.sushi_orders
  FOR INSERT
  TO anon
  WITH CHECK (true);
