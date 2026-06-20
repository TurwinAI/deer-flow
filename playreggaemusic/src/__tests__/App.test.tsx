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
});
