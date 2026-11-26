import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadSettings } from "./api/settings";
import { startSync } from "./sync/db";
import { startRecordings } from "./notes/recordings/uploads";

// Sync runs for the whole app, independent of which screen is open
const settings = loadSettings();
if (settings) startSync(settings);
// Recording recovery and uploads too (on the phone only)
if (settings) startRecordings(settings);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
