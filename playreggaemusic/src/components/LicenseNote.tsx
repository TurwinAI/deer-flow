import { AI_GENERATED_DISCLOSURE, PERSONAL_LICENSE_PLACEHOLDER } from "../lib/license";

/**
 * Personal-listening license note + AI disclosure (manifest §8.2 / §8.4).
 * Rendered near the Buy affordance on the Release page. The license text is a
 * PLACEHOLDER until the owner supplies binding wording.
 *
 * Uses `role="note"` (not <aside>) so it is NOT a landmark — a complementary
 * landmark nested inside the page's section/article would be an a11y violation
 * (landmark-complementary-is-top-level).
 */
export default function LicenseNote() {
  return (
    <div className="license-note" role="note" aria-label="License and AI disclosure">
      <p className="disclosure">{AI_GENERATED_DISCLOSURE}</p>
      <p className="license">{PERSONAL_LICENSE_PLACEHOLDER}</p>
    </div>
  );
}
