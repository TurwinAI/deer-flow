/**
 * Artist page tests (B06). The catalog data layer is MOCKED — no live
 * Firestore. Asserts the bio and the artist's releases render.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import ArtistPage from "../pages/ArtistPage";
import type { Artist, Release } from "../lib/catalog";

const ARTIST: Artist = {
  id: "roots-untold",
  name: "Roots Untold",
  bio: "Flagship roots-reggae project. All tracks are AI-generated.",
  links: { spotify: "https://open.spotify.com/artist/roots-untold" },
};

const RELEASES: Release[] = [
  {
    id: "foundation-stones",
    artistId: "roots-untold",
    title: "Foundation Stones",
    catalogNumber: "PRM-001",
    type: "ep",
    releaseDate: "2026-07-04",
    aiGenerated: true,
  },
];

vi.mock("../lib/catalog", () => ({
  getArtist: vi.fn(async () => ARTIST),
  listReleasesByArtist: vi.fn(async () => RELEASES),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/artists/roots-untold"]}>
      <Routes>
        <Route path="/artists/:artistId" element={<ArtistPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ArtistPage (B06)", () => {
  it("renders the artist bio and releases", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /roots untold/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/flagship roots-reggae project/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /foundation stones \(prm-001\)/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /spotify/i })).toBeInTheDocument();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: /roots untold/i, level: 1 });
    // color-contrast needs a real layout (no canvas in jsdom); disable it only.
    const results = await axe(container, { preload: false, rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  }, 15000);
});
