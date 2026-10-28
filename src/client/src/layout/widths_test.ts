import { describe, expect, it } from "vitest";
import { clampWidth, DEFAULTS, parseWidths } from "./widths";

describe("clampWidth", () => {
  it("keeps a width inside the panel's limits", () => {
    expect(clampWidth("side", 20)).toBe(62);
    expect(clampWidth("side", 900)).toBe(600);
    expect(clampWidth("tools", 900)).toBe(720);
    expect(clampWidth("tools", 100)).toBe(200);
    expect(clampWidth("tools", 333.6)).toBe(334);
  });
});

describe("parseWidths", () => {
  it("uses the defaults when nothing is saved or the value is broken", () => {
    expect(parseWidths(null)).toEqual(DEFAULTS);
    expect(parseWidths("not json")).toEqual(DEFAULTS);
    expect(parseWidths('{"side":"wide"}')).toEqual(DEFAULTS);
  });

  it("reads saved widths and clamps them", () => {
    expect(parseWidths('{"side":300,"tools":9999}')).toEqual({ side: 300, tools: 720 });
  });
});
