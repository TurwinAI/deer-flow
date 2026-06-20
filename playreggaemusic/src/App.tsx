import { Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import Home from "./pages/Home";

/**
 * B01 shell: navigation + home. Artist / release / shop / admin routes are
 * stubbed here and built out in later batches (B03 catalog UI, B06 shop,
 * B07 admin/agent console).
 */
export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main" id="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
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
