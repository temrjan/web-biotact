import { test, expect, type Locator, type Page } from "@playwright/test";
import { fixture, products, visibleCards } from "./catalogue.fixture";
import { BASKET_STORAGE_KEY } from "../src/guestBasket";

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
/** RU/UZ sits in the desktop top bar and, below 1000px, in the phone menu (M4). */
async function chooseLanguage(page: Page, lang: "ru" | "uz") {
  if (await page.locator(".menu-toggle").isVisible())
    await page.locator(".menu-toggle").click();
  await page.locator(`.languages [lang="${lang}"]`).click();
}
async function dialogCount(page: Page, count: number) {
  await expect(page.locator("dialog[open]")).toHaveCount(count);
}
/** Reach a control by keyboard so :focus-visible applies after earlier pointer input. */
async function keyboardFocus(control: Locator) {
  await control.focus();
  await control.page().keyboard.press("Tab");
  await control.page().keyboard.press("Shift+Tab");
  await greenFocus(control);
}
async function greenFocus(control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  expect(await control.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
  await expect(control).toHaveCSS("outline-color", "rgb(12, 61, 43)");
  await expect(control).toHaveCSS("outline-width", "2px");
  await expect(control).toHaveCSS("outline-style", "solid");
}
/**
 * Keyboard focus on the green product-page Add: the 2px brand-green ring sits
 * outside the button on its rounded frame, because an inner ring would vanish
 * on the green face.
 */
async function productAddFocus(page: Page) {
  const frame = page.locator(".detail-purchase .card-action"),
    add = frame.locator(".add");
  // Reach the button by keyboard so :focus-visible applies after pointer input.
  await add.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(add).toBeFocused();
  expect(await add.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
  await expect(add).toHaveCSS("outline-style", "none");
  await expect(frame).toHaveCSS("outline-color", "rgb(12, 61, 43)");
  await expect(frame).toHaveCSS("outline-width", "2px");
  await expect(frame).toHaveCSS("outline-style", "solid");
  await expect(frame).toHaveCSS("outline-offset", "3px");
}
/**
 * Focused expanded phone search (SF1): no outline and no border change on the
 * field or its rounded form; it looks exactly as with focus elsewhere in the
 * form ("Найти"), and the caret shows the focus.
 */
async function searchFocus(page: Page) {
  const form = page.locator(".topbar .search"),
    input = form.locator("input");
  const look = () =>
    form.evaluate((n) => {
      const s = getComputedStyle(n),
        field = n.querySelector("input");
      const i = field ? getComputedStyle(field) : null;
      return {
        border: [s.borderTop, s.borderRight, s.borderBottom, s.borderLeft],
        outline: s.outlineStyle,
        shadow: s.boxShadow,
        field: [i?.outlineStyle, i?.borderTopStyle, i?.boxShadow],
      };
    });
  await expect(input).toBeFocused();
  const focused = await look();
  expect(focused.field[0]).toBe("none");
  expect(focused.border[0]).toBe("1px solid rgb(196, 196, 196)");
  await form.getByRole("button").focus();
  expect(await look()).toEqual(focused);
  await input.focus();
}
/** Choose a size with the product page size buttons (SZ1). */
async function pickSize(page: Page, size: string) {
  const button = page
    .locator(".product-summary .size-chips")
    .getByRole("button", { name: size, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}
async function noSizeChosen(group: Locator) {
  for (const button of await group.getByRole("button").all())
    await expect(button).toHaveAttribute("aria-pressed", "false");
}
/** The open basket survived a language-only history step and has no language buttons. */
async function basketStaysOpen(page: Page) {
  await expect(page.locator("dialog.basket-panel[open]")).toHaveCount(1);
  await expect(page.locator(".basket-languages")).toHaveCount(0);
}
/**
 * Language-only hash change of the current view (as a manual edit or a
 * language link would make it) while the basket stays open.
 */
async function languageStep(page: Page, lang: "ru" | "uz") {
  await page.evaluate((lang) => {
    const [view, query] = location.hash.replace(/^#/, "").split("?");
    const params = new URLSearchParams(query);
    params.set("lang", lang);
    location.hash = `#${view || "home"}?${params}`;
  }, lang);
  await basketStaysOpen(page);
}

/** Border, face, radius, clipping and outer height of a stepper-style frame. */
function frameLook(frame: Locator) {
  return frame.evaluate((n) => {
    const s = getComputedStyle(n);
    return {
      border: [s.borderTop, s.borderBottom, s.borderLeft, s.borderRight],
      background: s.backgroundColor,
      radius: s.borderRadius,
      overflow: s.overflow,
      height: n.getBoundingClientRect().height,
    };
  });
}
type FrameLook = Awaited<ReturnType<typeof frameLook>>;
/**
 * The live basket stepper (`.basket-quantity`) of the open basket, as the
 * reference for the row control frame; needs at least one basket line. The
 * basket closes again afterwards.
 */
async function basketStepper(page: Page) {
  await page.locator(".basket-button").click();
  const stepper = page
    .locator("dialog.basket-panel[open] .basket-quantity")
    .first();
  await expect(stepper).toBeVisible();
  const frame = await frameLook(stepper);
  const cell = (await stepper.getByRole("button").first().boundingBox())
    ?.height;
  await page.keyboard.press("Escape");
  await dialogCount(page, 0);
  // A meaningful reference, not two empty measurements that happen to agree.
  expect(frame.border[0]).toMatch(/^1px solid rgb/);
  expect(cell).toBeGreaterThanOrEqual(44);
  return { frame, cell };
}
/**
 * The row control copies the basket stepper frame (`.basket-quantity`, measured
 * live in the same run): same border, face, radius, clipping, outer height and
 * row height; arrow-only rows have two cells.
 */
async function stepperFrame(
  control: Locator,
  cells: string[],
  basket: { frame: FrameLook; cell: number | undefined },
) {
  expect(await frameLook(control)).toEqual(basket.frame);
  const children = control.locator(":scope > *");
  expect(
    await children.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label")),
    ),
  ).toEqual(cells);
  for (const child of await children.all()) {
    expect((await child.boundingBox())?.height).toBe(basket.cell);
    await expect(child).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(child).toHaveCSS("color", "rgb(46, 37, 33)");
  }
}
/**
 * The plain "Все ›" link of a row header without arrows (DES-01, M6): the row
 * title in its name, brand green, bold 17px, a 44px hit height and a chevron.
 */
async function plainAll(
  link: Locator,
  name: string,
  text: string,
  target: string,
) {
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAccessibleName(name);
  await expect(link).toHaveText(text);
  await expect(link).toHaveAttribute("href", target);
  await expect(link).not.toHaveAttribute("aria-controls");
  await expect(link).toHaveCSS("color", "rgb(12, 61, 43)");
  await expect(link).toHaveCSS("font-size", "17px");
  await expect(link).toHaveCSS("font-weight", "700");
  await expect(link.locator("svg")).toHaveCount(1);
  expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
}
/** Every `aria-controls` on the page names an element that exists. */
async function ariaControlsResolve(page: Page) {
  expect(
    await page
      .locator("[aria-controls]")
      .evaluateAll((nodes) =>
        nodes
          .map((n) => n.getAttribute("aria-controls") || "")
          .filter((id) => !document.getElementById(id)),
      ),
  ).toEqual([]);
}
/**
 * Offset of an arrow's drawn chevron (its rasterised ink, not its DOM box)
 * from the centre of the arrow button, in CSS pixels.
 */
async function chevronInkOffset(arrow: Locator) {
  return arrow.evaluate(async (button) => {
    const svg = button.querySelector("svg");
    if (!svg || button.textContent?.trim()) return null;
    const box = svg.getBoundingClientRect(),
      frame = button.getBoundingClientRect(),
      scale = 8,
      width = Math.round(box.width * scale),
      height = Math.round(box.height * scale);
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(width));
    copy.setAttribute("height", String(height));
    copy.setAttribute("stroke", "#000");
    const image = new Image();
    image.src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(new XMLSerializer().serializeToString(copy));
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    let left = width,
      right = -1,
      top = height,
      bottom = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    if (right < 0) return null;
    return {
      x:
        box.left +
        (left + right + 1) / 2 / scale -
        (frame.left + frame.width / 2),
      y:
        box.top +
        (top + bottom + 1) / 2 / scale -
        (frame.top + frame.height / 2),
    };
  });
}
async function chevronCentred(arrow: Locator) {
  const offset = await chevronInkOffset(arrow);
  expect(offset).not.toBeNull();
  expect(Math.abs(offset?.x ?? Infinity)).toBeLessThanOrEqual(1);
  expect(Math.abs(offset?.y ?? Infinity)).toBeLessThanOrEqual(1);
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
        /^\/api\/v1\/(categories|products|products\/\d+|banners|settings\/banner_interval)$/.test(
          r.path,
        ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([1, 0]);
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
    choice = detail.getByRole("group", { name: "Размер: Synthetic Match 01" });
  await expect(choice.getByRole("button")).toHaveText(["L", "XL"]);
  await noSizeChosen(choice);
  await expect(detail.locator(".add")).toBeDisabled();
  await pickSize(page, "L");
  await detail.locator(".add").click();
  await detail.locator("[data-more]").click();
  await pickSize(page, "XL");
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
  await noSizeChosen(choice);
  await expect(detail.locator(".add")).toBeDisabled();
  await pickSize(page, "XL");
  await expect(detail.locator("output")).toHaveText("1");
  await detail.getByRole("button", { name: /Уменьшить количество/ }).click();
  await pickSize(page, "L");
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
    // A size product without any available size has no size buttons.
    if (id === 4005) await expect(detail.locator(".size-chips")).toHaveCount(0);
    await expect(page.locator(".basket-badge")).toHaveText("2");
  }
});

test("product page size buttons: neutral face, hover and selected grey, green ring only for the keyboard, chosen size goes into the basket", async ({
  page,
}) => {
  await fixture(page);
  for (const [width, lang, name] of [
    [1440, "ru", "Размер: Synthetic Match 01"],
    [390, "uz", "Oʻlcham: Synthetic Match 01"],
    [320, "ru", "Размер: Synthetic Match 01"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/#product?id=4001&lang=${lang}`);
    const detail = page.locator(".product-summary"),
      group = detail.getByRole("group", { name }),
      add = detail.locator(".detail-purchase .add");
    // Buttons instead of the dropdown; no "available sizes" line above.
    await expect(detail.locator("select")).toHaveCount(0);
    await expect(
      detail.getByText(/Доступные размеры|Mavjud oʻlchamlar/),
    ).toHaveCount(0);
    await expect(detail.locator(".size-choice > span")).toHaveText(
      lang === "ru" ? "Размер" : "Oʻlcham",
    );
    const l = group.getByRole("button", { name: "L", exact: true }),
      xl = group.getByRole("button", { name: "XL", exact: true });
    await expect(group.getByRole("button")).toHaveText(["L", "XL"]);
    await noSizeChosen(group);
    for (const button of [l, xl]) {
      expect((await button.boundingBox())?.height).toBe(44);
      await expect(button).toHaveCSS("background-color", "rgb(235, 235, 235)");
      await expect(button).toHaveCSS("border", "1px solid rgb(196, 196, 196)");
      await expect(button).toHaveCSS("border-radius", "10px");
      await expect(button).toHaveCSS("box-shadow", "none");
      await expect(button).toHaveCSS("color", "rgb(46, 37, 33)");
      await expect(button).toHaveCSS("font-weight", "400");
    }
    // Pale green Add until a size is chosen (N1 = B).
    await expect(add).toBeDisabled();
    await expect(add).toHaveCSS("opacity", "0.6");
    // Hover: our hover grey.
    await l.hover();
    await expect(l).toHaveCSS("background-color", "rgb(227, 227, 227)");
    // Mouse choice: selected grey and bold, no green frame.
    await xl.click();
    await expect(xl).toHaveAttribute("aria-pressed", "true");
    await expect(l).toHaveAttribute("aria-pressed", "false");
    await expect(xl).toBeFocused();
    expect(await xl.evaluate((n) => n.matches(":focus-visible"))).toBe(false);
    await expect(xl).toHaveCSS("outline-style", "none");
    await expect(xl).toHaveCSS("background-color", "rgb(221, 221, 221)");
    await expect(xl).toHaveCSS("font-weight", "700");
    await expect(xl).toHaveCSS("border", "1px solid rgb(196, 196, 196)");
    await expect(l).toHaveCSS("font-weight", "400");
    await expect(add).toBeEnabled();
    await expect(add).toHaveCSS("opacity", "1");
    // Keyboard: the green ring appears on Tab; Space chooses the size.
    await page.keyboard.press("Shift+Tab");
    await expect(l).toBeFocused();
    await greenFocus(l);
    await page.keyboard.press("Space");
    await expect(l).toHaveAttribute("aria-pressed", "true");
    await expect(xl).toHaveAttribute("aria-pressed", "false");
    await expect(l).toHaveCSS("background-color", "rgb(221, 221, 221)");
    await noOverflow(page);
    await page.evaluate(() => localStorage.clear());
  }
  // The chosen size goes into the basket line, as with the dropdown.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#product?id=4001&lang=ru");
  await pickSize(page, "XL");
  await page.locator(".product-summary .add").click();
  await expect(page.locator(".product-summary output")).toHaveText("1");
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-row")).toHaveCount(1);
  await expect(
    page.locator('[data-basket-product="4001"][data-basket-size="XL"] output'),
  ).toHaveText("1");
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
    // Phone header icons and the expanded search field keep the green ring.
    for (const icon of [".top-search", ".top-ai", ".topbar .basket-button"])
      await greenFocus(page.locator(icon));
    await page.locator(".top-search").focus();
    await page.keyboard.press("Enter");
    await searchFocus(page);
    // "Найти" and × keep the site's keyboard ring.
    await greenFocus(page.locator(".topbar .search button"));
    await greenFocus(page.locator(".search-close"));
    await page.keyboard.press("Escape");
    await expect(page.locator(".top-search")).toBeFocused();
    await greenFocus(page.locator('.gallery button[aria-pressed="true"]'));
    const detail = page.locator(".product-summary");
    await greenFocus(detail.locator(".size-chips button").first());
    await pickSize(page, "L");
    await productAddFocus(page);
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
    await expect(page.locator(".guest-continue")).toBeFocused();
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
    // On the green consultant header the ring is white (task 3 review r1, OPT-01).
    const close = page.locator(".assistant-panel .close-control");
    await expect(close).toBeFocused();
    expect(await close.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
    await expect(close).toHaveCSS("outline-color", "rgb(255, 255, 255)");
    await expect(close).toHaveCSS("outline-width", "2px");
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
  await page.locator(".menu-toggle").click();
  await page.locator(".drawer .nav-account").click();
  await page.keyboard.press("Tab");
  await greenFocus(page.locator(".account button"));
  await greenFocus(page.locator(".account a").first());
});

test("product page first Add is brand green, pale green while disabled; pressed state and every card stay neutral", async ({
  page,
}, testInfo) => {
  await fixture(page);
  await page.route("**/api/v1/consultant/turns", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        request_id: body.request_id,
        context_revision: body.context_revision,
        language: "ru",
        status: "answer",
        answer: "CURRENT",
        sources: [],
        cautions: [],
        products: [products[4]],
        open_product_id: null,
        context_token: "synthetic-token",
        context_expires_at: new Date(Date.now() + 1800000).toISOString(),
        commercial_checked_at: new Date().toISOString(),
      },
    });
  });
  const green = "rgb(12, 61, 43)",
    white = "rgb(255, 255, 255)",
    text = "rgb(46, 37, 33)",
    transparent = "rgba(0, 0, 0, 0)";
  /** Today's neutral card Add: rest, hover and pressed-down colours. */
  async function neutralCard(add: Locator) {
    await expect(add).toBeEnabled();
    await expect(add).toHaveCSS("background-color", transparent);
    await expect(add).toHaveCSS("color", text);
    await add.hover();
    await expect(add).toHaveCSS("background-color", "rgb(227, 227, 227)");
    await page.mouse.down();
    await expect(add).toHaveCSS("background-color", "rgb(216, 216, 216)");
    // Release away from the button so the check does not add the product.
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  for (const [width, lang, label] of [
    [1440, "ru", "В корзину"],
    [390, "uz", "Savatga"],
  ] as const) {
    await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
    await page.goto(`/#product?id=4004&lang=${lang}`);
    const detail = page.locator(".detail-purchase"),
      frame = detail.locator(".card-action"),
      add = detail.locator(".add");
    await expect(add).toBeEnabled();
    await expect(add).toHaveAccessibleName(new RegExp(`^${label}: `));
    await expect(add).toHaveCSS("background-color", green);
    await expect(add).toHaveCSS("color", white);
    await expect(add.locator("svg")).toHaveCSS("color", white);
    await add.hover();
    await expect(add).toHaveCSS("background-color", "rgb(41, 84, 68)");
    await page.mouse.down();
    await expect(add).toHaveCSS("background-color", "rgb(11, 54, 38)");
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect(add).toHaveCSS("background-color", green);
    await productAddFocus(page);
    if (width === 1440)
      await frame.screenshot({
        path: testInfo.outputPath("product-add-focus-1440.png"),
      });
    // Cards on the product page itself keep today's look.
    const recommended = page.locator(".product-recommended .add").first();
    await neutralCard(recommended);
    // Pressed state: unchanged quantity colours, focus moves to "+".
    await add.click();
    const more = detail.locator("[data-more]");
    await expect(more).toBeFocused();
    await expect(frame).toHaveCSS("background-color", "rgb(235, 235, 235)");
    await expect(frame).toHaveCSS("outline-style", "none");
    for (const control of await detail.locator(".quantity button").all()) {
      await expect(control).toHaveCSS("background-color", transparent);
      await expect(control).toHaveCSS("color", text);
    }
    await expect(detail.locator(".quantity output")).toHaveCSS("color", text);
    await detail.locator(".quantity button").first().click();
    await expect(add).toBeFocused();
    await expect(page.locator(".basket-badge")).toHaveCount(0);
    // Disabled first state (out of stock; a size not chosen yet): pale green.
    for (const id of [4003, 4001]) {
      await page.goto(`/#product?id=${id}&lang=${lang}`);
      const disabled = page.locator(".detail-purchase .add");
      await expect(disabled).toBeDisabled();
      await expect(disabled).toHaveCSS("background-color", green);
      await expect(disabled).toHaveCSS("opacity", "0.6");
    }
    await pickSize(page, "L");
    await expect(page.locator(".detail-purchase .add")).toBeEnabled();
    await expect(page.locator(".detail-purchase .add")).toHaveCSS(
      "opacity",
      "1",
    );
  }
  // Home row, catalogue grid and assistant cards keep today's look.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#home?lang=ru");
  await neutralCard(
    page.locator(`[data-category="product"] ${ordinaryCard} .add`),
  );
  await page.goto("/#catalogue?page=1&lang=ru");
  await neutralCard(page.locator(`.product-grid ${ordinaryCard} .add`));
  await page.goto("/#product?id=4004&lang=ru");
  await page.locator(".sidebar .ai-nav").click();
  const panel = page.locator(".assistant-panel");
  await panel.getByRole("textbox").fill("card");
  await panel.getByRole("textbox").press("Control+Enter");
  await neutralCard(panel.locator(".assistant-cards .add").first());
  await expect(page.locator(".detail-purchase .add")).toHaveCSS(
    "background-color",
    green,
  );
});

test("logo image in the side menu, phone menu and Account is the BIOTACT link to Home", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/v1/buyer/auth/**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  async function logo(link: Locator, home: string) {
    const image = link.locator("img");
    await expect(link).toHaveAccessibleName("BIOTACT");
    await expect(link).toHaveAttribute("href", home);
    await expect(image).toHaveAttribute("alt", "BIOTACT");
    // Explicit dimensions reserve the space before the file loads.
    await expect(image).toHaveAttribute("width", "351");
    await expect(image).toHaveAttribute("height", "125");
    await expect
      .poll(() =>
        image.evaluate((i: HTMLImageElement) =>
          i.complete ? i.naturalWidth : 0,
        ),
      )
      .toBeGreaterThan(0);
    const box = await image.boundingBox();
    expect(box?.width).toBeCloseTo(184, 0);
    expect((box?.width || 0) / (box?.height || 1)).toBeCloseTo(
      351.4 / 125.1,
      1,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#catalogue?page=1&lang=uz");
  const side = page.locator(".sidebar .brand");
  await logo(side, "/#home?lang=uz");
  await side.click();
  await expect(page).toHaveURL(/#home\?lang=uz$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#catalogue?page=1&lang=ru");
  await page.locator(".menu-toggle").click();
  const drawer = page.locator(".drawer .brand");
  await logo(drawer, "/#home?lang=ru");
  await drawer.click();
  await expect(page).toHaveURL(/#home\?lang=ru$/);
  await expect(page.locator(".drawer")).not.toBeVisible();
  await page.goto("/#account?lang=ru");
  await expect(page.locator(".account")).toBeVisible();
  await logo(page.locator(".account .brand"), "/#home?lang=ru");
});

// Spec r6 W3 (WL-01 to WL-03), also for the home menu link (Captain 2026-11-03).
test("logo and home menu link show Home from its top, also on Home, without reload or reset", async ({
  page,
}) => {
  await fixture(page);
  const top = () => page.evaluate(() => window.scrollY);
  async function scrolled(hash: string, y: number) {
    await page.goto(hash);
    await expect(page.locator("article").first()).toBeVisible();
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await expect.poll(top).toBeGreaterThan(1000);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const side = page.locator(".sidebar .brand"),
    menuHome = page
      .locator(".sidebar .nav-primary")
      .getByRole("link", { name: "Главная", exact: true });
  for (const link of [side, menuHome]) {
    await scrolled("/#catalogue?page=1&lang=ru", 3000);
    await link.click();
    await expect(page).toHaveURL(/#home\?lang=ru$/);
    await expect(page.locator('[data-category="product"] article')).toHaveCount(
      40,
    );
    await expect.poll(top).toBe(0);
    // On Home already: no hash change and no reload.
    await page.evaluate(() => window.scrollTo(0, 2500));
    await expect.poll(top).toBeGreaterThan(1000);
    await page.evaluate(() => ((window as { mark?: number }).mark = 1));
    await link.click();
    await expect.poll(top).toBe(0);
    await expect(page).toHaveURL(/#home\?lang=ru$/);
    expect(await page.evaluate(() => (window as { mark?: number }).mark)).toBe(
      1,
    );
  }
  // Enter on the focused logo; a click with a modifier keeps the page as it is.
  await page.evaluate(() => window.scrollTo(0, 2500));
  await side.focus();
  await page.keyboard.press("Enter");
  await expect.poll(top).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 2500));
  const popup = page.context().waitForEvent("page");
  await side.click({ modifiers: ["ControlOrMeta"] });
  await (await popup).close();
  expect(await top()).toBeGreaterThan(1000);
  // WL-03: the open assistant and its draft stay when Home is already shown.
  await page.locator(".sidebar .ai-nav").click();
  await page.locator(".assistant-panel textarea").fill("logo draft");
  await side.click();
  await expect.poll(top).toBe(0);
  await expect(page.locator(".assistant-panel")).toBeVisible();
  await expect(page.locator(".assistant-panel textarea")).toHaveValue(
    "logo draft",
  );
  // Phone: the drawer logo shows Home at the top and closes the drawer.
  await page.locator(".assistant-panel .close-control").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await scrolled("/#catalogue?page=1&lang=ru", 3000);
  await page.locator(".menu-toggle").click();
  await page.locator(".drawer .brand").click();
  await expect(page).toHaveURL(/#home\?lang=ru$/);
  await expect(page.locator(".drawer")).not.toBeVisible();
  await expect.poll(top).toBe(0);
});

test("accepted footer colors, size variants, availability and remembered basket share quantities without purchase requests", async ({
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
    "сохраняется в этом браузере",
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
  ).toEqual([1, 0]);
  expect(
    requests.every(
      (r) =>
        r.method === "GET" &&
        /^\/api\/v1\/(categories|products|products\/\d+|banners|settings\/banner_interval)$/.test(
          r.path,
        ),
    ),
  ).toBe(true);
  await page.locator(".sidebar .brand").click();
  await expect(page.locator('[data-category="product"] article')).toHaveCount(
    40,
  );
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
  await expect(page.locator('[data-category="product"] article')).toHaveCount(
    40,
  );
  await expect(page.locator(".basket-badge")).toHaveText("1");
});

test("compact size popup preserves Home/Catalogue card height, keyboard focus and draft cancellation at 390/320 and 125% text", async ({
  page,
}, testInfo) => {
  const sample = products[0];
  if (!sample) throw new Error("Missing sized fixture");
  // Not on sale: each product appears once on Home (no separate sale row).
  const source = products.slice(0, 4).map((p, i) => ({
    ...sample,
    is_sale: false,
    sale_price: null,
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
  await pickSize(page, "L");
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
  await expect(page.locator('[data-category="product"] article')).toHaveCount(
    40,
  );
  await page.locator(".sidebar .ai-nav").click();
  await dialogCount(page, 1);
  const panel = page.locator(".assistant-panel");
  await expect(panel.locator(".close-control")).toBeFocused();
  expect(await panel.evaluate((e) => e.matches(":modal"))).toBe(false);
  // The header holds no scope text: the greeting in the feed already says it.
  await expect(panel.locator(".ai-head")).not.toContainText("Помогу");
  // The greeting keeps the no-diagnosis line once the header lost it.
  await expect(panel.locator(".ai-examples .ai-scope")).toHaveText(
    "Не ставлю диагноз и не назначаю лечение.",
  );
  await expect(panel.locator(".ai-context")).toHaveText("Страница: Главная");
  await expect(panel.locator(".ai-context strong")).toHaveText("Главная");
  const baseline = requests.length,
    address = page.url(),
    empty = await panel.locator(".ai-body").textContent();
  const draft = panel.getByRole("textbox", { name: "Ваш вопрос", exact: true });
  await draft.fill(
    "Локальный черновик secret-question https://example.test/private",
  );
  // Shift+Enter is a new line, not a send (EN1).
  await draft.press("Shift+Enter");
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
  await page
    .locator('[data-category="product"] ' + firstCard + " .card-media")
    .click();
  await expect(page.locator(".product-main")).toBeVisible();
  await expect(panel.locator(".ai-context strong")).toHaveText("Товар №4001");
  await page.locator('.languages [lang="uz"]').click();
  await expect(panel.locator("h2")).toHaveText("AI maslahatchi");
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
  // The Account page is named as such, not as a "public catalogue" (task 4).
  await expect(panel.locator(".ai-context strong")).toHaveText(
    "Akkaunt · akkaunt maʼlumotlari maslahatchiga yuborilmaydi",
  );
  await expect(panel).not.toContainText("PRIVATE_CUSTOMER_123");
  const primary = page.locator(".account button");
  await primary.hover();
  await expect(primary).toHaveCSS("background-color", "rgb(41, 84, 68)");
  await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
  const accountBaseline = requests.length;
  await panel.getByRole("textbox").fill("only local");
  await panel.getByRole("textbox").press("Shift+Enter");
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
  ).toEqual([1, 0]);
});

test("AI adapts at 1440/1000/390/320 and enlarged text, modal focus/resize/menu/basket close cleanly", async ({
  page,
}, testInfo) => {
  await fixture(page);
  for (const width of [1440, 1000, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const row = page.locator('[data-category="product"] .product-row');
    await expect(row.locator("article")).toHaveCount(40);
    expect(await visibleCards(row)).toBe(width >= 1000 ? 4 : 2);
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
async function heroSlide(page: Page, id: number) {
  await expect(page.locator(".hero-stage")).toHaveAttribute(
    "data-busy",
    "false",
  );
  await expect(page.locator(heroMain)).toHaveAttribute(
    "data-banner-id",
    String(id),
  );
  expect(
    await page
      .locator(".hero-banner:not([data-position=main])")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.hasAttribute("inert")),
      ),
  ).toBe(true);
}

test("Home banners show admin images in server order at 3:1 with Mini App links, RU/UZ names and narrowed AI workspace", async ({
  page,
}, testInfo) => {
  await fixture(page);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await heroSlide(page, 6);
    const stage = await page.locator(".hero-stage").boundingBox();
    if (!stage) throw new Error("Missing banner bounds");
    expect(stage.width).toBe(width === 1440 ? 1160 : width - 32);
    expect(Math.abs(stage.height - stage.width / 3)).toBeLessThan(1);
    expect(
      await page
        .locator(".hero-banner")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-banner-id")),
        ),
    ).toEqual(["6", "5", "1"]);
    await expect(page.locator(heroMain + " img")).toHaveAttribute(
      "src",
      "/synthetic-banner-6.svg",
    );
    await expect(page.locator(heroMain + " a")).toHaveAccessibleName(
      "Баннер 4",
    );
    await expect(page.locator(".hero-dot")).toHaveCount(3);
    const rotation = await page.locator(".hero-rotation").boundingBox();
    if (!rotation) throw new Error("Missing rotation control");
    expect(rotation.y).toBeGreaterThan(stage.y);
    expect(rotation.y + rotation.height).toBeLessThan(stage.y + stage.height);
    if (width !== 320)
      await page.screenshot({
        path: testInfo.outputPath(`hero-home-${width}.png`),
      });
    for (const font of ["", "125%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, font);
      await noOverflow(page);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await chooseLanguage(page, "uz");
    await heroSlide(page, 6);
    await expect(page.locator(".hero-next")).toHaveAccessibleName(
      "Keyingi banner",
    );
    await page.locator(".hero-dot").nth(1).click();
    await heroSlide(page, 5);
    await expect(page.locator(heroMain + " a")).toHaveAccessibleName(
      "Sintetik banner",
    );
    await expect(page.locator(".hero-dot").nth(1)).toHaveAttribute(
      "aria-current",
      "true",
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const links = page.locator(".hero-link");
  await expect(links.nth(0)).toHaveAttribute(
    "href",
    "/#catalogue?page=1&lang=ru",
  );
  await expect(links.nth(1)).toHaveAttribute(
    "href",
    "/#catalogue?category=301&page=1&lang=ru",
  );
  await expect(links.nth(2)).toHaveAttribute(
    "href",
    "/#product?id=4004&lang=ru",
  );
  await expect(page.locator(".hero-link[target]")).toHaveCount(0);
  await page.locator(heroMain + " a").click();
  await expect(page).toHaveURL(/#catalogue\?page=1&lang=ru$/);
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await page.goBack();
  await page.locator(".hero-dot").nth(2).click();
  await heroSlide(page, 1);
  await page.locator(heroMain + " a").click();
  await expect(page.locator(".product-main")).toHaveAttribute(
    "data-product-id",
    "4004",
  );
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
    }
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
});

test("banner edges and dots wrap, crossfade whole slides and keep keyboard focus; empty or failed banners leave no carousel", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await heroSlide(page, 6);
  await page.locator(".hero-previous").click();
  await expect(
    page.locator('.hero-banner[data-position="incoming"]'),
  ).toHaveCSS("animation-duration", "0.28s");
  await expect(
    page.locator('.hero-banner[data-position="outgoing"]'),
  ).toHaveCSS("animation-duration", "0.28s");
  await heroSlide(page, 1);
  await page.locator(".hero-next").click();
  await heroSlide(page, 6);
  await page.locator(".hero-next").focus();
  await page.keyboard.press("ArrowRight");
  await heroSlide(page, 5);
  await expect(page.locator(".hero-next")).toBeFocused();
  await expect(page.locator(".hero [aria-live]")).toHaveText(
    "2 из 3: Синтетический баннер",
  );
  await page.keyboard.press("Tab");
  await greenFocus(page.locator(".hero-next"));
  await greenFocus(page.locator(heroMain + " a"));
  await greenFocus(page.locator(".hero-dot").first());
  await page.keyboard.press("Enter");
  await heroSlide(page, 6);
  f.banners = f.banners.slice(0, 1);
  await page.goto("/#home?lang=uz");
  await heroSlide(page, 6);
  await expect(
    page.locator(".hero-edge, .hero-dot, .hero-rotation"),
  ).toHaveCount(0);
  await expect(page.locator(".hero")).not.toHaveAttribute(
    "aria-roledescription",
  );
  f.banners = [];
  await page.goto("/#home?lang=ru");
  await expect(page.locator('[data-category="product"] article')).toHaveCount(
    40,
  );
  await expect(page.locator(".hero, .hero-loading")).toHaveCount(0);
  await page.route("**/api/v1/banners?*", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/#home?lang=uz");
  await expect(page.locator('[data-category="product"] article')).toHaveCount(
    40,
  );
  await expect(page.locator(".hero, .hero-loading")).toHaveCount(0);
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
});

