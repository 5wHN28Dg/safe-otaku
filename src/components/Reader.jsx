import { useEffect, useRef, useState } from 'preact/hooks';
import { getChapters, getChapterImages, getPageUrl } from '../lib/api.js';
import { navigate, appPath } from '../lib/router.js';
import { saveReadingPosition, getReadingPosition } from '../lib/db.js';

export function Reader({ mangaId, chapterId }) {
  const [chapterList, setChapterList] = useState([]);
  const [pages, setPages] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pagesRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getChapters(mangaId)
      .then((list) => {
        if (!cancelled) setChapterList(list);
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
        setPages(data.chapter.data.map((file) => getPageUrl(data.chapter.hash, file)));
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

  function pageElement(i) {
    return pagesRef.current?.children[i] || null;
  }

  function scrollToPage(i) {
    pageElement(i)?.scrollIntoView({ block: 'start' });
  }

  // The current page is whichever one crosses the middle of the viewport.
  useEffect(() => {
    if (pages.length === 0 || !pagesRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setPageIndex(Number(entry.target.dataset.index));
        }
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );
    for (const img of pagesRef.current.children) observer.observe(img);
    return () => observer.disconnect();
  }, [pages]);

  useEffect(() => {
    if (pages.length === 0) return;
    getReadingPosition(chapterId).then((pos) => {
      if (pos && pos.pageIndex > 0 && pos.pageIndex < pages.length) scrollToPage(pos.pageIndex);
    });
  }, [chapterId, pages]);

  useEffect(() => {
    if (pages.length > 0) saveReadingPosition(chapterId, mangaId, pageIndex);
  }, [pageIndex, chapterId, mangaId, pages.length]);

  const currentChapterIndex = chapterList.findIndex((c) => c.id === chapterId);
  const prevChapter = currentChapterIndex > 0 ? chapterList[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapterList.length - 1
      ? chapterList[currentChapterIndex + 1]
      : null;

  function goPrev() {
    if (pageIndex > 0) scrollToPage(pageIndex - 1);
    else if (prevChapter) navigate(appPath(`/read/${mangaId}/${prevChapter.id}`));
  }

  function goNext() {
    if (pageIndex < pages.length - 1) scrollToPage(pageIndex + 1);
    else if (nextChapter) navigate(appPath(`/read/${mangaId}/${nextChapter.id}`));
  }

  const keys = useRef({});
  keys.current = { goPrev, goNext };
  useEffect(() => {
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') keys.current.goPrev();
      if (e.key === 'ArrowRight') keys.current.goNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) return <p class="loading" role="status">Loading chapter…</p>;
  if (error) return <p class="error" role="alert">{error}</p>;
  if (pages.length === 0) return <p class="loading">No pages.</p>;

  const chapterNum = chapterList.find((c) => c.id === chapterId)?.attributes?.chapter || '?';

  return (
    <div class="reader">
      <div class="reader-toolbar">
        <a href={appPath(`/manga/${mangaId}`)}>← Back to manga</a>
        <span class="info" aria-live="polite">Chapter {chapterNum} — page {pageIndex + 1} / {pages.length}</span>
        <span class="spacer"></span>
        {prevChapter
          ? <a class="button" href={appPath(`/read/${mangaId}/${prevChapter.id}`)}>Prev ch</a>
          : <button disabled>Prev ch</button>}
        {nextChapter
          ? <a class="button" href={appPath(`/read/${mangaId}/${nextChapter.id}`)}>Next ch</a>
          : <button disabled>Next ch</button>}
      </div>

      <div class="reader-pages" ref={pagesRef}>
        {pages.map((url, i) => (
          <img key={url} data-index={i} src={url} alt={`Page ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} width="800" height="1200" />
        ))}
      </div>

      <div class="reader-nav">
        <button disabled={pageIndex === 0 && !prevChapter} onClick={goPrev}>← Previous</button>
        <button disabled={pageIndex === pages.length - 1 && !nextChapter} onClick={goNext}>Next →</button>
      </div>
    </div>
  );
}
