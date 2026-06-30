/**
 * Sticky slim site header (SPEC §3/§6). Brand seal + primary nav. Every link
 * resolves to a real route (guarded by App.test). aria-label "Primary" kept.
 */
import { Link, NavLink } from "react-router-dom";
import { Seal } from "./primitives";

const LINKS = [
  { to: "/releases", label: "Releases" },
  { to: "/artists", label: "Artists" },
  { to: "/about", label: "About" },
  { to: "/licensing", label: "Licensing" },
];

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner container container--wide">
        <Link to="/" className="site-header__brand" aria-label="PlayReggaeMusic.ai — home">
          <Seal compact />
          <span className="site-header__word">PlayReggaeMusic.ai</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => (isActive ? "site-nav__link is-active" : "site-nav__link")}
            >
              {l.label}
            </NavLink>
          ))}
          <Link to="/admin" className="site-nav__link site-nav__link--muted">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
