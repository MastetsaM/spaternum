import { describe, expect, it } from "vitest";
import { moveFavorite, parseFavorites, toggleFavorite } from "./favorites";

const KNOWN = ["notes", "voice-notes", "archive"];

describe("parseFavorites", () => {
  it("is every tool when never saved or broken", () => {
    expect(parseFavorites(null, KNOWN)).toEqual(KNOWN);
    expect(parseFavorites("not json", KNOWN)).toEqual(KNOWN);
    expect(parseFavorites('{"notes":true}', KNOWN)).toEqual(KNOWN);
  });

  it("keeps the saved order and drops unknown or repeated keys", () => {
    expect(parseFavorites('["archive","gone","notes","archive"]', KNOWN)).toEqual(["archive", "notes"]);
  });

  it("allows no favorites", () => {
    expect(parseFavorites("[]", KNOWN)).toEqual([]);
  });
});

describe("toggleFavorite", () => {
  it("removes a favorite, and adds a new one at the end", () => {
    expect(toggleFavorite(["notes", "archive"], "notes")).toEqual(["archive"]);
    expect(toggleFavorite(["archive"], "notes")).toEqual(["archive", "notes"]);
  });
});

describe("moveFavorite", () => {
  it("swaps with the neighbour, and does nothing at either end", () => {
    expect(moveFavorite(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveFavorite(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveFavorite(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveFavorite(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
