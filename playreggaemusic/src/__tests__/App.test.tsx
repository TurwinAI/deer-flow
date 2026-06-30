import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("App shell", () => {
  it("renders the landing hero and primary navigation", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /home of ai reggae music/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
  });

  it("discloses AI-generated provenance", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    // Standing footer disclosure (provenance is disclosed site-wide).
    expect(screen.getByText(/every release is ai-generated/i)).toBeInTheDocument();
  });

  it("resolves every primary nav link to a real route, not the catch-all (UI-14)", () => {
    render(
      <MemoryRouter initialEntries={["/releases"]}>
        <App />
      </MemoryRouter>,
    );
    // /releases renders the Releases index, NOT a fall-through to Home.
    expect(screen.getByRole("heading", { name: /^releases$/i, level: 1 })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /home of ai reggae music/i }),
    ).not.toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: /primary/i });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    const routed = new Set([
      "/",
      "/artists",
      "/releases",
      "/about",
      "/licensing",
      "/press",
      "/terms",
      "/privacy",
      "/admin",
    ]);
    for (const href of hrefs) {
      expect(routed.has(href ?? ""), `dangling nav link: ${href}`).toBe(true);
    }
    expect(document.querySelector('a[href="/shop"]')).toBeNull();
  });
});
