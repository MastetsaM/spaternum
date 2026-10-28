// The frame every screen sits in.
// PC: rail (sections) | side panel (tools + the open tool's items) | main | tool panel.
// Phone (narrow window): sections in the bottom bar, side panel as a ☰ drawer, tool panel from a button.

import {
  Archive,
  Briefcase,
  FileText,
  FolderKanban,
  House,
  Menu,
  Mic,
  PanelRight,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { useStatus } from "../sync/status";

export const PHONE = "(max-width: 700px)"; // keep in sync with App.css

const SECTIONS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/clients", label: "Clients", icon: Briefcase },
  { to: "/projects", label: "Projects", icon: FolderKanban },
];

export const TOOLS = [
  { to: "/tools/notes", label: "Notes", icon: FileText },
  { to: "/tools/voice-notes", label: "Voice notes", icon: Mic },
  { to: "/tools/archive", label: "Archive", icon: Archive },
];

type Props = {
  title: string;
  side?: ReactNode; // the open tool's items, e.g. the folder tree
  tools?: ReactNode; // tool-specific settings and details
  actions?: ReactNode; // buttons at the right of the header, e.g. Home's Settings gear
  children: ReactNode; // main content
};

export function Layout({ title, side, tools, actions, children }: Props) {
  const { pathname, search } = useLocation();
  const inTools = pathname.startsWith("/tools");
  const [drawerOpen, setDrawerOpen] = useState(false); // phone only
  // Open by default on the PC; on the phone it covers the screen, so only when asked
  const [toolsOpen, setToolsOpen] = useState(() => !window.matchMedia(PHONE).matches);
  const { online } = useStatus();
  const close = () => setDrawerOpen(false);
  useEffect(close, [pathname, search]); // any new screen, e.g. a folder picked in the drawer

  const sections = SECTIONS.map(({ to, label, icon: Icon }) => (
    <NavLink key={to} to={to} title={label} onClick={close}>
      <Icon size={22} />
      <span>{label}</span>
    </NavLink>
  ));

  // Tools: the list of tools, with the open tool's own items under it
  const sideContent = inTools ? (
    <ul className="tool-list">
      {TOOLS.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink to={to} onClick={close}>
            <Icon size={18} /> {label}
          </NavLink>
          {pathname.startsWith(to) && side && <div className="tool-items">{side}</div>}
        </li>
      ))}
    </ul>
  ) : (
    side
  );

  return (
    <div className={`layout ${sideContent ? "" : "no-side"} ${tools && toolsOpen ? "" : "no-tools"}`}>
      <nav className="rail">
        {sections}
        <span className={`status ${online ? "online" : ""}`} title={online ? "Online" : "Offline"} />
      </nav>

      {sideContent && (
        <aside className={`side ${drawerOpen ? "open" : ""}`}>
          <button className="close phone-only" onClick={close} aria-label="Close">
            <X size={20} />
          </button>
          {sideContent}
        </aside>
      )}
      {drawerOpen && <div className="backdrop phone-only" onClick={close} />}

      <main>
        <header>
          {sideContent && (
            <button className="phone-only" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
          )}
          <h1>{title}</h1>
          {tools && (
            <button onClick={() => setToolsOpen(!toolsOpen)} aria-label="Tool panel">
              <PanelRight size={20} />
            </button>
          )}
          {actions}
          <span className={`status phone-only ${online ? "online" : ""}`} />
        </header>
        <div className="content">{children}</div>
      </main>

      {tools && toolsOpen && (
        <aside className="tools">
          <button className="close phone-only" onClick={() => setToolsOpen(false)} aria-label="Close">
            <X size={20} />
          </button>
          {tools}
        </aside>
      )}

      <nav className="tabs">{sections}</nav>
    </div>
  );
}
