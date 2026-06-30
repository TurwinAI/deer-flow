/**
 * Releases index (SPEC §6) — the archival catalog grid. Artwork-forward tiles
 * with mono catalog numbers. This is also the public storefront.
 */
import { useEffect, useState } from "react";
import { Container, Page, Eyebrow, Reveal, ArtworkTile } from "../components/ui";
import { listReleases, type Release } from "../lib/catalog";

export default function Releases() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listReleases()
      .then((r) => active && setReleases(r))
      .catch(() => active && setError("Could not load releases."));
    return () => {
      active = false;
    };
  }, []);

  return (
    <Page>
      <Container>
        <header className="page-head">
          <Eyebrow>The catalog</Eyebrow>
          <h1>Releases</h1>
          <p className="lede">
            The full PlayReggaeMusic.ai discography — every record numbered,
            credited, and AI-disclosed.
          </p>
        </header>

        {error && (
          <p role="alert" className="empty">
            {error}
          </p>
        )}
        {releases === null && !error && <p className="empty">Loading releases…</p>}
        {releases && releases.length === 0 && <p className="empty">No releases yet.</p>}
        {releases && releases.length > 0 && (
          <ul className="tile-grid">
            {releases.map((release, i) => (
              <Reveal as="li" key={release.id} delay={i * 40}>
                <ArtworkTile
                  to={`/releases/${release.id}`}
                  catalogNumber={release.catalogNumber}
                  title={release.title}
                  meta={release.type.toUpperCase()}
                />
              </Reveal>
            ))}
          </ul>
        )}
      </Container>
    </Page>
  );
}
