-- =====================================================================
-- One-time cleanup migration: fix rows whose auto clock_out ended up on a
-- different NY calendar day than their clock_in.
--
-- Cause: prior versions of the auto-clockout edge functions stamped
-- clock_out = now() instead of computing the correct cutoff on clock_in's
-- own NY date. When a scheduled run was missed, the following successful
-- run closed the stale open log with the *later* day's timestamp,
-- inflating totals by ~24h per bad row.
--
-- Fix: for every affected row, rewrite clock_out to the correct cutoff
-- on clock_in's NY date, based on work_location (or the user's home
-- cafe_location if work_location is NULL on a legacy row):
--     Hodge Hall, Mon-Thu -> 19:30 America/New_York
--     Hodge Hall, Fri     -> 15:30 America/New_York
--     Hodge Hall, Sat/Sun -> leave as-is (Hodge does not auto-close on weekends)
--     Read Cafe, any day  -> 20:30 America/New_York
--
-- Only rows with verified_by = 'auto' are touched. Manually edited rows
-- (verified_by in 'face', 'admin_code', 'admin', 'manual', etc.) are left
-- untouched.
--
-- Run inside a transaction. Review the preview SELECTs before COMMIT.
-- =====================================================================

BEGIN;

-- Candidate rows: auto-verified, closed, and clock_out is on a different
-- NY calendar day than clock_in.
WITH candidates AS (
    SELECT
        t.id,
        t.user_id,
        t.clock_in,
        t.clock_out AS old_clock_out,
        COALESCE(t.work_location, u.cafe_location) AS cafe,
        (t.clock_in AT TIME ZONE 'America/New_York')::date          AS ci_ny_date,
        EXTRACT(ISODOW FROM (t.clock_in AT TIME ZONE 'America/New_York'))::int AS ci_ny_dow
    FROM time_logs t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.verified_by = 'auto'
      AND t.clock_out IS NOT NULL
      AND (t.clock_out AT TIME ZONE 'America/New_York')::date
          <> (t.clock_in  AT TIME ZONE 'America/New_York')::date
),
with_cutoff AS (
    SELECT
        c.*,
        CASE
            WHEN c.cafe = 'Hodge Hall' AND c.ci_ny_dow BETWEEN 1 AND 4
                THEN ((c.ci_ny_date + TIME '19:30') AT TIME ZONE 'America/New_York')
            WHEN c.cafe = 'Hodge Hall' AND c.ci_ny_dow = 5
                THEN ((c.ci_ny_date + TIME '15:30') AT TIME ZONE 'America/New_York')
            WHEN c.cafe = 'Read Cafe'
                THEN ((c.ci_ny_date + TIME '20:30') AT TIME ZONE 'America/New_York')
            ELSE NULL  -- Hodge weekends / unknown cafe: skip
        END AS new_clock_out
    FROM candidates c
)
SELECT
    id,
    user_id,
    cafe,
    ci_ny_date,
    ci_ny_dow,
    clock_in,
    old_clock_out,
    new_clock_out,
    (old_clock_out - clock_in) AS old_duration,
    (new_clock_out - clock_in) AS new_duration,
    CASE WHEN new_clock_out IS NULL THEN 'SKIP (weekend/unknown cafe)' ELSE 'WILL UPDATE' END AS action
FROM with_cutoff
ORDER BY cafe, ci_ny_date, user_id;

-- ---------------------------------------------------------------------
-- Review the output above. If it looks right, run the UPDATE below.
-- If not, ROLLBACK.
-- ---------------------------------------------------------------------

WITH candidates AS (
    SELECT
        t.id,
        COALESCE(t.work_location, u.cafe_location) AS cafe,
        (t.clock_in AT TIME ZONE 'America/New_York')::date          AS ci_ny_date,
        EXTRACT(ISODOW FROM (t.clock_in AT TIME ZONE 'America/New_York'))::int AS ci_ny_dow
    FROM time_logs t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.verified_by = 'auto'
      AND t.clock_out IS NOT NULL
      AND (t.clock_out AT TIME ZONE 'America/New_York')::date
          <> (t.clock_in  AT TIME ZONE 'America/New_York')::date
),
with_cutoff AS (
    SELECT
        c.id,
        CASE
            WHEN c.cafe = 'Hodge Hall' AND c.ci_ny_dow BETWEEN 1 AND 4
                THEN ((c.ci_ny_date + TIME '19:30') AT TIME ZONE 'America/New_York')
            WHEN c.cafe = 'Hodge Hall' AND c.ci_ny_dow = 5
                THEN ((c.ci_ny_date + TIME '15:30') AT TIME ZONE 'America/New_York')
            WHEN c.cafe = 'Read Cafe'
                THEN ((c.ci_ny_date + TIME '20:30') AT TIME ZONE 'America/New_York')
            ELSE NULL
        END AS new_clock_out
    FROM candidates c
)
UPDATE time_logs t
SET clock_out = w.new_clock_out
FROM with_cutoff w
WHERE t.id = w.id
  AND w.new_clock_out IS NOT NULL
  AND w.new_clock_out > t.clock_in;  -- sanity: cutoff must be after clock_in

-- Verify nothing cross-day remains (other than intentionally skipped rows)
SELECT
    COUNT(*) AS remaining_crossday_auto_rows
FROM time_logs t
WHERE t.verified_by = 'auto'
  AND t.clock_out IS NOT NULL
  AND (t.clock_out AT TIME ZONE 'America/New_York')::date
      <> (t.clock_in  AT TIME ZONE 'America/New_York')::date;

-- If the count above is 0 (or equals only the intentionally skipped
-- Hodge weekend rows you saw in the preview), run:  COMMIT;
-- Otherwise:  ROLLBACK;
COMMIT;
