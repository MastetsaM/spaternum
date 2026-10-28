// Empty screens until they're built: voice notes (block 8);
// home, clients and projects in later phases.

import { NavLink } from "react-router";
import { Layout, TOOLS } from "../layout/Layout";

export function HomeScreen() {
  return (
    <Layout title="Home">
      <p className="muted">The dashboard comes later.</p>
    </Layout>
  );
}

/** The tools, also in the main area — on the phone the ☰ drawer starts closed. */
export function ToolsScreen() {
  return (
    <Layout title="Tools">
      <ul className="tool-list">
        {TOOLS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to}>
              <Icon size={18} /> {label}
            </NavLink>
          </li>
        ))}
      </ul>
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

export function ClientsScreen() {
  return (
    <Layout title="Clients">
      <p className="muted">Clients come in a later phase.</p>
    </Layout>
  );
}

export function ProjectsScreen() {
  return (
    <Layout title="Projects">
      <p className="muted">Projects come in a later phase.</p>
    </Layout>
  );
}
