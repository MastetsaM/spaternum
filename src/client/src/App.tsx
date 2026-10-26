// Screens are routes, so Android's back gesture walks back through them.
// Hash routes: the packaged app serves files, so /#/notes always loads index.html.

import { createHashRouter, Navigate, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { loadSettings } from "./api/settings";
import { useStatus } from "./sync/status";
import { ArchiveScreen, NotesScreen, VoiceNotesScreen } from "./screens/Placeholders";
import { SettingsScreen } from "./screens/SettingsScreen";
import "./App.css";

/** Until the settings are saved, or when the server rejects the token: the settings screen. */
function Connected({ children }: { children: ReactNode }) {
  const { tokenRejected } = useStatus();
  if (!loadSettings() || tokenRejected) return <Navigate to="/settings" replace />;
  return children;
}

const router = createHashRouter([
  { path: "/", element: <Navigate to="/notes" replace /> },
  { path: "/notes", element: <Connected><NotesScreen /></Connected> },
  { path: "/voice-notes", element: <Connected><VoiceNotesScreen /></Connected> },
  { path: "/archive", element: <Connected><ArchiveScreen /></Connected> },
  { path: "/settings", element: <SettingsScreen /> },
  { path: "*", element: <Navigate to="/notes" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
