/**
 * Artist page (B06). Bio, external links, and the artist's releases.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

  if (error) return <p role="alert">{error}</p>;
  if (!view) return <p>Loading artist…</p>;

  const { artist, releases } = view;
  const links = Object.entries(artist.links).filter(([, url]) => Boolean(url)) as [
    string,
    string,
  ][];

  return (
    <article aria-labelledby="artist-name">
      <header>
        <h1 id="artist-name">{artist.name}</h1>
        {artist.photoPath && (
          <img
            className="artist-photo"
            src={`/preview/${artist.photoPath}`}
            alt={`Photo of ${artist.name}`}
          />
        )}
        <p className="bio">{artist.bio}</p>
      </header>

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

      <section aria-labelledby="artist-releases">
        <h2 id="artist-releases">Releases</h2>
        {releases.length === 0 ? (
          <p>No releases yet.</p>
        ) : (
          <ul className="card-grid">
            {releases.map((release) => (
              <li key={release.id}>
                <Link to={`/releases/${release.id}`}>
                  {release.title} ({release.catalogNumber})
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
