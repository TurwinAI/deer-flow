import { Link } from "react-router-dom";
import LabelMark from "./LabelMark";

/**
 * Primary navigation. Every link resolves to a real route (see App.tsx).
 * Browsing releases is the public storefront, so there is no separate "Shop".
 */
export default function Nav() {
  return (
    <nav className="prm-nav" aria-label="Primary">
      <Link to="/" aria-label="Home">
        <LabelMark compact />
      </Link>
      <span className="spacer" />
      <Link to="/artists">Artists</Link>
      <Link to="/releases">Releases</Link>
      <Link to="/admin">Admin</Link>
    </nav>
  );
}
