import { test, expect } from "@playwright/test";
import { fixture, products } from "./catalogue.fixture";

test("complete discovery, bounded Home, server paging/search and canonical native links", async ({
  page,
}) => {
  const f = await fixture(page);
  let auth = 0;
  page.on("request", (r) => {
    if (r.url().includes("/buyer/auth")) auth++;
  });
  await page.goto("/");
  await expect(page.locator(".home-grid article")).toHaveCount(4);
  await expect(page.locator(".group-tile.unavailable")).toContainText(
    "Товары для жизни",
  );
  await expect(page.locator(".group-tile.unavailable a")).toHaveCount(0);
  await expect(page.locator(".hero")).toHaveCount(1);
  await expect(page.locator("#hero-note")).toContainText("примеры");
  await expect(page.getByRole("main")).toHaveCount(1);
  const first = page.locator('[data-product-id="4001"]');
  await expect(first.locator("h3 a")).toHaveAttribute(
    "href",
    "/#product?id=4001&lang=ru",
  );
  await expect(first.locator(".price strong")).toContainText(/98\s?765,43 UZS/);
  await expect(first.locator(".card-action a")).toHaveCount(0);
  await first.locator(".card-media").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic Match 01",
  );
  await expect(
    page.getByText("<b>Plain API description</b>", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".product-text b")).toHaveCount(0);
  await expect(page.getByText("Доступные размеры: L, XL")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Смотреть видео" }),
  ).toHaveAttribute("href", "https://video.example.test/exact/watch?v=17");
  await page
    .getByRole("button", { name: "Изображение 2", exact: true })
    .click();
  await expect(page.locator(".detail-media img")).toHaveAttribute(
    "src",
    "/synthetic-second.svg",
  );
  await page
    .getByRole("button", { name: "Изображение 3", exact: true })
    .click();
  await expect(page.locator(".detail-media .image-fallback")).toBeVisible();
  await page.goto("/#catalogue?category=301&page=2&lang=ru");
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  expect(
    await page
      .locator("article")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-product-id")),
      ),
  ).toEqual(Array.from({ length: 20 }, (_, i) => String(4021 + i)));
  await expect(
    page.getByRole("link", { name: "Следующая", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".filter-row a")).toHaveCount(103);
  await page.locator('.filter-row a[href*="category=1099&"]').click();
  await expect(page.locator(".product-grid article")).toHaveCount(4);
  await page
    .locator(".filter-row")
    .getByRole("link", { name: "Все товары", exact: true })
    .click();
  await expect(page.locator(".result-count")).toContainText("45");
  await page.getByRole("link", { name: "Следующая", exact: true }).click();
  await page.getByRole("link", { name: "Следующая", exact: true }).click();
  await expect(page.locator('[data-product-id="4045"]')).toBeVisible();
  await page
    .getByRole("textbox", { name: "Поиск товаров" })
    .fill("  Match 4  ");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.locator(".product-grid article")).toHaveCount(6);
  await expect(page).toHaveURL(/#catalogue\?q=Match\+4&page=1&lang=ru$/);
  expect(
    f.requests.some(
      (u) =>
        u.pathname.endsWith("/products") &&
        u.searchParams.get("search") === "Match 4" &&
        !u.searchParams.has("category_id"),
    ),
  ).toBe(true);
  expect(
    f.requests.some(
      (u) =>
        u.pathname.endsWith("/categories") &&
        u.searchParams.get("page") === "2",
    ),
  ).toBe(true);
  expect(auth).toBe(0);
});

