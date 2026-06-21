import { Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import Home from "./pages/Home";
import Artists from "./pages/Artists";
import ArtistPage from "./pages/ArtistPage";
import ReleasePage from "./pages/ReleasePage";
import Admin from "./pages/Admin";
import AgentConsole from "./pages/AgentConsole";
import AdminApprovals from "./pages/AdminApprovals";
import AdminDistribution from "./pages/AdminDistribution";
import AdminRoyalties from "./pages/AdminRoyalties";

/**
 * App shell: navigation + public catalog routes (B06 — home, artists, artist,
 * release) + owner-only admin / agent console routes (B07).
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
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/agent" element={<AgentConsole />} />
          <Route path="/admin/approvals" element={<AdminApprovals />} />
          <Route path="/admin/distribution" element={<AdminDistribution />} />
          <Route path="/admin/royalties" element={<AdminRoyalties />} />
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
