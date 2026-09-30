import { html } from './lib/html.js';
import { useRoute, matchRoute } from './lib/router.js';
import { Header } from './components/Header.js';
import { Browse } from './components/Browse.js';
import { Detail } from './components/Detail.js';
import { Reader } from './components/Reader.js';
import { Favorites } from './components/Favorites.js';

function NotFound() {
  return html`<div class="notfound"><h2>Not found</h2><p>The page you requested does not exist.</p></div>`;
}

export function App() {
  const path = useRoute();
  const route = matchRoute(path);

  let content;
  switch (route.page) {
    case 'browse':
      content = html`<${Browse} query="" />`;
      break;
    case 'search':
      content = html`<${Browse} query=${decodeURIComponent(route.query)} />`;
      break;
    case 'detail':
      content = html`<${Detail} id=${route.id} />`;
      break;
    case 'reader':
      content = html`<${Reader} mangaId=${route.mangaId} chapterId=${route.chapterId} />`;
      break;
    case 'favorites':
      content = html`<${Favorites} />`;
      break;
    default:
      content = html`<${NotFound} />`;
  }

  return html`
    <${Header} path=${path} />
    <main>${content}</main>
  `;
}
