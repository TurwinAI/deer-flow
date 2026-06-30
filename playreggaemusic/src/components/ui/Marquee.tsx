/**
 * Dub ticker (SPEC §4) — a slow, edge-faded mono marquee of catalog numbers and
 * label phrases. The "version/echo" motif of the mixing desk. Pause on hover.
 * Reduced-motion: the CSS animation is disabled globally, so it renders as a
 * static line (still readable, never empty).
 */
export default function Marquee({ items }: { items: string[] }) {
  // Duplicate the sequence so the translateX loop is seamless.
  const run = [...items, ...items];
  return (
    <div className="marquee" role="presentation" aria-hidden="true">
      <div className="marquee__track">
        {run.map((item, i) => (
          <span className="marquee__item" key={i}>
            {item}
            <span className="marquee__sep">◦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
