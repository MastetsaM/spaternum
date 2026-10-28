// Screens are routes, so Android's back gesture walks back through them.
// Hash routes: the packaged app serves files, so /#/notes always loads index.html.

import { createHashRouter, Navigate, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { loadSettings } from "./api/settings";
import { useStatus } from "./sync/status";
import {
  ClientsScreen,
  HomeScreen,
  NotesScreen,
  ProjectsScreen,
  ToolsScreen,
  VoiceNotesScreen,
} from "./screens/Placeholders";
import { ArchiveScreen } from "./screens/ArchiveScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import "./App.css";

/** Until the settings are saved, or when the server rejects the token: the settings screen. */
function Connected({ children }: { children: ReactNode }) {
  const { tokenRejected } = useStatus();
  if (!loadSettings() || tokenRejected) return <Navigate to="/settings" replace />;
  return children;
}

const connected = (screen: ReactNode) => <Connected>{screen}</Connected>;

const router = createHashRouter([
  { path: "/", element: <Navigate to="/home" replace /> },
  { path: "/home", element: connected(<HomeScreen />) },
  { path: "/tools", element: connected(<ToolsScreen />) },
  { path: "/tools/notes", element: connected(<NotesScreen />) },
  { path: "/tools/voice-notes", element: connected(<VoiceNotesScreen />) },
  { path: "/tools/archive", element: connected(<ArchiveScreen />) },
  { path: "/clients", element: connected(<ClientsScreen />) },
  { path: "/projects", element: connected(<ProjectsScreen />) },
  { path: "/settings", element: <SettingsScreen /> },
  { path: "*", element: <Navigate to="/home" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
