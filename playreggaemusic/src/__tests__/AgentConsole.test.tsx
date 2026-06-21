/**
 * Agent console tests (B07). Auth + admin data layers MOCKED — no live Firebase
 * Auth / Functions / LLM. Covers: non-admin denied; admin can trigger a run and
 * see the (canned) transcript; axe a11y.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import AgentConsole from "../pages/AgentConsole";
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

const runAgentMock = vi.fn(async (prompt: string) => [
  { role: "system" as const, content: "You are the label manager." },
  { role: "human" as const, content: prompt },
  {
    role: "ai" as const,
    content: "Drafted a follow-up EP and put it on sale. (Canned, no live model.)",
  },
]);

vi.mock("../lib/admin", () => ({
  runAgent: (prompt: string) => runAgentMock(prompt),
}));

function renderConsole() {
  return render(
    <MemoryRouter initialEntries={["/admin/agent"]}>
      <AgentConsole />
    </MemoryRouter>,
  );
}

describe("Agent console (B07)", () => {
  beforeEach(() => {
    runAgentMock.mockClear();
    currentSession = { uid: "fixture-owner", email: "owner@playreggaemusic.ai", isAdmin: true };
  });

  it("denies a non-admin session", async () => {
    currentSession = { uid: "fan", email: null, isAdmin: false };
    renderConsole();
    expect(await screen.findByRole("heading", { name: /admin sign-in required/i })).toBeInTheDocument();
  });

  it("triggers a run and shows the canned transcript", async () => {
    renderConsole();
    fireEvent.click(await screen.findByRole("button", { name: /trigger run/i }));
    expect(await screen.findByText(/drafted a follow-up ep/i)).toBeInTheDocument();
    expect(runAgentMock).toHaveBeenCalledOnce();
    // No live model: the transcript came from the mocked data layer.
    expect(screen.getByRole("heading", { name: /transcript/i })).toBeInTheDocument();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderConsole();
    await screen.findByRole("heading", { name: /agent console/i });
    const results = await axe(container, {
      preload: false,
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  }, 15000);
});