test("banner autoplay uses the admin interval and pauses for hover, keyboard, manual control, hidden page, other surfaces and reduced motion", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
  await page.goto("/");
  await page.mouse.move(1, 1);
  await heroSlide(page, 6);
  await expect(page.locator("#hero-play-state")).toHaveText(
    "Автосмена · каждые 4 с",
  );
  await page.clock.runFor(3999);
  await heroSlide(page, 6);
  await page.clock.runFor(1);
  await expect(page.locator(".hero-stage")).toHaveAttribute(
    "data-busy",
    "true",
  );
  await page.clock.runFor(280);
  await heroSlide(page, 5);
  await page.locator(".hero-stage").hover();
  await page.clock.runFor(9000);
  await heroSlide(page, 5);
  await page.mouse.move(1, 1);
  await page.clock.runFor(4000);
  await page.clock.runFor(280);
  await heroSlide(page, 1);
  await page.locator(".hero-rotation").click();
  await page.mouse.move(1, 1);
  await page.clock.runFor(9000);
  await heroSlide(page, 1);
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
  await heroSlide(page, 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(4000);
  await page.clock.runFor(280);
  await heroSlide(page, 6);
  await page.locator(".sidebar .ai-nav").click();
  await page.clock.runFor(9000);
  await heroSlide(page, 6);
  await page.keyboard.press("Escape");
  await page
    .locator('[data-category="product"] ' + firstCard + " .add")
    .click();
  await expect(page.locator(".size-picker")).toBeVisible();
  await page.clock.runFor(9000);
  await heroSlide(page, 6);
  await page.keyboard.press("Escape");
  await page.locator(heroMain + " a").focus();
  await page.keyboard.press("Tab");
  await page.clock.runFor(9000);
  await heroSlide(page, 6);
  await page.locator(".hero-next").click();
  await page.clock.runFor(9300);
  await heroSlide(page, 5);
  f.interval = null;
  await page.goto("/");
  await page.mouse.move(1, 1);
  await expect(page.locator("#hero-play-state")).toHaveText(
    "Автосмена · каждые 3 с",
  );
  await page.clock.runFor(3000);
  await page.clock.runFor(280);
  await heroSlide(page, 5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#hero-play-state")).toContainText(
    "меньше движения",
  );
  await page.clock.runFor(9000);
  await heroSlide(page, 6);
  await page.locator(".hero-next").click();
  await heroSlide(page, 5);
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
  test("both-way swipes preserve vertical page scroll; dot and banner taps navigate", async ({
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
      await heroSlide(page, 6);
      const stage = await page.locator(".hero-stage").boundingBox();
      if (!stage) throw new Error("Missing touch bounds");
      const y = stage.y + stage.height / 2;
      await swipe(300, y, 100, y);
      await heroSlide(page, 5);
      await expect(page).toHaveURL(/\/$|#home/);
      await swipe(100, y, 300, y);
      await heroSlide(page, 6);
      await page.locator(".hero-dot").nth(2).tap();
      await heroSlide(page, 1);
      await swipe(210, y + 20, 210, y - 200);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await heroSlide(page, 1);
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator(heroMain + " a").tap();
      await expect(page.locator(".product-main")).toHaveAttribute(
        "data-product-id",
        "4004",
      );
      await page.locator(".menu-toggle").tap();
      await expect(page.locator(".drawer")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".menu-toggle")).toBeFocused();
    } finally {
      await cdp.detach();
    }
  });
});

