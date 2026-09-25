import { chromium, expect, test } from "@playwright/test";

const viewports = [
  { name: "iphone", width: 390, height: 844 },
  { name: "android", width: 360, height: 800 },
  { name: "ipad", width: 768, height: 1024 },
  { name: "ipad-air", width: 820, height: 1180 },
];

const pages = ["/", "/dashboard", "/record", "/jobs", "/review", "/results", "/estimate", "/estimate?report=underwriting", "/account", "/jobs/new", "/login", "/forgot", "/auth/reset", "/admin/users", "/admin/system"];

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of pages) {
      test(`${path} has no horizontal overflow`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const report = await page.evaluate(() => {
          const view = document.documentElement.clientWidth;
          const wide = [...document.body.querySelectorAll("*")].filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && (box.right > view + 1 || box.left < -1);
          }).slice(0, 6).map((element) => `${element.tagName}.${String((element as HTMLElement).className).slice(0, 80)}`);
          const input = document.querySelector("input, select, textarea");
          const font = input ? parseFloat(getComputedStyle(input).fontSize) : parseFloat(getComputedStyle(document.body).fontSize);
          const button = [...document.querySelectorAll("a.btn, button.btn, nav a")].find((element) => element.getBoundingClientRect().height >= 1);
          const target = button ? button.getBoundingClientRect().height : 44;
          return { scroll: document.documentElement.scrollWidth, view, wide, font, target };
        });
        expect(report.wide, report.wide.join(", ")).toEqual([]);
        expect(report.scroll).toBeLessThanOrEqual(report.view + 1);
        expect(report.font).toBeGreaterThanOrEqual(16);
        expect(report.target).toBeGreaterThanOrEqual(44);
      });
    }
  });
}

test("old routes redirect into the job flow", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/record$/);
  await context.addCookies([{ name: "scope_start", value: "jobs", url: "http://127.0.0.1:3099/" }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/jobs$/);
  await context.clearCookies();
  await page.goto("/measure");
  await expect(page).toHaveURL(/\/record$/);
  await page.goto("/walk");
  await expect(page).toHaveURL(/\/record$/);
  await page.goto("/contents");
  await expect(page).toHaveURL(/\/results$/);
  await page.goto("/claims");
  await expect(page).toHaveURL(/\/estimate$/);
  await page.goto("/underwriting");
  await expect(page).toHaveURL(/\/estimate\?report=underwriting$/);
});

test("record is the shutter only and the sheet is on account", async ({ page }) => {
  await page.goto("/record");
  await expect(page.getByText("Allow camera access, or open this page on a phone.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help" })).toHaveCount(0);
  await expect(page.getByText("Attach to existing job")).toHaveCount(0);
  await expect(page.locator(".frame-guide")).toHaveCount(0);

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Calibration sheet" })).toBeVisible();
  await expect(page.getByText("Place the sheet flat on the floor, in view of the camera, then record.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download sheet PDF" })).toHaveAttribute("href", "/api/calibration-target");

  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3099",
    permissions: ["camera", "microphone"],
    viewport: { width: 390, height: 844 },
  });
  const live = await context.newPage();
  await live.goto("/record");
  await expect(live.getByRole("button", { name: "Record" })).toBeVisible();
  await expect(live.getByText("Place the calibration sheet on the floor, then record.")).toBeVisible();
  await expect(live.locator(".camera-controls button")).toHaveCount(1);
  await expect(live.getByRole("button", { name: "Upload" })).toHaveCount(0);
  await expect(live.getByRole("button", { name: "Help" })).toHaveCount(0);
  await expect(live.locator(".frame-guide")).toHaveCount(0);
  await context.close();
  await browser.close();
});
