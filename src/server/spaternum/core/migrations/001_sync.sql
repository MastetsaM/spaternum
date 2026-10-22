-- Announces every write to a synced table on the 'sync' channel; the payload is the
-- table name. The SSE stream (events.py) forwards it so clients pull right away.
-- Each synced table adds:
--   CREATE TRIGGER <table>_notify AFTER INSERT OR UPDATE ON <table>
--       FOR EACH STATEMENT EXECUTE FUNCTION sync_notify();
CREATE FUNCTION sync_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('sync', TG_TABLE_NAME);
    RETURN NULL;
END;
$$;
