import { useEffect, useState } from 'preact/hooks';
import { getFavorites, removeFavorite } from '../lib/db.js';
import { appPath } from '../lib/router.js';

export function Favorites() {
  const [items, setItems] = useState(null);

  function load() {
    getFavorites().then((data) => {
      setItems(data.sort((a, b) => b.addedAt - a.addedAt));
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id) {
    await removeFavorite(id);
    load();
  }

  if (items === null) return <p class="loading" role="status">Loading…</p>;

  if (items.length === 0) {
    return <p class="favorites-empty">No favorites yet. Add some from a manga page.</p>;
  }

  return (
    <div>
      <h2>Favorites</h2>
      <ul class="chapter-list">
        {items.map((item) => (
          <li key={item.id} class="favorite">
            <a href={appPath(`/manga/${item.id}`)}>{item.title}</a>
            <button class="link-button" onClick={() => remove(item.id)} aria-label={`Remove ${item.title} from favorites`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
