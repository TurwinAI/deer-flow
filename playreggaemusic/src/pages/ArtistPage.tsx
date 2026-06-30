/**
 * Artist page (SPEC §6). Bio, external links, discography. Test hooks kept:
 * h1 artist name, bio text, release link "Title (CAT)", external link labels.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Container, Page, Eyebrow, ReleaseTile } from "../components/ui";
import {
  getArtist,
  listReleasesByArtist,
  type Artist,
  type Release,
} from "../lib/catalog";

interface ArtistView {
  artist: Artist;
  releases: Release[];
}

const LINK_LABELS: Record<string, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtube: "YouTube",
  instagram: "Instagram",
};

export default function ArtistPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const [view, setView] = useState<ArtistView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistId) return;
    let active = true;
    Promise.all([getArtist(artistId), listReleasesByArtist(artistId)])
      .then(([artist, releases]) => {
        if (!active) return;
        if (!artist) {
          setError("Artist not found.");
          return;
        }
        setView({ artist, releases });
      })
      .catch(() => active && setError("Could not load artist."));
    return () => {
      active = false;
    };
  }, [artistId]);

  if (error)
    return (
      <Page>
        <Container>
          <p role="alert" className="empty">
            {error}
          </p>
        </Container>
      </Page>
    );
  if (!view)
    return (
      <Page>
        <Container>
          <p className="empty">Loading artist…</p>
        </Container>
      </Page>
    );

  const { artist, releases } = view;
  const links = Object.entries(artist.links).filter(([, url]) => Boolean(url)) as [
    string,
    string,
  ][];

  return (
    <Page>
      <Container>
        <article aria-labelledby="artist-name">
          <header className="page-head">
            <Eyebrow>Artist</Eyebrow>
            <h1 id="artist-name">{artist.name}</h1>
            {artist.photoPath && (
              <img
                className="artist-photo"
                src={`/preview/${artist.photoPath}`}
                alt={`Photo of ${artist.name}`}
              />
            )}
            <p className="lede" style={{ maxWidth: "62ch" }}>
              {artist.bio}
            </p>

            {links.length > 0 && (
              <nav aria-label={`${artist.name} external links`}>
                <ul className="link-list">
                  {links.map(([key, url]) => (
                    <li key={key}>
                      <a href={url} target="_blank" rel="noreferrer">
                        {LINK_LABELS[key] ?? key}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </header>

          <section aria-labelledby="artist-releases">
            <h2 id="artist-releases" className="eyebrow" style={{ color: "var(--text-muted)" }}>
              Releases
            </h2>
            {releases.length === 0 ? (
              <p className="empty">No releases yet.</p>
            ) : (
              <ul className="tile-grid">
                {releases.map((release) => (
                  <li key={release.id}>
                    <ReleaseTile release={release} artistName={artist.name} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>
      </Container>
    </Page>
  );
}
