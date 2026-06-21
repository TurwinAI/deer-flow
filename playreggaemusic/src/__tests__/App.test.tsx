import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("App shell (B01)", () => {
  it("renders the label hero and primary navigation", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /home of ai reggae music/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/playreggaemusic\.ai/i)).toBeInTheDocument();
  });

  it("discloses AI-generated provenance (brief §8.4)", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText(/ai-generated music/i)).toBeInTheDocument();
  });

  it("resolves every primary nav link to a real route, not the catch-all (UI-14)", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/releases"]}>
        <App />
      </MemoryRouter>,
    );
    // /releases must render the Releases index, NOT fall through to Home.
    expect(
      screen.getByRole("heading", { name: /^releases$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /home of ai reggae music/i }),
    ).not.toBeInTheDocument();
    // No nav link may point at a route that does not exist (e.g. the old /shop).
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    const routed = new Set(["/", "/artists", "/releases", "/admin"]);
    for (const href of hrefs) {
      expect(routed.has(href ?? ""), `dangling nav link: ${href}`).toBe(true);
    }
    expect(container.querySelector('a[href="/shop"]')).toBeNull();
  });
});
