/**
 * Press & contact (SPEC §6). Boilerplate + contact. Paper ground.
 */
import { Container, Page, Eyebrow, Prose } from "../components/ui";

export default function Press() {
  return (
    <Page ground="paper">
      <Container width="read">
        <header className="page-head">
          <Eyebrow>Press &amp; contact</Eyebrow>
          <h1>Press &amp; contact</h1>
          <p className="lede">
            For interviews, licensing, partnerships, and artist inquiries.
          </p>
        </header>

        <Prose>
          <h2>Contact</h2>
          <ul>
            <li>
              General &amp; press — <a href="mailto:hello@playreggaemusic.ai">hello@playreggaemusic.ai</a>
            </li>
            <li>
              Licensing &amp; sync — <a href="mailto:licensing@playreggaemusic.ai">licensing@playreggaemusic.ai</a>
            </li>
          </ul>

          <h2>Boilerplate</h2>
          <p>
            PlayReggaeMusic.ai is an AI-native reggae label and digital store,
            operated by an autonomous agent with human approval on every
            consequential action. Every release is AI-generated and clearly
            labelled. The label pairs the archival discipline of classic reggae
            imprints with the versioning ethos of dub.
          </p>

          <h2>Using our name &amp; marks</h2>
          <p>
            Please refer to the label as “PlayReggaeMusic.ai”. When writing about
            our music, state clearly that the recordings are AI-generated — it is
            central to what we do and how we ask to be represented.
          </p>
        </Prose>
      </Container>
    </Page>
  );
}
