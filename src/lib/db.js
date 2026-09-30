const DB_NAME = 'mangadex-safe';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('readingPositions')) {
        db.createObjectStore('readingPositions', { keyPath: 'chapterId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const result = fn(store);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
      })
  );
}

export function addFavorite(manga) {
  return tx('favorites', 'readwrite', (store) =>
    store.put({ id: manga.id, title: manga.title, addedAt: Date.now() })
  );
}

export function removeFavorite(id) {
  return tx('favorites', 'readwrite', (store) => store.delete(id));
}

export function getFavorites() {
  return tx('favorites', 'readonly', (store) => {
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result);
    });
  });
}

export function isFavorite(id) {
  return tx('favorites', 'readonly', (store) => {
    const req = store.get(id);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(!!req.result);
    });
  });
}

export function saveReadingPosition(chapterId, mangaId, pageIndex) {
  return tx('readingPositions', 'readwrite', (store) =>
    store.put({ chapterId, mangaId, pageIndex, updatedAt: Date.now() })
  );
}

export function getReadingPosition(chapterId) {
  return tx('readingPositions', 'readonly', (store) => {
    const req = store.get(chapterId);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
    });
  });
}
