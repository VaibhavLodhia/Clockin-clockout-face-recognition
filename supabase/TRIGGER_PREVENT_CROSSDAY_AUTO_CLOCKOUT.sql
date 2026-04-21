-- =====================================================================
-- DB guard: make it impossible for auto clock-out rows to end up on a
-- different NY calendar day than their clock_in, or have clock_out
-- earlier than clock_in.
--
-- Only auto-verified rows are constrained. Manual admin edits are not
-- blocked, because an admin may intentionally record an unusual shift.
-- =====================================================================

CREATE OR REPLACE FUNCTION prevent_bad_auto_clockout()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.clock_out IS NOT NULL AND NEW.clock_out < NEW.clock_in THEN
        RAISE EXCEPTION
            'clock_out (%) cannot be before clock_in (%) for time_log %',
            NEW.clock_out, NEW.clock_in, NEW.id;
    END IF;

    IF NEW.verified_by = 'auto'
       AND NEW.clock_out IS NOT NULL
       AND (NEW.clock_out AT TIME ZONE 'America/New_York')::date
           <> (NEW.clock_in  AT TIME ZONE 'America/New_York')::date
    THEN
        RAISE EXCEPTION
            'Auto clock_out must be on the same America/New_York calendar day as clock_in (time_log %: clock_in=%, clock_out=%)',
            NEW.id, NEW.clock_in, NEW.clock_out;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_bad_auto_clockout ON time_logs;

CREATE TRIGGER trg_prevent_bad_auto_clockout
    BEFORE INSERT OR UPDATE ON time_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_bad_auto_clockout();
