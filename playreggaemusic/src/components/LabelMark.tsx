/**
 * The PlayReggaeMusic.ai imprint mark. A stamp-style badge ("PRM") plus the
 * label wordmark — an imprint cue per the brief (§2). Catalog numbering and
 * release-artwork framing build on this in later batches.
 */
export default function LabelMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="label-mark" aria-label="PlayReggaeMusic.ai">
      <span className="stamp" aria-hidden="true">
        PRM
      </span>
      {!compact && <span>PlayReggaeMusic.ai</span>}
    </span>
  );
}
