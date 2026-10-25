import { test, expect, type Locator, type Page } from "@playwright/test";
import { fixture, products } from "./catalogue.fixture";

const firstCard = '[data-product-id="4001"]';
const ordinaryCard = '[data-product-id="4004"]';
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("dialog[open]")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.scrollWidth <= node.clientWidth),
      ),
  ).toBe(true);
}
async function dialogCount(page: Page, count: number) {
  await expect(page.locator("dialog[open]")).toHaveCount(count);
}
async function greenFocus(control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  expect(await control.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
  await expect(control).toHaveCSS("outline-color", "rgb(12, 61, 43)");
  await expect(control).toHaveCSS("outline-width", "2px");
  await expect(control).toHaveCSS("outline-style", "solid");
}

test("Product detail shares nonsized Add, quantity and removal with list, header and basket in RU/UZ", async ({
  page,
}) => {
  const source = products.map((p) => ({ ...p }));
  await fixture(page, source);
  const requests: { path: string; method: string }[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/"))
      requests.push({ path: new URL(r.url()).pathname, method: r.method() });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#product?id=4004&lang=ru");
  const detail = page.locator(".product-summary");
  await expect(detail.locator(".price strong")).toContainText(
    /112\s?233,44 UZS/,
  );
  await expect(detail.locator("select")).toHaveCount(0);
  await expect(detail.locator(".add")).toBeEnabled();
  await detail.locator(".add").focus();
  await page.keyboard.press("Enter");
  await expect(detail.locator("output")).toHaveText("1");
  await expect(detail.locator("[data-more]")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".basket-badge")).toHaveText("2");
  await page.locator(".breadcrumbs a").first().click();
  const card = page.locator(ordinaryCard);
  await expect(card.locator("output")).toHaveText("2");
  await card.getByRole("button", { name: /Уменьшить количество/ }).click();
  await card.locator("h3 a").click();
  await expect(detail.locator("output")).toHaveText("1");
  await page.locator(".basket-button").click();
  await expect(page.locator('[data-basket-product="4004"]')).toHaveAttribute(
    "data-basket-size",
    "",
  );
  await page.locator(".basket-panel [data-more]").click();
  await expect(page.locator(".basket-total")).toContainText(/224\s?466,88 UZS/);
  await page.keyboard.press("Escape");
  await expect(detail.locator("output")).toHaveText("2");
  for (let n = 0; n < 2; n++)
    await detail.getByRole("button", { name: /Уменьшить количество/ }).click();
  await expect(detail.locator(".add")).toBeFocused();
  await expect(page.locator(".basket-badge")).toHaveCount(0);
  await page.locator(".sidebar .brand").click();
  await page.locator(ordinaryCard + " .card-media").click();
  await detail.locator(".add").click();
  await page.locator('.languages [lang="uz"]').click();
  await expect(detail.locator("output")).toHaveText("1");
  await expect(
    detail.getByRole("button", { name: /Miqdorni oshirish/ }),
  ).toBeEnabled();
  const ordinary = source.find((p) => p.id === 4004);
  if (!ordinary)
    throw new Error("Missing independent ordinary-product fixture");
  ordinary.is_in_stock = false;
  await page.locator(".breadcrumbs a").first().click();
  await expect(card.locator("[data-more]")).toBeDisabled();
  await card.locator("h3 a").click();
  await expect(detail.locator("[data-more]")).toBeDisabled();
  await detail.getByRole("button", { name: /Miqdorni kamaytirish/ }).click();
  await expect(
    detail.getByRole("button", { name: /^Savatga:/ }),
  ).toBeDisabled();
  await expect(page.locator(".basket-badge")).toHaveCount(0);
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-panel .empty-state")).toContainText(
    "boʻsh",
  );
  expect(
    requests.every(
      (r) =>
        r.method === "GET" &&
        /^\/api\/v1\/(categories|products|products\/\d+)$/.test(r.path),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("Product detail requires an explicit available size, keeps canonical variants separate and blocks unavailable products", async ({
  page,
}) => {
  await fixture(
    page,
    products.map((p) =>
      p.id === 4005 ? { ...p, requires_size: true, available_sizes: [] } : p,
    ),
  );
  await page.goto("/#product?id=4001");
  const detail = page.locator(".product-summary"),
    choice = detail.getByRole("combobox");
  await expect(choice).toHaveValue("");
  await expect(choice.locator("option")).toHaveText([
    "Выберите размер",
    "L",
    "XL",
  ]);
  await expect(detail.locator(".add")).toBeDisabled();
  await choice.selectOption("L");
  await detail.locator(".add").click();
  await detail.locator("[data-more]").click();
  await choice.selectOption("XL");
  await expect(detail.locator(".add")).toBeEnabled();
  await detail.locator(".add").click();
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-row")).toHaveCount(2);
  await expect(
    page.locator('[data-basket-product="4001"][data-basket-size="L"] output'),
  ).toHaveText("2");
  await expect(
    page.locator('[data-basket-product="4001"][data-basket-size="XL"] output'),
  ).toHaveText("1");
  await expect(page.locator(".basket-total")).toContainText(/296\s?296,29 UZS/);
  await page.keyboard.press("Escape");
  await page.locator(".breadcrumbs a").first().click();
  await expect(page.locator(firstCard + " output")).toHaveText("2");
  await expect(page.locator(firstCard + " .size-summary")).toContainText("L");
  await page.locator(firstCard + " h3 a").click();
  await expect(choice).toHaveValue("");
  await expect(detail.locator(".add")).toBeDisabled();
  await choice.selectOption("XL");
  await expect(detail.locator("output")).toHaveText("1");
  await detail.getByRole("button", { name: /Уменьшить количество/ }).click();
  await choice.selectOption("L");
  await expect(detail.locator("output")).toHaveText("2");
  for (const id of [4002, 4003, 4005]) {
    await page.evaluate((id) => {
      window.location.hash = `product?id=${id}`;
    }, id);
    await expect(page.locator(".product-main")).toHaveAttribute(
      "data-product-id",
      String(id),
    );
    await expect(detail.locator(".add")).toBeDisabled();
    if (id === 4005) {
      await expect(choice).toHaveValue("");
      await expect(choice.locator("option")).toHaveCount(1);
    }
    await expect(page.locator(".basket-badge")).toHaveText("2");
  }
});

test("brand-green 2px keyboard focus remains visible on detail, fields and modal controls at compact sizes and 125% text", async ({
  page,
}, testInfo) => {
  await fixture(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#product?id=4001");
    await expect(page.locator(".product-main")).toBeVisible();
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "125%"),
    );
    await page.keyboard.press("Tab");
    await greenFocus(page.locator(".search input"));
    await greenFocus(page.locator('.gallery button[aria-pressed="true"]'));
    const detail = page.locator(".product-summary"),
      choice = detail.getByRole("combobox");
    await greenFocus(choice);
    await choice.selectOption("L");
    await greenFocus(detail.locator(".add"));
    await page.keyboard.press("Enter");
    await greenFocus(detail.locator("[data-more]"));
    await expect(detail.locator("[data-more]")).toHaveCSS(
      "outline-offset",
      "-5px",
    );
    await noOverflow(page);
    await page.locator(".basket-button").focus();
    await page.keyboard.press("Enter");
    await greenFocus(page.locator(".basket-panel .close-control"));
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".basket-remove")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(".basket-panel .close-control")).toBeFocused();
    await greenFocus(page.locator(".basket-panel [data-more]"));
    await expect(page.locator(".basket-panel [data-more]")).toHaveCSS(
      "outline-offset",
      "-5px",
    );
    await noOverflow(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".basket-button")).toBeFocused();
    await page.locator(".top-ai").focus();
    await page.keyboard.press("Enter");
    await greenFocus(page.locator(".assistant-panel .close-control"));
    await greenFocus(page.locator(".assistant-panel textarea"));
    await noOverflow(page);
    if (width === 390)
      await page.screenshot({
        path: testInfo.outputPath("focus-field-phone.png"),
      });
    await page.keyboard.press("Escape");
    await expect(page.locator(".top-ai")).toBeFocused();
    await detail.getByRole("button", { name: /Уменьшить количество/ }).click();
    await expect(page.locator(".basket-badge")).toHaveCount(0);
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.route("**/api/v1/buyer/auth/**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.locator(".top-utilities > a").click();
  await page.keyboard.press("Tab");
  await greenFocus(page.locator(".account button"));
  await greenFocus(page.locator(".account a").first());
});

test("accepted footer colors, size variants, availability and local basket share quantities without requests or persistence", async ({
  page,
}) => {
  await fixture(
    page,
    products.map((p) =>
      p.id === 4005 ? { ...p, requires_size: true, available_sizes: [] } : p,
    ),
  );
  const requests: { path: string; method: string }[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/"))
      requests.push({ path: new URL(r.url()).pathname, method: r.method() });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#catalogue");
  await expect(page.locator("article")).toHaveCount(20);
  const sale = page.locator(firstCard),
    ordinary = page.locator(ordinaryCard);
  await expect(sale.locator(".promotion-badge")).toHaveText("Акция");
  await expect(
    page.locator('[data-product-id="4002"] .promotion-badge'),
  ).toHaveCount(0);
  for (const id of [4002, 4003, 4005])
    await expect(page.locator(`[data-product-id="${id}"] .add`)).toBeDisabled();
  await expect(sale.locator(".add")).toBeEnabled();
  await expect(sale.locator("select")).toHaveCount(0);
  await expect(sale.locator(".card-action")).toHaveCSS(
    "background-color",
    "rgb(235, 235, 235)",
  );
  await expect(sale.locator(".card-action")).toHaveCSS(
    "border-top-color",
    "rgb(214, 214, 214)",
  );
  const add = sale.locator(".add");
  const before = await sale.locator(".card-action").boundingBox();
  expect(before?.height).toBe(57);
  await expect(add.locator("svg")).toHaveAttribute("stroke-width", "1.6");
  await expect(add.locator("svg")).toHaveCSS("width", "22px");
  await add.hover();
  await expect(add).toHaveCSS("background-color", "rgb(227, 227, 227)");
  await page.mouse.down();
  await expect(add).toHaveCSS("background-color", "rgb(216, 216, 216)");
  await page.mouse.up();
  const picker = page.locator(".size-picker");
  await dialogCount(page, 1);
  await expect(picker.locator("#size-picker-product")).toHaveText(
    "Synthetic Match 01",
  );
  await expect(
    picker.getByRole("button", { name: "В корзину", exact: true }),
  ).toBeDisabled();
  await expect(picker.locator('[aria-pressed="true"]')).toHaveCount(0);
  await picker.getByRole("button", { name: "L", exact: true }).click();
  await picker.getByRole("button", { name: "В корзину", exact: true }).click();
  const plus = sale.getByRole("button", {
    name: "Увеличить количество",
    exact: false,
  });
  await expect(sale.locator("output")).toHaveText("1");
  await expect(sale.locator(".size-summary")).toBeFocused();
  await expect(sale.locator(".size-summary")).toContainText("1·L⌄");
  expect((await sale.locator(".card-action").boundingBox())?.height).toBe(
    before?.height,
  );
  await plus.hover();
  await expect(plus).toHaveCSS("background-color", "rgb(224, 224, 224)");
  await page.mouse.down();
  await expect(plus).toHaveCSS("background-color", "rgb(216, 216, 216)");
  await page.mouse.up();
  await expect(sale.locator("output")).toHaveText("2");
  await sale.locator(".size-summary").click();
  await expect(
    picker.getByRole("button", { name: "L · 2", exact: true }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "XL", exact: true }).click();
  await picker.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(page.locator(".basket-badge")).toHaveText("3");
  await expect(sale.locator(".size-summary")).toContainText("1·XL⌄");
  await sale.locator(".size-summary").click();
  await expect(
    picker.getByRole("button", { name: "L · 2", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "XL · 1", exact: true }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "L · 2", exact: true }).click();
  await picker.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(sale.locator(".size-summary")).toContainText("1·XL⌄");
  await expect(page.locator(".basket-badge")).toHaveText("3");
  await sale.locator(".size-summary").click();
  await picker.getByRole("button", { name: "L · 2", exact: true }).click();
  await picker.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(sale.locator("output")).toHaveText("3");
  await sale.getByRole("button", { name: /Уменьшить количество/ }).click();
  await expect(sale.locator("output")).toHaveText("2");
  await ordinary.locator(".add").click();
  await expect(page.locator(".basket-badge")).toHaveText("4");
  const currentURL = page.url(),
    baselineRequests = requests.length;
  await page.locator(".basket-button").click();
  await dialogCount(page, 1);
  await expect(page.locator(".basket-panel")).toContainText(
    "обновлении страницы",
  );
  await expect(page.locator(".basket-row")).toHaveCount(3);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "125%"),
    );
    await noOverflow(page);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const l = page.locator('[data-basket-product="4001"][data-basket-size="L"]');
  const xl = page.locator(
    '[data-basket-product="4001"][data-basket-size="XL"]',
  );
  await expect(l.locator("output")).toHaveText("2");
  await expect(xl.locator("output")).toHaveText("1");
  await expect(page.locator(".basket-total")).toContainText(/408\s?529,73 UZS/);
  await l
    .getByRole("button", { name: "Уменьшить количество", exact: false })
    .click();
  await xl.getByRole("button", { name: "Убрать", exact: false }).click();
  await expect(l.locator("output")).toHaveText("1");
  await expect(xl).toHaveCount(0);
  await expect(page.locator(".basket-total")).toContainText(/210\s?998,87 UZS/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".basket-button")).toBeFocused();
  expect(page.url()).toBe(currentURL);
  expect(requests.length).toBe(baselineRequests);
  await expect(sale.locator("output")).toHaveText("1");
  await sale
    .getByRole("button", { name: "Уменьшить количество", exact: false })
    .click();
  await expect(sale.locator(".add")).toBeFocused();
  await page.locator('.languages [lang="uz"]').click();
  await expect(page.locator("article")).toHaveCount(20);
  await expect(page.locator(".basket-badge")).toHaveText("1");
  await expect(page.locator(firstCard + " .promotion-badge")).toHaveText(
    "Aksiya",
  );
  await page.locator(ordinaryCard + " h3 a").click();
  await expect(page.locator(".product-main")).toBeVisible();
  await expect(page.locator(".basket-badge")).toHaveText("1");
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-panel h2")).toHaveText("Savat");
  await page.locator(".basket-remove").click();
  await expect(page.locator(".empty-state")).toContainText("boʻsh");
  await expect(page.locator(".basket-panel .close-control")).toBeFocused();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(
    requests.every(
      (r) =>
        r.method === "GET" &&
        /^\/api\/v1\/(categories|products|products\/\d+)$/.test(r.path),
    ),
  ).toBe(true);
  await page.locator(".sidebar .brand").click();
  await expect(page.locator(".home-grid article")).toHaveCount(4);
  const selected = page.locator('.sidebar a[aria-current="page"]');
  await selected.hover();
  await expect(selected).toHaveCSS("background-color", "rgb(221, 221, 221)");
  const catalogue = page.locator(".sidebar .nav-primary > button").first();
  await catalogue.hover();
  await expect(catalogue).toHaveCSS("background-color", "rgb(227, 227, 227)");
  await page.mouse.down();
  await expect(catalogue).toHaveCSS("background-color", "rgb(216, 216, 216)");
  await page.mouse.up();
  await page.locator(ordinaryCard + " .add").click();
  await expect(page.locator(".basket-badge")).toHaveText("1");
  await page.reload();
  await expect(page.locator(".home-grid article")).toHaveCount(4);
  await expect(page.locator(".basket-badge")).toHaveCount(0);
});

