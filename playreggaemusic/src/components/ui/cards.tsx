/**
 * Catalog cards + generative cover art (SPEC §3/§5). No external imagery: each
 * release gets a deterministic 7"-label roundel (vinyl grooves + a stamped
 * center label) seeded by its catalog number — a Studio One / Treasure Isle nod
 * rendered as crisp SVG. Heritage tones only; one per card, never tricolor.
 */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const LABEL_TONES = ["#1e4d38", "#7e2b22", "#a87f28", "#243b53", "#5a3921"];

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
      aria-label={`${title} — ${catalogNumber} label artwork`}
    >
      <rect width="100" height="100" fill="#0f0d0a" />
      <circle cx="50" cy="50" r="49" fill="#1a1712" />
      {grooves.map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#2a241c" strokeWidth="0.5" />
      ))}
      <circle cx="50" cy="50" r="22" fill={tone} />
      <circle cx="50" cy="50" r="22" fill="none" stroke="#f4efe4" strokeWidth="0.4" opacity="0.4" />
      <circle cx="50" cy="50" r="2.4" fill="#0f0d0a" />
      <text
        x="50"
        y="36"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="4.6"
        letterSpacing="0.6"
        fill="#f4efe4"
        opacity="0.92"
      >
        {catalogNumber}
      </text>
      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="3.2"
        letterSpacing="0.8"
        fill="#f4efe4"
        opacity="0.62"
      >
        PRM · AI
      </text>
    </svg>
  );
}

export function ArtworkTile({
  to,
  catalogNumber,
  title,
  meta,
}: {
  to: string;
  catalogNumber: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <Link to={to} className="tile">
      <span className="tile__art">
        <ReleaseArt catalogNumber={catalogNumber} title={title} />
      </span>
      <span className="tile__cat">{catalogNumber}</span>
      <span className="tile__title">{title}</span>
      {meta && <span className="tile__meta">{meta}</span>}
    </Link>
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
