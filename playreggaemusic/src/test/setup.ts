import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

// Register the vitest-axe accessibility matcher (toHaveNoViolations).
expect.extend(axeMatchers);
