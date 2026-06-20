import { Link } from "react-router-dom";
import LabelMark from "./LabelMark";

/**
 * Primary navigation. Routes beyond Home are stubbed in B01 and implemented
 * in later batches (catalog, shop, admin).
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
      <Link to="/shop">Shop</Link>
      <Link to="/admin">Admin</Link>
    </nav>
  );
}
