/**
 * Releases — the archival catalog (rev. 2). Artwork grid by default, with a
 * grid⇄list (discography ledger) toggle. Inline play on both views.
 */
import { useEffect, useState } from "react";
import { Container, Page, Reveal, ReleaseTile, ReleaseRow } from "../components/ui";
import { listArtists, listReleases, type Artist, type Release } from "../lib/catalog";

export default function Releases() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [artists, setArtists] = useState<Record<string, Artist>>({});
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    let active = true;
    Promise.all([listReleases(), listArtists()])
      .then(([rels, arts]) => {
        if (!active) return;
        setReleases(rels);
        setArtists(Object.fromEntries(arts.map((a) => [a.id, a])));
      })
      .catch(() => active && setError("Could not load releases."));
    return () => {
      active = false;
    };
  }, []);

  const count = releases?.length ?? 0;

  return (
    <Page>
      <Container>
        <header className="page-head">
          <p className="eyebrow">the catalog</p>
          <h1>Releases</h1>
        </header>

        <div className="toolbar">
          <span className="toolbar__count">{count > 0 ? `${count} release${count === 1 ? "" : "s"}` : ""}</span>
          <div className="viewtoggle" role="group" aria-label="View">
            <button
              type="button"
              className={view === "grid" ? "is-active" : ""}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
            <button
              type="button"
              className={view === "list" ? "is-active" : ""}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
        </div>

        {error && <p role="alert" className="empty">{error}</p>}
        {releases === null && !error && <p className="empty">Loading releases…</p>}
        {releases && releases.length === 0 && <p className="empty">No releases yet.</p>}

        {releases && releases.length > 0 && view === "grid" && (
          <ul className="tile-grid">
            {releases.map((r, i) => (
              <Reveal as="li" key={r.id} delay={i * 35}>
                <ReleaseTile release={r} artistName={artists[r.artistId]?.name} />
              </Reveal>
            ))}
          </ul>
        )}

        {releases && releases.length > 0 && view === "list" && (
          <ul className="disco">
            {releases.map((r) => (
              <ReleaseRow key={r.id} release={r} artistName={artists[r.artistId]?.name} />
            ))}
          </ul>
        )}
      </Container>
    </Page>
  );
}
