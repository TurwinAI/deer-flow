/**
 * AI-generated badge (manifest §8.4). Shown on every release. Carries an
 * accessible label so screen readers announce the AI provenance.
 */
export default function AiBadge() {
  return (
    <span className="ai-badge" role="note" aria-label="This release is AI-generated">
      AI-generated music
    </span>
  );
}