test("compact size popup preserves Home/Catalogue card height, keyboard focus and draft cancellation at 390/320 and 125% text", async ({
  page,
}, testInfo) => {
  const sample = products[0];
  if (!sample) throw new Error("Missing sized fixture");
  const source = products.slice(0, 4).map((p, i) => ({
    ...sample,
    id: p.id,
    name: `Compact product ${i + 1}`,
    requires_size: i === 0,
    available_sizes: i === 0 ? ["L", "XL"] : [],
  }));
  await fixture(page, source);
  const card = page.locator(firstCard),
    picker = page.locator(".size-picker");
  async function geometry() {
    return page.locator(".product-card").evaluateAll((cards) =>
      cards.map((card) => ({
        height: card.getBoundingClientRect().height,
        footer: card.querySelector(".card-action")?.getBoundingClientRect()
          .height,
        media: card.querySelector(".card-media")?.getBoundingClientRect()
          .height,
        width: card.getBoundingClientRect().width,
      })),
    );
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["home", "catalogue"]) {
      await page.goto(`/#${view}`);
      await expect(page.locator(".product-card")).toHaveCount(4);
      for (const fontSize of ["", "125%"]) {
        await page.evaluate(
          (size) => (document.documentElement.style.fontSize = size),
          fontSize,
        );
        const before = await geometry();
        const heights = before.map((g) => g.height);
        // Separate grid rows can differ by a fraction of a CSS pixel.
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
        expect(
          before.every((g) => Math.abs(g.width - (g.media || 0)) < 1),
        ).toBe(true);
        expect(before.every((g) => g.footer === (fontSize ? 71.25 : 57))).toBe(
          true,
        );
        await expect(card.locator("select, .size-choice")).toHaveCount(0);
        if (width === 1440 && view === "home" && !fontSize)
          await page.locator(".sidebar .ai-nav").click();
        await page.keyboard.press("Tab");
        await greenFocus(card.locator(".add"));
        await page.keyboard.press("Enter");
        await dialogCount(page, 1);
        await expect(page.locator(".assistant-panel")).not.toBeVisible();
        await expect(
          picker.getByRole("button", { name: "Отмена", exact: true }),
        ).toBeFocused();
        expect(await picker.evaluate((node) => node.matches(":modal"))).toBe(
          true,
        );
        expect(await geometry()).toEqual(before);
        expect(
          await page.evaluate(
            () => getComputedStyle(document.documentElement).overflow,
          ),
        ).toBe("hidden");
        await greenFocus(
          picker.getByRole("button", { name: "L", exact: true }),
        );
        await page.keyboard.press("Enter");
        const confirm = picker.getByRole("button", {
          name: "В корзину",
          exact: true,
        });
        await greenFocus(confirm);
        await page.keyboard.press("Tab");
        await expect(
          picker.getByRole("button", { name: "L", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(card.locator(".add")).toBeFocused();
        await expect(page.locator(".basket-badge")).toHaveCount(0);
        await card.locator(".add").click();
        await expect(picker.locator('[aria-pressed="true"]')).toHaveCount(0);
        await picker.getByRole("button", { name: "XL", exact: true }).click();
        await picker
          .getByRole("button", { name: "В корзину", exact: true })
          .click();
        await expect(card.locator(".size-summary")).toBeFocused();
        await expect(card.locator(".size-summary")).toContainText("1·XL⌄");
        expect(await geometry()).toEqual(before);
        await page.keyboard.press("Tab");
        await greenFocus(card.locator(".size-summary"));
        await noOverflow(page);
        await card.locator(".size-summary").click();
        await expect(
          picker.getByRole("button", { name: "XL · 1", exact: true }),
        ).toBeVisible();
        await noOverflow(page);
        if (width === 390 && view === "home" && fontSize === "125%")
          await page.screenshot({ path: testInfo.outputPath("popup-390.png") });
        await page.keyboard.press("Escape");
        await card
          .getByRole("button", { name: /Уменьшить количество/ })
          .click();
        await expect(card.locator(".add")).toBeFocused();
        expect(await geometry()).toEqual(before);
        expect(
          await page.evaluate(
            () => getComputedStyle(document.documentElement).overflow,
          ),
        ).not.toBe("hidden");
      }
    }
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await card.locator(".add").click();
  await picker.getByRole("button", { name: "L", exact: true }).click();
  // Hash changes can also come from Back/Forward while a native modal is open.
  await page.evaluate(() => (window.location.hash = "catalogue?lang=uz"));
  await dialogCount(page, 0);
  await expect(page.locator("#content")).toBeFocused();
  await expect(page.locator(".basket-badge")).toHaveCount(0);
  await card.locator(".add").click();
  await expect(picker.locator("h2")).toHaveText("Oʻlchamni tanlang");
  await expect(
    picker.getByRole("button", { name: "Savatga", exact: true }),
  ).toBeDisabled();
  await picker.getByRole("button", { name: "L", exact: true }).click();
  await picker.getByRole("button", { name: "Savatga", exact: true }).click();
  await expect(card.locator(".size-summary")).toHaveAccessibleName(
    /Oʻlchamni tanlang:.*L/,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("cards-1440.png") });
  await card.locator(".size-summary").click();
  await page.evaluate(() => (window.location.hash = "product?id=4001&lang=uz"));
  await dialogCount(page, 0);
  await expect(page.locator("#content")).toBeFocused();
  await page.locator(".product-summary select").selectOption("L");
  await expect(page.locator(".product-summary output")).toHaveText("1");
  const sized = source[0];
  if (!sized) throw new Error("Missing mutable sized fixture");
  sized.available_sizes = [];
  await page.locator(".breadcrumbs a").first().click();
  await expect(card.locator(".size-summary")).toContainText("1·L⌄");
  await expect(card.locator("[data-more]")).toBeDisabled();
  await card.getByRole("button", { name: /Miqdorni kamaytirish/ }).click();
  await expect(card.locator(".add")).toBeDisabled();
  await expect(page.locator(".basket-badge")).toHaveCount(0);
});

test("AI draft stays local until explicit send and resets on semantic navigation", async ({
  page,
}, testInfo) => {
  await fixture(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(r.method() + " " + r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".home-grid article")).toHaveCount(4);
  await page.locator(".sidebar .ai-nav").click();
  await dialogCount(page, 1);
  const panel = page.locator(".assistant-panel");
  await expect(panel.locator(".close-control")).toBeFocused();
  expect(await panel.evaluate((e) => e.matches(":modal"))).toBe(false);
  await expect(panel).toContainText("Не ставлю диагноз");
  await expect(panel.locator(".ai-context strong")).toHaveText("Главная");
  const baseline = requests.length,
    address = page.url(),
    empty = await panel.locator(".ai-body").textContent();
  const draft = panel.getByRole("textbox", { name: "Ваш вопрос", exact: true });
  await draft.fill(
    "Локальный черновик secret-question https://example.test/private",
  );
  await draft.press("Enter");
  await expect(
    panel.getByRole("button", { name: "Отправить", exact: true }),
  ).toBeEnabled();
  expect(page.url()).toBe(address);
  expect(requests.length).toBe(baseline);
  expect(await panel.locator(".ai-body").textContent()).toBe(empty);
  await page.screenshot({
    path: testInfo.outputPath("ai-wide.png"),
    fullPage: true,
  });
  await draft.press("Escape");
  await expect(page.locator(".sidebar .ai-nav")).toBeFocused();
  await page.locator(".sidebar .ai-nav").click();
  await expect(draft).toHaveValue(/secret-question/);
  await page.locator(firstCard + " .card-media").click();
  await expect(page.locator(".product-main")).toBeVisible();
  await expect(panel.locator(".ai-context strong")).toHaveText("Товар №4001");
  await page.locator('.languages [lang="uz"]').click();
  await expect(panel.locator("h2")).toHaveText("AI-maslahatchi");
  await expect(panel.getByRole("textbox")).toHaveValue("");
  await expect(
    panel.getByRole("button", { name: "Yuborish", exact: true }),
  ).toBeDisabled();
  // An Account response can contain private values; none becomes consultant context.
  await page.route("**/api/v1/buyer/auth/**", (r) =>
    r.fulfill({ status: 503, json: { private_body: "PRIVATE_CUSTOMER_123" } }),
  );
  await page.locator(".top-utilities > a").click();
  await expect(page.locator(".account")).toBeVisible();
  await expect(panel.locator(".ai-context")).toContainText(
    "akkaunt maʼlumotlarisiz",
  );
  await expect(panel).not.toContainText("PRIVATE_CUSTOMER_123");
  const primary = page.locator(".account button");
  await primary.hover();
  await expect(primary).toHaveCSS("background-color", "rgb(41, 84, 68)");
  await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
  const accountBaseline = requests.length;
  await panel.getByRole("textbox").fill("only local");
  await panel.getByRole("textbox").press("Enter");
  expect(requests.length).toBe(accountBaseline);
  await page.locator(".basket-button").click();
  await dialogCount(page, 1);
  await expect(panel).not.toBeVisible();
  await page.keyboard.press("Escape");
  await dialogCount(page, 0);
  expect(
    requests.filter(
      (r) =>
        r.includes("secret-question") ||
        /assistant|consultant|chat|completion|orders|basket/.test(r),
    ).length,
  ).toBe(0);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("AI adapts at 1440/1000/390/320 and enlarged text, modal focus/resize/menu/basket close cleanly", async ({
  page,
}, testInfo) => {
  await fixture(page);
  for (const width of [1440, 1000, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".home-grid article")).toHaveCount(4);
    expect(
      await page
        .locator(".home-grid")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(width >= 1000 ? 4 : 2);
    await page.locator(width >= 1000 ? ".sidebar .ai-nav" : ".top-ai").click();
    await dialogCount(page, 1);
    expect(
      await page
        .locator(".assistant-panel")
        .evaluate((e) => e.matches(":modal")),
    ).toBe(width < 1000);
    for (const fontSize of ["", "125%"]) {
      await page.evaluate(
        (s) => (document.documentElement.style.fontSize = s),
        fontSize,
      );
      await noOverflow(page);
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    if (width === 390)
      await page.screenshot({
        path: testInfo.outputPath("ai-phone.png"),
        fullPage: true,
      });
    if (width < 1000) {
      await expect(
        page.locator(".assistant-panel .close-control"),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest(".assistant-panel"),
        ),
      ).toBe(true);
      await page.keyboard.press("Tab");
      await expect(
        page.locator(".assistant-panel .close-control"),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).overflow,
        ),
      ).toBe("hidden");
    }
    await page.keyboard.press("Escape");
    await dialogCount(page, 0);
    await expect(
      page.locator(width >= 1000 ? ".sidebar .ai-nav" : ".top-ai"),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflow,
      ),
    ).not.toBe("hidden");
  }
  // A single open surface survives viewport changes without a stranded modal lock.
  await page.locator(".menu-toggle").click();
  await page.locator(".drawer .ai-nav").click();
  await dialogCount(page, 1);
  await expect(page.locator(".drawer")).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(() =>
      page.locator(".assistant-panel").evaluate((e) => e.matches(":modal")),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflow,
    ),
  ).not.toBe("hidden");
  await page.locator(".assistant-panel textarea").fill("resize draft");
  await page.setViewportSize({ width: 390, height: 500 });
  await expect
    .poll(() =>
      page.locator(".assistant-panel").evaluate((e) => e.matches(":modal")),
    )
    .toBe(true);
  await page.locator(".assistant-panel textarea").scrollIntoViewIfNeeded();
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".top-ai")).toBeFocused();
  await page.locator(".basket-button").click();
  await dialogCount(page, 1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".basket-button")).toBeFocused();
  await page.locator(".menu-toggle").click();
  await page.setViewportSize({ width: 1000, height: 900 });
  await dialogCount(page, 0);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflow,
    ),
  ).not.toBe("hidden");
});

