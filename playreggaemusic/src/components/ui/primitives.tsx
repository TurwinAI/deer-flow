/**
 * Centralized UI primitives (docs/design/SPEC.md §5). Presentational only — no
 * data fetching. Every public page composes from these; pages add layout
 * (grid/gap) but no bespoke visual styling.
 */
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  HTMLAttributes,
  ReactNode,
} from "react";
import { Link } from "react-router-dom";

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---- Layout ----------------------------------------------------------- */

export function Container({
  width = "wide",
  className,
  children,
}: {
  width?: "wide" | "read";
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx("container", `container--${width}`, className)}>{children}</div>;
}

export function Page({
  ground = "dark",
  children,
}: {
  ground?: "dark" | "paper";
  children: ReactNode;
}) {
  return <div className={cx("page", ground === "paper" && "ground-paper page--paper")}>{children}</div>;
}

/* ---- Type ------------------------------------------------------------- */

export function Eyebrow({
  as: Tag = "p" as ElementType,
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cx("eyebrow", className)}>{children}</Tag>;
}

export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("prose", className)}>{children}</div>;
}

export function Hairline(props: HTMLAttributes<HTMLHRElement>) {
  return <hr {...props} className={cx("hairline", props.className)} />;
}

/* ---- Buttons ---------------------------------------------------------- */

type Variant = "primary" | "ghost" | "link";

export function Button({
  variant = "primary",
  className,
  ...rest
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={cx("btn", `btn--${variant}`, className)} />;
}

export function LinkButton({
  to,
  variant = "primary",
  className,
  children,
  ...rest
}: { to: string; variant?: Variant } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link to={to} className={cx("btn", `btn--${variant}`, className)} {...rest}>
      {children}
    </Link>
  );
}

/* ---- Tags / badges ---------------------------------------------------- */

export function Tag({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx("tag", className)}>{children}</span>;
}

/**
 * AI-generated badge (manifest §8.4). Keeps the accessible label the release
 * tests assert ("This release is AI-generated").
 */
export function AiBadge() {
  return (
    <span className="ai-badge" role="note" aria-label="This release is AI-generated">
      <span className="ai-badge__dot" aria-hidden="true" />
      AI-generated music
    </span>
  );
}

/* ---- Brand mark ------------------------------------------------------- */

export function Seal({ compact = false }: { compact?: boolean }) {
  return (
    <span className="seal" aria-label="PlayReggaeMusic.ai">
      <svg className="seal__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="22.5" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
        <circle cx="24" cy="24" r="3.1" fill="currentColor" />
        <text
          x="24"
          y="15.5"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="6.4"
          letterSpacing="1.2"
          fill="currentColor"
        >
          PRM
        </text>
      </svg>
      {!compact && <span className="seal__word">PlayReggaeMusic.ai</span>}
    </span>
  );
}
