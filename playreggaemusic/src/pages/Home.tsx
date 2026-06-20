/**
 * Label home (B01 shell). Real catalog content — featured release, artist
 * spotlight (Roots Untold), latest releases — arrives in B03 once the data
 * model and catalog UI exist.
 */
export default function Home() {
  return (
    <section className="hero">
      <h1>The home of AI reggae music.</h1>
      <p className="tagline">
        An official AI-native reggae imprint. Roots-deep, forward-looking —
        artists, releases, and a catalog built for the next era of the sound.
      </p>
      <span className="ai-badge">AI-generated music</span>
    </section>
  );
}