test("direct links, reload, Back/Forward, RU/UZ fallback and invalid destinations", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/#catalogue?category=301&q=Match&page=2&lang=ru");
  await expect(page.locator(".result-count")).toContainText("Страница 2 / 2");
  await page.getByRole("link", { name: "UZ", exact: true }).click();
  await expect(page.locator(".result-count")).toContainText("Sahifa 2 / 2");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Nutriyentlar API",
  );
  await page.reload();
  await expect(page.locator('[data-product-id="4021"] h3')).toHaveText(
    "Synthetic Match 21",
  );
  await page.locator('[data-product-id="4021"] h3 a').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic Match 21",
  );
  await page.goBack();
  await expect(page.locator(".result-count")).toContainText("Sahifa 2 / 2");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic Match 21",
  );
  for (const address of [
    "/#catalogue?category=9999",
    "/#product?id=9999",
    "/#product?id=-1",
    "/#catalogue?page=0",
  ]) {
    await page.goto(address);
    await expect(page.locator(".read-state h1")).toHaveText(
      address.includes("category")
        ? "Категория недоступна"
        : address.includes("9999")
          ? "Товар не найден"
          : "Адрес недоступен",
    );
    await expect(page.locator("article")).toHaveCount(0);
    await expect(
      page
        .locator(".read-state")
        .getByRole("link", { name: "Все товары", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/#catalogue?category=302");
  await expect(
    page.getByText("Товары не найдены", { exact: true }),
  ).toBeVisible();
});

test("a failed required category page cannot advertise a partial catalogue; retry and empty replace it", async ({
  page,
}) => {
  const f = await fixture(page);
  f.categoryFailure = "malformed";
  await page.goto("/#catalogue");
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await expect(page.locator(".filter-row a")).toHaveCount(0);
  await expect(page.locator("article")).toHaveCount(0);
  delete f.categoryFailure;
  f.empty = true;
  await page
    .locator("main")
    .getByRole("button", { name: "Повторить", exact: true })
    .click();
  await expect(
    page.getByText("Товары не найдены", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".result-count")).toContainText("0");
});

for (const kind of ["language", "filter", "detail"])
  test(`obsolete ${kind} response cannot replace the current result`, async ({
    page,
  }) => {
    await fixture(page);
    let release = () => {},
      held = false;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const path =
      kind === "detail" ? "**/api/v1/products/4001" : "**/api/v1/products?*";
    await page.route(path, async (route) => {
      const u = new URL(route.request().url());
      const old =
        kind === "detail" ||
        (kind === "language"
          ? route.request().headers()["x-language"] === "ru"
          : u.searchParams.get("category_id") === "301");
      if (!old) {
        await route.fallback();
        return;
      }
      held = true;
      await gate;
      await route
        .fulfill({
          json:
            kind === "detail"
              ? { ...products[0], name: "STALE DETAIL" }
              : {
                  items: [{ ...products[0], name: "STALE RESULT" }],
                  page: 1,
                  size: 20,
                  total: 1,
                  pages: 1,
                },
        })
        .catch(() => {});
    });
    try {
      await page.goto(
        kind === "detail" ? "/#product?id=4001" : "/#catalogue?category=301",
      );
      await expect.poll(() => held).toBe(true);
      await page.evaluate((kind) => {
        window.location.hash =
          kind === "detail"
            ? "product?id=4002&lang=uz"
            : kind === "language"
              ? "catalogue?category=301&lang=uz"
              : "catalogue?category=1099";
      }, kind);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        kind === "detail"
          ? "Synthetic Match 02"
          : kind === "language"
            ? "Nutriyentlar API"
            : "Дополнительная 99",
      );
      if (kind !== "detail")
        await expect(page.locator("article")).toHaveCount(
          kind === "filter" ? 4 : 20,
        );
      release();
      await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
      await expect(page.getByText(/STALE/)).toHaveCount(0);
    } finally {
      release();
    }
  });

test("public round trip and Account reentry reconcile cookies without resetting request state on language", async ({
  page,
}) => {
  await fixture(page);
  let actor = 1,
    sessions = 0,
    telegram = 0;
  await page.route("**/api/v1/buyer/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session")) {
      sessions++;
      await route.fulfill({
        json: {
          csrf_token: "a".repeat(64),
          expires_at: "2030-01-01T00:00:00Z",
          authenticated_at: "2026-10-22T00:00:00Z",
          user: { id: actor, telegram_id: actor },
        },
      });
    } else if (path.endsWith("/club"))
      await route.fulfill({
        json: {
          is_member: true,
          tier: "biotact_friend",
          balance: actor * 111,
          available: actor * 111,
          reserved_until: null,
        },
      });
    else {
      telegram++;
      await route.fulfill({ status: 503, json: {} });
    }
  });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("unrelated", "exact bytes");
    sessionStorage.setItem("biotact.tg1.request", '{"key":"kept"}');
  });
  await page.locator(".group-tile").first().click();
  await expect(page.locator("article")).toHaveCount(20);
  await page.locator("article h3 a").first().click();
  await expect(page.locator(".product-main")).toBeVisible();
  expect(sessions).toBe(0);
  expect(telegram).toBe(0);
  await page
    .locator(".top-utilities")
    .getByRole("link", { name: "Аккаунт", exact: true })
    .click();
  await expect(
    page.getByText("Всего баллов: 111", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "UZ", exact: true }).click();
  expect(sessions).toBe(1);
  await expect(
    page.getByText("Всего баллов: 111", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Barcha mahsulotlar", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(20);
  const paused = sessions;
  actor = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(sessions).toBe(paused);
  await page
    .locator(".top-utilities")
    .getByRole("link", { name: "Akkaunt", exact: true })
    .click();
  await expect(
    page.getByText("Всего баллов: 222", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => [
      localStorage.getItem("unrelated"),
      sessionStorage.getItem("biotact.tg1.request"),
    ]),
  ).toEqual(["exact bytes", '{"key":"kept"}']);
  expect(telegram).toBe(0);
});

