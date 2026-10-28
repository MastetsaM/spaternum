-- Optional note title (2026-10-28). Empty = the body's first line is shown, so existing notes
-- look the same. Spec: planning/specs/notes_spec.md
ALTER TABLE notes ADD COLUMN title text NOT NULL DEFAULT '';
