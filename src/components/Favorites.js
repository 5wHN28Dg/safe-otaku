import { useEffect, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { getFavorites, removeFavorite } from '../lib/db.js';
import { navigate, appPath } from '../lib/router.js';

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

  if (items === null) return html`<div class="loading">Loading…</div>`;

  if (items.length === 0) {
    return html`<div class="favorites-empty">No favorites yet. Add some from a manga page.</div>`;
  }

  return html`
    <div>
      <h2>Favorites</h2>
      <ul class="chapter-list">
        ${items.map((item) => {
          const href = appPath(`/manga/${item.id}`);
          return html`
            <li key=${item.id}>
              <a href=${href} onClick=${(e) => { e.preventDefault(); navigate(href); }}>
                <span>${item.title}</span>
                <span class="chapter-meta">
                  <button
                    style="border:none;background:none;color:var(--accent);cursor:pointer;font-size:0.85rem"
                    onClick=${(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove(item.id);
                    }}
                  >Remove</button>
                </span>
              </a>
            </li>
          `;
        })}
      </ul>
    </div>
  `;
}
