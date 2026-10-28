import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings, normalizeServer, saveSettings } from "./settings";

describe("server address", () => {
  it("adds https:// and drops trailing slashes", () => {
    expect(normalizeServer(" raspberrypi.x.ts.net/ ")).toBe("https://raspberrypi.x.ts.net");
    expect(normalizeServer("http://127.0.0.1:8000//")).toBe("http://127.0.0.1:8000");
    expect(normalizeServer("")).toBe("");
  });
});

describe("saved settings", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage;
  });

  it("round-trips", () => {
    saveSettings({ server: "https://a", token: "t" });
    expect(loadSettings()).toEqual({ server: "https://a", token: "t" });
  });

  it("treats missing, incomplete or broken values as not set", () => {
    expect(loadSettings()).toBeNull();
    store.set("spaternum.settings", '{"server":"https://a"}');
    expect(loadSettings()).toBeNull();
    store.set("spaternum.settings", "{broken");
    expect(loadSettings()).toBeNull();
  });
});
