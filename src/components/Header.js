import { html } from '../lib/html.js';
import { navigate, appPath } from '../lib/router.js';

export function Header({ path }) {
  const isBrowse = path.includes('/search') || path.endsWith('/mangadex-safe/') || path.endsWith('/mangadex-safe');
  const isFavorites = path.includes('/favorites');

  function go(e, to) {
    e.preventDefault();
    navigate(appPath(to));
  }

  return html`
    <header class="site-header">
      <h1>
        <a href=${appPath('/')} onClick=${(e) => go(e, '/')}>MangaDex Safe</a>
      </h1>
      <nav>
        <a href=${appPath('/')} class=${isBrowse ? 'active' : ''} onClick=${(e) => go(e, '/')}>Browse</a>
        <a href=${appPath('/favorites')} class=${isFavorites ? 'active' : ''} onClick=${(e) => go(e, '/favorites')}>Favorites</a>
      </nav>
    </header>
  `;
}
