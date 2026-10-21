-- seq is assigned by the server on every write; clients pull by seq, never by
-- their own updated_at, so an old offline edit pushed late is still pulled.
CREATE SEQUENCE items_seq;

CREATE TABLE items (
    id          uuid PRIMARY KEY,
    text        text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL,
    archived_at timestamptz,
    seq         bigint NOT NULL
);

CREATE INDEX items_seq_idx ON items (seq);
