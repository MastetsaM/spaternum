// Favorite tools: which tools the side panel lists, in Mihail's order (favorites_spec.md).
// Each device keeps its own, as a JSON list of tool keys in localStorage.

import { useEffect, useState } from "react";

const KEY = "spaternum.favoriteTools";

/** The saved list, without unknown or repeated keys. Never saved or broken → every tool. */
export function parseFavorites(value: string | null, known: string[]): string[] {
  let saved: unknown;
  try {
    saved = JSON.parse(value ?? "null");
  } catch {
    return known;
  }
  if (!Array.isArray(saved)) return known;
  return [...new Set(saved)].filter((key): key is string => known.includes(key));
}

/** Starred → removed; not starred → added at the end. */
export function toggleFavorite(favorites: string[], key: string): string[] {
  return favorites.includes(key) ? favorites.filter((k) => k !== key) : [...favorites, key];
}

/** Moves a favorite one place up (-1) or down (+1); at either end nothing changes. */
export function moveFavorite(favorites: string[], key: string, step: -1 | 1): string[] {
  const from = favorites.indexOf(key);
  const to = from + step;
  if (from < 0 || to < 0 || to >= favorites.length) return favorites;
  const next = [...favorites];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

// Screens that show the favorites (the side panel, the Favorites page) redraw when they change
const listeners = new Set<() => void>();

function loadRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** This device's favorites, kept up to date. */
export function useFavorites(known: string[]): string[] {
  const [raw, setRaw] = useState(loadRaw);
  useEffect(() => {
    const update = () => setRaw(loadRaw());
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  return parseFavorites(raw, known);
}

export function saveFavorites(favorites: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites));
  } catch {
    // not saved: nothing changes on screen either
  }
  listeners.forEach((update) => update());
}
