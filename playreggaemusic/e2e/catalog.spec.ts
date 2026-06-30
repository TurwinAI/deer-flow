import { expect, test } from "@playwright/test";

/**
 * End-to-end catalog + admin + agent flow (B07), run entirely in FIXTURES mode
 * (the app is built with VITE_USE_FIXTURES=1 by the webServer in
 * playwright.config.ts). Every data read/write and the agent run are served
 * from in-memory fixtures — there is NO live Firebase / Functions / Polar /
 * Anthropic call anywhere in this spec.
 *
 * Flow: home -> Artists -> Roots Untold -> Foundation Stones release
 * (tracklist + AI badge + license note) -> Buy (mocked checkout, confirmation
 * shown) -> /admin (fixtures admin) -> create a catalog item -> /admin/agent ->
 * trigger a run -> canned transcript appears.
 */
test("browse catalog, buy (mocked), admin CRUD, and trigger an agent run", async ({ page }) => {
  // --- Home --------------------------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /home of ai reggae music/i })).toBeVisible();

  // --- Artists list ------------------------------------------------------
  await page.getByRole("link", { name: "Artists" }).first().click();
  await expect(page.getByRole("heading", { name: /^Artists$/ })).toBeVisible();

  // --- Roots Untold artist page -----------------------------------------
  await page.getByRole("link", { name: "Roots Untold" }).click();
  await expect(page.getByRole("heading", { name: "Roots Untold", level: 1 })).toBeVisible();

  // --- Foundation Stones release page -----------------------------------
  // Click the caption link (below the artwork; the centered play button overlays
  // the cover link, so target the caption to navigate).
  await page.locator("a.tile__cap").filter({ hasText: /foundation stones/i }).first().click();
  await expect(page.getByRole("heading", { name: /foundation stones/i, level: 1 })).toBeVisible();

  // Tracklist, AI badge, and personal-license note are all visible.
  await expect(page.getByText("Jah Light Dub")).toBeVisible();
  await expect(page.getByLabel(/this release is ai-generated/i)).toBeVisible();
  await expect(page.getByText(/personal-listening license only/i)).toBeVisible();

  // --- Buy (mocked checkout in fixtures mode) ---------------------------
  await page.getByRole("button", { name: /buy foundation stones digital download/i }).click();
  await expect(page.getByText(/checkout started/i)).toBeVisible();

  // --- Admin console (fixtures admin) -----------------------------------
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /admin console/i })).toBeVisible();
  await expect(page.getByText("Roots Untold")).toBeVisible();
  await expect(page.getByText(/Paid revenue:/)).toBeVisible();

  // Create a new catalog item (artist) and see it appear in the listing.
  await page.getByLabel(/^ID \(slug\)/i).fill("studio-one-ai");
  await page.getByLabel(/^Name/i).fill("Studio One AI");
  await page.getByRole("button", { name: /save artist/i }).click();
  await expect(page.getByRole("status")).toContainText(/saved artist studio-one-ai/i);
  await expect(page.getByText("Studio One AI")).toBeVisible();

  // --- Agent console: trigger a run, assert the canned transcript -------
  await page.getByRole("link", { name: /open the agent console/i }).click();
  await expect(page.getByRole("heading", { name: /agent console/i })).toBeVisible();
  await page.getByRole("button", { name: /trigger run/i }).click();
  await expect(page.getByRole("heading", { name: /transcript/i })).toBeVisible();
  await expect(page.getByText(/canned transcript, no live model call/i)).toBeVisible();
});
