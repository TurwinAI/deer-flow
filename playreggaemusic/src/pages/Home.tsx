/**
 * Label home (B06). Hero + a featured release and artist spotlight pulled from
 * the catalog. The hero heading + AI badge are always present (the App shell
 * test relies on them); featured content loads from the catalog lib (mocked in
 * tests).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AiBadge from "../components/AiBadge";
import {
  listArtists,
  listReleases,
  type Artist,
  type Release,
} from "../lib/catalog";

export default function Home() {
  const [featured, setFeatured] = useState<Release | null>(null);
  const [spotlight, setSpotlight] = useState<Artist | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listReleases(), listArtists()])
      .then(([releases, artists]) => {
        if (!active) return;
        if (releases.length > 0) setFeatured(releases[0]);
        if (artists.length > 0) setSpotlight(artists[0]);
      })
      .catch(() => {
        /* Home still renders its hero even if the catalog is unavailable. */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="hero" aria-labelledby="home-heading">
        <h1 id="home-heading">The home of AI reggae music.</h1>
        <p className="tagline">
          An official AI-native reggae imprint. Roots-deep, forward-looking —
          artists, releases, and a catalog built for the next era of the sound.
        </p>
        <AiBadge />
      </section>

      {featured && (
        <section className="featured" aria-labelledby="featured-heading">
          <h2 id="featured-heading">Featured release</h2>
          <Link to={`/releases/${featured.id}`}>
            {featured.title} ({featured.catalogNumber})
          </Link>
        </section>
      )}

      {spotlight && (
        <section className="spotlight" aria-labelledby="spotlight-heading">
          <h2 id="spotlight-heading">Artist spotlight</h2>
          <Link to={`/artists/${spotlight.id}`}>{spotlight.name}</Link>
          <p>{spotlight.bio}</p>
        </section>
      )}
    </>
  );
}
