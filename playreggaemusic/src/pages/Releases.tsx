/**
 * Releases index. Lists all label releases with links to each release page.
 * This is also the public "shop" — browse releases and buy from a release page.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
    <section aria-labelledby="releases-heading">
      <h1 id="releases-heading">Releases</h1>
      {error && <p role="alert">{error}</p>}
      {releases === null && !error && <p>Loading releases…</p>}
      {releases && releases.length === 0 && <p>No releases yet.</p>}
      {releases && releases.length > 0 && (
        <ul className="card-grid">
          {releases.map((release) => (
            <li key={release.id}>
              <Link to={`/releases/${release.id}`}>{release.title}</Link>
              <p>
                {release.catalogNumber} · {release.type.toUpperCase()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
