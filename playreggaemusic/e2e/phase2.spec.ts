import { expect, test } from "@playwright/test";

/**
 * Phase-2 end-to-end human-in-the-loop flow (P2B10), run entirely in FIXTURES
 * mode (the app is built with VITE_USE_FIXTURES=1 by the webServer in
 * playwright.config.ts). Every data read/write, approval, and the agent run are
 * served from in-memory fixtures — there is NO live Firebase / Functions / Polar
 * / Anthropic call anywhere in this spec.
 *
 * Flow: public catalog (home) -> /admin (fixtures admin) -> /admin/approvals ->
 * approve a pending consequential action -> it disappears -> /admin/royalties
 * shows a per-artist statement -> /admin/distribution shows a delivered release
 * -> /admin/agent trigger a run -> the canned transcript appears.
 */
test("operate the gated label offline: approvals, royalties, distribution, agent run", async ({
  page,
}) => {
  // --- Public catalog (home) --------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /home of ai reggae music/i })).toBeVisible();

  // --- Admin console (fixtures admin) -----------------------------------
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /admin console/i })).toBeVisible();

  // --- Pending approvals: approve one, it disappears --------------------
  await page.getByRole("link", { name: /pending approvals/i }).click();
  await expect(page.getByRole("heading", { name: /pending approvals/i })).toBeVisible();
  // Two seeded consequential actions are pending.
  await expect(page.getByText("deliver_release")).toBeVisible();
  await expect(page.getByText("initiate_payout")).toBeVisible();

  // Approve the deliver_release action; it is removed from the list.
  await page.getByRole("button", { name: /approve deliver_release/i }).click();
  await expect(page.getByText("deliver_release")).toBeHidden();
  // The other approval is still listed.
  await expect(page.getByText("initiate_payout")).toBeVisible();

  // --- Royalty statements: a per-artist statement is shown --------------
  await page.goto("/admin/royalties");
  await expect(page.getByRole("heading", { name: /royalty statements/i })).toBeVisible();
  await expect(page.getByText("Roots Untold")).toBeVisible();
  // Net = gross 9.00 - deductions 1.00 - recoupment 0.00 = 8.00 USD.
  await expect(page.getByText("8.00 USD")).toBeVisible();

  // --- Distribution status: the release is delivered --------------------
  await page.goto("/admin/distribution");
  await expect(page.getByRole("heading", { name: /distribution status/i })).toBeVisible();
  await expect(page.getByText("Foundation Stones")).toBeVisible();
  await expect(page.getByRole("cell", { name: "delivered", exact: true })).toBeVisible();

  // --- Agent console: trigger a run, assert the canned transcript -------
  await page.goto("/admin/agent");
  await expect(page.getByRole("heading", { name: /agent console/i })).toBeVisible();
  await page.getByRole("button", { name: /trigger run/i }).click();
  await expect(page.getByRole("heading", { name: /transcript/i })).toBeVisible();
  await expect(page.getByText(/canned transcript, no live model call/i)).toBeVisible();
});