test("Home sections: sale, Mini App category rows, lazy video, FAQ accordion, consultation mock-up and contacts in RU/UZ", async ({
  page,
}, testInfo) => {
  await fixture(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.method() + " " + r.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect
    .poll(() =>
      page
        .locator("main > section")
        .evaluateAll((nodes) =>
          nodes.map(
            (n) =>
              n.getAttribute("data-category") ||
              [...n.classList].find((c) => c !== "home-section"),
          ),
        ),
    )
    .toEqual(["hero", "sale", "product", "home-video", "faq", "consultation"]);
  const sale = page.locator('[data-category="sale"]');
  await expect(sale.locator("h2")).toHaveText("Акции");
  await expect(sale.locator(".section-head a")).toHaveCount(0);
  await expect(sale.locator(firstCard + " .promotion-badge")).toHaveText(
    "Акция",
  );
  expect(
    requests.some((r) =>
      r.includes("/api/v1/products?on_sale=true&page=1&size=100"),
    ),
  ).toBe(true);
  expect(
    requests.some((r) =>
      r.includes("/api/v1/products?category_id=301&page=1&size=100"),
    ),
  ).toBe(true);
  await sale.locator(firstCard + " .add").click();
  await page
    .locator(".size-picker")
    .getByRole("button", { name: "L", exact: true })
    .click();
  await page
    .locator(".size-picker")
    .getByRole("button", { name: "В корзину", exact: true })
    .click();
  await expect(page.locator(".basket-badge")).toHaveText("1");
  await expect(
    page.locator('[data-category="product"] ' + firstCard + " output"),
  ).toHaveText("1");

  const video = page.locator(".home-video");
  await expect(video.locator("h2")).toHaveText(
    "Пробиотики и витаминно-минеральные комплексы",
  );
  await expect(video.locator("iframe")).toHaveCount(0);
  expect(requests.some((r) => r.includes("youtube-nocookie"))).toBe(false);
  await video
    .getByRole("button", {
      name: "Смотреть видео: Пробиотики и витаминно-минеральные комплексы",
    })
    .click();
  const frame = video.locator("iframe");
  await expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/MaA4Rtf9ZXA?autoplay=1&rel=0",
  );
  await expect(frame).toHaveAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin",
  );
  await expect(frame).toHaveAttribute("allowfullscreen", "");
  const box = await frame.boundingBox();
  expect(
    Math.abs((box?.width || 0) / (box?.height || 1) - 16 / 9),
  ).toBeLessThan(0.01);

  const questions = page.locator(".faq-item h3 button");
  await expect(questions).toHaveCount(6);
  await expect(questions.first()).toHaveText(
    /Что делает продукцию BIOTACT DEUTSCHLAND уникальной на рынке\?/,
  );
  await expect(page.locator(".faq [role=region]:visible")).toHaveCount(0);
  await questions.nth(0).click();
  await expect(questions.nth(0)).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("region", {
      name: /Что делает продукцию BIOTACT DEUTSCHLAND/,
    }),
  ).toContainText("инновационным формулам");
  await questions.nth(5).focus();
  await page.keyboard.press("Enter");
  await expect(questions.nth(0)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".faq [role=region]:visible")).toContainText(
    "+998 93 555 17 47",
  );
  await page.keyboard.press("Space");
  await expect(page.locator(".faq [role=region]:visible")).toHaveCount(0);

  const form = page.locator(".consultation");
  await expect(form.locator("h2")).toHaveText(
    "Получите бесплатную консультацию по нашей продукции от специалиста",
  );
  await form.getByLabel("Ваше имя").fill("Synthetic Name");
  await form.getByLabel("Телефон").fill("90 123 45 67");
  await form.getByLabel("Ваш вопрос").fill("private-question");
  await greenFocus(form.getByLabel("Ваш вопрос"));
  const before = requests.length;
  await form
    .getByRole("button", { name: "Получить консультацию", exact: true })
    .click();
  await expect(form.getByRole("status")).toHaveText(
    "Форма скоро заработает. Позвоните нам: +998 93 555 17 47",
  );
  await expect(
    form.getByRole("link", { name: "+998 93 555 17 47" }),
  ).toHaveAttribute("href", "tel:+998935551747");
  await page.waitForTimeout(200);
  expect(requests.slice(before)).toEqual([]);
  expect(requests.filter((r) => r.includes("private-question"))).toEqual([]);
  expect(page.url()).toMatch(/\/$/);

  const footer = page.locator(".page-footer");
  // Captain P1: two address lines, then the phone line, then the e-mail line.
  await expect(footer.locator('[aria-labelledby="footer-uz"] p')).toHaveText([
    // Spec r6 WF-01: the Mini App legal address (contacts.ts postalAddress).
    "100109, Республика Узбекистан, г. Ташкент,",
    "Алмазарский район, ул. Фаробий, 448J",
    "Тел.: (+998 93) 555 17 47",
    "E-Mail: contact_uz@biotact.de",
  ]);
  for (const link of await footer.locator("a").all()) {
    await expect(link).toHaveCSS("text-decoration-line", "none");
    await expect(link).toHaveCSS("color", "rgb(12, 61, 43)");
  }
  await keyboardFocus(footer.locator("a").first());
  await expect(footer).toContainText("Фаробий");
  await expect(footer).not.toContainText("Янгикурган");
  await expect(
    footer.getByRole("link", { name: "(+998 93) 555 17 47" }),
  ).toHaveAttribute("href", "tel:+998935551747");
  await expect(
    footer.getByRole("link", { name: "contact_uz@biotact.de" }),
  ).toHaveAttribute("href", "mailto:contact_uz@biotact.de");
  await expect(footer).toContainText("Siemensstraße 10");
  await expect(footer).toContainText("53121 Bonn, Deutschland");
  // Bottom row: copyright on the left, developer credit on the right.
  const bottom = footer.locator(".footer-bottom > p");
  const year = new Date().getFullYear();
  await expect(footer.locator("#footer-uz")).toHaveText('ООО "Biotact"');
  await expect(bottom).toHaveText([
    `© ${year} ООО "Biotact"`,
    "Разработка сайта — temrjan.com",
  ]);
  const credit = footer.getByRole("link", { name: "temrjan.com", exact: true });
  await expect(credit).toHaveAttribute("href", "https://temrjan.com");
  await expect(credit).toHaveAttribute("target", "_blank");
  await expect(credit).toHaveAttribute("rel", "noopener noreferrer");
  const footerBox = await footer.boundingBox(),
    copyrightBox = await bottom.first().boundingBox(),
    creditBox = await bottom.last().boundingBox();
  if (!footerBox || !copyrightBox || !creditBox)
    throw new Error("Missing footer bottom row");
  expect(Math.abs(copyrightBox.x - footerBox.x)).toBeLessThan(1);
  expect(
    Math.abs(creditBox.x + creditBox.width - (footerBox.x + footerBox.width)),
  ).toBeLessThan(1);
  expect(Math.abs(copyrightBox.y - creditBox.y)).toBeLessThan(1);
  await expect(
    footer.getByRole("link", { name: "kontakt@biotact.de" }),
  ).toHaveAttribute("href", "mailto:kontakt@biotact.de");
  await page.screenshot({
    path: testInfo.outputPath("home-sections-1440.png"),
    fullPage: true,
  });

  await page.locator('.languages [lang="uz"]').click();
  await expect(sale.locator("h2")).toHaveText("Aksiyalar");
  await expect(page.locator('[data-category="product"] h2')).toHaveText(
    "Nutriyentlar API",
  );
  await expect(
    page.locator('[data-category="product"] .section-head a'),
  ).toHaveText("Hammasi");
  await expect(video.locator("h2")).toHaveText(
    "Probiotiklar va vitamin-mineral komplekslar",
  );
  await expect(page.locator(".faq h2")).toHaveText("Savol-javob");
  await expect(questions.nth(3)).toHaveText(
    /Bizning probiotiklar va vitamin-mineral komplekslarimizning noyob afzalliklari qanday\?/,
  );
  await expect(form.locator("h2")).toHaveText(
    "Bizning mutaxassisimizdan mahsulotlarimiz bo'yicha bepul maslahat oling",
  );
  await form
    .getByRole("button", { name: "Maslahat olish", exact: true })
    .click();
  await expect(form.getByRole("status")).toHaveText(
    "Shakl tez orada ishga tushadi. Bizga qo'ng'iroq qiling: +998 93 555 17 47",
  );
  await expect(
    footer.locator('[aria-labelledby="footer-uz"] p').first(),
  ).toHaveText("100109, Toshkent shahri, Olmazor tumani,");
  await expect(
    footer.locator('[aria-labelledby="footer-uz"] p').nth(1),
  ).toHaveText("Farobiy ko'chasi, 448J");
  await expect(footer).not.toContainText("Yangiqo'rg'on");
  await page.locator('[data-category="product"] .section-head a').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Nutriyentlar API",
  );
  await expect(page.locator(".page-footer")).toContainText("Toshkent shahri");
  // The Uzbek page names the company in its Uzbek legal form, spelled as the
  // Captain's reference (C-101, typographic quotes).
  await expect(page.locator("#footer-uz")).toHaveText("“Biotact” MChJ");
  await expect(page.locator(".footer-bottom > p")).toHaveText([
    `© ${year} “Biotact” MChJ`,
    "Sayt ishlab chiqilgan: temrjan.com",
  ]);
  await expect(page.locator(".page-footer")).not.toContainText("ООО");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#home?lang=uz");
    await expect(page.locator('[data-category="product"] article')).toHaveCount(
      40,
    );
    for (const font of ["", "125%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, font);
      await noOverflow(page);
      // The bottom footer row wraps inside the footer.
      expect(
        await page
          .locator(".footer-bottom")
          .evaluate((row) =>
            [...row.children].every(
              (c) =>
                c.getBoundingClientRect().left >=
                  row.getBoundingClientRect().left - 1 &&
                c.getBoundingClientRect().right <=
                  row.getBoundingClientRect().right + 1,
            ),
          ),
      ).toBe(true);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
  expect(
    requests.filter(
      (r) =>
        !r.startsWith("GET ") ||
        /consultation|orders|basket|lead|feedback/.test(r),
    ),
  ).toEqual([]);
});

async function seedGuestBasket(
  page: Page,
  items: { product_id: number; size: string | null; quantity: number }[],
) {
  await page.goto("/#catalogue");
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await page.evaluate(
    ({ key, items }) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, items })),
    { key: BASKET_STORAGE_KEY, items },
  );
  await page.reload();
  await expect(page.locator(".product-grid article")).toHaveCount(20);
}
async function rememberedBasket(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null") as unknown,
    BASKET_STORAGE_KEY,
  );
}

