import { expect, test } from "@playwright/test";

test("login accepts email and password without a role picker", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const form = page.locator("form").first();
  await expect(form.getByLabel("Email")).toHaveAttribute("autocomplete", "email");
  await expect(form.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  await expect(form.getByLabel("Password")).toHaveAttribute("type", "password");
  await form.getByRole("button", { name: "Show" }).click();
  await expect(form.getByLabel("Password")).toHaveAttribute("type", "text");
  await expect(page.getByRole("combobox", { name: "Role" })).toBeHidden();
  await expect(page.getByText("Dev-only sign-in")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
});

test("forgot password and reset link states stay generic", async ({ page }) => {
  await page.goto("/forgot");
  await expect(page.getByRole("heading", { name: "Forgot password" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "email");
  await page.getByLabel("Email").fill("person@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");

  await page.goto("/auth/reset?error=invalid");
  await expect(page.getByText("This link is expired or invalid.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request another" })).toHaveAttribute("href", "/forgot");
  await expect(page.getByRole("textbox", { name: /^New password/ })).toHaveAttribute("autocomplete", "new-password");
});

test("admin invite page and account password fields are present", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByText("Dev preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invite" })).toBeVisible();
  await expect(page.getByRole("combobox")).toContainText("Customer");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invites are not sent")).toBeVisible();

  await page.goto("/account");
  await expect(page.getByLabel("Current password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("textbox", { name: /^New password/ })).toHaveAttribute("autocomplete", "new-password");
});

test("phone tabs stay on one line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs");
  for (const name of ["Record", "Jobs", "Results", "Estimate", "Account"]) {
    const link = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeLessThan(56);
  }
});

test("dev sign-in cannot grant admin", async ({ request }) => {
  const response = await request.post("/api/auth/dev", {
    data: { name: "Ada", email: "ada@example.com", role: "admin" },
  });
  expect(response.status()).toBe(400);
});
