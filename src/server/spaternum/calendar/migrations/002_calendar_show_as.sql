-- Show as: busy / tentative / free (2026-10-30). Existing events stay busy, as before.
-- Spec: planning/specs/calendar_spec.md
ALTER TABLE calendar_events ADD COLUMN show_as text NOT NULL DEFAULT 'busy'
    CHECK (show_as IN ('busy', 'tentative', 'free'));
