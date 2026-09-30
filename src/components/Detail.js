import { useEffect, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import {
  getManga,
  getChapters,
  getCoverUrl,
  getMangaTitle,
  getMangaDescription,
  getAuthorName,
} from '../lib/api.js';
import { navigate, appPath } from '../lib/router.js';
import { addFavorite, removeFavorite, isFavorite } from '../lib/db.js';

export function Detail({ id }) {
  const [manga, setManga] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getManga(id), getChapters(id, 200, 0)])
      .then(([m, c]) => {
        if (cancelled) return;
        setManga(m.data);
        setChapters(c.data || []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    isFavorite(id).then(setFav);
  }, [id]);

  async function toggleFavorite() {
    if (!manga) return;
    if (fav) {
      await removeFavorite(id);
      setFav(false);
    } else {
      await addFavorite({ id, title: getMangaTitle(manga) });
      setFav(true);
    }
  }

  if (loading) return html`<div class="loading">Loading…</div>`;
  if (error) return html`<div class="error">${error}</div>`;
  if (!manga) return html`<div class="notfound">Not found.</div>`;

  const cover = getCoverUrl(manga);
  const title = getMangaTitle(manga);
  const description = getMangaDescription(manga);
  const author = getAuthorName(manga);
  const tags = (manga.attributes?.tags || [])
    .map((t) => t.attributes?.name?.en)
    .filter(Boolean);

  return html`
    <div>
      <div class="detail">
        ${cover && html`<img class="cover" src=${cover} alt=${title} />`}
        <div>
          <h2>${title}</h2>
          ${author && html`<div class="meta">by ${author}</div>`}
          ${description && html`<p class="description">${description}</p>`}
          ${tags.length > 0 && html`
            <div class="tags">
              ${tags.map((t) => html`<span class="tag" key=${t}>${t}</span>`)}
            </div>
          `}
          <div class="actions">
            <button class=${fav ? '' : 'primary'} onClick=${toggleFavorite}>
              ${fav ? 'Remove from favorites' : 'Add to favorites'}
            </button>
          </div>
        </div>
      </div>

      <h3>Chapters</h3>
      ${chapters.length === 0
        ? html`<div class="loading">No chapters available.</div>`
        : html`
          <ul class="chapter-list">
            ${chapters.map((ch) => {
              const num = ch.attributes?.chapter || '?';
              const chTitle = ch.attributes?.title || '';
              const pages = ch.attributes?.pages || 0;
              const href = appPath(`/read/${id}/${ch.id}`);
              return html`
                <li key=${ch.id}>
                  <a href=${href} onClick=${(e) => { e.preventDefault(); navigate(href); }}>
                    <span>Chapter ${num}${chTitle ? ` — ${chTitle}` : ''}</span>
                    <span class="chapter-meta">${pages} pages</span>
                  </a>
                </li>
              `;
            })}
          </ul>
        `}
    </div>
  `;
}
