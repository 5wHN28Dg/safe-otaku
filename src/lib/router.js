import { useState, useEffect } from 'preact/hooks';

export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return path;
}

export function navigate(to) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function matchRoute(path) {
  const parts = path.split('/').filter(Boolean);

  // Mount point is /mangadex-safe/. Strip it before matching.
  const base = parts[0] === 'mangadex-safe' ? parts.slice(1) : parts;

  if (base.length === 0) return { page: 'browse' };
  if (base[0] === 'search') return { page: 'search', query: base[1] || '' };
  if (base[0] === 'favorites') return { page: 'favorites' };
  if (base[0] === 'manga' && base[1]) return { page: 'detail', id: base[1] };
  if (base[0] === 'read' && base[1] && base[2]) {
    return { page: 'reader', mangaId: base[1], chapterId: base[2] };
  }
  return { page: 'notfound' };
}

export function appPath(p) {
  return '/mangadex-safe' + (p.startsWith('/') ? p : '/' + p);
}