test("remembered exact variants survive reload, a new page and optional unavailable Account; all shared increments cap at99", async ({
  page,
  context,
}) => {
  await fixture(page);
  await seedGuestBasket(page, [
    { product_id: 4001, size: "L", quantity: 98 },
    { product_id: 4001, size: "XL", quantity: 1 },
    { product_id: 4004, size: null, quantity: 2 },
  ]);
  const sale = page.locator(firstCard);
  await expect(sale.locator("output")).toHaveText("98");
  await sale.locator("[data-more]").click();
  await expect(sale.locator("output")).toHaveText("99");
  await expect(sale.locator("[data-more]")).toBeDisabled();
  // A full L line does not disable choosing XL through the accepted popup.
  await sale.locator(".size-summary").click();
  const picker = page.locator(".size-picker");
  await picker.getByRole("button", { name: "L · 99", exact: true }).click();
  await picker.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(sale.locator("output")).toHaveText("99");
  await sale.locator(".size-summary").click();
  await picker.getByRole("button", { name: "XL · 1", exact: true }).click();
  await picker.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(sale.locator("output")).toHaveText("2");
  await expect(page.locator(".basket-badge")).toHaveText("103");
  await page.locator(firstCard + " h3 a").click();
  await pickSize(page, "L");
  await expect(page.locator(".product-summary [data-more]")).toBeDisabled();
  await page.locator(".basket-button").click();
  await expect(
    page.locator('[data-basket-size="L"] [data-more]'),
  ).toBeDisabled();
  await page.locator('[data-basket-size="XL"] [data-more]').click();
  await page.keyboard.press("Escape");
  const expected = {
    version: 1,
    items: [
      { product_id: 4001, size: "L", quantity: 99 },
      { product_id: 4001, size: "XL", quantity: 3 },
      { product_id: 4004, size: null, quantity: 2 },
    ],
  };
  await expect.poll(() => rememberedBasket(page)).toEqual(expected);
  await page.route("**/api/v1/buyer/auth/**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.locator(".top-utilities > a").click();
  await expect(page.locator(".account")).toBeVisible();
  await expect(page.locator(".basket-badge")).toHaveText("104");
  await page.reload();
  await page.locator(".basket-button").click();
  await expect(page.locator(".guest-continue")).toBeEnabled();
  await page.locator(".guest-continue").click();
  await expect(page.getByLabel("Имя", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const second = await context.newPage();
  try {
    await fixture(second);
    const langs: string[] = [];
    second.on("request", (r) => {
      if (/\/products\/\d+$/.test(new URL(r.url()).pathname))
        langs.push(r.headers()["x-language"] || "");
    });
    await second.goto("/#catalogue?lang=uz");
    await second.locator(".basket-button").click();
    await expect(second.locator(".basket-row")).toHaveCount(3);
    await expect(second.locator(".guest-continue")).toBeEnabled();
    expect(langs).toEqual(["uz", "uz"]);
    expect(await rememberedBasket(second)).toEqual(expected);
  } finally {
    await second.close();
  }
});

// Class-1 guest checkout boundaries (WS-02, WS-03, WS-06, WS-11, D-1, D-3).
test("guest validation, server review, unaccepted terms, draft lifetime and privacy cross the actual browser request and storage boundaries", async ({
  page,
}, testInfo) => {
  await fixture(page);
  const requests: { method: string; url: string; body: string }[] = [],
    consoleMessages: string[] = [];
  page.on("request", (r) =>
    requests.push({
      method: r.method(),
      url: r.url(),
      body: r.postData() || "",
    }),
  );
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.route("**/__test/guest-observer-control", (r) =>
    r.fulfill({ status: 204 }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#catalogue");
  await page.evaluate(() =>
    fetch("/__test/guest-observer-control", {
      method: "POST",
      body: "observer-control",
    }),
  );
  expect(
    requests.some((r) => r.method === "POST" && r.body === "observer-control"),
  ).toBe(true);
  requests.length = 0;
  await page.locator(ordinaryCard + " .add").click();
  await page.locator(".basket-button").click();
  await page.locator(".guest-continue").click();
  const name = page.getByLabel("Имя", { exact: true }),
    phone = page.getByLabel("Контактный телефон"),
    address = page.getByLabel("Адрес доставки");
  await name.fill("   ");
  await phone.fill("letters");
  await address.fill("  ");
  await phone.press("Enter");
  await expect(name).toBeFocused();
  await expect(page.locator(".guest-error")).toHaveCount(3);
  await expect(page.locator("#guest-phone-error")).toHaveText(
    "Укажите телефон: от 9 до 15 цифр. Допустимы пробелы, скобки, дефисы, точки и плюс в начале.",
  );
  const details = {
    name: "李 Guest-Private <b>Тест</b>",
    phone: "+998 (90) 555-01.23",
    address: "Guest-Private 東京, дом 1\nвход 2",
  };
  await name.fill(details.name);
  await phone.fill(details.phone);
  await address.fill(details.address);
  await page
    .getByRole("button", { name: "Проверить данные", exact: true })
    .click();
  await expect(page.locator(".guest-review")).toContainText(details.name);
  await expect(page.locator(".guest-review b")).toHaveCount(0);
  await expect(page.locator(".guest-checkout .basket-total")).toBeVisible();
  const accept = page.getByRole("checkbox");
  await expect(accept).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("guest-review-1440.png") });
  const before = page.url();
  // Without accepted terms, repeated presses and Enter create nothing.
  await page
    .getByRole("button", { name: "Оформить заказ", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await page.keyboard.press("Enter");
  await expect(page.locator("#guest-accept-error")).toHaveText(
    "Чтобы оформить заказ, примите условия.",
  );
  await expect(accept).toBeFocused();
  expect(page.url()).toBe(before);
  await expect(page.locator(".basket-badge")).toHaveText("1");
  await page
    .getByRole("button", { name: "Назад к данным", exact: true })
    .click();
  await expect(name).toHaveValue(details.name);
  await page
    .getByRole("button", { name: "Назад в корзину", exact: true })
    .click();
  await page.locator(".basket-panel [data-more]").click();
  await page.locator(".guest-continue").click();
  await expect(name).toHaveValue(details.name);
  await expect(page.locator(".guest-review")).toHaveCount(0);
  await phone.fill("90 777 77 77");
  await page
    .getByRole("button", { name: "Проверить данные", exact: true })
    .click();
  await expect(page.locator(".guest-review")).toContainText("90 777 77 77");
  await expect(page.locator(".basket-unit")).toContainText("× 2");
  await page
    .getByRole("button", { name: "Назад к данным", exact: true })
    .click();
  await languageStep(page, "uz");
  await expect(page.getByLabel("Ism", { exact: true })).toHaveValue(
    details.name,
  );
  await expect(page.getByLabel("Aloqa telefoni")).toHaveValue("90 777 77 77");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "125%"),
    );
    await expect(
      page.locator(".basket-panel").getByRole("button", { name: /^(RU|UZ)$/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Tab");
    await greenFocus(page.getByLabel("Yetkazib berish manzili"));
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`guest-form-${width}.png`),
    });
  }
  await page
    .getByRole("button", { name: "Maʼlumotlarni tekshirish", exact: true })
    .click();
  await expect(page.locator(".guest-review")).toContainText(details.name);
  await noOverflow(page);
  // Both translations are cached now; changing the resolved projection still invalidates review.
  // Back returns to the same view in Russian.
  await page.goBack();
  await basketStaysOpen(page);
  await expect(page.locator(".guest-review")).toHaveCount(0);
  await expect(name).toHaveValue(details.name);
  await page
    .getByRole("button", { name: "Проверить данные", exact: true })
    .click();
  await languageStep(page, "uz");
  await expect(page.locator(".guest-review")).toHaveCount(0);
  await expect(page.getByLabel("Ism", { exact: true })).toHaveValue(
    details.name,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".basket-button")).toBeFocused();
  await page.locator(".basket-button").click();
  await expect(page.locator("#basket-title")).toHaveText("Savat");
  await page.locator(".guest-continue").click();
  await expect(page.getByLabel("Ism", { exact: true })).toHaveValue("");
  await page.getByLabel("Ism", { exact: true }).fill(details.name);
  await page.evaluate(() => {
    window.location.hash = "#product?id=4004&lang=uz";
  });
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator(".basket-button").click();
  await page.locator(".guest-continue").click();
  await expect(page.getByLabel("Ism", { exact: true })).toHaveValue("");
  await page.reload();
  await page.locator(".basket-button").click();
  await page.locator(".guest-continue").click();
  await expect(page.getByLabel("Ism", { exact: true })).toHaveValue("");
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    url: location.href,
  }));
  expect(storage.local).toEqual({
    [BASKET_STORAGE_KEY]: JSON.stringify({
      version: 1,
      items: [{ product_id: 4004, size: null, quantity: 2 }],
    }),
  });
  expect(storage.session).toEqual({});
  expect(JSON.stringify(storage)).not.toContain("Guest-Private");
  expect(JSON.stringify(requests)).not.toContain("Guest-Private");
  expect(JSON.stringify(storage)).not.toContain(details.phone);
  expect(JSON.stringify(requests)).not.toContain(details.phone);
  expect(consoleMessages.join("\n")).not.toContain("Guest-Private");
  // Review sends only the basket lines for a server quote; no order is created.
  const writes = requests.filter((r) => !["GET", "HEAD"].includes(r.method));
  expect(writes.length).toBeGreaterThan(0);
  for (const write of writes) {
    expect(new URL(write.url).pathname).toBe("/api/v1/guest/quote");
    expect(JSON.parse(write.body)).toEqual({
      items: [
        {
          product_id: 4004,
          quantity: expect.any(Number),
          size: null,
        },
      ],
    });
  }
});

