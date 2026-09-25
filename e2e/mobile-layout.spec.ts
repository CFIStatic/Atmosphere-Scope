import { expect, test } from "@playwright/test";

const viewports = [
  { name: "iphone", width: 390, height: 844 },
  { name: "android", width: 360, height: 800 },
  { name: "ipad", width: 768, height: 1024 },
  { name: "ipad-air", width: 820, height: 1180 },
];

const pages = ["/", "/record", "/jobs", "/review", "/results", "/estimate", "/estimate?report=underwriting", "/account", "/jobs/new", "/login", "/forgot", "/auth/reset", "/admin/users", "/admin/system"];

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
