/**
 * Release artifact page (SPEC §6). Large cover, mono tracklist with inline
 * preview players, buy affordance, AI provenance + license note. Test hooks
 * preserved: h1 title, track titles, <audio> labels, AI badge, buy button
 * label, license placeholder copy.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Container,
  Page,
  AiBadge,
  Tag,
  Button,
  LicenseNote,
  PlayButton,
} from "../components/ui";
import { ReleaseArt } from "../components/ui/cards";
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
import { fixturesEnabled } from "../lib/fixtures";

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
  const [confirmation, setConfirmation] = useState<string | null>(null);

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
      if (fixturesEnabled()) {
        setConfirmation("Checkout started — you'll be redirected to secure payment.");
        setBuying(false);
        return;
      }
      window.location.assign(checkoutUrl);
    } catch {
      setBuyError("Could not start checkout. Please try again.");
      setBuying(false);
    }
  }

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
          <p className="empty">Loading release…</p>
        </Container>
      </Page>
    );

  const { release, tracks, product } = view;

  return (
    <Page>
      <Container>
        <article className="release" aria-labelledby="release-title">
          <div className="release__art">
            <ReleaseArt catalogNumber={release.catalogNumber} title={release.title} />
          </div>

          <div>
            <header>
              <p className="release__cat">{release.catalogNumber}</p>
              <h1 id="release-title" className="release__title">
                {release.title}
              </h1>
              <div className="release__badges">
                <Tag>{release.type}</Tag>
                <Tag>{release.releaseDate}</Tag>
                <AiBadge />
              </div>
            </header>

            <section aria-labelledby="tracklist-heading">
              <h2 id="tracklist-heading" className="eyebrow" style={{ color: "var(--text-muted)" }}>
                Tracklist
              </h2>
              <ol className="tracklist">
                {tracks.map((track, i) => (
                  <li className="track" key={track.id}>
                    <PlayButton
                      track={{
                        id: `${release.id}:${track.id}`,
                        title: track.title,
                        subtitle: `${release.title} · ${release.catalogNumber}`,
                        src: previewUrl(track.previewClipPath),
                      }}
                      label={track.title}
                    />
                    <span className="track__no">{String(i + 1).padStart(2, "0")}</span>
                    <span className="track__title">{track.title}</span>
                    <span className="track__dur">{formatDuration(track.durationSec)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="buy-heading" className="buy">
              <h2 id="buy-heading" className="eyebrow" style={{ color: "var(--text-muted)", margin: 0 }}>
                Buy
              </h2>
              {product ? (
                <>
                  <p className="buy__price">{formatPrice(product)}</p>
                  <Button
                    type="button"
                    onClick={() => onBuy(product.id)}
                    disabled={buying}
                    aria-label={`Buy ${release.title} digital download`}
                  >
                    {buying ? "Starting checkout…" : "Buy digital download"}
                  </Button>
                  {buyError && (
                    <p role="alert" className="empty">
                      {buyError}
                    </p>
                  )}
                  {confirmation && (
                    <p role="status" className="checkout-confirmation">
                      {confirmation}
                    </p>
                  )}
                </>
              ) : (
                <p className="empty">Not yet available for purchase.</p>
              )}
              <LicenseNote />
            </section>
          </div>
        </article>
      </Container>
    </Page>
  );
}