test("corrupt storage and denied read/write retain usable in-memory Add, form and removal", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/#catalogue");
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await page.evaluate(
    (key) => localStorage.setItem(key, "{broken"),
    BASKET_STORAGE_KEY,
  );
  await page.reload();
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-notice")).toContainText("повреждена");
  await expect(page.locator(".empty-state")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Denied", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.reload();
  await page.locator(ordinaryCard + " .add").click();
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-notice")).toContainText(
    "Не удаётся сохранить",
  );
  await page.locator(".basket-panel [data-more]").click();
  await expect(page.locator(".basket-panel output")).toHaveText("2");
  await page.locator(".guest-continue").click();
  await page.getByLabel("Имя", { exact: true }).fill("Memory");
  await page.getByLabel("Контактный телефон").fill("901234567");
  await page.getByLabel("Адрес доставки").fill("Memory address");
  await page
    .getByRole("button", { name: "Проверить данные", exact: true })
    .click();
  await expect(page.locator(".guest-review")).toContainText("Memory address");
  await page
    .getByRole("button", { name: "Назад к данным", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Назад в корзину", exact: true })
    .click();
  await page.locator(".basket-remove").click();
  await expect(page.locator(".empty-state")).toBeVisible();
});

test("restoration keeps missing, failed, unavailable and obsolete variants visible; retry and removal recover without substitution", async ({
  page,
}) => {
  await fixture(page);
  await seedGuestBasket(page, [
    { product_id: 9999, size: null, quantity: 1 },
    { product_id: 4004, size: null, quantity: 2 },
    { product_id: 4002, size: null, quantity: 1 },
    { product_id: 4003, size: null, quantity: 1 },
    { product_id: 4001, size: "XXL", quantity: 1 },
    { product_id: 4001, size: null, quantity: 1 },
    { product_id: 4005, size: "L", quantity: 1 },
  ]);
  let failed = true;
  await page.route("**/api/v1/products/4004", (route) =>
    route.fulfill(failed ? { status: 503, json: {} } : { json: products[3] }),
  );
  await page.reload();
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-row")).toHaveCount(7);
  await expect(page.locator('[data-basket-product="9999"]')).toContainText(
    "Товар №9999",
  );
  await expect(page.locator('[data-basket-product="9999"]')).toContainText(
    "Товар не найден",
  );
  await expect(page.locator('[data-basket-product="4004"]')).toContainText(
    "Не удалось проверить",
  );
  await expect(page.locator('[data-basket-size="XXL"]')).toContainText(
    "Выбранный размер недоступен",
  );
  await expect(
    page.locator('[data-basket-product="4001"][data-basket-size=""]'),
  ).toContainText("Выбранный размер недоступен");
  await expect(page.locator('[data-basket-product="4005"]')).toContainText(
    "Выбранный размер недоступен",
  );
  await expect(page.locator(".guest-continue")).toBeDisabled();
  failed = false;
  await page
    .locator('[data-basket-product="4004"]')
    .getByRole("button", { name: "Повторить", exact: true })
    .click();
  await expect(page.locator('[data-basket-product="4004"] output')).toHaveText(
    "2",
  );
  await expect(page.locator(".guest-continue")).toBeDisabled();
  const blockedRows = page.locator(
    '.basket-row:not([data-basket-product="4004"])',
  );
  while (await blockedRows.count())
    await blockedRows.first().locator(".basket-remove").click();
  await expect(page.locator(".basket-row")).toHaveCount(1);
  await expect(page.locator(".guest-continue")).toBeEnabled();
});

test("late public reads cannot resurrect removals, undo quantities or apply a previous language", async ({
  page,
}) => {
  await fixture(page);
  await seedGuestBasket(page, [{ product_id: 4004, size: null, quantity: 2 }]);
  const held: (() => Promise<void>)[] = [];
  await page.route("**/api/v1/products/4004", async (route) => {
    if (route.request().headers()["x-language"] === "ru") {
      await new Promise<void>((resolve) =>
        held.push(async () => {
          await route
            .fulfill({ json: { ...products[3], name: "Old RU result" } })
            .catch(() => {});
          resolve();
        }),
      );
    } else
      await route.fulfill({
        json: { ...products[3], name: "Fresh UZ result" },
      });
  });
  await page.reload();
  await expect.poll(() => held.length).toBe(1);
  await page.locator(".basket-button").click();
  await expect(page.locator(".basket-row")).toContainText("Проверяем товар");
  await expect(page.locator(".guest-continue")).toBeDisabled();
  await page.locator(".basket-remove").click();
  await held[0]?.();
  await expect(page.locator(".basket-row")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator(ordinaryCard + " .add").click();
  await expect(page.locator(ordinaryCard + " output")).toHaveText("1");
  await page.reload();
  await expect.poll(() => held.length).toBe(2);
  // A native Add while restoration is pending changes the original quantity.
  await page.locator(ordinaryCard + " .add").click();
  await page.locator(ordinaryCard + " [data-more]").click();
  await held[1]?.();
  await expect(page.locator(ordinaryCard + " output")).toHaveText("3");
  await page.reload();
  await expect.poll(() => held.length).toBe(3);
  await page.locator(".basket-button").click();
  await languageStep(page, "uz");
  await expect(page.locator(".basket-name")).toHaveText("Fresh UZ result");
  await held[2]?.();
  await expect(page.locator(".basket-name")).toHaveText("Fresh UZ result");
  await expect(page.locator(".basket-panel output")).toHaveText("3");
});

test("Home rows scroll with one stepper-style row control and no scrollbar; catalogue tabs read as headings without the search note", async ({
  page,
}) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const popular = page.locator('[data-category="product"]');
  const row = popular.locator(".product-row");
  await expect(row.locator("article")).toHaveCount(40);
  await expect(row).toHaveCSS("scrollbar-width", "none");
  expect(
    await row.evaluate((n) => (n as HTMLElement).offsetHeight - n.clientHeight),
  ).toBe(0);
  // One control instead of two arrows and a pill: [‹] Все [›] in the frame of
  // the live basket stepper (one basket line makes the basket show it).
  await row.locator(ordinaryCard).locator(".add").click();
  const basket = await basketStepper(page);
  const control = popular.locator(".section-head .slider-controls");
  await expect(control).toHaveCount(1);
  await stepperFrame(
    control,
    ["Предыдущие товары", "Все: Нутриенты", "Следующие товары"],
    basket,
  );
  const previous = control.getByRole("button", { name: "Предыдущие товары" });
  const next = control.getByRole("button", { name: "Следующие товары" });
  const all = control.getByRole("link", { name: "Все: Нутриенты" });
  await expect(all).toHaveText("Все");
  await expect(all).toHaveCSS("font-size", "17px");
  await expect(all).toHaveCSS("font-weight", "700");
  await expect(all).toHaveAttribute(
    "href",
    "/#catalogue?category=301&page=1&lang=ru",
  );
  // Vector chevrons centred by the button (R2), not text glyphs.
  for (const arrow of [previous, next]) {
    await expect(arrow).toHaveAttribute("aria-controls", "home-product-row");
    await expect(arrow.locator("svg")).toHaveCount(1);
    expect((await arrow.boundingBox())?.width).toBe(44);
    await chevronCentred(arrow);
  }
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  // The end arrow stays focusable with a solid inner ring; only its chevron fades.
  await keyboardFocus(previous);
  await expect(previous).toHaveCSS("outline-offset", "-5px");
  await expect(previous).toHaveCSS("opacity", "1");
  await expect(previous.locator("svg")).toHaveCSS("opacity", "0.4");
  await expect(next.locator("svg")).toHaveCSS("opacity", "1");
  await keyboardFocus(all);
  await expect(all).toHaveCSS("outline-offset", "-5px");
  await previous.hover();
  await expect(previous).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await next.hover();
  await expect(next).toHaveCSS("background-color", "rgb(224, 224, 224)");
  await all.hover();
  await expect(all).toHaveCSS("background-color", "rgb(224, 224, 224)");
  // A disabled arrow does nothing.
  await previous.click({ force: true });
  expect(await row.evaluate((n) => n.scrollLeft)).toBe(0);
  await next.click();
  await expect.poll(() => row.evaluate((n) => n.scrollLeft)).toBeGreaterThan(0);
  // Four of forty cards are visible: one step shows the next four.
  await expect(next).toBeEnabled();
  await expect(previous).toBeEnabled();
  await expect(previous.locator("svg")).toHaveCSS("opacity", "1");
  await expect.poll(() => visibleCards(row)).toBe(4);
  await expect(row.locator('[data-product-id="4005"]')).toBeInViewport();
  await previous.click();
  await expect.poll(() => row.evaluate((n) => n.scrollLeft)).toBe(0);
  await expect(previous).toBeDisabled();
  // Swiping/trackpad scrolling still works and updates the arrows.
  await row.evaluate((n) => n.scrollBy({ left: 400 }));
  await expect(previous).toBeEnabled();
  // The arrows reach the last product of the category.
  await row.evaluate((n) => n.scrollTo({ left: 0 }));
  await expect(previous).toBeDisabled();
  for (let step = 1; step <= 9; step++) {
    await next.click();
    await expect(
      row.locator(`[data-product-id="${4004 + step * 4}"]`),
    ).toBeInViewport();
  }
  await expect(next).toBeDisabled();
  await expect(next.locator("svg")).toHaveCSS("opacity", "0.4");
  await expect(row.locator('[data-product-id="4040"]')).toBeInViewport();
  // The sale row has no catalogue target; its single product does not
  // scroll, so its header shows nothing (V1).
  const saleHead = page.locator('[data-category="sale"] .section-head');
  await expect(saleHead.locator("h2")).toHaveText("Акции");
  await expect(saleHead.locator(".slider-controls, a, button")).toHaveCount(0);
  await ariaControlsResolve(page);
  await all.click();
  await expect(page).toHaveURL(/#catalogue\?category=301&page=1&lang=ru$/);

  const tabs = page.locator(".filter-row a");
  const current = page.locator('.filter-row a[aria-current="page"]');
  await expect(current).toHaveText("Нутриенты");
  await expect(current).toHaveCSS("color", "rgb(12, 61, 43)");
  await expect(current).toHaveCSS("text-decoration-line", "underline");
  for (const tab of [current, tabs.first()]) {
    await expect(tab).toHaveCSS("border-top-style", "none");
    await expect(tab).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  await expect(tabs.first()).toHaveCSS("text-decoration-line", "none");
  await tabs.first().hover();
  await expect(tabs.first()).toHaveCSS("text-decoration-line", "underline");
  await keyboardFocus(tabs.first());
  await expect(page.getByText(/Поиск по русскому названию/)).toHaveCount(0);
  await expect(page.locator(".search-note")).toHaveCount(0);
  await page.goto("/#catalogue?page=1&lang=uz");
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await expect(page.getByText(/Ruscha nom/)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#home?lang=uz");
  const compact = page.locator('[data-category="product"]');
  await expect(compact.locator("article")).toHaveCount(40);
  // Phones: no arrow frame; the category row keeps only "Hammasi ›" (M6).
  await expect(compact.locator(".slider-controls, .slider-arrow")).toHaveCount(
    0,
  );
  await plainAll(
    compact.locator(".section-head .view-all-link"),
    "Hammasi: Nutriyentlar API",
    "Hammasi",
    "/#catalogue?category=301&page=1&lang=uz",
  );
  await expect(
    page.locator('[data-category="sale"] .section-head > :not(h2)'),
  ).toHaveCount(0);
  await noOverflow(page);
});

test("row header: Все link while a row loads, fails or does not scroll; arrows only for a row that exists and scrolls", async ({
  page,
}) => {
  await fixture(page);
  // Наборы: held, then two products (no overflow at four per row);
  // Техника: the row read fails.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/v1/products?*", async (route) => {
    const category = new URL(route.request().url()).searchParams.get(
      "category_id",
    );
    if (category === "302") {
      await held;
      await route.fulfill({
        json: {
          items: products
            .slice(4, 6)
            .map((p, i) => ({ ...p, id: 5001 + i, category_id: 302 })),
          page: 1,
          size: 100,
          total: 2,
          pages: 1,
        },
      });
    } else if (category === "303")
      await route.fulfill({ status: 503, json: {} });
    else await route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const sets = page.locator('[data-category="vitaminy-set"]'),
    tech = page.locator('[data-category="tehnika"]');
  await expect(page.locator('[data-category="product"] article')).toHaveCount(
    40,
  );
  // Loading: the link, no arrows and no reference to the missing row.
  await expect(sets.locator(".product-row")).toHaveCount(0);
  await plainAll(
    sets.locator(".section-head .view-all-link"),
    "Все: Наборы",
    "Все",
    "/#catalogue?category=302&page=1&lang=ru",
  );
  await expect(sets.locator(".slider-controls, .slider-arrow")).toHaveCount(0);
  // Error: the link stays the way to the category.
  await expect(tech.getByRole("button", { name: /Повторить/ })).toBeVisible();
  await plainAll(
    tech.locator(".section-head .view-all-link"),
    "Все: Техника",
    "Все",
    "/#catalogue?category=303&page=1&lang=ru",
  );
  await expect(tech.locator(".slider-controls, .slider-arrow")).toHaveCount(0);
  await ariaControlsResolve(page);
  // Ready without overflow: still the link only (V1).
  release();
  await expect(sets.locator(".product-row article")).toHaveCount(2);
  expect(
    await sets
      .locator(".product-row")
      .evaluate((n) => n.scrollWidth - n.clientWidth),
  ).toBeLessThanOrEqual(1);
  await plainAll(
    sets.locator(".section-head .view-all-link"),
    "Все: Наборы",
    "Все",
    "/#catalogue?category=302&page=1&lang=ru",
  );
  await expect(sets.locator(".slider-controls, .slider-arrow")).toHaveCount(0);
  // A row that exists and scrolls has the frame, its arrows control the row.
  const popular = page.locator('[data-category="product"] .section-head');
  await expect(popular.locator(".slider-controls > *")).toHaveCount(3);
  await expect(popular.locator(".view-all-link")).toHaveCount(0);
  await ariaControlsResolve(page);
  // Narrowing to a phone drops the frame; widening brings it back.
  await page.setViewportSize({ width: 999, height: 1000 });
  await expect(popular.locator(".slider-controls")).toHaveCount(0);
  await expect(popular.locator(".view-all-link")).toHaveCount(1);
  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect(popular.locator(".slider-controls > *")).toHaveCount(3);
  await tech.locator(".view-all-link").click();
  await expect(page).toHaveURL(/#catalogue\?category=303&page=1&lang=ru$/);
});

test("phone home rows shift once by a small random distance when they come into view and stay; not under reduced motion, after a touch or a scroll, or on desktop", async ({
  page,
}) => {
  await fixture(page);
  // Pin Math.random per page view, so both ends of the random ranges are proven.
  await page.addInitScript(() => {
    const pinned = sessionStorage.getItem("pinned-random");
    if (pinned !== null) Math.random = () => Number(pinned);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const row = page.locator('[data-category="product"] .product-row'),
    sale = page.locator('[data-category="sale"] .product-row');
  const left = () => row.evaluate((n) => n.scrollLeft);
  /** Open Home in a new page view, optionally pinning Math.random. */
  async function open(random: number | null) {
    await page.goto("/#catalogue?page=1");
    await page.evaluate((random) => {
      if (random === null) sessionStorage.removeItem("pinned-random");
      else sessionStorage.setItem("pinned-random", String(random));
    }, random);
    await page.goto("/");
    await page.reload();
    await expect(row.locator("article")).toHaveCount(40);
  }
  /** Wait until the row has moved and stopped; returns its offset. */
  async function settled() {
    await expect.poll(left, { timeout: 3000 }).toBeGreaterThan(0);
    let previous = -1,
      current = await left();
    while (current !== previous) {
      await page.waitForTimeout(150);
      previous = current;
      current = await left();
    }
    return current;
  }
  const cardWidth = () =>
    row
      .locator("article")
      .first()
      .evaluate((n) => (n as HTMLElement).offsetWidth);
  for (const random of [0, 0.999]) {
    await open(random);
    // Not before the row comes into view.
    await page.waitForTimeout(800);
    expect(await left()).toBe(0);
    await row.scrollIntoViewIfNeeded();
    const shift = await settled(),
      card = await cardWidth();
    // Below one card width: part of the first card stays visible.
    expect(shift).toBeGreaterThanOrEqual(Math.floor(card * 0.3));
    expect(shift).toBeLessThanOrEqual(Math.ceil(card * 0.55));
    await expect(row.locator("article").first()).toBeInViewport({
      ratio: 0.4,
    });
    // It stays: no return, no snapping back, not replayed on the next visit.
    await expect(row).toHaveCSS("scroll-snap-type", "none");
    await page.waitForTimeout(2000);
    expect(await left()).toBe(shift);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    expect(await left()).toBe(shift);
  }
  // A row whose cards fit does not move (the sale row has one product).
  await sale.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  expect(await sale.evaluate((n) => n.scrollLeft)).toBe(0);
  // The visitor touched the row before the hint: it does not move.
  await open(null);
  await row.evaluate((n) => {
    n.scrollIntoView({ block: "center" });
    n.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  expect(await left()).toBe(0);
  // The visitor scrolled the row before the hint: it stays where they left it.
  await open(null);
  await row.evaluate((n) => {
    n.scrollIntoView({ block: "center" });
    n.scrollBy({ left: n.clientWidth });
  });
  const own = await left();
  expect(own).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(await left()).toBe(own);
  await expect(row).not.toHaveAttribute("data-hint");
  // Reduced motion: no shift at all.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(null);
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  expect(await left()).toBe(0);
  // Desktop: no shift; the arrows scroll the row.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(null);
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  expect(await left()).toBe(0);
  await expect(row).toHaveCSS("scroll-snap-type", "x mandatory");
});

test("phone row hint plays once per site visit: back on Home by link, menu or Back without a reload the row stays at the start; a reload is a new visit", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const row = page.locator('[data-category="product"] .product-row'),
    cards = row.locator("article");
  const left = () => row.evaluate((n) => n.scrollLeft);
  /** Mark the document, so a later check proves no reload happened in between. */
  const mark = () =>
    page.evaluate(() => Object.assign(window, { sameVisit: true }));
  async function shifts() {
    await expect(cards).toHaveCount(40);
    await row.scrollIntoViewIfNeeded();
    await expect.poll(left, { timeout: 3000 }).toBeGreaterThan(0);
    await expect(row).toHaveAttribute("data-hint", "");
  }
  /** Back on Home in the same document: the row starts at 0 and stays there past the longest hint delay, snapping as usual. */
  async function stays() {
    await expect(page).toHaveURL(/#home\?lang=ru$/);
    expect(await page.evaluate(() => "sameVisit" in window)).toBe(true);
    await expect(cards).toHaveCount(40);
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    expect(await left()).toBe(0);
    await expect(row).not.toHaveAttribute("data-hint");
    await expect(row).toHaveCSS("scroll-snap-type", "x mandatory");
  }
  async function toCatalogue() {
    await page.locator('[data-category="product"] .view-all-link').click();
    await expect(page).toHaveURL(/#catalogue\?/);
    await expect(row).toHaveCount(0);
  }
  // First view: the row shifts.
  await page.goto("/#home?lang=ru");
  await mark();
  await shifts();
  // Catalogue by the row's "Все" link, then Back.
  await toCatalogue();
  await page.goBack();
  await stays();
  // Catalogue again, then Home by the logo in the phone menu.
  await toCatalogue();
  await page.locator(".menu-toggle").click();
  await page.locator(".drawer .brand").click();
  await stays();
  // A reload is a new visit: the row shifts again.
  await page.reload();
  expect(await page.evaluate(() => "sameVisit" in window)).toBe(false);
  await shifts();
  // A row the visitor touched before the hint keeps its chance used up too.
  await page.reload();
  await mark();
  await expect(cards).toHaveCount(40);
  await row.evaluate((n) => {
    n.scrollIntoView({ block: "center" });
    n.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  expect(await left()).toBe(0);
  await toCatalogue();
  await page.goBack();
  await stays();
  // A row that never came into view before leaving still gets its one shift.
  await page.reload();
  await mark();
  await expect(cards).toHaveCount(40);
  await page.waitForTimeout(800);
  expect(await left()).toBe(0);
  await page.goto("/#catalogue?page=1&lang=ru");
  await expect(row).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/#home\?lang=ru$/);
  expect(await page.evaluate(() => "sameVisit" in window)).toBe(true);
  await shifts();
});

test("side menu shows no per-item loading or error text; the page keeps its own retry", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/v1/categories?*", async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto("/");
  const menu = page.locator(".sidebar .category-nav");
  await expect(page.getByRole("status").first()).toHaveText("Загружаем…");
  await expect(menu).toHaveText("Все товары");
  await expect(menu.locator("a")).toHaveCount(1);
  f.categoryFailure = "status";
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось загрузить данные",
  );
  await expect(menu).toHaveText("Все товары");
  await expect(page.locator(".sidebar")).not.toContainText("Не удалось");
  delete f.categoryFailure;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(menu.locator("a")).toHaveText([
    "Все товары",
    "Нутриенты",
    "Наборы",
    "Техника",
  ]);
  // A category absent from the API keeps its existing "unavailable" line.
  await expect(menu.locator("span")).toHaveText(
    "Товары для жизни — Недоступно",
  );
});

/**
 * S1/S2 in one menu: each category entry has its set-A icon in brand green;
 * hairlines separate category entries and nothing else.
 */
async function categoryMenu(menu: Locator) {
  const entries = menu.locator(".category-nav > *");
  await expect(entries).toHaveCount(5);
  const marks = await entries.evaluateAll((nodes) =>
    nodes.map((n) => {
      const svg = n.querySelector("svg");
      const r = svg?.getBoundingClientRect();
      const line = getComputedStyle(n, "::before");
      return {
        icons: n.querySelectorAll("svg").length,
        // First drawing primitive identifies the Lucide icon.
        shape: svg?.firstElementChild?.getAttribute("d") ?? svg?.innerHTML,
        size: [r?.width, r?.height],
        colour: svg && getComputedStyle(svg).color,
        divider:
          line.content === "none"
            ? null
            : `${line.borderTopWidth} ${line.borderTopStyle} ${line.borderTopColor}`,
      };
    }),
  );
  expect(marks.map((m) => m.icons)).toEqual([1, 1, 1, 1, 1]);
  expect(marks.map((m) => m.shape?.slice(0, 18))).toEqual([
    '<rect width="7" he', // layout-grid: Все товары
    "m10.5 20.5 10-10a4", // pill: product
    '<rect x="3" y="8" ', // gift: vitaminy-set
    "M2 12h20", // cooking-pot: tehnika
    "M2 9.5a5.5 5.5 0 0", // heart-pulse: active-life
  ]);
  for (const m of marks) {
    expect(m.size).toEqual([20, 20]);
    expect(m.colour).toBe("rgb(12, 61, 43)");
  }
  expect(marks.map((m) => m.divider)).toEqual([
    null,
    "1px solid rgb(214, 214, 214)",
    "1px solid rgb(214, 214, 214)",
    "1px solid rgb(214, 214, 214)",
    "1px solid rgb(214, 214, 214)",
  ]);
  // Top-level menu entries keep no divider.
  expect(
    await menu
      .locator(".nav-primary > *")
      .evaluateAll((nodes) =>
        nodes.every((n) => getComputedStyle(n, "::before").content === "none"),
      ),
  ).toBe(true);
}

test("side menu and phone menu separate category entries with hairlines and show the approved icons", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#home?lang=ru");
  const side = page.locator(".sidebar");
  await expect(side.locator(".category-nav a")).toHaveCount(4);
  await categoryMenu(side);
  // Each icon sits before its name; the names and targets are unchanged.
  await expect(side.locator(".category-nav a")).toHaveText([
    "Все товары",
    "Нутриенты",
    "Наборы",
    "Техника",
  ]);
  await expect(
    side.getByRole("link", { name: "Нутриенты", exact: true }),
  ).toHaveAttribute("href", "/#catalogue?category=301&page=1&lang=ru");
  await noOverflow(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#home?lang=uz");
    await page.locator(".menu-toggle").click();
    const drawer = page.locator(".drawer");
    await expect(drawer.locator(".category-nav a")).toHaveCount(4);
    await categoryMenu(drawer);
    await noOverflow(page);
    await page.keyboard.press("Escape");
  }
});

test("basket sits in the side menu on desktop and in the phone top bar that returns on upward scroll", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#catalogue?page=1&lang=ru");
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await expect(page.locator(".basket-button")).toHaveCount(1);
  const sideBasket = page.locator(".sidebar .basket-button");
  expect(
    await sideBasket.evaluate((n) =>
      n.previousElementSibling?.classList.contains("ai-nav"),
    ),
  ).toBe(true);
  await expect(page.locator(".topbar .basket-button")).toHaveCount(0);
  await expect(page.locator(".topbar .top-ai")).toBeVisible();
  await page
    .locator('.product-grid [data-product-id="4020"]')
    .scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(500);
  await page.locator('.product-grid [data-product-id="4020"] .add').click();
  await expect(sideBasket.locator(".basket-badge")).toHaveText("1");
  await expect(sideBasket).toBeInViewport();
  await expect(sideBasket).toHaveAccessibleName("Корзина · 1");
  await sideBasket.click();
  await dialogCount(page, 1);
  await expect(page.locator(".basket-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(sideBasket).toBeFocused();
  await page.locator(".topbar .top-ai").click();
  await expect(page.locator(".assistant-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".assistant-panel")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#catalogue?page=1&lang=uz");
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await expect(page.locator(".basket-button")).toHaveCount(1);
  const topBasket = page.locator(".topbar .basket-button");
  await expect(topBasket).toBeVisible();
  await expect(
    page.locator(".sidebar .basket-button, .drawer .basket-button"),
  ).toHaveCount(0);
  // Focus returned to the AI button above would keep the header on screen.
  await page.locator("#content").focus();
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 1600);
  await page.waitForFunction(() => scrollY > 1000);
  await headerShown(page, false);
  // Bring the card into view first: a scroll made by the click itself would
  // be a downward scroll after the visitor's input and hide the bar again.
  const added = page.locator('.product-grid [data-product-id="4019"] .add');
  await added.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.mouse.wheel(0, -200);
  await headerShown(page, true);
  await expect(page.locator(".topbar")).toHaveCSS("position", "sticky");
  const before = await page.evaluate(() => scrollY);
  await added.click();
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await headerShown(page, true);
  await expect(topBasket.locator(".basket-badge")).toHaveText("2");
  await expect(topBasket).toBeInViewport();
  // The returned sticky bar stays above cards and their sale badges.
  const hit = await topBasket.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return n.contains(
      document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
    );
  });
  expect(hit).toBe(true);
  await topBasket.click();
  await dialogCount(page, 1);
  await page.keyboard.press("Escape");
  await expect(topBasket).toBeFocused();
  await noOverflow(page);
});

/** Two animation frames: the header scroll handler runs in one. */
async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}
/** The phone top bar is on screen at y = 0, or slid fully above it (M5). */
async function headerShown(page: Page, shown: boolean) {
  const bar = page.locator(".topbar");
  if (shown) await expect(bar).not.toHaveAttribute("data-hidden");
  else await expect(bar).toHaveAttribute("data-hidden", "true");
  await expect(bar).toHaveCSS(
    "transform",
    shown ? "none" : "matrix(1, 0, 0, 1, 0, -69)",
  );
  await expect
    .poll(async () => (await bar.boundingBox())?.y)
    .toBe(shown ? 0 : -69);
}
/** Scroll by script (also works under a modal scroll lock) and let a frame pass. */
async function scrollPage(page: Page, by: number) {
  await page.evaluate((y) => window.scrollBy(0, y), by);
  await frames(page);
}
/** One phone header icon: a 44px plate-less brand-green button with its name. */
async function headerIcon(icon: Locator, name: string) {
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAccessibleName(name);
  const box = await icon.boundingBox();
  expect([box?.width, box?.height]).toEqual([44, 44]);
  await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(icon).toHaveCSS("box-shadow", "none");
  await expect(icon).toHaveCSS("border-top-width", "0px");
  await expect(icon).toHaveCSS("color", "rgb(12, 61, 43)");
  await expect(icon.locator("svg")).toHaveCount(1);
}

test("phone header is one row of icons with in-place search; Account and RU/UZ move to the menu; desktop header unchanged", async ({
  page,
}) => {
  await fixture(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#home?lang=ru");
    await expect(page.locator(".hero-stage")).toBeVisible();
    const bar = page.locator(".topbar");
    expect((await bar.boundingBox())?.height).toBe(69);
    const items = bar.locator(":scope > *, .top-utilities > *");
    expect(
      await items.evaluateAll((nodes) =>
        nodes.map((n) => n.className || n.tagName),
      ),
    ).toEqual([
      "menu-toggle",
      "top-utilities",
      "top-icon top-search",
      "top-icon top-ai",
      "basket-button top-icon",
    ]);
    await expect(page.locator(".menu-toggle")).toHaveText("Меню ☰");
    await headerIcon(page.locator(".top-search"), "Поиск товаров");
    await headerIcon(page.locator(".top-ai"), "AI консультант");
    await headerIcon(page.locator(".topbar .basket-button"), "Корзина");
    // All four controls share one row.
    const centres = await bar
      .locator(".menu-toggle, .top-icon")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return r.y + r.height / 2;
        }),
      );
    expect(new Set(centres).size).toBe(1);
    await expect(page.locator(".top-search")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // The form exists only while expanded, when this icon is not rendered,
    // so the collapsed icon names no missing element (OPT-02).
    await expect(page.locator(".top-search")).not.toHaveAttribute(
      "aria-controls",
    );
    await ariaControlsResolve(page);
    await expect(bar.locator(".search, .languages, a")).toHaveCount(0);
    await expect(bar).not.toContainText("AI · помощь");
    await page.locator(".top-search").hover();
    await expect(page.locator(".top-search")).toHaveCSS(
      "background-color",
      "rgb(227, 227, 227)",
    );
    await noOverflow(page);
  }

  // M2: the search icon expands into the field in place of the whole row.
  await page.locator(".top-search").click();
  const form = page.locator(".topbar #top-search");
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute("role", "search");
  await expect(
    form.getByRole("textbox", { name: "Поиск товаров" }),
  ).toBeFocused();
  // Mouse opening: no outline or border change on the focused field (SF1).
  await searchFocus(page);
  await expect(
    page.locator(".topbar .menu-toggle, .topbar .top-utilities"),
  ).toHaveCount(0);
  const close = page.getByRole("button", {
    name: "Закрыть поиск",
    exact: true,
  });
  await expect(close).toBeVisible();
  expect((await page.locator(".topbar").boundingBox())?.height).toBe(69);
  await noOverflow(page);
  await page.keyboard.type("Match 4");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#catalogue\?q=Match\+4&page=1&lang=ru$/);
  await expect(page.locator(".product-grid article")).toHaveCount(6);
  await expect(form).toHaveCount(0);
  await expect(page.locator(".top-search")).toBeFocused();
  // On a results page the field opens with the current query.
  await page.locator(".top-search").click();
  await expect(form.locator("input")).toHaveValue("Match 4");
  await close.click();
  await expect(form).toHaveCount(0);
  await expect(page.locator(".top-search")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(form.locator("input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(page.locator(".top-search")).toBeFocused();
  // The expanded field does not stay open across views.
  await page.locator(".top-search").click();
  await page.evaluate(() => (location.hash = "#home?lang=ru"));
  await expect(page.locator(".hero-stage")).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(page.locator(".top-search")).toBeVisible();

  // M3, M4: Account and the language live in the phone menu.
  await page.locator(".menu-toggle").click();
  const drawer = page.locator(".drawer");
  await expect(drawer).toBeVisible();
  const account = drawer.getByRole("link", { name: "Аккаунт", exact: true });
  await expect(account).toHaveAttribute("href", "/#account?lang=ru");
  await expect(account.locator("svg")).toHaveCount(1);
  const language = drawer.getByRole("group", { name: "Язык", exact: true });
  await expect(language.getByRole("link")).toHaveText(["RU", "UZ"]);
  await expect(language.locator('[lang="ru"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator(".languages")).toHaveCount(1);
  const menuItems = await drawer.evaluate((d) =>
    Array.from(d.querySelectorAll(".nav-primary > *, .drawer-language")).map(
      (n) => n.className,
    ),
  );
  expect(menuItems.indexOf("drawer-language")).toBe(menuItems.length - 1);
  expect(menuItems[menuItems.length - 2]).toBe("nav-account");
  await expect(drawer.locator(".drawer-language")).toHaveCSS(
    "border-top",
    "1px solid rgb(214, 214, 214)",
  );
  await language.locator('[lang="uz"]').click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/#home\?lang=uz$/);
  await expect(page.locator(".menu-toggle")).toBeFocused();
  await headerIcon(page.locator(".top-search"), "Mahsulot qidirish");
  await headerIcon(page.locator(".top-ai"), "AI maslahatchi");
  await headerIcon(page.locator(".topbar .basket-button"), "Savat");
  await page.locator(".top-search").click();
  await expect(
    page.getByRole("button", { name: "Qidiruvni yopish", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".menu-toggle").click();
  await expect(
    drawer.getByRole("group", { name: "Til", exact: true }),
  ).toBeVisible();
  await expect(drawer.locator('.languages [lang="uz"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(
    drawer.getByRole("link", { name: "Akkaunt", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // 125% text keeps the bar usable without horizontal overflow.
  await page.evaluate(() => (document.documentElement.style.fontSize = "125%"));
  await noOverflow(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));

  // Desktop keeps its search field, text AI button, Account and RU/UZ (D3).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#home?lang=ru");
  const top = page.locator(".topbar");
  await expect(
    top.getByRole("textbox", { name: "Поиск товаров" }),
  ).toBeVisible();
  await expect(top.locator(".top-ai")).toHaveText("AI · помощь");
  await expect(top.getByRole("link", { name: "Аккаунт" })).toBeVisible();
  await expect(top.locator(".languages a")).toHaveText(["RU", "UZ"]);
  await expect(page.locator(".languages")).toHaveCount(1);
  await expect(
    page.locator(".top-search, .top-icon, .menu-toggle"),
  ).toHaveCount(1);
  await expect(page.locator(".menu-toggle")).toBeHidden();
  expect((await top.boundingBox())?.height).toBe(79);
});

test("phone header hides on downward scroll and returns on upward scroll; never hidden with a surface, the search or focus inside", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#catalogue?page=1&lang=ru");
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  const bar = page.locator(".topbar");
  await expect(bar).toHaveCSS("transition-duration", "0.2s");
  await page.mouse.move(195, 500);
  // Travel within the header height at the top of the page keeps it.
  await page.mouse.wheel(0, 40);
  await page.waitForFunction(() => scrollY >= 40);
  await frames(page);
  await headerShown(page, true);
  await page.mouse.wheel(0, 600);
  await headerShown(page, false);
  await expect(page.locator(".menu-toggle")).not.toBeInViewport();
  // A move below the threshold (bounce, address bar) changes nothing.
  await scrollPage(page, -6);
  await headerShown(page, false);
  await page.mouse.wheel(0, -120);
  await headerShown(page, true);
  await scrollPage(page, 600);
  await headerShown(page, false);
  // Reaching the top shows it.
  await scrollPage(page, -10000);
  await headerShown(page, true);

  // Focus in the header shows it and keeps it while scrolling.
  await scrollPage(page, 800);
  await headerShown(page, false);
  await page.locator(".top-search").focus();
  await headerShown(page, true);
  await scrollPage(page, 600);
  await expect(bar).toHaveCSS("transform", "none");
  expect((await bar.boundingBox())?.y).toBe(0);
  // Focus leaving the header after that scroll does not slide it away by
  // itself (OPT-01); the next downward scroll does.
  await page.locator("#content").focus();
  await headerShown(page, true);
  await page.waitForTimeout(400);
  expect((await bar.boundingBox())?.y).toBe(0);
  await page.mouse.wheel(0, 300);
  await headerShown(page, false);

  // Each surface and the expanded search keep the header on screen.
  for (const open of [
    ".menu-toggle",
    ".top-search",
    ".top-ai",
    ".topbar .basket-button",
  ]) {
    await scrollPage(page, -10000);
    await headerShown(page, true);
    await page.locator(open).click();
    await scrollPage(page, 900);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(800);
    await headerShown(page, true);
    await page.keyboard.press("Escape");
    await expect(page.locator(open)).toBeFocused();
    await headerShown(page, true);
  }
  // A surface opened from the page while the header is hidden shows it.
  await page.locator("#content").focus();
  await scrollPage(page, -10000);
  await page.mouse.wheel(0, 400);
  await headerShown(page, false);
  await page.locator('[data-product-id="4001"] .add').click();
  await expect(page.locator(".size-picker")).toBeVisible();
  await headerShown(page, true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".size-picker")).toBeHidden();
  await headerShown(page, true);
  // A view change shows it.
  await page.mouse.wheel(0, 400);
  await headerShown(page, false);
  await page.evaluate(() => (location.hash = "#catalogue?page=2&lang=ru"));
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await headerShown(page, true);
  // Content loading into the new view and scripted scrolling are not the
  // visitor's travel; the next own scroll input counts again.
  await scrollPage(page, 800);
  await headerShown(page, true);
  await page.mouse.wheel(0, 300);
  await headerShown(page, false);

  // Reduced motion: no slide animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(bar).toHaveCSS("transition-duration", "0s");
  await scrollPage(page, -10000);
  await page.mouse.wheel(0, 600);
  await headerShown(page, false);
  await page.emulateMedia({ reducedMotion: null });

  // Desktop: the top bar stays in the page flow and never hides.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(bar).not.toHaveAttribute("data-hidden");
  await expect(bar).toHaveCSS("position", "static");
  await scrollPage(page, -10000);
  await page.mouse.wheel(0, 800);
  await page.waitForFunction(() => scrollY > 500);
  await frames(page);
  await expect(bar).not.toHaveAttribute("data-hidden");
  await expect(bar).toHaveCSS("transform", "none");
});

test("product page follows the Mini App: description, composition, disclaimer note, embedded video and recommended slider", async ({
  page,
}) => {
  const source = products.map((p, i) =>
    i === 0
      ? {
          ...p,
          description:
            "**Ключевые компоненты** в одной формуле\nВторая строка <b>как текст</b>",
          additional_info_title: "Состав:",
          additional_info: "1 капсула содержит:\n\n**Витамин C** - 250 мг",
          disclaimer: "БАД. Не является лекарственным средством.",
          video_url: "https://youtu.be/avRmBAElLYQ",
        }
      : p,
  );
  const f = await fixture(page, source);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.method() + " " + r.url()));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#product?id=4001&lang=ru");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic Match 01",
  );
  const description = page.locator(".product-summary .product-description");
  await expect(description.locator("h2")).toHaveText("Описание");
  await expect(description.locator("strong")).toHaveText("Ключевые компоненты");
  await expect(description.locator("p")).toHaveText(
    "Ключевые компоненты в одной формуле\nВторая строка <b>как текст</b>",
  );
  await expect(description.locator("b")).toHaveCount(0);
  const order = await page
    .locator("main > section, main > .product-main")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.querySelector("h2")?.textContent || n.className),
    );
  expect(order).toEqual([
    "Описание",
    "Преимущества",
    "Состав:",
    "product-text product-note-section",
    "product-text product-video",
    "Рекомендуемые продукты",
  ]);
  const composition = page.locator(".product-text", {
    has: page.getByRole("heading", { name: "Состав:" }),
  });
  await expect(composition.locator("p")).toHaveText(
    "1 капсула содержит:\n\nВитамин C - 250 мг",
  );
  expect(
    await composition
      .locator("p")
      .evaluate((n) => (n as HTMLElement).innerText),
  ).toContain("содержит:\n\nВитамин C");
  const note = page.getByRole("note", { name: "Примечание" });
  await expect(note).toHaveText("БАД. Не является лекарственным средством.");
  await expect(note).toHaveCSS("background-color", "rgb(246, 239, 223)");
  await expect(page.getByRole("link", { name: /Смотреть видео/ })).toHaveCount(
    0,
  );
  const video = page.locator(".product-video");
  await expect(video.locator("iframe")).toHaveCount(0);
  expect(requests.some((r) => r.includes("youtube-nocookie"))).toBe(false);
  await video
    .getByRole("button", { name: "Смотреть видео: Synthetic Match 01" })
    .click();
  await expect(video.locator("iframe")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/avRmBAElLYQ?autoplay=1&rel=0",
  );
  await expect(video.locator("iframe")).toHaveAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin",
  );

  const recommended = page.locator(".product-recommended");
  await expect(recommended.locator("h2")).toHaveText("Рекомендуемые продукты");
  await expect(
    recommended
      .locator("article")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-product-id")),
      ),
  ).resolves.toEqual(["4002", "4003", "4004", "4005", "4006"]);
  expect(
    f.requests.some(
      (u) =>
        u.pathname.endsWith("/products") &&
        u.searchParams.get("category_id") === "301" &&
        u.searchParams.get("size") === "6",
    ),
  ).toBe(true);
  const next = recommended.getByRole("button", { name: "Следующие товары" });
  const previous = recommended.getByRole("button", {
    name: "Предыдущие товары",
  });
  await expect(recommended.locator(".view-all")).toHaveCount(0);
  for (const arrow of [previous, next]) {
    await expect(arrow).toHaveAttribute(
      "aria-controls",
      "product-recommended-row",
    );
    await chevronCentred(arrow);
  }
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(previous).toBeDisabled();
  const card = recommended.locator(ordinaryCard);
  await expect(card.locator(".price strong")).toContainText(/112\s?233,44 UZS/);
  await card.locator(".add").click();
  await expect(page.locator(".basket-badge")).toHaveText("1");
  // Same frame as the live basket stepper and the home rows, arrows only.
  await stepperFrame(
    recommended.locator(".slider-controls"),
    ["Предыдущие товары", "Следующие товары"],
    await basketStepper(page),
  );
  // On a phone the slider is far down the page; the opened product starts at the top.
  await page.setViewportSize({ width: 390, height: 844 });
  // Phones: no arrow frame; this row has no "Все" link either (M6).
  await expect(recommended.locator(".section-head > :not(h2)")).toHaveCount(0);
  await card.locator("h3 a").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1000);
  await card.locator("h3 a").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Synthetic Match 04",
  );
  await expect(page.locator(".product-recommended article")).toHaveCount(5);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".product-recommended article")).toHaveCount(5);
  await expect(
    page.locator('.product-recommended [data-product-id="4004"]'),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "UZ", exact: true }).click();
  await expect(page.locator(".product-recommended h2")).toHaveText(
    "Tavsiya etilgan mahsulotlar",
  );
  // No category: no slider.
  await page.goto("/#product?id=4045&lang=ru");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Synthetic Match 45",
  );
  await expect(page.locator(".product-recommended")).toHaveCount(0);
  // A failed category read hides the slider; the product stays.
  await page.route("**/api/v1/products?*", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/#product?id=4001&lang=ru");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic Match 01",
  );
  await expect(page.locator(".product-video")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator(".product-recommended")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
  }
});

