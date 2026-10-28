// The frame every screen sits in.
// PC: rail (sections) | side panel (the list of tools only) | main | tool panel (the tool's navigation and details).
// Phone (narrow window): sections in the bottom bar, side panel as a ☰ drawer, tool panel from a button.
// On the PC both panels can be resized by dragging their inner edge (widths.ts).

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
import { useEffect, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { useStatus } from "../sync/status";
import { clampWidth, DEFAULTS, loadWidths, saveWidths, type Panel, type Widths } from "./widths";

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
  tools?: ReactNode; // the tool's own navigation (e.g. the folder tree) and details
  actions?: ReactNode; // buttons at the right of the header, e.g. Home's Settings gear
  children: ReactNode; // main content
};

export function Layout({ title, tools, actions, children }: Props) {
  const { pathname, search } = useLocation();
  const inTools = pathname.startsWith("/tools");
  const [drawerOpen, setDrawerOpen] = useState(false); // phone only
  // Open by default on the PC; on the phone it covers the screen, so only when asked
  const [toolsOpen, setToolsOpen] = useState(() => !window.matchMedia(PHONE).matches);
  const [widths, setWidths] = useState(loadWidths);
  const { online } = useStatus();
  const close = () => setDrawerOpen(false);
  // Any new screen (e.g. a folder picked in the tool panel) closes what slides over it on the phone
  useEffect(() => {
    close();
    if (window.matchMedia(PHONE).matches) setToolsOpen(false);
  }, [pathname, search]);

  const sections = SECTIONS.map(({ to, label, icon: Icon }) => (
    <NavLink key={to} to={to} title={label} onClick={close}>
      <Icon size={22} />
      <span>{label}</span>
    </NavLink>
  ));

  // Tools: only the list of tools; anything inside a tool goes in the tool panel
  const sideContent = inTools && (
    <ul className="tool-list">
      {TOOLS.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink to={to} onClick={close} title={label}>
            <Icon size={18} /> <span>{label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className={`layout ${sideContent ? "" : "no-side"} ${tools && toolsOpen ? "" : "no-tools"}`}
      style={{ "--side-w": `${widths.side}px`, "--tools-w": `${widths.tools}px` } as CSSProperties}
    >
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
      {sideContent && <ResizeEdge panel="side" widths={widths} onChange={setWidths} />}
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
      {tools && toolsOpen && <ResizeEdge panel="tools" widths={widths} onChange={setWidths} />}

      <nav className="tabs">{sections}</nav>
    </div>
  );
}

type EdgeProps = { panel: Panel; widths: Widths; onChange: (widths: Widths) => void };

/** The draggable inner edge of a panel (PC only). Saved when the drag ends; double-click resets. */
function ResizeEdge({ panel, widths, onChange }: EdgeProps) {
  const widthAt = (x: number) => clampWidth(panel, panel === "side" ? x - 64 : window.innerWidth - x); // 64 = rail

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault(); // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange({ ...widths, [panel]: widthAt(e.clientX) });
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    saveWidths(widths);
  }
  function reset() {
    const next = { ...widths, [panel]: DEFAULTS[panel] };
    onChange(next);
    saveWidths(next);
  }

  return (
    <div
      className={`resize resize-${panel}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={reset}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
    />
  );
}
