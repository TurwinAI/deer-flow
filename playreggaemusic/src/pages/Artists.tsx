/**
 * Artists list (B06). Lists all label artists with links to each artist page.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
    <section aria-labelledby="artists-heading">
      <h1 id="artists-heading">Artists</h1>
      {error && <p role="alert">{error}</p>}
      {artists === null && !error && <p>Loading artists…</p>}
      {artists && artists.length === 0 && <p>No artists yet.</p>}
      {artists && artists.length > 0 && (
        <ul className="card-grid">
          {artists.map((artist) => (
            <li key={artist.id}>
              <Link to={`/artists/${artist.id}`}>{artist.name}</Link>
              <p>{artist.bio}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