/** Questions the mocked consultant answers with the API's error body (`router.error`). */
const apiErrors: Record<string, { status: number; code: string }> = {
  busy: { status: 503, code: "answer_unavailable" },
  invalid: { status: 400, code: "context_invalid" },
};
/**
 * Mocked consultant API for the chat panel: a question starting with "slow" waits for
 * release, "fail" answers 503 `unavailable`; the questions of `apiErrors` (also after a
 * "slow " prefix) answer their error.
 */
async function mockConsultant(page: Page, chatProducts = [products[4]]) {
  const turns: Record<string, unknown>[] = [];
  const waiting: (() => void)[] = [];
  await page.route("**/api/v1/consultant/cancel", (r) =>
    r.fulfill({ status: 204 }),
  );
  await page.route("**/api/v1/consultant/turns", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    turns.push(body);
    const question = String(body.question);
    if (question.startsWith("slow"))
      await new Promise<void>((resolve) => waiting.push(resolve));
    if (body.question === "fail") {
      await route
        .fulfill({ status: 503, json: { code: "unavailable" } })
        .catch(() => undefined);
      return;
    }
    const error = apiErrors[question.replace(/^slow /, "")];
    if (error) {
      await route
        .fulfill({
          status: error.status,
          json: {
            request_id: body.request_id,
            code: error.code,
            retryable: error.status === 503,
          },
        })
        .catch(() => undefined);
      return;
    }
    await route
      .fulfill({
        json: {
          request_id: body.request_id,
          context_revision: body.context_revision,
          language: body.language,
          status: "answer",
          answer: `ANSWER ${String(body.question)}`,
          sources: [],
          cautions: [],
          products: chatProducts,
          open_product_id: null,
          context_token: "synthetic-token",
          context_expires_at: new Date(Date.now() + 1800000).toISOString(),
          commercial_checked_at: new Date().toISOString(),
        },
      })
      .catch(() => undefined);
  });
  return { turns, release: () => waiting.shift()?.() };
}
async function openChat(page: Page, lang: "ru" | "uz", width = 1440) {
  await page.setViewportSize({ width, height: width >= 1000 ? 1000 : 844 });
  await page.goto(`/#home?lang=${lang}`);
  await page.locator(width >= 1000 ? ".sidebar .ai-nav" : ".top-ai").click();
  const panel = page.locator(".assistant-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test("chat question is capped at 1,000 characters with a counter near the cap (QL1)", async ({
  page,
}) => {
  await fixture(page);
  const { turns } = await mockConsultant(page);
  const panel = await openChat(page, "ru");
  const draft = panel.getByRole("textbox", { name: "Ваш вопрос", exact: true });
  const send = panel.getByRole("button", { name: "Отправить", exact: true });
  const counter = panel.locator(".ai-count");
  await expect(draft).toHaveAttribute("maxlength", "1000");
  await draft.fill("а".repeat(799));
  await expect(counter).toHaveCount(0);
  await draft.pressSequentially("б");
  await expect(counter).toHaveText("Символов: 800 / 1000");
  await expect(draft).toHaveAttribute("aria-describedby", "assistant-count");
  // Typing past the cap stops at 1,000; Send stays available (no silent block).
  await draft.fill("в".repeat(995));
  await draft.pressSequentially("гггггггггг");
  await expect(draft).toHaveValue("в".repeat(995) + "ггггг");
  await expect(counter).toHaveText("Символов: 1000 / 1000");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(panel.locator(".ai-answer")).toHaveCount(1);
  expect(Array.from(String(turns[0]?.question)).length).toBe(1000);
  await expect(counter).toHaveCount(0);
  await page.goto("/#home?lang=uz");
  await page.locator(".sidebar .ai-nav").click();
  await panel.getByRole("textbox").fill("x".repeat(900));
  await expect(counter).toHaveText("Belgilar: 900 / 1000");
});

