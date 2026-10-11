import { test, expect } from "@playwright/test";

test("secondary OCR fields stay pending review by default", async ({ page }) => {
  // This test assumes the app is running and user is authenticated.
  await page.goto("http://localhost:5173");

  // Open dashboard and wait for OCR preview panel.
  await page.getByText("Dokument Vorschau").waitFor({ timeout: 30000 });

  // Secondary badge should be visible.
  await expect(page.getByText("Zu pruefen").first()).toBeVisible();

  // Keep default behavior (do not include secondary values).
  const toggle = page.getByLabel("Sekundaere Felder trotzdem uebernehmen");
  if (await toggle.isVisible()) {
    await expect(toggle).not.toBeChecked();
  }

  // Confirm mapping.
  await page.getByRole("button", { name: /Bestaetigen & Einfuegen/ }).click();

  // Pending review warning should appear and no forced overwrite should happen.
  await expect(page.getByText(/Pending Review markiert/)).toBeVisible();
});
