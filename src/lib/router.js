import { useState, useEffect } from 'preact/hooks';

// Hash routing (#/manga/<id>). uhttpd serves files only and has no per-site
// fallback to index.html, so path-based routes would 404 on refresh or bookmark.
function currentRoute() {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useRoute() {
  const [path, setPath] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setPath(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function matchRoute(path) {
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { page: 'browse' };
  if (parts[0] === 'search') return { page: 'search', query: parts[1] || '' };
  if (parts[0] === 'favorites') return { page: 'favorites' };
  if (parts[0] === 'manga' && parts[1]) return { page: 'detail', id: parts[1] };
  if (parts[0] === 'read' && parts[1] && parts[2]) {
    return { page: 'reader', mangaId: parts[1], chapterId: parts[2] };
  }
  return { page: 'notfound' };
}

export function appPath(p) {
  return '#' + (p.startsWith('/') ? p : '/' + p);
}

export function navigate(to) {
  window.location.hash = to.replace(/^#/, '');
}
