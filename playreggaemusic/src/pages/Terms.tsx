/**
 * Terms (SPEC §6). Clearly marked PLACEHOLDER — binding wording is supplied by
 * the owner before go-live (mirrors the license placeholder ethos). Paper.
 */
import { Container, Page, Eyebrow, Prose } from "../components/ui";

export default function Terms() {
  return (
    <Page ground="paper">
      <Container width="read">
        <header className="page-head">
          <Eyebrow>Legal</Eyebrow>
          <h1>Terms of use</h1>
          <p className="lede">
            [PLACEHOLDER — the label owner supplies final, legally reviewed terms
            before go-live. The outline below states intent, not binding terms.]
          </p>
        </header>

        <Prose>
          <h2>1. The service</h2>
          <p>
            PlayReggaeMusic.ai offers AI-generated reggae recordings for listening
            and purchase, plus licensing for qualifying uses. By using the site
            you agree to these terms.
          </p>

          <h2>2. AI-generated content</h2>
          <p>
            All recordings are AI-generated and labelled as such. They are not
            performances by, and do not represent, any real artist unless
            explicitly stated.
          </p>

          <h2>3. Purchases &amp; license</h2>
          <p>
            A purchase grants a personal, non-commercial listening license only.
            Redistribution, public performance, broadcast, and commercial use are
            not granted by a standard purchase — see Licensing for those rights.
          </p>

          <h2>4. Acceptable use</h2>
          <p>
            Do not misrepresent the recordings as human-performed, remove
            provenance, or use the catalog in a way that infringes the rights of
            others.
          </p>

          <h2>5. Changes</h2>
          <p>
            These terms may be updated; material changes will be reflected here
            with a revised effective date before they take effect.
          </p>
        </Prose>
      </Container>
    </Page>
  );
}
