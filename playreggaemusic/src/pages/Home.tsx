/**
 * Landing (rev. 2 — catalog-led, docs/design/SPEC.md). No hero, no marketing
 * prose: one line of copy, then the catalog. The single <h1> ("the home of AI
 * reggae music") is kept as that one line (tests rely on it); below it the
 * release grid leads, with hover/inline play feeding the docked player.
 */
import { useEffect, useState } from "react";
import { Container, Page, Reveal, ReleaseTile } from "../components/ui";
import { listArtists, listReleases, type Artist, type Release } from "../lib/catalog";

export default function Home() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [artists, setArtists] = useState<Record<string, Artist>>({});

  useEffect(() => {
    let active = true;
    Promise.all([listReleases(), listArtists()])
      .then(([rels, arts]) => {
        if (!active) return;
        setReleases(rels);
        setArtists(Object.fromEntries(arts.map((a) => [a.id, a])));
      })
      .catch(() => {
        /* still renders the intro line if the catalog is unavailable */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Page>
      <Container>
        <section className="home-intro" aria-labelledby="home-heading">
          <h1 id="home-heading" className="home-intro__title">
            the home of AI <em>reggae</em> music
          </h1>
          <p className="home-intro__aside">
            An AI-native imprint. Roots discipline, dub method — every record
            disclosed.
          </p>
        </section>

        <div className="toolbar" aria-hidden={releases.length === 0}>
          <span className="toolbar__count">
            {releases.length > 0 ? `${releases.length} release${releases.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        {releases.length > 0 && (
          <ul className="tile-grid">
            {releases.map((r, i) => (
              <Reveal as="li" key={r.id} delay={i * 35}>
                <ReleaseTile release={r} artistName={artists[r.artistId]?.name} />
              </Reveal>
            ))}
          </ul>
        )}
      </Container>
    </Page>
  );
}