test("chat sends one message at a time; answer, error and cancel enable Send again (OM1)", async ({
  page,
}) => {
  await fixture(page);
  const consultant = await mockConsultant(page);
  const panel = await openChat(page, "ru");
  const draft = panel.getByRole("textbox", { name: "Ваш вопрос", exact: true });
  const send = panel.getByRole("button", { name: "Отправить", exact: true });
  await draft.fill("slow");
  await send.click();
  await expect.poll(() => consultant.turns.length).toBe(1);
  await expect(panel.getByRole("status")).toHaveText("Готовлю ответ…");
  // While Luna answers: Send is disabled, Enter and examples do not send.
  await draft.fill("second");
  await expect(send).toBeDisabled();
  await draft.press("Enter");
  await draft.press("Control+Enter");
  await expect(draft).toHaveValue("second");
  await expect(panel.locator(".suggestions button").first()).toBeDisabled();
  await page.waitForTimeout(300);
  expect(consultant.turns).toHaveLength(1);
  consultant.release();
  await expect(panel.locator(".ai-answer")).toContainText("ANSWER slow");
  await expect(send).toBeEnabled();
  await draft.press("Enter");
  await expect(panel.locator(".ai-answer")).toHaveCount(2);
  expect(consultant.turns[1]?.question).toBe("second");
  expect(consultant.turns[1]?.history).toEqual([
    { question: "slow", answer: "ANSWER slow" },
  ]);
  // An error re-enables sending and keeps the question.
  await draft.fill("fail");
  await draft.press("Enter");
  await expect(panel.getByRole("status")).toContainText("Ответ недоступен");
  await expect(draft).toHaveValue("fail");
  await expect(send).toBeEnabled();
  // Cancel re-enables sending at once; the late answer is dropped.
  await draft.fill("slow");
  await draft.press("Enter");
  await expect(send).toBeDisabled();
  await panel.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(send).toBeEnabled();
  // spec r7 CH-08: the cancelled question is back in the textarea, no pending entry.
  await expect(draft).toHaveValue("slow");
  await expect(panel.locator(".ai-pending")).toHaveCount(0);
  consultant.release();
  await page.waitForTimeout(300);
  await expect(panel.locator(".ai-answer")).toHaveCount(2);
  // Closing the panel mid-answer does not leave Send disabled after reopening.
  await draft.press("Enter");
  await expect(send).toBeDisabled();
  await panel.locator(".close-control").click();
  await expect(panel).not.toBeVisible();
  consultant.release();
  await page.locator(".sidebar .ai-nav").click();
  await expect(send).toBeEnabled();
  await expect(panel.locator(".ai-answer")).toHaveCount(2);
});

test("chat Enter sends, Shift+Enter adds a line, IME composition does not send (EN1)", async ({
  page,
}) => {
  await fixture(page);
  const { turns } = await mockConsultant(page);
  for (const [lang, hint] of [
    ["ru", "Enter — отправить."],
    ["uz", "Enter — yuborish."],
  ] as const) {
    const panel = await openChat(page, lang);
    await expect(panel.locator(".ai-compose .muted")).toContainText(hint);
    const draft = panel.getByRole("textbox");
    await expect(draft).toHaveAttribute("enterkeyhint", "send");
    await draft.fill("line one");
    await draft.press("Shift+Enter");
    await draft.pressSequentially("line two");
    await expect(draft).toHaveValue("line one\nline two");
    expect(turns).toHaveLength(lang === "ru" ? 0 : 1);
    // A composing Enter (IME confirmation) is not a send.
    await draft.dispatchEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    await draft.dispatchEvent("keydown", {
      key: "Enter",
      keyCode: 229,
      bubbles: true,
      cancelable: true,
    });
    await page.waitForTimeout(200);
    expect(turns).toHaveLength(lang === "ru" ? 0 : 1);
    await draft.press("Enter");
    await expect(panel.locator(".ai-answer")).toHaveCount(1);
    expect(turns.at(-1)?.question).toBe("line one\nline two");
    await expect(draft).toHaveValue("");
  }
});

test("chat product card is wide enough for the name and price on one line, no overflow (CW1)", async ({
  page,
}) => {
  await fixture(page);
  const base = products[4],
    other = products[5];
  if (!base || !other) throw new Error("Missing chat card fixtures");
  await mockConsultant(page, [
    { ...base, name: "BIFOLAK® ACTIVE", price: "75500.00" },
    { ...other, name: "OPHTALMOCOMPLEX®", price: "112233.00" },
  ]);
  const lines = (node: Locator) =>
    node.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(
        Array.from(range.getClientRects()).map((r) => Math.round(r.top)),
      ).size;
    });
  for (const width of [1440, 390, 320]) {
    const panel = await openChat(page, "ru", width);
    await panel.getByRole("textbox").fill("card");
    await panel.getByRole("textbox").press("Enter");
    const cards = panel.locator(".assistant-cards .product-card");
    await expect(cards).toHaveCount(2);
    const body = await panel.locator(".ai-body").boundingBox();
    if (!body) throw new Error("Missing chat body");
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      if (!box) throw new Error("Missing chat card");
      // One card per row inside the panel's text column.
      expect(box.width).toBeGreaterThan(body.width - 48);
      expect(await lines(card.locator("h3 a"))).toBe(1);
      expect(await lines(card.locator(".price strong"))).toBe(1);
      expect(await card.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
        true,
      );
    }
    await noOverflow(page);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  }
});

test("chat data notice is collapsed with OpenAI and OpenRouter; an example tap sends it (AS1)", async ({
  page,
}) => {
  await fixture(page);
  const { turns } = await mockConsultant(page);
  for (const [lang, hint, data, first] of [
    [
      "ru",
      "Не пишите в вопросе личные данные. Enter — отправить.",
      "Обработка данных",
      "Как принимать IMMUNOCOMPLEX?",
    ],
    [
      "uz",
      "Savolda shaxsiy maʼlumotlarni yozmang. Enter — yuborish.",
      "Maʼlumotlarni qayta ishlash",
      "IMMUNOCOMPLEX KIDS qanday qabul qilinadi?",
    ],
  ] as const) {
    const panel = await openChat(page, lang);
    await expect(panel.locator(".ai-hint")).toHaveText(hint);
    const notice = panel.locator("details.ai-data");
    await expect(notice.locator("summary")).toHaveText(data);
    // The full notice is out of sight until the visitor opens it.
    expect(await notice.evaluate((e) => (e as HTMLDetailsElement).open)).toBe(
      false,
    );
    await expect(notice.locator("p").first()).toBeHidden();
    await expect(notice).toContainText("OpenAI");
    await expect(notice).toContainText("OpenRouter");
    await notice.locator("summary").click();
    await expect(notice.locator("p").first()).toBeVisible();
    await expect(notice.locator("p").first()).toContainText("OpenRouter");
    await expect(
      notice.getByRole("link", { name: "OpenRouter" }),
    ).toHaveAttribute("href", "https://openrouter.ai/privacy");
    const examples = panel.locator(".ai-examples .suggestions button");
    await expect(examples).toHaveCount(3);
    await examples.first().click();
    await expect(panel.locator(".ai-answer")).toContainText(`ANSWER ${first}`);
    expect(turns.at(-1)?.question).toBe(first);
    expect(turns.at(-1)?.language).toBe(lang);
    await expect(panel.getByRole("textbox")).toHaveValue("");
    // Examples step aside after the first message and return after reset.
    await expect(panel.locator(".ai-examples")).toHaveCount(0);
    await panel.locator(".ai-head .ai-reset").click();
    await expect(examples).toHaveCount(3);
    await noOverflow(page);
  }
});

