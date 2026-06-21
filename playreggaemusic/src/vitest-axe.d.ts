/**
 * Type augmentation for the vitest-axe accessibility matcher. The matcher is
 * registered at runtime in src/test/setup.ts via expect.extend; this declares
 * `toHaveNoViolations` on Vitest's assertion interfaces so TS sees it. Declared
 * inline (rather than `extends AxeMatchers`) so the augmentation carries a
 * member and does not trip the empty-interface lint rule.
 */
import "vitest";

interface NoViolationsMatcherResult {
  message(): string;
  pass: boolean;
  actual: unknown[];
}

declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): NoViolationsMatcherResult;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): NoViolationsMatcherResult;
  }
}
