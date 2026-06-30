/**
 * Landing page (redesign — docs/design/SPEC.md §6). Catalog-as-hero: the newest
 * release is the thesis, not a marketing banner. The hero <h1> + AI badge are
 * always present (App shell test relies on them); featured/grid/spotlight load
 * from the catalog lib (mocked in tests; the page still renders without it).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Container,
  Page,
  Eyebrow,
  AiBadge,
  LinkButton,
  Marquee,
  Reveal,
  SectionHeading,
  ArtworkTile,
  ArtistCard,
} from "../components/ui";
import { ReleaseArt } from "../components/ui/cards";
import { listArtists, listReleases, type Artist, type Release } from "../lib/catalog";

const TICKER = [
  "DUB AS SYSTEM, NOT SYMBOL",
  "ROOTS DISCIPLINE",
  "AI-NATIVE IMPRINT",
  "EVERY RELEASE DISCLOSED",
  "THE ARCHIVE & THE DESK",
];

export default function Home() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [spotlight, setSpotlight] = useState<Artist | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listReleases(), listArtists()])
      .then(([rels, artists]) => {
        if (!active) return;
        setReleases(rels);
        if (artists.length > 0) setSpotlight(artists[0]);
      })
      .catch(() => {
        /* Landing still renders its hero even if the catalog is unavailable. */
      });
    return () => {
      active = false;
    };
  }, []);

  const featured = releases[0] ?? null;
  const grid = releases.slice(0, 8);
  const ticker = [...releases.map((r) => r.catalogNumber), ...TICKER];

  return (
    <Page>
      <Container>
        <section className="hero" aria-labelledby="home-heading">
          <div>
            <Eyebrow className="hero__eyebrow">AI-native reggae label &amp; archive</Eyebrow>
            <h1 id="home-heading" className="hero__title">
              The home of AI <span className="hero__echo">reggae</span> music.
            </h1>
            <p className="hero__lede">
              An imprint built on roots discipline and dub method — a catalog
              engineered, released, and stewarded by an autonomous label. Every
              record is AI-generated and labelled as such.
            </p>
            <div className="hero__actions">
              <LinkButton to="/releases" variant="primary">
                Browse the catalog
              </LinkButton>
              <LinkButton to="/about" variant="ghost">
                What this is
              </LinkButton>
            </div>
            <div style={{ marginTop: "var(--s-6)" }}>
              <AiBadge />
            </div>
          </div>

          {featured && (
            <Link
              to={`/releases/${featured.id}`}
              className="hero__feature"
              aria-label={`Featured release: ${featured.title}`}
            >
              <ReleaseArt catalogNumber={featured.catalogNumber} title={featured.title} />
              <span className="hero__feature-cap">
                <span>{featured.catalogNumber}</span>
                <span>Latest · {featured.type.toUpperCase()}</span>
              </span>
            </Link>
          )}
        </section>
      </Container>

      <Marquee items={ticker} />

      {grid.length > 0 && (
        <Container>
          <section className="stack" style={{ paddingTop: "var(--s-8)" }}>
            <div>
              <SectionHeading
                eyebrow="The catalog"
                title="Latest releases"
                id="latest-heading"
                action={{ to: "/releases", label: "All releases" }}
              />
              <ul className="tile-grid">
                {grid.map((r, i) => (
                  <Reveal as="li" key={r.id} delay={i * 40}>
                    <ArtworkTile
                      to={`/releases/${r.id}`}
                      catalogNumber={r.catalogNumber}
                      title={r.title}
                      meta={r.type.toUpperCase()}
                    />
                  </Reveal>
                ))}
              </ul>
            </div>

            {spotlight && (
              <section aria-labelledby="spotlight-heading">
                <SectionHeading eyebrow="Roster" title="Artist spotlight" id="spotlight-heading" />
                <ArtistCard
                  to={`/artists/${spotlight.id}`}
                  name={spotlight.name}
                  bio={spotlight.bio}
                />
              </section>
            )}

            <section aria-labelledby="ethos-heading">
              <SectionHeading eyebrow="The method" title="An archive, run by an agent" id="ethos-heading" />
              <div className="feature-row">
                <div className="feature">
                  <h3>Roots, by discipline</h3>
                  <p>
                    Catalog numbers, credits, and provenance on every record —
                    the archival rigor of the imprints that built the genre.
                  </p>
                </div>
                <div className="feature">
                  <h3>Dub, as method</h3>
                  <p>
                    An autonomous label plans, releases, and accounts for the
                    catalog — versioning tradition into something new.
                  </p>
                </div>
                <div className="feature">
                  <h3>Disclosed, always</h3>
                  <p>
                    Every release is AI-generated and clearly labelled. No
                    impersonation, no ambiguity — provenance is part of the work.
                  </p>
                </div>
              </div>
            </section>

            <section className="cta" aria-labelledby="cta-heading">
              <Eyebrow>For supervisors &amp; brands</Eyebrow>
              <h2 id="cta-heading">License the sound.</h2>
              <p className="lede">
                Clear, AI-disclosed reggae and dub for film, TV, games, and
                advertising — masters and compositions in one place.
              </p>
              <div className="cta__row">
                <LinkButton to="/licensing" variant="primary">
                  Licensing &amp; sync
                </LinkButton>
                <LinkButton to="/press" variant="ghost">
                  Press &amp; contact
                </LinkButton>
              </div>
            </section>
          </section>
        </Container>
      )}
    </Page>
  );
}
