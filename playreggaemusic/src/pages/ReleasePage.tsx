/**
 * Release page (B06). Tracklist with preview playback, a Buy button that opens
 * a Polar checkout, the AI-generated badge, and the personal-license note.
 *
 * The catalog + checkout modules are imported (and mocked in tests), so this
 * page renders entirely from injected data with no live Firestore/Polar.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AiBadge from "../components/AiBadge";
import LicenseNote from "../components/LicenseNote";
import {
  getRelease,
  getProductForRelease,
  listTracksByRelease,
  previewUrl,
  type Product,
  type Release,
  type Track,
} from "../lib/catalog";
import { createCheckout } from "../lib/checkout";

interface ReleaseView {
  release: Release;
  tracks: Track[];
  product?: Product;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function formatPrice(product: Product): string {
  return `${(product.priceCents / 100).toFixed(2)} ${product.currency}`;
}

export default function ReleasePage() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const [view, setView] = useState<ReleaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    if (!releaseId) return;
    let active = true;
    Promise.all([
      getRelease(releaseId),
      listTracksByRelease(releaseId),
      getProductForRelease(releaseId),
    ])
      .then(([release, tracks, product]) => {
        if (!active) return;
        if (!release) {
          setError("Release not found.");
          return;
        }
        setView({ release, tracks, product });
      })
      .catch(() => active && setError("Could not load release."));
    return () => {
      active = false;
    };
  }, [releaseId]);

  async function onBuy(productId: string) {
    setBuying(true);
    setBuyError(null);
    try {
      const { checkoutUrl } = await createCheckout(productId);
      window.location.assign(checkoutUrl);
    } catch {
      setBuyError("Could not start checkout. Please try again.");
      setBuying(false);
    }
  }

  if (error) return <p role="alert">{error}</p>;
  if (!view) return <p>Loading release…</p>;

  const { release, tracks, product } = view;

  return (
    <article aria-labelledby="release-title">
      <header className="release-header">
        <p className="catalog-number">{release.catalogNumber}</p>
        <h1 id="release-title">{release.title}</h1>
        <AiBadge />
      </header>

      <section aria-labelledby="tracklist-heading">
        <h2 id="tracklist-heading">Tracklist</h2>
        <ol className="tracklist">
          {tracks.map((track) => (
            <li key={track.id}>
              <span className="track-title">{track.title}</span>
              <span className="track-duration">{formatDuration(track.durationSec)}</span>
              <audio
                controls
                preload="none"
                src={previewUrl(track.previewClipPath)}
                aria-label={`Preview of ${track.title}`}
              >
                Your browser does not support audio preview playback.
              </audio>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="buy-heading" className="buy">
        <h2 id="buy-heading">Buy</h2>
        {product ? (
          <>
            <p className="price">{formatPrice(product)}</p>
            <button
              type="button"
              onClick={() => onBuy(product.id)}
              disabled={buying}
              aria-label={`Buy ${release.title} digital download`}
            >
              {buying ? "Starting checkout…" : "Buy digital download"}
            </button>
            {buyError && <p role="alert">{buyError}</p>}
          </>
        ) : (
          <p>Not yet available for purchase.</p>
        )}
        <LicenseNote />
      </section>
    </article>
  );
}
