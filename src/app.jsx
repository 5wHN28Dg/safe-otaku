import { useRoute, matchRoute } from './lib/router.js';
import { Header } from './components/Header.jsx';
import { Browse } from './components/Browse.jsx';
import { Detail } from './components/Detail.jsx';
import { Reader } from './components/Reader.jsx';
import { Favorites } from './components/Favorites.jsx';

function NotFound() {
  return (
    <div class="notfound">
      <h2>Not found</h2>
      <p>The page you requested does not exist.</p>
    </div>
  );
}

function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // malformed % escape in a hand-edited URL
  }
}

export function App() {
  const path = useRoute();
  const route = matchRoute(path);

  let content;
  switch (route.page) {
    case 'browse':
      content = <Browse query="" />;
      break;
    case 'search':
      content = <Browse query={decode(route.query)} />;
      break;
    case 'detail':
      content = <Detail id={route.id} />;
      break;
    case 'reader':
      content = <Reader mangaId={route.mangaId} chapterId={route.chapterId} />;
      break;
    case 'favorites':
      content = <Favorites />;
      break;
    default:
      content = <NotFound />;
  }

  return (
    <>
      <Header route={route.page} />
      <main>{content}</main>
    </>
  );
}
