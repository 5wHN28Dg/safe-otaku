const API_BASE = '/cgi-bin/md/api';
const IMG_BASE = '/cgi-bin/md/img';

async function fetchApi(path, params = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, v);
    } else {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export function searchManga(query, limit = 24, offset = 0) {
  const params = {
    limit,
    offset,
    'includes[]': ['cover_art'],
    'order[relevance]': 'desc',
  };
  if (query) params.title = query;
  return fetchApi('/manga', params);
}

export function getManga(id) {
  return fetchApi(`/manga/${id}`, {
    'includes[]': ['cover_art', 'author', 'artist'],
  });
}

export function getChapters(mangaId, limit = 100, offset = 0) {
  return fetchApi(`/manga/${mangaId}/feed`, {
    limit,
    offset,
    'translatedLanguage[]': ['en'],
    'order[chapter]': 'asc',
    'includes[]': ['scanlation_group'],
  });
}

export function getChapterImages(chapterId) {
  return fetchApi(`/at-home/server/${chapterId}`);
}

export function getCoverUrl(manga) {
  const cover = manga.relationships?.find((r) => r.type === 'cover_art');
  const fileName = cover?.attributes?.fileName;
  if (!fileName) return null;
  return `${IMG_BASE}/covers/${manga.id}/${fileName}`;
}

export function getPageUrl(chapterHash, pageFile) {
  return `${IMG_BASE}/data/${chapterHash}/${pageFile}`;
}

export function getMangaTitle(manga) {
  const titles = manga.attributes?.title || {};
  return titles.en || Object.values(titles)[0] || 'Untitled';
}

export function getMangaDescription(manga) {
  const descriptions = manga.attributes?.description || {};
  return descriptions.en || Object.values(descriptions)[0] || '';
}

export function getAuthorName(manga) {
  const author = manga.relationships?.find((r) => r.type === 'author');
  return author?.attributes?.name || '';
}
