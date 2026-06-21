/**
 * Component tests for the P2B10 human-in-the-loop admin pages: Pending Approvals,
 * Distribution status, and Royalty statements. The auth + admin data layers are
 * MOCKED, so each page renders entirely from fixtures — NO live Firebase Auth /
 * Functions / Firestore call. Covers: non-admin is denied; admin sees the
 * fixture data; approving removes a pending item; axe a11y on the Approvals page
 * (color-contrast stays disabled in jsdom, as in Admin.test).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import AdminApprovals from "../pages/AdminApprovals";
import AdminDistribution from "../pages/AdminDistribution";
import AdminRoyalties from "../pages/AdminRoyalties";
import type { AdminSession } from "../lib/auth";
import type {
  DistributionRow,
  PendingApproval,
  RoyaltyStatementRow,
} from "../lib/admin";

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

// A mutable pending-approvals store so the mock mirrors the real "approve
// removes it" behaviour the page relies on.
let pending: PendingApproval[] = [];
const approveMock = vi.fn(async (approvalId: string) => {
  pending = pending.filter((p) => p.approvalId !== approvalId);
});

const distributions: DistributionRow[] = [
  {
    releaseId: "foundation-stones",
    title: "Foundation Stones",
    status: "delivered",
    scheduledAt: "2026-07-04T00:00:00.000Z",
    deliveredAt: "2026-07-04T01:00:00.000Z",
  },
];

const statements: RoyaltyStatementRow[] = [
  {
    id: "roots-untold__2026-Q2",
    artistId: "roots-untold",
    artistName: "Roots Untold",
    period: "2026-Q2",
    grossCents: 900,
    deductionsCents: 100,
    recoupmentAppliedCents: 0,
    netCents: 800,
  },
];

vi.mock("../lib/admin", () => ({
  listPendingApprovals: vi.fn(async () => pending.map((p) => ({ ...p }))),
  approvePending: (approvalId: string) => approveMock(approvalId),
  listDistributions: vi.fn(async () => distributions.map((d) => ({ ...d }))),
  listRoyaltyStatements: vi.fn(async () => statements.map((s) => ({ ...s }))),
}));

function renderAt(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("Pending approvals (P2B10)", () => {
  beforeEach(() => {
    currentSession = { uid: "fixture-owner", email: "owner@playreggaemusic.ai", isAdmin: true };
    approveMock.mockClear();
    pending = [
      {
        approvalId: "deliver_release__abc",
        tool: "deliver_release",
        argsSummary: 'releaseId: "foundation-stones"',
        createdAt: "2026-06-20T09:00:00.000Z",
      },
      {
        approvalId: "initiate_payout__def",
        tool: "initiate_payout",
        argsSummary: 'payoutId: "payout__roots-untold__2026-Q2"',
        createdAt: "2026-06-20T09:05:00.000Z",
      },
    ];
  });

  it("denies a non-admin session", async () => {
    currentSession = { uid: "fan", email: "fan@x.test", isAdmin: false };
    renderAt(<AdminApprovals />);
    expect(
      await screen.findByRole("heading", { name: /admin sign-in required/i }),
    ).toBeInTheDocument();
  });

  it("lists pending approvals for an admin", async () => {
    renderAt(<AdminApprovals />);
    expect(await screen.findByRole("heading", { name: /pending approvals/i })).toBeInTheDocument();
    expect(await screen.findByText("deliver_release")).toBeInTheDocument();
    expect(screen.getByText("initiate_payout")).toBeInTheDocument();
  });

  it("approving removes the item from the list", async () => {
    renderAt(<AdminApprovals />);
    await screen.findByText("deliver_release");
    fireEvent.click(screen.getByRole("button", { name: /approve deliver_release/i }));
    await waitFor(() => expect(approveMock).toHaveBeenCalledWith("deliver_release__abc"));
    await waitFor(() => expect(screen.queryByText("deliver_release")).not.toBeInTheDocument());
    // The other approval is still listed.
    expect(screen.getByText("initiate_payout")).toBeInTheDocument();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderAt(<AdminApprovals />);
    await screen.findByRole("heading", { name: /pending approvals/i });
    const results = await axe(container, {
      preload: false,
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  }, 15000);
});

describe("Distribution status (P2B10)", () => {
  beforeEach(() => {
    currentSession = { uid: "fixture-owner", email: "owner@playreggaemusic.ai", isAdmin: true };
  });

  it("denies a non-admin session", async () => {
    currentSession = { uid: "fan", email: "fan@x.test", isAdmin: false };
    renderAt(<AdminDistribution />);
    expect(
      await screen.findByRole("heading", { name: /admin sign-in required/i }),
    ).toBeInTheDocument();
  });

  it("lists releases with their distribution status", async () => {
    renderAt(<AdminDistribution />);
    expect(await screen.findByRole("heading", { name: /distribution status/i })).toBeInTheDocument();
    expect(await screen.findByText("Foundation Stones")).toBeInTheDocument();
    expect(screen.getByText("delivered")).toBeInTheDocument();
  });
});

describe("Royalty statements (P2B10)", () => {
  beforeEach(() => {
    currentSession = { uid: "fixture-owner", email: "owner@playreggaemusic.ai", isAdmin: true };
  });

  it("denies a non-admin session", async () => {
    currentSession = { uid: "fan", email: "fan@x.test", isAdmin: false };
    renderAt(<AdminRoyalties />);
    expect(
      await screen.findByRole("heading", { name: /admin sign-in required/i }),
    ).toBeInTheDocument();
  });

  it("lists per-artist statements with reconciling totals", async () => {
    renderAt(<AdminRoyalties />);
    expect(await screen.findByRole("heading", { name: /royalty statements/i })).toBeInTheDocument();
    expect(await screen.findByText("Roots Untold")).toBeInTheDocument();
    // Net = gross(9.00) - deductions(1.00) - recoupment(0.00) = 8.00 USD.
    expect(screen.getByText("8.00 USD")).toBeInTheDocument();
    expect(screen.getByText("9.00 USD")).toBeInTheDocument();
  });
});
