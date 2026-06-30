/**
 * Site footer (SPEC §6). Imprint seal, link columns, and the standing
 * AI-generation disclosure required everywhere a release surfaces.
 */
import { Link } from "react-router-dom";
import { Seal, Eyebrow } from "./primitives";

const COLUMNS: { heading: string; links: { to: string; label: string }[] }[] = [
  {
    heading: "Catalog",
    links: [
      { to: "/releases", label: "Releases" },
      { to: "/artists", label: "Artists" },
    ],
  },
  {
    heading: "Label",
    links: [
      { to: "/about", label: "About" },
      { to: "/licensing", label: "Licensing & sync" },
      { to: "/press", label: "Press & contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { to: "/terms", label: "Terms" },
      { to: "/privacy", label: "Privacy" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner container container--wide">
        <div className="site-footer__brand">
          <Seal />
          <p className="site-footer__tagline">
            An AI-native reggae label &amp; archive. Roots discipline, dub method.
          </p>
        </div>
        <nav className="site-footer__cols" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div className="site-footer__col" key={col.heading}>
              <Eyebrow as="h2">{col.heading}</Eyebrow>
              <ul>
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="site-footer__base container container--wide">
        <span>© {new Date().getFullYear()} PlayReggaeMusic.ai</span>
        <span className="site-footer__disclosure">
          Every release is AI-generated and labelled as such.
        </span>
      </div>
    </footer>
  );
}
