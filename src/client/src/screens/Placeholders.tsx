// Empty screens until their blocks are built (notes: 7, voice notes: 8, archive: 9).

import { Layout } from "../layout/Layout";

export function NotesScreen() {
  return (
    <Layout title="Notes" side={<p className="muted">Folders</p>} tools={<p className="muted">Note details</p>}>
      <p className="muted">Notes come in block 7.</p>
    </Layout>
  );
}

export function VoiceNotesScreen() {
  return (
    <Layout title="Voice notes" side={<p className="muted">Tags</p>} tools={<p className="muted">Recording details</p>}>
      <p className="muted">Voice notes come in block 8.</p>
    </Layout>
  );
}

export function ArchiveScreen() {
  return (
    <Layout title="Archive">
      <p className="muted">The archive comes in block 9.</p>
    </Layout>
  );
}
