// The frame every screen sits in. PC: rail | side panel | main | tool panel.
// Phone (narrow window): bottom tabs, side panel slides in from the left, tool panel from a button.

import { Archive, FileText, Menu, Mic, PanelRight, Settings, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { useStatus } from "../sync/status";

const CATEGORIES = [
  { to: "/notes", label: "Notes", icon: FileText },
  { to: "/voice-notes", label: "Voice notes", icon: Mic },
  { to: "/archive", label: "Archive", icon: Archive },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const PHONE = "(max-width: 700px)"; // keep in sync with App.css

type Props = {
  title: string;
  side?: ReactNode; // the category's sub-items, e.g. the folder tree
  tools?: ReactNode; // tool-specific settings and details
  children: ReactNode; // main content
};

export function Layout({ title, side, tools, children }: Props) {
  const [sideOpen, setSideOpen] = useState(false); // phone only
  // Open by default on the PC; on the phone it covers the screen, so only when asked
  const [toolsOpen, setToolsOpen] = useState(() => !window.matchMedia(PHONE).matches);
  const { online } = useStatus();

  const links = CATEGORIES.map(({ to, label, icon: Icon }) => (
    <NavLink key={to} to={to} title={label} onClick={() => setSideOpen(false)}>
      <Icon size={22} />
      <span>{label}</span>
    </NavLink>
  ));

  return (
    <div className={`layout ${side ? "" : "no-side"} ${tools && toolsOpen ? "" : "no-tools"}`}>
      <nav className="rail">
        {links}
        <span className={`status ${online ? "online" : ""}`} title={online ? "Online" : "Offline"} />
      </nav>

      {side && (
        <aside className={`side ${sideOpen ? "open" : ""}`}>
          <button className="close phone-only" onClick={() => setSideOpen(false)} aria-label="Close">
            <X size={20} />
          </button>
          {side}
        </aside>
      )}

      <main>
        <header>
          {side && (
            <button className="phone-only" onClick={() => setSideOpen(true)} aria-label="Open list">
              <Menu size={20} />
            </button>
          )}
          <h1>{title}</h1>
          <span className={`status phone-only ${online ? "online" : ""}`} />
          {tools && (
            <button onClick={() => setToolsOpen(!toolsOpen)} aria-label="Tool panel">
              <PanelRight size={20} />
            </button>
          )}
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

      <nav className="tabs">{links}</nav>
    </div>
  );
}
