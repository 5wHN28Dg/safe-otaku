import { useEffect, useState } from 'preact/hooks';
import {
  getManga,
  getChapters,
  getCoverUrl,
  getMangaTitle,
  getMangaDescription,
  getAuthorName,
  getGroupName,
} from '../lib/api.js';
import { appPath } from '../lib/router.js';
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

    getManga(id)
      .then(async (m) => {
        // Only ask for chapters once the filtered lookup has returned the title.
        const c = m ? await getChapters(id) : [];
        if (cancelled) return;
        setManga(m);
        setChapters(c);
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

  if (loading) return <p class="loading" role="status">Loading…</p>;
  if (error) return <p class="error" role="alert">{error}</p>;
  if (!manga) return <p class="notfound">Not available.</p>;

  const cover = getCoverUrl(manga);
  const title = getMangaTitle(manga);
  const description = getMangaDescription(manga);
  const author = getAuthorName(manga);
  const tags = (manga.attributes?.tags || [])
    .map((t) => t.attributes?.name?.en)
    .filter(Boolean);

  return (
    <div>
      <div class="detail">
        {cover && <img class="cover" src={cover} alt="" width="300" height="450" />}
        <div>
          <h2>{title}</h2>
          {author && <p class="meta">by {author}</p>}
          {description && <p class="description">{description}</p>}
          {tags.length > 0 && (
            <ul class="tags" aria-label="Tags">
              {tags.map((t) => <li class="tag" key={t}>{t}</li>)}
            </ul>
          )}
          <div class="actions">
            <button class={fav ? '' : 'primary'} aria-pressed={fav} onClick={toggleFavorite}>
              {fav ? 'Remove from favorites' : 'Add to favorites'}
            </button>
          </div>
        </div>
      </div>

      <h3>Chapters</h3>
      {chapters.length === 0
        ? <p class="loading">No English chapters hosted on MangaDex.</p>
        : (
          <ul class="chapter-list">
            {chapters.map((ch) => {
              const num = ch.attributes?.chapter || '?';
              const chTitle = ch.attributes?.title || '';
              const group = getGroupName(ch);
              return (
                <li key={ch.id}>
                  <a href={appPath(`/read/${id}/${ch.id}`)}>
                    <span>Chapter {num}{chTitle ? ` — ${chTitle}` : ''}</span>
                    <span class="chapter-meta">{group || `${ch.attributes?.pages || 0} pages`}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
