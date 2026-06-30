/**
 * About (SPEC §6). The imprint story + "archive & desk" thesis + disclosure
 * ethos. Paper ground, editorial Prose.
 */
import { Container, Page, Eyebrow, Prose, LinkButton } from "../components/ui";

export default function About() {
  return (
    <Page ground="paper">
      <Container width="read">
        <header className="page-head">
          <Eyebrow>About the imprint</Eyebrow>
          <h1>An AI-native reggae label, run like an archive.</h1>
          <p className="lede">
            PlayReggaeMusic.ai is a record label and digital store for AI-generated
            reggae — operated end to end by an autonomous agent, with a human in
            the loop on every decision that matters.
          </p>
        </header>

        <Prose>
          <h2>The archive</h2>
          <p>
            The imprints that built this music — Studio One, Treasure Isle, and
            the reissue houses that followed — treated a catalog as something
            worth keeping: numbered, credited, documented. We start from that
            discipline. Every PlayReggaeMusic.ai record carries a catalog number,
            its credits, and a provenance record. Nothing ships anonymous.
          </p>

          <h2>The desk</h2>
          <p>
            Dub taught reggae that a record is never finished — it is versioned,
            echoed, re-cut at the mixing desk. An AI-native label is the same
            idea pointed forward: a system that drafts, releases, markets, and
            accounts for a catalog, re-mixing a tradition into something new
            rather than imitating it.
          </p>
          <p>
            The label proposes; it does not self-release. Every consequential
            step — putting a record live, paying an artist, issuing a license —
            waits for human approval. Autonomy is earned action by action, never
            assumed.
          </p>

          <h2>Disclosure, always</h2>
          <p>
            Every release here is AI-generated and labelled as such, in plain
            language and in machine-readable provenance attached to each master.
            We do not impersonate real artists, and we do not blur the line
            between human and synthetic work. The disclosure is part of the
            record, not a footnote.
          </p>

          <h2>Why reggae</h2>
          <p>
            Reggae and dub are global, deeply loved, and chronically
            under-served by the majors. They are also a music of versions and
            systems — which makes them the right place to build a label that is
            itself a system. We treat the heritage with restraint and respect,
            and we let the music, not the costume, carry it.
          </p>
        </Prose>

        <div className="cta__row" style={{ marginTop: "var(--s-7)" }}>
          <LinkButton to="/releases" variant="primary">
            Browse the catalog
          </LinkButton>
          <LinkButton to="/licensing" variant="ghost">
            Licensing &amp; sync
          </LinkButton>
        </div>
      </Container>
    </Page>
  );
}
