/**
 * Artists index (SPEC §6) — the roster.
 */
import { useEffect, useState } from "react";
import { Container, Page, Eyebrow, Reveal, ArtistCard } from "../components/ui";
import { listArtists, type Artist } from "../lib/catalog";

export default function Artists() {
  const [artists, setArtists] = useState<Artist[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listArtists()
      .then((a) => active && setArtists(a))
      .catch(() => active && setError("Could not load artists."));
    return () => {
      active = false;
    };
  }, []);

  return (
    <Page>
      <Container>
        <header className="page-head">
          <Eyebrow>The roster</Eyebrow>
          <h1>Artists</h1>
          <p className="lede">The acts of the PlayReggaeMusic.ai imprint.</p>
        </header>

        {error && (
          <p role="alert" className="empty">
            {error}
          </p>
        )}
        {artists === null && !error && <p className="empty">Loading artists…</p>}
        {artists && artists.length === 0 && <p className="empty">No artists yet.</p>}
        {artists && artists.length > 0 && (
          <ul className="artist-grid" style={{ listStyle: "none" }}>
            {artists.map((artist, i) => (
              <Reveal as="li" key={artist.id} delay={i * 40}>
                <ArtistCard to={`/artists/${artist.id}`} name={artist.name} bio={artist.bio} />
              </Reveal>
            ))}
          </ul>
        )}
      </Container>
    </Page>
  );
}
