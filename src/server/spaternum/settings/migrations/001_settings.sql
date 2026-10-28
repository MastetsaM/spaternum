-- Small settings that follow Mihail across devices, one row per key; value is JSON as text.
-- Spec: planning/specs/favorites_spec.md

CREATE SEQUENCE settings_seq;

CREATE TABLE settings (
    id          uuid PRIMARY KEY,      -- fixed per key in the client, so every device writes the same row
    key         text NOT NULL UNIQUE,  -- e.g. 'favorite_tools'
    value       text NOT NULL,         -- JSON, e.g. '["notes", "archive"]'
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL,  -- latest write wins
    archived_at timestamptz,           -- unused: settings are never archived
    seq         bigint NOT NULL        -- server-assigned on every write; sync pulls by this
);

CREATE INDEX settings_seq_idx ON settings (seq);
CREATE TRIGGER settings_notify AFTER INSERT OR UPDATE ON settings
    FOR EACH STATEMENT EXECUTE FUNCTION sync_notify();