const heroMain = '.hero-banner[data-position="main"]';
async function heroSlide(page: Page, title: string) {
  await expect(page.locator(".hero-stage")).toHaveAttribute(
    "data-busy",
    "false",
  );
  await expect(page.locator(heroMain + " h2")).toHaveText(title);
  expect(
    await page
      .locator(".hero-banner:not([data-position=main])")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.hasAttribute("inert")),
      ),
  ).toBe(true);
}

test("Home banner preserves reference heights, copy and composition at 1440/390/320, enlarged text and narrowed AI workspace", async ({
  page,
}, testInfo) => {
  await fixture(page);
  for (const [width, expectedHeight] of [
    [1440, 402],
    [390, 440],
    [320, 458],
  ]) {
    if (!width || !expectedHeight) throw new Error("Missing geometry fixture");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".home-grid article")).toHaveCount(4);
    const stage = page.locator(".hero-stage");
    expect((await stage.boundingBox())?.height).toBe(expectedHeight);
    expect((await stage.boundingBox())?.width).toBe(
      width === 1440 ? 1160 : width - 32,
    );
    await expect(page.locator("#hero-note")).toContainText("примеры");
    await expect(
      page.locator(".hero nav, .hero .preview, .hero a"),
    ).toHaveCount(0);
    const stageBox = await stage.boundingBox(),
      rotation = await page.locator(".hero-rotation").boundingBox();
    if (!stageBox || !rotation) throw new Error("Missing banner bounds");
    expect(rotation.y).toBeGreaterThan(stageBox.y);
    expect(rotation.y + rotation.height).toBeLessThan(
      stageBox.y + stageBox.height,
    );
    if (width !== 320)
      await page.screenshot({
        path: testInfo.outputPath(`hero-home-${width}.png`),
      });
    for (const font of ["", "125%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, font);
      for (let index = 0; index < 3; index++) {
        await expect(page.locator(".hero-stage")).toHaveAttribute(
          "data-busy",
          "false",
        );
        expect(
          await page.locator(heroMain).evaluate((node) => {
            const box = node.getBoundingClientRect(),
              copy = node.querySelector(".hero-copy"),
              art = node.querySelector(".hero-art");
            if (!copy || !art) return false;
            const c = copy.getBoundingClientRect(),
              a = art.getBoundingClientRect();
            return (
              c.bottom <= box.bottom &&
              c.right <= box.right &&
              c.left >= box.left &&
              (a.left >= c.right || a.top >= c.bottom)
            );
          }),
        ).toBe(true);
        await noOverflow(page);
        await page.locator(".hero-next").click();
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.locator('.languages [lang="uz"]').click();
    await expect(page.locator("#hero-note")).toContainText("namuna");
    await expect(page.locator(".hero-next")).toHaveAccessibleName(
      "Keyingi eʼlon",
    );
    await noOverflow(page);
  }
  for (const width of [1440, 1000]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.locator(".sidebar .ai-nav").click();
    for (const font of ["", "125%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, font);
      await noOverflow(page);
      const hero = await page.locator(".hero").boundingBox(),
        assistant = await page.locator(".assistant-panel").boundingBox();
      if (!hero || !assistant) throw new Error("Missing workspace bounds");
      expect(hero.x + hero.width).toBeLessThanOrEqual(assistant.x);
      expect(
        await page
          .locator(heroMain)
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
});

test("banner edges wrap, crossfade whole slides, keyboard and artwork drag; example modal coordinates surfaces, focus and route cleanup", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await heroSlide(page, "Ближек истокам");
  await page.locator(".hero-previous").click();
  await expect(
    page.locator('.hero-banner[data-position="incoming"]'),
  ).toHaveCSS("animation-duration", "0.28s");
  await expect(
    page.locator('.hero-banner[data-position="outgoing"]'),
  ).toHaveCSS("animation-duration", "0.28s");
  await heroSlide(page, "Замечатьбольше");
  await page.locator(".hero-next").click();
  await heroSlide(page, "Ближек истокам");
  await page.locator(".hero-next").focus();
  await page.keyboard.press("ArrowRight");
  await heroSlide(page, "Времядля диалога");
  await expect(page.locator(".hero-next")).toBeFocused();
  await page.keyboard.press("Tab");
  await greenFocus(page.locator(".hero-next"));
  const art = await page.locator(heroMain + " .hero-art").boundingBox();
  if (!art) throw new Error("Missing artwork");
  await page.mouse.move(art.x + art.width / 2, art.y + art.height / 2);
  await page.mouse.down();
  await page.mouse.move(art.x + art.width / 2 + 100, art.y + art.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await heroSlide(page, "Ближек истокам");
  await page.locator(".sidebar .ai-nav").click();
  await page.locator(heroMain + " .hero-details").click();
  await dialogCount(page, 1);
  const modal = page.locator(".hero-example");
  await expect(page.locator(".assistant-panel")).not.toBeVisible();
  await expect(modal).toHaveAccessibleName("Пример материала");
  await expect(modal).toContainText("не сообщает о реальной публикации");
  await expect(modal.locator(".close-control")).toBeFocused();
  await page.keyboard.press("Tab");
  await greenFocus(modal.locator(".close-control"));
  await page.keyboard.press("Shift+Tab");
  await expect(modal.locator("button").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(modal.locator(".close-control")).toBeFocused();
  await expect(page.locator("html")).toHaveClass(/modal-open/);
  await page.keyboard.press("Escape");
  await expect(page.locator(heroMain + " .hero-details")).toBeFocused();
  await dialogCount(page, 0);
  await page.locator(".basket-button").click();
  await dialogCount(page, 1);
  await page.keyboard.press("Escape");
  await page.locator('.languages [lang="uz"]').click();
  await page.locator(heroMain + " .hero-details").click();
  await expect(modal).toHaveAccessibleName("Material namunasi");
  await expect(modal).toContainText("haqiqiy nashr");
  await page.evaluate(() => {
    location.hash = "catalogue?lang=uz";
  });
  await expect(page.locator(".hero")).toHaveCount(0);
  await dialogCount(page, 0);
  await expect(page.locator("html")).not.toHaveClass(/modal-open/);
  await expect(page.locator("#content")).toBeFocused();
});

test("banner eight-second autoplay pauses for hover, keyboard, manual control, hidden page, other surfaces and reduced motion", async ({
  page,
}) => {
  await fixture(page);
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
  await page.goto("/");
  await page.mouse.move(1, 1);
  await page.clock.runFor(7999);
  await heroSlide(page, "Ближек истокам");
  await page.clock.runFor(1);
  await expect(page.locator(".hero-stage")).toHaveAttribute(
    "data-busy",
    "true",
  );
  await page.clock.runFor(280);
  await heroSlide(page, "Времядля диалога");
  await page.locator(".hero-stage").hover();
  await page.clock.runFor(9000);
  await heroSlide(page, "Времядля диалога");
  await page.mouse.move(1, 1);
  await page.clock.runFor(8000);
  await expect(page.locator(".hero-stage")).toHaveAttribute(
    "data-busy",
    "true",
  );
  await page.clock.runFor(280);
  await heroSlide(page, "Замечатьбольше");
  await page.locator(".hero-rotation").click();
  await page.mouse.move(1, 1);
  await page.clock.runFor(9000);
  await heroSlide(page, "Замечатьбольше");
  await page.locator(".hero-rotation").click();
  await page.mouse.move(1, 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(9000);
  await heroSlide(page, "Замечатьбольше");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(8000);
  await expect(page.locator(".hero-stage")).toHaveAttribute(
    "data-busy",
    "true",
  );
  await page.clock.runFor(280);
  await heroSlide(page, "Ближек истокам");
  await page.locator(".sidebar .ai-nav").click();
  await page.clock.runFor(9000);
  await heroSlide(page, "Ближек истокам");
  await page.keyboard.press("Escape");
  await page.locator(firstCard + " .add").click();
  await expect(page.locator(".size-picker")).toBeVisible();
  await page.clock.runFor(9000);
  await heroSlide(page, "Ближек истокам");
  await page.keyboard.press("Escape");
  await page.locator(heroMain + " .hero-details").focus();
  await page.keyboard.press("Tab");
  await page.clock.runFor(9000);
  await heroSlide(page, "Ближек истокам");
  await page.locator(".hero-next").click();
  await page.clock.runFor(9300);
  await heroSlide(page, "Времядля диалога");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#hero-play-state")).toContainText(
    "меньше движения",
  );
  await page.clock.runFor(9000);
  await heroSlide(page, "Ближек истокам");
  await page.locator(".hero-next").click();
  await heroSlide(page, "Времядля диалога");
  await expect(page.locator(heroMain)).toHaveCSS("animation-name", "none");
  await page.locator(".sidebar .nav-primary > a").last().click();
  await page.clock.runFor(20000);
  await expect(page.locator(".hero")).toHaveCount(0);
});

test.describe("banner native mobile gestures", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("both-way swipes preserve vertical page scroll and native example CTA taps", async ({
    page,
    context,
  }) => {
    await fixture(page);
    await page.goto("/");
    const cdp = await context.newCDPSession(page);
    async function swipe(x1: number, y1: number, x2: number, y2: number) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: x1, y: y1 }],
      });
      for (let step = 1; step <= 6; step++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x1 + ((x2 - x1) * step) / 6, y: y1 + ((y2 - y1) * step) / 6 },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    try {
      await heroSlide(page, "Ближек истокам");
      const stage = await page.locator(".hero-stage").boundingBox();
      if (!stage) throw new Error("Missing touch bounds");
      const y = stage.y + stage.height - 100;
      await swipe(300, y, 100, y);
      await heroSlide(page, "Времядля диалога");
      await swipe(100, y, 300, y);
      await heroSlide(page, "Ближек истокам");
      const button = await page
        .locator(heroMain + " .hero-details")
        .boundingBox();
      if (!button) throw new Error("Missing native tap target");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: button.x + button.width / 2, y: button.y + button.height / 2 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(page.locator(".hero-example")).toBeVisible();
      await page.locator(".hero-example button").last().tap();
      await expect(page.locator(heroMain + " .hero-details")).toBeFocused();
      await swipe(210, y, 210, y - 220);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await heroSlide(page, "Ближек истокам");
      await page.locator(".menu-toggle").tap();
      await expect(page.locator(".drawer")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".menu-toggle")).toBeFocused();
    } finally {
      await cdp.detach();
    }
  });
});
