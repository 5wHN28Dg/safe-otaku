import { useEffect, useState } from 'preact/hooks';
import { searchManga, getCoverUrl, getMangaTitle } from '../lib/api.js';
import { navigate, appPath } from '../lib/router.js';

const LIMIT = 24;
const MAX_RESULTS = 10000; // MangaDex rejects offset + limit beyond this

function MangaCard({ manga }) {
  const cover = getCoverUrl(manga);
  const title = getMangaTitle(manga);
  return (
    <li class="manga-card">
      <a href={appPath(`/manga/${manga.id}`)}>
        {cover
          ? <img src={cover} alt="" loading="lazy" width="300" height="450" />
          : <div class="cover-placeholder"></div>}
        <span class="title">{title}</span>
      </a>
    </li>
  );
}

export function Browse({ query }) {
  const [input, setInput] = useState(query || '');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setInput(query || '');
    setOffset(0);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    searchManga(query, LIMIT, offset)
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

  const total = Math.min(results?.total ?? 0, MAX_RESULTS);
  const hasPrev = offset > 0;
  const hasNext = offset + LIMIT < total;

  return (
    <div>
      <form class="search-bar" role="search" onSubmit={onSubmit}>
        <label for="search-input" class="visually-hidden">Search manga by title</label>
        <input
          id="search-input"
          type="search"
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="Search manga by title…"
        />
        <button type="submit">Search</button>
      </form>

      {loading && <p class="loading" role="status">Loading…</p>}
      {error && <p class="error" role="alert">{error}</p>}

      {!loading && !error && results && (
        results.data.length === 0
          ? <p class="loading" role="status">No results.</p>
          : (
            <>
              <ul class="manga-grid">
                {results.data.map((m) => <MangaCard key={m.id} manga={m} />)}
              </ul>
              {total > LIMIT && (
                <nav class="pager" aria-label="Results pages">
                  <button disabled={!hasPrev} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Previous</button>
                  <span class="pager-info">
                    {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                  </span>
                  <button disabled={!hasNext} onClick={() => setOffset(offset + LIMIT)}>Next</button>
                </nav>
              )}
            </>
          )
      )}
    </div>
  );
}
