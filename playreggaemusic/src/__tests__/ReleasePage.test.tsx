/**
 * Release page tests (B06). The catalog + checkout data layers are MOCKED with
 * vi.mock, so the page renders entirely from fixtures — NO live Firestore and
 * NO live Polar/Functions call. Asserts tracklist, AI badge, buy button, and
 * the personal-license note render; plus an axe a11y check (no violations).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import ReleasePage from "../pages/ReleasePage";
import type { Product, Release, Track } from "../lib/catalog";

const RELEASE: Release = {
  id: "foundation-stones",
  artistId: "roots-untold",
  title: "Foundation Stones",
  catalogNumber: "PRM-001",
  type: "ep",
  releaseDate: "2026-07-04",
  aiGenerated: true,
};

const TRACKS: Track[] = [
  { id: "t1", releaseId: "foundation-stones", title: "Foundation Stones", durationSec: 218, previewClipPath: "previews/fs/01.mp3" },
  { id: "t2", releaseId: "foundation-stones", title: "Jah Light Dub", durationSec: 245, previewClipPath: "previews/fs/02.mp3" },
];

const PRODUCT: Product = {
  id: "foundation-stones-download",
  type: "music_download",
  title: "Foundation Stones (Digital Download)",
  priceCents: 700,
  currency: "USD",
  releaseId: "foundation-stones",
};

const createCheckoutMock = vi.fn();

vi.mock("../lib/catalog", () => ({
  getRelease: vi.fn(async () => RELEASE),
  listTracksByRelease: vi.fn(async () => TRACKS),
  getProductForRelease: vi.fn(async () => PRODUCT),
  previewUrl: (p: string) => `https://example.test/${p}`,
}));

vi.mock("../lib/checkout", () => ({
  createCheckout: (...args: unknown[]) => createCheckoutMock(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/releases/foundation-stones"]}>
      <Routes>
        <Route path="/releases/:releaseId" element={<ReleasePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReleasePage (B06)", () => {
  beforeEach(() => {
    createCheckoutMock.mockReset();
  });

  it("shows tracklist, AI badge, buy button and license note", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /foundation stones/i, level: 1 })).toBeInTheDocument();

    // Tracklist
    expect(screen.getByText("Jah Light Dub")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    // Preview playback affordance (inline play button feeding the global player)
    expect(screen.getByRole("button", { name: /play foundation stones/i })).toBeInTheDocument();

    // AI badge
    expect(screen.getByLabelText(/this release is ai-generated/i)).toBeInTheDocument();

    // Buy button
    expect(screen.getByRole("button", { name: /buy foundation stones digital download/i })).toBeInTheDocument();

    // Personal-license note (placeholder copy)
    expect(screen.getByText(/personal-listening license only/i)).toBeInTheDocument();
    expect(screen.getByText(/placeholder license/i)).toBeInTheDocument();
  });

  it("buy button calls the (mocked) checkout with the product id", async () => {
    createCheckoutMock.mockResolvedValue({ checkoutUrl: "https://sandbox.polar.sh/checkout/x", checkoutId: "c1" });
    // jsdom does not implement navigation; replace location with a mock whose
    // `assign` we can observe, so the redirect is inert and assertable.
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, assign },
    });
    try {
      renderPage();
      const button = await screen.findByRole("button", { name: /buy foundation stones digital download/i });
      fireEvent.click(button);
      await waitFor(() => expect(createCheckoutMock).toHaveBeenCalledWith("foundation-stones-download"));
      await waitFor(() => expect(assign).toHaveBeenCalledWith("https://sandbox.polar.sh/checkout/x"));
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: /foundation stones/i, level: 1 });
    // color-contrast requires a real layout/canvas (jsdom has no getContext),
    // so it cannot be evaluated here; disable just that rule. All other WCAG
    // checks (landmarks, names, roles, alt text, labels) run normally.
    const results = await axe(container, { preload: false, rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  }, 15000);
});
