/**
 * Catalog cards + generative cover art (rev. 2). Artwork-forward tiles with a
 * hover/lazy play overlay that feeds the global player — clicking play streams
 * the release's first preview in place (the docked bar appears) without leaving
 * the grid. The play control is a SIBLING of the navigation link (never nested
 * inside an <a>) to avoid nested-interactive a11y violations.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { PlayButton, usePlayer } from "./player";
import { listTracksByRelease, previewUrl, type Release } from "../../lib/catalog";

const LABEL_TONES = ["#1f7a4d", "#7e2b22", "#c9851a", "#243b53", "#5a3921"];

function seed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function ReleaseArt({
  catalogNumber,
  title,
}: {
  catalogNumber: string;
  title: string;
}) {
  const tone = LABEL_TONES[seed(catalogNumber) % LABEL_TONES.length];
  const grooves = [46, 42, 38, 34, 30];
  return (
    <svg
      className="release-art"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${title} cover`}
    >
      <rect width="100" height="100" fill="#0c0c0d" />
      <circle cx="50" cy="50" r="49" fill="#161618" />
      {grooves.map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#242428" strokeWidth="0.5" />
      ))}
      <circle cx="50" cy="50" r="22" fill={tone} />
      <circle cx="50" cy="50" r="22" fill="none" stroke="#f4f3f1" strokeWidth="0.4" opacity="0.35" />
      <circle cx="50" cy="50" r="2.2" fill="#0c0c0d" />
      <text x="50" y="36" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="4.4" letterSpacing="0.6" fill="#f4f3f1" opacity="0.92">
        {catalogNumber}
      </text>
      <text x="50" y="68" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="3" letterSpacing="0.8" fill="#f4f3f1" opacity="0.6">
        PRM · AI
      </text>
    </svg>
  );
}

/** Lazy "play this release's first preview" wiring, shared by tile + row. */
function useReleasePlay(release: Release, artistName?: string) {
  const { track, playing, play, toggle } = usePlayer();
  const [loading, setLoading] = useState(false);
  const isCurrent = track?.id.startsWith(`${release.id}:`) ?? false;
  async function onPlay() {
    if (isCurrent) {
      toggle();
      return;
    }
    setLoading(true);
    try {
      const tracks = await listTracksByRelease(release.id);
      const first = tracks[0];
      if (!first) return;
      play({
        id: `${release.id}:${first.id}`,
        title: first.title,
        subtitle: [artistName, release.catalogNumber].filter(Boolean).join(" · "),
        src: previewUrl(first.previewClipPath),
      });
    } finally {
      setLoading(false);
    }
  }
  return { isCurrent, playing, loading, onPlay };
}

/**
 * A catalog tile: cover (links to the release) + hover play overlay + ledger
 * caption. Play lazily loads the release's first track, then streams it.
 */
export function ReleaseTile({
  release,
  artistName,
}: {
  release: Release;
  artistName?: string;
}) {
  const { isCurrent, playing, loading, onPlay } = useReleasePlay(release, artistName);

  return (
    <div className="tile">
      <div className="tile__art">
        <Link to={`/releases/${release.id}`} className="tile__cover" aria-label={`${release.title} — open release`}>
          <ReleaseArt catalogNumber={release.catalogNumber} title={release.title} />
        </Link>
        <span className="tile__play">
          {/* Sibling of the link, not nested. Lazy-loads + plays the first track. */}
          <button
            type="button"
            className={isCurrent && playing ? "play-btn is-playing" : "play-btn"}
            aria-label={isCurrent && playing ? `Pause ${release.title}` : `Play ${release.title}`}
            aria-pressed={isCurrent && playing}
            disabled={loading}
            onClick={onPlay}
          >
            {isCurrent && playing ? <EqMini /> : <span className="play-btn__tri" aria-hidden="true" />}
          </button>
        </span>
      </div>
      <Link to={`/releases/${release.id}`} className="tile__cap">
        <span className="tile__meta">
          <span className="tile__cat">{release.catalogNumber}</span>
          <span>{release.type.toUpperCase()}</span>
        </span>
        <span className="tile__title">{release.title}</span>
        {artistName && <span className="tile__artist">{artistName}</span>}
      </Link>
    </div>
  );
}

function EqMini() {
  return (
    <span className="eq eq--on" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

/** Ledger row for the discography list view. */
export function ReleaseRow({
  release,
  artistName,
}: {
  release: Release;
  artistName?: string;
}) {
  const { isCurrent, playing, loading, onPlay } = useReleasePlay(release, artistName);
  return (
    <li>
      <div className="disco__row">
        <button
          type="button"
          className={isCurrent && playing ? "play-btn is-playing disco__play" : "play-btn disco__play"}
          aria-label={isCurrent && playing ? `Pause ${release.title}` : `Play ${release.title}`}
          aria-pressed={isCurrent && playing}
          disabled={loading}
          onClick={onPlay}
          style={{ width: "2rem", height: "2rem" }}
        >
          {isCurrent && playing ? <EqMini /> : <span className="play-btn__tri" aria-hidden="true" />}
        </button>
        <span className="disco__cat">{release.catalogNumber}</span>
        <Link to={`/releases/${release.id}`} className="disco__title">
          {release.title}
        </Link>
        <span className="disco__dim">{artistName ?? "—"}</span>
        <span className="disco__dim disco__year">{release.type}</span>
      </div>
    </li>
  );
}

export function ArtistCard({
  to,
  name,
  bio,
}: {
  to: string;
  name: string;
  bio?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Link to={to} className="artist-card" aria-label={name}>
      <span className="artist-card__mark" aria-hidden="true">
        {initials}
      </span>
      <span className="artist-card__body">
        <span className="artist-card__name">{name}</span>
        {bio && <span className="artist-card__bio">{bio}</span>}
      </span>
    </Link>
  );
}

// Re-export so pages can offer per-track play (release detail).
export { PlayButton };
