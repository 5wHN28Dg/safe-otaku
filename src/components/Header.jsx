import { appPath } from '../lib/router.js';

export function Header({ route }) {
  const isBrowse = route === 'browse' || route === 'search';
  const isFavorites = route === 'favorites';

  return (
    <header class="site-header">
      <h1>
        <a href={appPath('/')}>MangaDex Safe</a>
      </h1>
      <nav>
        <a href={appPath('/')} aria-current={isBrowse ? 'page' : undefined}>Browse</a>
        <a href={appPath('/favorites')} aria-current={isFavorites ? 'page' : undefined}>Favorites</a>
      </nav>
    </header>
  );
}
