// Favorites: pick the tools this device's side panel lists, and their order (favorites_spec.md).
// Favorites first with up/down arrows, then the other tools; a star switches each on or off.

import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { Layout, TOOL_KEYS, TOOLS } from "../layout/Layout";
import { moveFavorite, saveFavorites, toggleFavorite, useFavorites } from "../layout/favorites";

export function FavoritesScreen() {
  const favorites = useFavorites(TOOL_KEYS);
  const others = TOOL_KEYS.filter((key) => !favorites.includes(key));
  const save = saveFavorites;

  function row(key: string, starred: boolean, index: number) {
    const { label, icon: Icon } = TOOLS.find((t) => t.key === key)!;
    return (
      <li key={key} className="fav-row">
        <button
          className={`icon-button ${starred ? "on" : ""}`}
          onClick={() => save(toggleFavorite(favorites, key))}
          aria-label={starred ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
        >
          <Star size={18} fill={starred ? "currentColor" : "none"} />
        </button>
        <Icon size={18} />
        <span className="fav-label">{label}</span>
        {starred && (
          <>
            <button
              className="icon-button"
              disabled={index === 0}
              onClick={() => save(moveFavorite(favorites, key, -1))}
              aria-label={`Move ${label} up`}
            >
              <ArrowUp size={16} />
            </button>
            <button
              className="icon-button"
              disabled={index === favorites.length - 1}
              onClick={() => save(moveFavorite(favorites, key, 1))}
              aria-label={`Move ${label} down`}
            >
              <ArrowDown size={16} />
            </button>
          </>
        )}
      </li>
    );
  }

  return (
    <Layout title="Favorites">
      <p className="muted">Starred tools show in the side panel, in this order.</p>
      <ul className="fav-list">
        {favorites.map((key, i) => row(key, true, i))}
        {others.map((key, i) => row(key, false, i))}
      </ul>
    </Layout>
  );
}
