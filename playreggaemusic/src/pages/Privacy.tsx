/**
 * Privacy (SPEC §6). Clearly marked PLACEHOLDER — binding policy supplied by the
 * owner before go-live. Paper ground.
 */
import { Container, Page, Eyebrow, Prose } from "../components/ui";

export default function Privacy() {
  return (
    <Page ground="paper">
      <Container width="read">
        <header className="page-head">
          <Eyebrow>Legal</Eyebrow>
          <h1>Privacy</h1>
          <p className="lede">
            [PLACEHOLDER — the label owner supplies a final, legally reviewed
            privacy policy before go-live. The outline below states intent.]
          </p>
        </header>

        <Prose>
          <h2>What we collect</h2>
          <p>
            Only what is needed to run the store: order and payment details
            (handled by our payment processor), and basic, privacy-respecting
            analytics about how the catalog is browsed.
          </p>

          <h2>Payments</h2>
          <p>
            Purchases are processed by a third-party payment provider. We do not
            store full card details on our own systems.
          </p>

          <h2>How we use it</h2>
          <p>
            To fulfil orders, grant your downloads, provide support, and improve
            the catalog. We do not sell personal data.
          </p>

          <h2>Your choices</h2>
          <p>
            You may request access to or deletion of your personal data via the
            contact addresses on the Press &amp; contact page.
          </p>
        </Prose>
      </Container>
    </Page>
  );
}
