import { test, expect, type Locator, type Page } from "@playwright/test";
import { fixture } from "./catalogue.fixture";

// Scroll task 1 (DocHub web-biotact/tasks/storefront-scroll-search, Captain 2026-11-12):
// the 25 acceptance checks with a 2 px tolerance. The fixture names stand in for the live
// ones: «Наборы» (empty) for «Эксклюзивные сеты», «Техника» (empty) for «Техника Healthy
// Life Style», «Дополнительная 99» (4 products) for «Товары ЗОЖ».

/** Reads answer late, so a returning page first renders short, as on the live site. */
async function slowReads(page: Page) {
  await page.route(/\/api\/v1\/(products|categories)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fallback();
  });
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** Scrolls to `y` ("bottom" for the page end) and checks the page really got there. */
async function at(page: Page, y: number | "bottom") {
  const target = await page.evaluate(
    (v) =>
      v === "bottom"
        ? document.documentElement.scrollHeight - window.innerHeight
        : v,
    y,
  );
  await page.evaluate((v) => window.scrollTo(0, v), target);
  await expect.poll(() => scrollY(page)).toBe(target);
}

/** The position after the page's data has loaded, also a moment later. */
async function expectAt(page: Page, loaded: Locator, y: number) {
  await expect(loaded.first()).toBeVisible();
  for (const pause of [0, 400]) {
    await page.waitForTimeout(pause);
    await expect
      .poll(async () => Math.abs((await scrollY(page)) - y))
      .toBeLessThanOrEqual(2);
  }
}

/** Follows a link without the pointer scrolling it into view first. */
const follow = (link: Locator) => link.evaluate((a: HTMLElement) => a.click());

