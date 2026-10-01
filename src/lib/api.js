// Calls go through the router CGI, which forwards only these endpoints and
// query keys and appends the content ratings itself. See cgi/md.
const API_BASE = '/cgi-bin/md/api';
const IMG_BASE = '/cgi-bin/md/img';
const FEED_PAGE = 500; // MangaDex maximum for /manga/{id}/feed

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
  if (res.status === 403) throw new Error('Not available.');
  if (!res.ok) throw new Error(`API ${res.status}`);
  const text = await res.text();
  // uclient-fetch failures arrive as an empty 200 body.
  if (!text) throw new Error('MangaDex did not respond. Try again.');
  return JSON.parse(text);
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

// /manga/{id} ignores content ratings, so look the title up through the filtered list.
export async function getManga(id) {
  const res = await fetchApi('/manga', {
    'ids[]': [id],
    'includes[]': ['cover_art', 'author', 'artist'],
  });
  return res.data?.[0] || null;
}

// All English chapters hosted on MangaDex, in reading order.
export async function getChapters(mangaId) {
  const chapters = [];
  for (let offset = 0; ; offset += FEED_PAGE) {
    const res = await fetchApi(`/manga/${mangaId}/feed`, {
      limit: FEED_PAGE,
      offset,
      'translatedLanguage[]': ['en'],
      'order[chapter]': 'asc',
      'includes[]': ['scanlation_group'],
      includeExternalUrl: 0,
    });
    chapters.push(...(res.data || []));
    if (offset + FEED_PAGE >= res.total) return chapters;
  }
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

export function getGroupName(chapter) {
  const group = chapter.relationships?.find((r) => r.type === 'scanlation_group');
  return group?.attributes?.name || '';
}
