import { Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import Home from "./pages/Home";
import Artists from "./pages/Artists";
import ArtistPage from "./pages/ArtistPage";
import ReleasePage from "./pages/ReleasePage";

/**
 * App shell: navigation + public catalog routes (B06 — home, artists, artist,
 * release). Admin / agent console routes arrive in B07.
 */
export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main" id="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/artists" element={<Artists />} />
          <Route path="/artists/:artistId" element={<ArtistPage />} />
          <Route path="/releases/:releaseId" element={<ReleasePage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <span className="imprint-mark">PRM</span>
        <span>
          PlayReggaeMusic.ai — the home of AI reggae music. Releases are
          AI-generated.
        </span>
      </footer>
    </div>
  );
}