test("navigation opens pages at the top; Back, Forward and language keep positions (desktop 1–20)", async ({
  page,
}) => {
  // Every step waits for slowed reads and checks its position twice.
  test.setTimeout(120_000);
  await fixture(page);
  await slowReads(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const count = page.locator(".result-count"),
    home = page.locator('[data-category="product"] article'),
    detail = page.locator(".product-detail h1, main h1"),
    sideMenu = page.locator(".sidebar .nav-primary"),
    tabs = page.locator(".filter-row");
  await page.goto("/#home?lang=ru");
  await expect(home).toHaveCount(40);

  // 1. Side menu → «Все товары» from 900.
  await at(page, 900);
  await follow(sideMenu.getByRole("link", { name: "Все товары" }));
  await expectAt(page, count, 0);
  // 2. Tab «Наборы» from 1500.
  await at(page, 1500);
  await follow(tabs.getByRole("link", { name: "Наборы", exact: true }));
  await expect(page).toHaveURL(/category=302/);
  await expectAt(page, count, 0);
  // 3. Tab «Техника» from 1500 (on «Нутриенты»: «Наборы» is too short to scroll).
  await follow(tabs.getByRole("link", { name: "Нутриенты", exact: true }));
  await expectAt(page, count, 0);
  await at(page, 1500);
  await follow(tabs.getByRole("link", { name: "Техника", exact: true }));
  await expect(page).toHaveURL(/category=303/);
  await expectAt(page, count, 0);
  // 4. Tab «Дополнительная 99» from the bottom of «Все товары».
  await follow(tabs.getByRole("link", { name: "Все товары", exact: true }));
  await expectAt(page, count, 0);
  await at(page, "bottom");
  await follow(tabs.getByRole("link", { name: "Дополнительная 99" }));
  await expect(page).toHaveURL(/category=1099/);
  await expectAt(page, count, 0);
  // 5. Tab «Все товары» from 1500 (on «Нутриенты»).
  await follow(tabs.getByRole("link", { name: "Нутриенты", exact: true }));
  await expectAt(page, count, 0);
  await at(page, 1500);
  await follow(tabs.getByRole("link", { name: "Все товары", exact: true }));
  await expect(page).toHaveURL(/#catalogue\?page=1&lang=ru$/);
  await expectAt(page, count, 0);
  // 6. Page 2 of the list from 3500.
  await at(page, 3500);
  await follow(page.locator(".pagination a").last());
  await expect(page).toHaveURL(/page=2/);
  await expectAt(page, count, 0);
  // 7. A product card of page 2 from 1800.
  await at(page, 1800);
  await follow(page.locator('[data-product-id="4025"] h3 a'));
  await expect(page).toHaveURL(/#product\?id=4025/);
  await expectAt(page, detail, 0);

  // 11–18 follow 7: the catalogue was left at 1800 (page 2) and 3500 (page 1).
  // 11. On the product at 300, Back → page 2 at 1800.
  await at(page, 300);
  await page.goBack();
  await expectAt(page, count, 1800);
  // 12. Forward → the product at 300.
  await page.goForward();
  await expectAt(page, detail, 300);
  // 13. UZ at 300.
  await follow(page.locator('.languages a[lang="uz"]').first());
  await expect(page).toHaveURL(/lang=uz$/);
  await expectAt(page, detail, 300);
  // 14. At 450, RU.
  await at(page, 450);
  await follow(page.locator('.languages a[lang="ru"]').first());
  await expect(page).toHaveURL(/lang=ru$/);
  await expectAt(page, detail, 450);
  // 15. Back (undo RU) at 450; 16. Back (undo UZ) at 300.
  await page.goBack();
  await expect(page).toHaveURL(/lang=uz$/);
  await expectAt(page, detail, 450);
  await page.goBack();
  await expect(page).toHaveURL(/#product\?id=4025&lang=ru$/);
  await expectAt(page, detail, 300);
  // 17. Back → page 2 at 1800; 18. Back → page 1 at 3500.
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expectAt(page, count, 1800);
  await page.goBack();
  await expect(page).toHaveURL(/#catalogue\?page=1&lang=ru$/);
  await expectAt(page, count, 3500);

  // 8. Search from 1500.
  await at(page, 1500);
  await page.locator("form.search input").first().fill("Synthetic Match 1");
  await page.locator("form.search input").first().press("Enter");
  await expect(page).toHaveURL(/q=Synthetic/);
  await expectAt(page, count, 0);
  // 9. «Главная» from 400.
  await at(page, 400);
  await follow(sideMenu.getByRole("link", { name: "Главная", exact: true }));
  await expectAt(page, home, 0);
  await expect(home).toHaveCount(40);
  // 10. A product card on Home from 2200; 19. its product at 250, Back → Home at 2200.
  await at(page, 2200);
  await follow(home.nth(1).locator("h3 a"));
  await expect(page).toHaveURL(/#product\?id=4002/);
  await expectAt(page, detail, 0);
  await at(page, 250);
  await page.goBack();
  await expect(home).toHaveCount(40);
  await expectAt(page, home, 2200);
  // 20. Forward → the product at 250.
  await page.goForward();
  await expectAt(page, detail, 250);
});

test("phone menu, list and Back keep the same rules (433 px, 21–25)", async ({
  page,
}) => {
  // Every step waits for slowed reads and checks its position twice.
  test.setTimeout(120_000);
  await fixture(page);
  await slowReads(page);
  await page.setViewportSize({ width: 433, height: 861 });
  const count = page.locator(".result-count"),
    home = page.locator('[data-category="product"] article'),
    detail = page.locator("main h1");
  async function menu(name: string) {
    await page.locator(".menu-toggle").click();
    await page
      .locator(".drawer .nav-primary")
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page.locator(".drawer")).not.toBeVisible();
  }
  await page.goto("/#home?lang=ru");
  await expect(home).toHaveCount(40);
  // 21. Menu → «Все товары» from 900.
  await at(page, 900);
  await menu("Все товары");
  await expectAt(page, count, 0);
  // 22. Menu → «Нутриенты» from 2500 («Наборы» is empty in the fixture).
  await at(page, 2500);
  await menu("Нутриенты");
  await expect(page).toHaveURL(/category=301/);
  await expectAt(page, count, 0);
  // 23. A card of the list from 2000.
  await at(page, 2000);
  await follow(page.locator('[data-product-id="4005"] h3 a'));
  await expectAt(page, detail, 0);
  // 24. On the product at 400, Back → the list at 2000.
  await at(page, 400);
  await page.goBack();
  await expectAt(page, count, 2000);
  // 25. Menu → «Главная» from 1500.
  await at(page, 1500);
  await menu("Главная");
  await expectAt(page, home, 0);
});

test("user input stops a restore; a reload starts at the top", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const count = page.locator(".result-count"),
    detail = page.locator("main h1");
  await page.goto("/#catalogue?page=1&lang=ru");
  await expect(count).toBeVisible();
  await at(page, 2000);
  await follow(page.locator('[data-product-id="4005"] h3 a'));
  await expectAt(page, detail, 0);
  // A held list response keeps the restore waiting; a wheel turn cancels it.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/v1\/products\?/, async (route) => {
    await held;
    await route.fallback();
  });
  await page.goBack();
  // The catalogue view is shown (its heading) and still waits for its list.
  await expect(page.locator("main h1")).toHaveText("Каталог");
  await expect(page.locator("main [role=status]").first()).toBeVisible();
  await expect(count).toHaveCount(0);
  await page.mouse.wheel(0, 120);
  // The wheel event reaches the page after mouse.wheel resolves.
  await expect.poll(() => scrollY(page)).toBe(120);
  release();
  await expect(count).toBeVisible();
  await page.waitForTimeout(400);
  expect(await scrollY(page)).toBeLessThan(1000);
  // Without input the same Back restores; after F5 positions are gone.
  await at(page, 2000);
  await follow(page.locator('[data-product-id="4005"] h3 a'));
  await expectAt(page, detail, 0);
  await page.goBack();
  await expectAt(page, count, 2000);
  await page.goForward();
  await expectAt(page, detail, 0);
  await page.reload();
  await expectAt(page, detail, 0);
  await page.goBack();
  await expectAt(page, count, 0);
});
