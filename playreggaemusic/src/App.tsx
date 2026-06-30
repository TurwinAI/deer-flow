import { Route, Routes } from "react-router-dom";
import SiteHeader from "./components/ui/SiteHeader";
import SiteFooter from "./components/ui/SiteFooter";
import Home from "./pages/Home";
import Artists from "./pages/Artists";
import ArtistPage from "./pages/ArtistPage";
import Releases from "./pages/Releases";
import ReleasePage from "./pages/ReleasePage";
import About from "./pages/About";
import Licensing from "./pages/Licensing";
import Press from "./pages/Press";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Admin from "./pages/Admin";
import AgentConsole from "./pages/AgentConsole";
import AdminApprovals from "./pages/AdminApprovals";
import AdminDistribution from "./pages/AdminDistribution";
import AdminRoyalties from "./pages/AdminRoyalties";

/**
 * App shell: sticky header + public/marketing routes (landing, catalog, artist,
 * release, about, licensing, press, terms, privacy) + owner-only admin/agent
 * routes. All built on the centralized UI system (docs/design/SPEC.md).
 */
export default function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main className="app-main" id="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/artists" element={<Artists />} />
          <Route path="/artists/:artistId" element={<ArtistPage />} />
          <Route path="/releases" element={<Releases />} />
          <Route path="/releases/:releaseId" element={<ReleasePage />} />
          <Route path="/about" element={<About />} />
          <Route path="/licensing" element={<Licensing />} />
          <Route path="/press" element={<Press />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/agent" element={<AgentConsole />} />
          <Route path="/admin/approvals" element={<AdminApprovals />} />
          <Route path="/admin/distribution" element={<AdminDistribution />} />
          <Route path="/admin/royalties" element={<AdminRoyalties />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}
