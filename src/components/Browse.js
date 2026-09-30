import { useEffect, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { searchManga, getCoverUrl, getMangaTitle } from '../lib/api.js';
import { navigate, appPath } from '../lib/router.js';

function MangaCard({ manga }) {
  const cover = getCoverUrl(manga);
  const title = getMangaTitle(manga);
  const href = appPath(`/manga/${manga.id}`);
  return html`
    <div class="manga-card">
      <a href=${href} onClick=${(e) => { e.preventDefault(); navigate(href); }}>
        ${cover
          ? html`<img src=${cover} alt=${title} loading="lazy" width="300" height="450" />`
          : html`<div style="aspect-ratio:2/3;background:var(--surface);border-radius:var(--radius)"></div>`}
        <div class="title">${title}</div>
      </a>
    </div>
  `;
}

export function Browse({ query }) {
  const [input, setInput] = useState(query || '');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const limit = 24;

  useEffect(() => {
    setInput(query || '');
    setOffset(0);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    searchManga(query, limit, offset)
      .then((data) => {
        if (cancelled) return;
        setResults(data);
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
  }, [query, offset]);

  function onSubmit(e) {
    e.preventDefault();
    const q = input.trim();
    navigate(q ? appPath(`/search/${encodeURIComponent(q)}`) : appPath('/'));
  }

  const total = results?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return html`
    <div>
      <form class="search-bar" onSubmit=${onSubmit}>
        <input
          type="text"
          value=${input}
          onInput=${(e) => setInput(e.currentTarget.value)}
          placeholder="Search manga by title..."
          aria-label="Search manga"
        />
        <button type="submit">Search</button>
      </form>

      ${loading && html`<div class="loading">Loading…</div>`}
      ${error && html`<div class="error">${error}</div>`}

      ${!loading && !error && results && html`
        ${results.data.length === 0
          ? html`<div class="loading">No results.</div>`
          : html`
            <div class="manga-grid">
              ${results.data.map((m) => html`<${MangaCard} key=${m.id} manga=${m} />`)}
            </div>
            ${total > limit && html`
              <div class="reader-nav" style="justify-content:center">
                <button disabled=${!hasPrev} onClick=${() => setOffset(Math.max(0, offset - limit))}>Previous</button>
                <span style="align-self:center;color:var(--muted);font-size:0.9rem">
                  ${offset + 1}–${Math.min(offset + limit, total)} of ${total}
                </span>
                <button disabled=${!hasNext} onClick=${() => setOffset(offset + limit)}>Next</button>
              </div>
            `}
          `}
      `}
    </div>
  `;
}
