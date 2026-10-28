// Empty screens until they're built: home, clients and projects come in later phases.

import { Settings } from "lucide-react";
import { NavLink } from "react-router";
import { Layout, TOOLS } from "../layout/Layout";

export function HomeScreen() {
  return (
    // Settings opens only from here (ui-design_spec.md)
    <Layout
      title="Home"
      actions={
        <NavLink to="/settings" title="Settings" className="gear">
          <Settings size={20} />
        </NavLink>
      }
    >
      <p className="muted">Home comes in a later phase.</p>
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
