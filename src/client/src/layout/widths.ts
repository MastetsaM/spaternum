// PC panel widths: limits, and the widths Mihail dragged, kept in localStorage (ui-design_spec.md).

export type Panel = "side" | "tools";
export type Widths = Record<Panel, number>;

export const DEFAULTS: Widths = { side: 260, tools: 280 };
export const LIMITS: Record<Panel, [number, number]> = { side: [180, 600], tools: [200, 720] };
/** The side panel showing only the tool icons. Dragged below its minimum, it snaps to this. */
export const SIDE_ICONS = 52;

const KEY = "spaternum.panelWidths";

export function clampWidth(panel: Panel, px: number): number {
  const [min, max] = LIMITS[panel];
  // Below the side panel's minimum: whichever is nearer, icons only or the minimum
  if (panel === "side" && px < min) return px < (SIDE_ICONS + min) / 2 ? SIDE_ICONS : min;
  return Math.round(Math.min(max, Math.max(min, px)));
}

/** Saved widths, with defaults for anything missing or broken. */
export function parseWidths(raw: string | null): Widths {
  let saved: Partial<Record<Panel, unknown>> = {};
  try {
    saved = JSON.parse(raw ?? "{}") ?? {};
  } catch {
    // broken value: use the defaults
  }
  const pick = (panel: Panel) =>
    typeof saved[panel] === "number" ? clampWidth(panel, saved[panel]) : DEFAULTS[panel];
  return { side: pick("side"), tools: pick("tools") };
}

export function loadWidths(): Widths {
  try {
    return parseWidths(localStorage.getItem(KEY));
  } catch {
    return DEFAULTS;
  }
}

export function saveWidths(widths: Widths) {
  try {
    localStorage.setItem(KEY, JSON.stringify(widths));
  } catch {
    // not saved: the width still applies until the app closes
  }
}
