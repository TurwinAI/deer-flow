/**
 * Licensing & sync (SPEC §6). Pitch + how to request. Paper ground.
 */
import { Container, Page, Eyebrow, Prose, LinkButton } from "../components/ui";

export default function Licensing() {
  return (
    <Page ground="paper">
      <Container width="read">
        <header className="page-head">
          <Eyebrow>Licensing &amp; sync</Eyebrow>
          <h1>Clear reggae &amp; dub for screen and brand.</h1>
          <p className="lede">
            Master and composition in one place, AI-disclosed and rights-clean —
            built to clear fast for film, TV, games, and advertising.
          </p>
        </header>

        <Prose>
          <h2>What you can license</h2>
          <ul>
            <li>
              <strong>Sync licenses</strong> — recordings for use in visual
              media, by territory and term.
            </li>
            <li>
              <strong>Masters &amp; compositions</strong> — both halves held by
              the label, so clearance is one conversation, not two.
            </li>
            <li>
              <strong>Custom &amp; bespoke</strong> — riddims and versions built
              to a brief, in the label's roots-and-dub vocabulary.
            </li>
          </ul>

          <h2>Why it clears cleanly</h2>
          <p>
            Every recording carries an ISRC, every composition a registered
            work, and every release a provenance record stating it is
            AI-generated. There is no sample-clearance tail and no disputed
            authorship — the rights position is documented from the start.
          </p>

          <h2>How to request</h2>
          <p>
            Tell us the recording, the media, the territory, and the term. We
            confirm the master and composition are clearable, then issue the
            license on approval. Binding license wording is finalized with the
            label before any placement goes live.
          </p>
        </Prose>

        <div className="cta__row" style={{ marginTop: "var(--s-7)" }}>
          <LinkButton to="/press" variant="primary">
            Contact for licensing
          </LinkButton>
          <LinkButton to="/releases" variant="ghost">
            Hear the catalog
          </LinkButton>
        </div>
      </Container>
    </Page>
  );
}
