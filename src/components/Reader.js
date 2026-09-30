import { useEffect, useState, useCallback } from 'preact/hooks';
import { html } from '../lib/html.js';
import { getChapters, getChapterImages, getPageUrl } from '../lib/api.js';
import { navigate, appPath } from '../lib/router.js';
import { saveReadingPosition, getReadingPosition } from '../lib/db.js';

export function Reader({ mangaId, chapterId }) {
  const [chapterList, setChapterList] = useState([]);
  const [pages, setPages] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getChapters(mangaId, 500, 0)
      .then((data) => {
        if (cancelled) return;
        setChapterList(data.data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mangaId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    setPageIndex(0);

    getChapterImages(chapterId)
      .then((data) => {
        if (cancelled) return;
        const urls = data.chapter.data.map((file) =>
          getPageUrl(data.chapter.hash, file)
        );
        setPages(urls);
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
  }, [chapterId]);

  useEffect(() => {
    getReadingPosition(chapterId).then((pos) => {
      if (pos && pos.pageIndex < pages.length) setPageIndex(pos.pageIndex);
    });
  }, [chapterId, pages.length]);

  useEffect(() => {
    if (pages.length > 0) {
      saveReadingPosition(chapterId, mangaId, pageIndex);
    }
  }, [pageIndex, chapterId, mangaId, pages.length]);

  const currentChapterIndex = chapterList.findIndex((c) => c.id === chapterId);
  const prevChapter = currentChapterIndex > 0 ? chapterList[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapterList.length - 1
      ? chapterList[currentChapterIndex + 1]
      : null;

  const goPrev = useCallback(() => {
    if (pageIndex > 0) setPageIndex(pageIndex - 1);
    else if (prevChapter) navigate(appPath(`/read/${mangaId}/${prevChapter.id}`));
  }, [pageIndex, prevChapter, mangaId]);

  const goNext = useCallback(() => {
    if (pageIndex < pages.length - 1) setPageIndex(pageIndex + 1);
    else if (nextChapter) navigate(appPath(`/read/${mangaId}/${nextChapter.id}`));
  }, [pageIndex, pages.length, nextChapter, mangaId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  if (loading) return html`<div class="loading">Loading chapter…</div>`;
  if (error) return html`<div class="error">${error}</div>`;
  if (pages.length === 0) return html`<div class="loading">No pages.</div>`;

  const chapterNum = chapterList.find((c) => c.id === chapterId)?.attributes?.chapter || '?';
  const backHref = appPath(`/manga/${mangaId}`);

  return html`
    <div class="reader">
      <div class="reader-toolbar">
        <a href=${backHref} onClick=${(e) => { e.preventDefault(); navigate(backHref); }}>← Back to manga</a>
        <span class="info">Chapter ${chapterNum} — page ${pageIndex + 1} / ${pages.length}</span>
        <span class="spacer"></span>
        <button disabled=${!prevChapter} onClick=${() => prevChapter && navigate(appPath(`/read/${mangaId}/${prevChapter.id}`))}>Prev ch</button>
        <button disabled=${!nextChapter} onClick=${() => nextChapter && navigate(appPath(`/read/${mangaId}/${nextChapter.id}`))}>Next ch</button>
      </div>

      <div class="reader-pages">
        ${pages.map((url, i) =>
          html`<img
            key=${i}
            src=${url}
            alt=${`Page ${i + 1}`}
            loading=${i === pageIndex ? 'eager' : 'lazy'}
            width="800"
            height="1200"
          />`
        )}
      </div>

      <div class="reader-nav">
        <button disabled=${pageIndex === 0 && !prevChapter} onClick=${goPrev}>← Previous</button>
        <button disabled=${pageIndex === pages.length - 1 && !nextChapter} onClick=${goNext}>Next →</button>
      </div>
    </div>
  `;
}