test("chat keeps and sends every exchange of the tab: the 6th request carries the 5 shown pairs (WB-01, WB-02)", async ({
  page,
}) => {
  await fixture(page);
  const { turns } = await mockConsultant(page);
  const panel = await openChat(page, "ru");
  const draft = panel.getByRole("textbox", { name: "Ваш вопрос", exact: true });
  const answers = panel.locator(".ai-answer");
  const expected = [1, 2, 3, 4, 5].map((i) => ({
    question: `question ${i}`,
    answer: `ANSWER question ${i}`,
  }));
  for (const pair of expected) {
    await draft.fill(pair.question);
    await draft.press("Enter");
    await expect(answers.last()).toContainText(pair.answer);
  }
  // Every exchange of the tab stays on screen, oldest first.
  const shown = await answers.evaluateAll((sections) =>
    sections.map((s) => ({
      question: s.querySelector(".ai-question")?.textContent ?? "",
      answer: s.querySelector(".ai-plain")?.textContent ?? "",
    })),
  );
  expect.soft(shown).toEqual(expected);
  await draft.fill("question 6");
  await draft.press("Enter");
  await expect.poll(() => turns.length).toBe(6);
  expect.soft(turns[5]?.history).toEqual(expected);
  expect.soft(turns[5]?.history).toEqual(shown);
  expect(turns[5]?.context_token).toBe("synthetic-token");
  await expect(answers.last()).toContainText("ANSWER question 6");
});

test("chat data notice: all messages of the tab are sent, no in-tab storage sentence (WB-04 to WB-08)", async ({
  page,
}) => {
  await fixture(page);
  await mockConsultant(page);
  // `privacy` base values are the website 74e4eaf texts; only one phrase changes.
  for (const [lang, privacyBase, before, after, retention] of [
    [
      "ru",
      "Для ответа ваш вопрос и последние сообщения этой вкладки будут переданы OpenAI; для подбора товара текст вопроса также может передаваться OpenRouter. Не указывайте ФИО, контакты, документы или другие личные сведения. OpenAI и OpenRouter могут хранить данные по своим правилам. Ответ не заменяет консультацию врача. Отправляя вопрос, вы соглашаетесь с такой обработкой.",
      "ваш вопрос и последние сообщения этой вкладки",
      "ваш вопрос и все сообщения этой вкладки",
      "Передаются вопрос, предыдущие сообщения этой вкладки и публичные сведения о товарах. Данные аккаунта, корзины и заказа не передаются. Защитные идентификаторы хранятся до 24 часов, события без переписки и идентификаторов — до 7 дней. Проверка личных данных не гарантирует их полного обнаружения.",
    ],
    [
      "uz",
      "Javob olish uchun savolingiz va shu varaqdagi oxirgi xabarlar OpenAIʼga yuboriladi; mahsulot tanlash uchun savol matni OpenRouterʼga ham yuborilishi mumkin. Ism-familiya, aloqa maʼlumotlari, hujjatlar yoki boshqa shaxsiy maʼlumotlarni kiritmang. OpenAI va OpenRouter maʼlumotlarni oʻz qoidalari asosida saqlashi mumkin. Javob shifokor maslahatini almashtirmaydi. Savolni yuborish orqali bunday qayta ishlashga rozilik bildirasiz.",
      "shu varaqdagi oxirgi xabarlar",
      "shu varaqdagi barcha xabarlar",
      "Savol, shu varaqdagi oldingi xabarlar va ochiq mahsulot maʼlumotlari yuboriladi. Hisob, savat va buyurtma maʼlumotlari yuborilmaydi. Himoya identifikatorlari 24 soatgacha, matn va identifikatorsiz hodisalar 7 kungacha saqlanadi. Shaxsiy maʼlumotlarni tekshirish ularning barchasini aniqlashni kafolatlamaydi.",
    ],
  ] as const) {
    expect(privacyBase.split(before)).toHaveLength(2);
    const privacy = privacyBase.replace(before, after);
    const panel = await openChat(page, lang);
    const notice = panel.locator("details.ai-data");
    await notice.locator("summary").click();
    const [first, second] = [
      notice.locator("p").nth(0),
      notice.locator("p").nth(1),
    ];
    await expect(first).toBeVisible();
    expect.soft(await first.textContent()).toBe(privacy);
    expect.soft(await second.textContent()).toBe(retention);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  }
});

for (const [lang, busy] of [
  [
    "ru",
    "Консультант сейчас временно не может ответить. Ваш вопрос сохранён — отправьте его ещё раз чуть позже.",
  ],
  [
    "uz",
    "Maslahatchi hozircha javob bera olmayapti. Savolingiz saqlandi — birozdan keyin qayta yuboring.",
  ],
] as const)
  test(`chat ${lang}: answer_unavailable shows the busy notice and keeps the question, exchanges and token for a retry (WB-09)`, async ({
    page,
  }) => {
    await fixture(page);
    const { turns } = await mockConsultant(page);
    const panel = await openChat(page, lang);
    const draft = panel.getByRole("textbox");
    const send = panel.locator('.ai-compose button[type="submit"]');
    await draft.fill("first");
    await draft.press("Enter");
    await expect(panel.locator(".ai-answer")).toHaveCount(1);
    await draft.fill("busy");
    await draft.press("Enter");
    await expect.poll(() => turns.length).toBe(2);
    await expect(panel.getByRole("status")).toHaveText(busy);
    await expect(draft).toHaveValue("busy");
    await expect(panel.locator(".ai-answer")).toHaveCount(1);
    await expect(send).toBeEnabled();
    // The retry starts from the same state as the failed request.
    await send.click();
    await expect.poll(() => turns.length).toBe(3);
    const [, failed, retry] = turns;
    expect(failed?.history).toEqual([
      { question: "first", answer: "ANSWER first" },
    ]);
    expect(failed?.context_token).toBe("synthetic-token");
    expect(retry?.question).toBe("busy");
    expect(retry?.history).toEqual(failed?.history);
    expect(retry?.context_token).toBe(failed?.context_token);
    expect(retry?.tab_id).toBe(failed?.tab_id);
    await expect(panel.getByRole("status")).toHaveText(busy);
  });

test("chat context_invalid still resets: empty history, null token, new tab id, the question kept (WB-03)", async ({
  page,
}) => {
  await fixture(page);
  const { turns } = await mockConsultant(page);
  const panel = await openChat(page, "ru");
  const draft = panel.getByRole("textbox");
  await draft.fill("first");
  await draft.press("Enter");
  await expect(panel.locator(".ai-answer")).toHaveCount(1);
  await draft.fill("invalid");
  await draft.press("Enter");
  await expect(panel.getByRole("status")).toHaveText(
    "Контекст истёк или недействителен. Вопрос сохранён: отправьте его снова явно.",
  );
  await expect(draft).toHaveValue("invalid");
  await expect(panel.locator(".ai-answer")).toHaveCount(0);
  await draft.fill("after");
  await draft.press("Enter");
  await expect.poll(() => turns.length).toBe(3);
  const [, failed, next] = turns;
  expect(failed?.context_token).toBe("synthetic-token");
  expect(next?.history).toEqual([]);
  expect(next?.context_token).toBeNull();
  expect(next?.tab_id).not.toBe(failed?.tab_id);
});

// --- spec r7 W4: send, progress line and scroll (CH-01 to CH-11) ---------------------

/** P's client box, its scroll state, and the boxes the CH rules read. P is the
 * message feed: the panel's header and form stay in place (storefront task 3). */
async function chatGeometry(panel: Locator) {
  return panel.locator(".ai-body").evaluate((p) => {
    const top = p.getBoundingClientRect().top + p.clientTop;
    const box = (e: Element | null | undefined) => {
      const r = e?.getBoundingClientRect();
      return r ? { top: r.top - top, bottom: r.bottom - top } : null;
    };
    const answers = p.querySelectorAll(".ai-answer");
    return {
      scrollTop: p.scrollTop,
      clientHeight: p.clientHeight,
      line: box(p.querySelector('[role="status"]')),
      question: box(answers[answers.length - 1]?.querySelector("p")),
    };
  });
}
const longText = (lang: "ru" | "uz") =>
  (lang === "ru"
    ? "длинный вопрос о приёме и составе товара "
    : "mahsulotni qabul qilish va tarkibi haqida uzun savol "
  ).repeat(18);

test("chat send shows the question at once with an animated progress line; a short answer does not scroll (spec r7 B1, CH-01, CH-02, CH-04, CH-10)", async ({
  page,
}) => {
  await fixture(page);
  const consultant = await mockConsultant(page);
  const panel = await openChat(page, "ru", 1900);
  // The feed between the fixed header and form must hold the short exchange (CH-04).
  await page.setViewportSize({ width: 1900, height: 1300 });
  const draft = panel.getByRole("textbox", { name: "Ваш вопрос", exact: true });
  await draft.fill("first");
  await draft.press("Enter");
  await expect(panel.locator(".assistant-cards .product-card")).toHaveCount(1);
  await draft.fill("slow");
  await draft.press("Enter");
  await expect.poll(() => consultant.turns.length).toBe(2);
  const pending = panel.locator(".ai-pending");
  await expect(pending).toHaveText("slow");
  await expect(pending.locator(".ai-question")).toHaveText("slow");
  await expect(draft).toHaveValue("");
  await expect(draft).toBeFocused();
  // After the cards, directly above the live region; not a completed exchange.
  expect(
    await panel.evaluate((p) => {
      const cards = p.querySelector(".assistant-cards");
      const item = p.querySelector(".ai-pending");
      return (
        cards?.nextElementSibling === item &&
        item?.nextElementSibling === p.querySelector('[role="status"]')
      );
    }),
  ).toBe(true);
  await expect(panel.locator(".ai-answer")).toHaveCount(1);
  const status = panel.getByRole("status");
  expect(await status.evaluate((e) => e.textContent)).toBe("Готовлю ответ…");
  const dots = status.locator('.ai-progress-dots[aria-hidden="true"] > span');
  await expect(dots).toHaveCount(3);
  const band = status.locator('.ai-progress-band[aria-hidden="true"]');
  for (const moving of [...(await dots.all()), band])
    expect(
      await moving.evaluate((e) => getComputedStyle(e).animationName),
    ).not.toBe("none");
  // The ellipsis is read, not shown next to the dots.
  const ellipsis = await status
    .locator(".ai-progress-hidden")
    .evaluate((e) => [e.textContent, e.getBoundingClientRect().width]);
  expect(ellipsis[0]).toBe("…");
  expect(Number(ellipsis[1])).toBeLessThanOrEqual(1);
  // The polite region does not change while the request is in flight.
  const mutations = await status.evaluate(
    (e) =>
      new Promise<number>((resolve) => {
        let count = 0;
        const observer = new MutationObserver((list) => (count += list.length));
        observer.observe(e, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 1000);
      }),
  );
  expect(mutations).toBe(0);
  await draft.fill("next");
  const before = await chatGeometry(panel);
  consultant.release();
  await expect(panel.locator(".ai-answer")).toHaveCount(2);
  await expect(pending).toHaveCount(0);
  expect((await chatGeometry(panel)).scrollTop).toBe(before.scrollTop);
  await expect(draft).toHaveValue("next");
  // A send by a click keeps the focus on the Send button (CH-01).
  await draft.fill("slow click");
  const send = panel.getByRole("button", { name: "Отправить", exact: true });
  await send.click();
  await expect(pending).toHaveText("slow click");
  expect(await send.evaluate((e) => document.activeElement === e)).toBe(true);
  consultant.release();
  await expect(panel.locator(".ai-answer")).toHaveCount(3);
});

test("chat long answer is read from its question; a customer who scrolled away stays (spec r7 B2, B3, CH-01, CH-04 to CH-06)", async ({
  page,
}) => {
  await fixture(page);
  const consultant = await mockConsultant(page);
  for (const [lang, width, progress] of [
    ["ru", 1900, "Готовлю ответ…"],
    ["uz", 390, "Javob tayyorlanmoqda…"],
  ] as const) {
    const panel = await openChat(page, lang, width);
    const draft = panel.getByRole("textbox");
    for (const n of [1, 2]) {
      await draft.fill(`${n} ${longText(lang)}`);
      await draft.press("Enter");
      await expect(panel.locator(".ai-answer")).toHaveCount(n);
    }
    await draft.fill(`slow ${longText(lang)}`);
    await draft.press("Enter");
    await expect(panel.getByRole("status")).toHaveText(progress);
    // CH-01: the whole progress line is in view.
    const held = await chatGeometry(panel);
    expect(held.line?.top).toBeGreaterThanOrEqual(0);
    expect(held.line?.bottom).toBeLessThanOrEqual(held.clientHeight);
    consultant.release();
    await expect(panel.locator(".ai-answer")).toHaveCount(3);
    const after = await chatGeometry(panel);
    expect(after.question?.top).toBeGreaterThanOrEqual(0);
    expect(after.question?.top).toBeLessThanOrEqual(16);
    if (width === 1900) {
      // B3: scrolled to the top during the hold, the panel stays there.
      await draft.fill(`slow ${longText(lang)}`);
      await draft.press("Enter");
      await expect(panel.getByRole("status")).toHaveText(progress);
      await panel.locator(".ai-body").evaluate((p) => (p.scrollTop = 0));
      consultant.release();
      await expect(panel.locator(".ai-answer")).toHaveCount(4);
      expect((await chatGeometry(panel)).scrollTop).toBe(0);
    }
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  }
});

test("chat progress line stands still under reduced motion (spec r7 B4, CH-03)", async ({
  page,
}) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const consultant = await mockConsultant(page);
  const panel = await openChat(page, "ru", 1900);
  await panel.getByRole("textbox").fill("slow");
  await panel.getByRole("textbox").press("Enter");
  const status = panel.getByRole("status");
  await expect(status).toHaveText("Готовлю ответ…");
  const dots = status.locator(".ai-progress-dots > span");
  await expect(dots).toHaveCount(3);
  for (const still of [
    ...(await dots.all()),
    status.locator(".ai-progress-band"),
  ])
    expect(await still.evaluate((e) => getComputedStyle(e).animationName)).toBe(
      "none",
    );
  await expect(status.locator(".ai-progress-label")).toBeVisible();
  for (const dot of await dots.all()) await expect(dot).toBeVisible();
  consultant.release();
  await expect(panel.locator(".ai-answer")).toHaveCount(1);
});

test("chat failure with a new question typed keeps that question and drops the pending entry (spec r7 B5, CH-07)", async ({
  page,
}) => {
  await fixture(page);
  const consultant = await mockConsultant(page);
  const panel = await openChat(page, "ru");
  const draft = panel.getByRole("textbox");
  await draft.fill("slow busy");
  await draft.press("Enter");
  await expect(panel.locator(".ai-pending")).toHaveText("slow busy");
  await draft.fill("next");
  consultant.release();
  await expect(panel.getByRole("status")).toHaveText(
    "Консультант сейчас временно не может ответить. Ваш вопрос сохранён — отправьте его ещё раз чуть позже.",
  );
  await expect(draft).toHaveValue("next");
  await expect(panel.locator(".ai-pending")).toHaveCount(0);
  await expect(panel.locator(".ai-answer")).toHaveCount(0);
});

test("consultant says the context was reset only after «Начать заново» (task 4)", async ({
  page,
}) => {
  await fixture(page);
  await page.clock.install();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#home?lang=ru");
  // Half an hour on the page without a conversation is no reset to announce
  // (task 4 review r1, OPT-01).
  await page.clock.runFor(30 * 60 * 1000 + 2000);
  await page.locator(".sidebar .ai-nav").click();
  const panel = page.locator(".assistant-panel");
  await expect(panel.locator(".close-control")).toBeFocused();
  const status = panel.locator(".ai-body [role=status]");
  await expect(status).toHaveText("");
  await panel
    .getByRole("button", { name: "Начать заново", exact: true })
    .click();
  await expect(status).toHaveText(
    "Контекст сброшен. Можно задать новый вопрос.",
  );
});