test("product failure and malformed product page retry the current language and filters", async ({
  page,
}) => {
  await fixture(page);
  let fail = true;
  await page.route("**/api/v1/products/4001", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { private_body: "must not be shown" },
      });
    else await route.fallback();
  });
  await page.goto("/#product?id=4001&lang=uz");
  await expect(page.locator("main [role=alert]")).toContainText(
    "Maʼlumotlarni",
  );
  await expect(page.getByText("must not be shown")).toHaveCount(0);
  fail = false;
  await page
    .locator("main")
    .getByRole("button", { name: "Qayta urinish", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic Match 01",
  );
  let malformed = true;
  await page.route("**/api/v1/products?*", async (route) => {
    if (malformed)
      await route.fulfill({
        json: {
          items: [{ ...products[0], price: "not a decimal" }],
          total: 1,
          page: 1,
          pages: 1,
          size: 20,
        },
      });
    else await route.fallback();
  });
  await page.goto("/#catalogue?category=301&q=Match&lang=uz");
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);
  malformed = false;
  await page
    .locator("main")
    .getByRole("button", { name: "Qayta urinish", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(20);
  await expect(
    page.getByRole("textbox", { name: "Mahsulot qidirish" }),
  ).toHaveValue("Match");
});

test("responsive cards, gallery and drawer keyboard remain usable at wide, 390 and 320 with enlarged text", async ({
  page,
}, testInfo) => {
  await fixture(page);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(page.locator(".home-grid article")).toHaveCount(4);
    expect(
      await page
        .locator(".home-grid")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(width === 1440 ? 4 : 2);
    const media = page.locator(".card-media").first();
    const size = await media.boundingBox();
    expect(Math.abs((size?.width || 0) - (size?.height || 0))).toBeLessThan(1);
    await page.screenshot({
      path: testInfo.outputPath(`home-${width}.png`),
      fullPage: true,
    });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "125%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    if (width < 1000) {
      const open = page.getByRole("button", { name: "Меню", exact: false });
      await open.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(() => !!document.activeElement?.closest("dialog")),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(open).toBeFocused();
      await open.click();
      await page
        .locator("dialog")
        .getByRole("link", { name: "Все товары", exact: true })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    } else await page.goto("/#catalogue");
    await expect(page.locator("article")).toHaveCount(20);
    expect(
      await page
        .locator(".product-grid")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(width === 1440 ? 3 : 2);
    await expect(page.locator('[data-product-id="4002"]')).toContainText(
      "Недоступен для покупки",
    );
    await expect(
      page.locator('[data-product-id="4002"] .price del'),
    ).toContainText(/125\s?000,55/);
    await page.screenshot({
      path: testInfo.outputPath(`catalogue-${width}.png`),
      fullPage: true,
    });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "125%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page.goto("/#product?id=4001");
    await expect(page.locator(".product-main")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`product-${width}.png`),
      fullPage: true,
    });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "125%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
});
