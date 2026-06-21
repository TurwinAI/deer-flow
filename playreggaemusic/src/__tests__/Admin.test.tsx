/**
 * Admin console tests (B07). The auth + admin data layers are MOCKED, so the
 * page renders entirely from fixtures — NO live Firebase Auth / Functions /
 * Firestore. Covers: non-admin is denied; admin sees catalog + orders/revenue;
 * the create-artist form calls the (mocked) data layer; axe a11y.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import Admin from "../pages/Admin";
import type { AdminSession } from "../lib/auth";

let currentSession: AdminSession | null = {
  uid: "fixture-owner",
  email: "owner@playreggaemusic.ai",
  isAdmin: true,
};

vi.mock("../lib/auth", () => ({
  watchAdminSession: (cb: (s: AdminSession | null) => void) => {
    cb(currentSession);
    return () => {};
  },
}));

const createArtistMock = vi.fn(async (arg: { id: string; name: string; bio: string }) => ({
  id: arg.id,
  name: arg.name,
  bio: arg.bio,
  links: {},
}));

vi.mock("../lib/admin", () => ({
  listAdminArtists: vi.fn(async () => [
    { id: "roots-untold", name: "Roots Untold", bio: "", links: {} },
  ]),
  listAdminReleases: vi.fn(async () => [
    {
      id: "foundation-stones",
      artistId: "roots-untold",
      title: "Foundation Stones",
      catalogNumber: "PRM-001",
      type: "ep",
      releaseDate: "2026-07-04",
      aiGenerated: true,
    },
  ]),
  listAdminProducts: vi.fn(async () => [
    {
      id: "foundation-stones-download",
      type: "music_download",
      title: "Foundation Stones (Digital Download)",
      priceCents: 700,
      currency: "USD",
      releaseId: "foundation-stones",
    },
  ]),
  listOrders: vi.fn(async () => [
    {
      id: "order-fixture-1",
      customer: "cus_fixture",
      productId: "foundation-stones-download",
      amount: 700,
      currency: "USD",
      status: "paid",
      createdAt: "2026-06-15T12:00:00.000Z",
    },
  ]),
  createArtist: (arg: { id: string; name: string; bio: string }) => createArtistMock(arg),
  createRelease: vi.fn(),
  createProduct: vi.fn(),
}));

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Admin />
    </MemoryRouter>,
  );
}

describe("Admin console (B07)", () => {
  beforeEach(() => {
    createArtistMock.mockClear();
    currentSession = { uid: "fixture-owner", email: "owner@playreggaemusic.ai", isAdmin: true };
  });

  it("denies a non-admin session", async () => {
    currentSession = { uid: "fan", email: "fan@x.test", isAdmin: false };
    renderAdmin();
    expect(await screen.findByRole("heading", { name: /admin sign-in required/i })).toBeInTheDocument();
  });

  it("shows catalog, orders and revenue for an admin", async () => {
    renderAdmin();
    expect(await screen.findByRole("heading", { name: /admin console/i })).toBeInTheDocument();
    expect(await screen.findByText("Roots Untold")).toBeInTheDocument();
    expect(screen.getByText(/Foundation Stones \(PRM-001\)/)).toBeInTheDocument();
    // Revenue: one paid 700-cent order = 7.00 USD (shown in the summary line).
    expect(screen.getByText(/Paid revenue:/)).toBeInTheDocument();
    expect(screen.getByText(/across 1 order/i)).toBeInTheDocument();
    expect(screen.getByText("order-fixture-1")).toBeInTheDocument();
  });

  it("create-artist form calls the data layer", async () => {
    renderAdmin();
    await screen.findByRole("heading", { name: /admin console/i });
    fireEvent.change(screen.getByRole("textbox", { name: /^id \(slug\)/i }), {
      target: { value: "new-artist" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^name/i }), {
      target: { value: "New Artist" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save artist/i }));
    await waitFor(() =>
      expect(createArtistMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "new-artist", name: "New Artist" }),
      ),
    );
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderAdmin();
    await screen.findByRole("heading", { name: /admin console/i });
    const results = await axe(container, {
      preload: false,
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  }, 15000);
});
