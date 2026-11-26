-- Separate edited time for the "last edited" sort (2026-11-26). updated_at changes on every
-- write (sync needs that); edited_at only when the content changes. Existing notes keep
-- their order. Spec: planning/specs/notes-order_spec.md
ALTER TABLE notes ADD COLUMN edited_at timestamptz;
UPDATE notes SET edited_at = updated_at;
ALTER TABLE notes ALTER COLUMN edited_at SET NOT NULL;
