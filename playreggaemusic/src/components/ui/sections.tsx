/**
 * Composite section helpers (SPEC §5).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Eyebrow } from "./primitives";
import { AI_GENERATED_DISCLOSURE, PERSONAL_LICENSE_PLACEHOLDER } from "../../lib/license";

export function SectionHeading({
  eyebrow,
  title,
  id,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  id?: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 id={id}>{title}</h2>
      </div>
      {action && (
        <Link to={action.to} className="section-head__action">
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/**
 * Personal-listening license note + AI disclosure (manifest §8.2/§8.4). Keeps
 * the placeholder copy the release tests assert. role="note" (not a landmark).
 */
export function LicenseNote() {
  return (
    <div className="license-note" role="note" aria-label="License and AI disclosure">
      <p className="license-note__disclosure">{AI_GENERATED_DISCLOSURE}</p>
      <p>{PERSONAL_LICENSE_PLACEHOLDER}</p>
    </div>
  );
}
