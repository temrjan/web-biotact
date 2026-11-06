import { test, expect, type Page, type Request } from "@playwright/test";
import { BASKET_STORAGE_KEY } from "../src/guestBasket";

/**
 * Paired G1 guest checkout verification (spec S2 §11, CK-19) against the real FastAPI
 * application (`packages/api/tests/g1_browser_server.py`) and disposable PostgreSQL 16.
 * Covers WS-01…WS-11, OC-04, OC-06, PY-02, ST-02, NT-01, BD-04, U-5 and G1C-CARRY-O1.
 */
type Lang = "ru" | "uz";
interface Counts {
  orders: number;
  creates: number;
  deletes: number;
  new_order_messages: number;
  paid_messages: number;
}
const labels = {
  ru: {
    name: "Имя",
    phone: "Контактный телефон",
    address: "Адрес доставки",
    review: "Проверить данные",
    place: "Оформить заказ",
  },
  uz: {
    name: "Ism",
    phone: "Aloqa telefoni",
    address: "Yetkazib berish manzili",
    review: "Maʼlumotlarni tekshirish",
    place: "Buyurtma berish",
  },
};
const buyer = {
  name: "Guest-Private Покупатель",
  phone: "+998 (90) 123-45-67",
  address: "Guest-Private Ташкент, улица 1",
};

async function counts(page: Page): Promise<Counts> {
  const response = await page.request.get("/api/__g1/counts");
  expect(response.status()).toBe(200);
  return (await response.json()) as Counts;
}
async function setPrice(page: Page, productId: number, price: string) {
  const response = await page.request.post("/api/__g1/price", {
    data: { product_id: productId, price },
  });
  expect(response.status()).toBe(200);
}
function track(page: Page) {
  const seen: { path: string; method: string; body: string; csrf: string }[] =
    [];
  page.on("request", (r: Request) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/v1/guest/"))
      seen.push({
        path: url.pathname,
        method: r.method(),
        body: r.postData() || "",
        csrf: r.headers()["x-csrf-token"] || "",
      });
  });
  return seen;
}
const creates = (seen: ReturnType<typeof track>) =>
  seen
    .filter((r) => r.path === "/api/v1/guest/orders")
    .map((r) => JSON.parse(r.body) as Record<string, unknown>);
async function toReview(page: Page, lang: Lang) {
  const l = labels[lang];
  await page.locator(".basket-button").click();
  await page.locator(".guest-continue").click();
  await page.getByLabel(l.name, { exact: true }).fill(buyer.name);
  await page.getByLabel(l.phone).fill(buyer.phone);
  await page.getByLabel(l.address).fill(buyer.address);
  await page.getByRole("button", { name: l.review, exact: true }).click();
  await expect(page.locator(".guest-checkout .basket-total")).toBeVisible();
}
async function place(page: Page, lang: Lang) {
  const accept = page.locator("#guest-accept");
  if (!(await accept.isChecked())) await accept.check();
  await page
    .getByRole("button", { name: labels[lang].place, exact: true })
    .click();
}
async function shown(page: Page, value: string, lang: Lang) {
  return page.evaluate(
    ([value, lang]) =>
      `${new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 2 }).format(Number(value))} UZS`,
    [value, lang] as const,
  );
}
async function badge(page: Page) {
  const b = page.locator(".basket-badge");
  return (await b.count()) ? await b.textContent() : "0";
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("native guest checkout (CK-19: WS-01…WS-11, OC-04, OC-06, PY-02, ST-02, NT-01, BD-04, U-5, G1C-CARRY-O1)", async ({
  page,
}) => {
  expect(process.env.TG1_BROWSER_BOUNDARY).not.toBe("1");
  expect(process.env.G1_BROWSER_FIXTURE).toBe("1");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const consoleMessages: Promise<string>[] = [];
  page.on("console", (m) =>
    consoleMessages.push(
      Promise.all(
        m.args().map((a) => a.jsonValue().catch(() => undefined)),
      ).then((args) => `${m.text()} ${JSON.stringify(args)}`),
    ),
  );
  const seen = track(page);
  const tokens: string[] = [];
  page.on("response", async (r) => {
    const path = new URL(r.url()).pathname;
    if (
      (path === "/api/v1/guest/orders" && r.status() === 201) ||
      (path === "/api/v1/guest/order" && r.status() === 200)
    ) {
      const body = (await r.json().catch(() => null)) as {
        csrf_token?: string;
      } | null;
      if (body?.csrf_token) tokens.push(body.csrf_token);
    }
  });

  await setPrice(page, 4201, "60000.00");
  const before = await counts(page);
  try {
    // 1. RU catalogue & basket with unsized (4201) and sized (4203, L) products.
    await page.goto("/#catalogue?lang=ru");
    await expect(page.locator(".product-grid article")).toHaveCount(3);
    await page.evaluate(
      ({ key, items }) =>
        localStorage.setItem(key, JSON.stringify({ version: 1, items })),
      {
        key: BASKET_STORAGE_KEY,
        items: [
          { product_id: 4201, size: null, quantity: 2 },
          { product_id: 4203, size: "L", quantity: 1 },
        ],
      },
    );
    await page.reload();
    await expect(page.locator(".product-grid article")).toHaveCount(3);
    expect(await badge(page)).toBe("3");

    // 2. RU delivery details & review: authoritative server quote and WS-03 legal links.
    await toReview(page, "ru");
    const rows = page.locator(".guest-checkout .basket-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(
      `${await shown(page, "60000.00", "ru")} × 2`,
    );
    await expect(rows.nth(0)).toContainText(
      await shown(page, "120000.00", "ru"),
    );
    await expect(rows.nth(1)).toContainText("L");
    await expect(rows.nth(1)).toContainText(
      `${await shown(page, "30000.00", "ru")} × 1`,
    );
    await expect(page.locator(".guest-checkout .basket-total")).toContainText(
      await shown(page, "150000.00", "ru"),
    );
    await expect(page.locator(".basket-panel")).not.toContainText(
      "предварительно",
    );
    await expect(page.locator(".guest-checkout")).toContainText(
      "Цены и сумма подтверждены магазином. Доставка оплачивается отдельно.",
    );
    await expect(page.locator(".basket-panel #basket-note")).toHaveText(
      "Корзина сохраняется в этом браузере. Заказ можно оформить без аккаунта.",
    );

    const terms = page.getByRole("link", { name: "Условия продажи" }),
      policy = page.getByRole("link", { name: "Политику конфиденциальности" });
    await expect(terms).toHaveAttribute(
      "href",
      "https://app.biotact.uz/legal/terms",
    );
    await expect(policy).toHaveAttribute(
      "href",
      "https://app.biotact.uz/legal/policy",
    );
    for (const link of [terms, policy]) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    await expect(page.locator("#guest-accept")).not.toBeChecked();
    await page.getByRole("button", { name: "Оформить заказ" }).click();
    await expect(page.locator("#guest-accept-error")).toHaveText(
      "Чтобы оформить заказ, примите условия.",
    );
    expect(creates(seen)).toEqual([]);

    // 3. Price change between review and submit (OC-04, WS-02, WS-05): 409 quote_changed, no order created.
    await setPrice(page, 4201, "75000.00");
    await place(page, "ru");
    await expect(page.locator(".guest-checkout")).toContainText(
      "Цены или наличие изменились. Проверьте заказ ещё раз.",
    );
    await expect(rows.nth(0)).toContainText(
      `${await shown(page, "75000.00", "ru")} × 2`,
    );
    await expect(page.locator(".guest-checkout .basket-total")).toContainText(
      await shown(page, "180000.00", "ru"),
    );
    expect((await counts(page)).orders).toBe(before.orders);
    expect(creates(seen)).toHaveLength(1);

    // 4. Held create response, U-5 Back disabled, and automatic same-key resend (OC-06, WS-05, U-5).
    const back = page.getByRole("button", {
      name: "Назад к данным",
      exact: true,
    });
    let cutFirst = true;
    await page.route("**/api/v1/guest/orders", async (route) => {
      if (cutFirst) {
        cutFirst = false;
        const res = await route.fetch();
        await route.fulfill({ response: res, body: "{" });
      } else {
        await route.fallback();
      }
    });
    await page.request.get("/__test/hold?kind=guest-order");
    await page.locator(".guest-place").evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect
      .poll(async () => (await page.request.get("/__test/held")).json())
      .toEqual({ held: true });
    await expect(page.locator(".guest-place")).toBeDisabled();
    await expect(back).toBeDisabled();
    expect(creates(seen)).toHaveLength(2);
    expect((await counts(page)).orders).toBe(before.orders + 1);

    await page.request.get("/__test/release");
    await expect(page.locator(".guest-checkout")).toContainText(
      "Проверяем результат…",
    );
    await expect(back).toBeDisabled();
    await expect(page).toHaveURL(/\/#order\?lang=ru$/);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.unroute("**/api/v1/guest/orders");
    await setPrice(page, 4201, "60000.00");

    const submitted = creates(seen);
    expect(submitted).toHaveLength(3);
    const keys = submitted.map((b) => String(b.idempotency_key));
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).toBe(keys[1]);
    expect(Object.keys(submitted[2] ?? {}).sort()).toEqual([
      "accept_terms",
      "address",
      "idempotency_key",
      "items",
      "name",
      "phone",
      "quote_fingerprint",
    ]);
    expect(submitted[2]?.idempotency_key).toMatch(/^[0-9a-f]{32}$/);
    expect(submitted[2]?.quote_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((await counts(page)).orders).toBe(before.orders + 1);

    // 5. Order view in RU & existing unpaid order notice (WS-04, WS-07, G1C-CARRY-O1).
    await expect(page.locator("#order-title")).toHaveText(
      /^Заказ № ORD-[A-Z0-9-]+$/,
    );
    const titleText = (await page.locator("#order-title").textContent()) ?? "";
    const ordNumber = titleText.replace("Заказ № ", "").trim();
    expect(ordNumber).toMatch(/^ORD-[A-Z0-9-]+$/);
    await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");
    await expect(page.locator(".order-view")).toContainText(
      "Неоплаченный заказ отменяется автоматически примерно через 30 минут после оформления.",
    );
    const pay = page.locator(".order-pay");
    await expect(pay).toHaveText(
      `Оплатить ${await shown(page, "180000.00", "ru")}`,
    );
    await expect(pay).toBeEnabled();
    expect(tokens.length).toBeGreaterThanOrEqual(1);

    await toReview(page, "ru");
    const notice = page.locator(".guest-unpaid");
    await expect(notice).toContainText(
      `На этом устройстве есть неоплаченный заказ № ${ordNumber}. Новый заказ заменит его здесь, а неоплаченный заказ отменится автоматически.`,
    );
    const openOrder = notice.getByRole("link", { name: "Открыть заказ" });
    await expect(openOrder).toHaveAttribute("href", "/#order?lang=ru");
    await expect(page.locator(".guest-place")).toBeEnabled();
    await openOrder.click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator("#order-title")).toHaveText(
      `Заказ № ${ordNumber}`,
    );

    // 6. UZ flow: add sale item 4202 after order creation (WS-09), verify UZ quote, WS-03 links, unpaid notice & order view.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#catalogue?lang=uz");
    await expect(page.locator(".product-grid article")).toHaveCount(3);
    await page.locator('[data-product-id="4202"] .add').click();
    expect(await badge(page)).toBe("4");

    await toReview(page, "uz");
    const uzRows = page.locator(".guest-checkout .basket-row");
    await expect(uzRows).toHaveCount(3);
    await expect(uzRows.nth(2)).toContainText(
      `${await shown(page, "80000.00", "uz")} × 1`,
    );
    await expect(page.locator(".guest-checkout .basket-total")).toContainText(
      await shown(page, "230000.00", "uz"),
    );
    await expect(page.locator(".guest-checkout")).toContainText(
      "Narxlar va summa doʻkon tomonidan tasdiqlangan. Yetkazib berish alohida toʻlanadi.",
    );
    const uzTerms = page.getByRole("link", { name: "Sotish shartlari" }),
      uzPolicy = page.getByRole("link", { name: "Maxfiylik siyosati" });
    await expect(uzTerms).toHaveAttribute(
      "href",
      "https://app.biotact.uz/legal/terms",
    );
    await expect(uzPolicy).toHaveAttribute(
      "href",
      "https://app.biotact.uz/legal/policy",
    );
    for (const link of [uzTerms, uzPolicy]) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    await page.getByRole("button", { name: "Buyurtma berish" }).click();
    await expect(page.locator("#guest-accept-error")).toHaveText(
      "Buyurtma berish uchun shartlarni qabul qiling.",
    );
    expect(creates(seen)).toHaveLength(3);

    const uzNotice = page.locator(".guest-unpaid");
    await expect(uzNotice).toContainText(
      `Bu qurilmada toʻlanmagan № ${ordNumber} buyurtma bor. Yangi buyurtma uni bu yerda almashtiradi, toʻlanmagan buyurtma esa avtomatik bekor qilinadi.`,
    );
    await uzNotice.getByRole("link", { name: "Buyurtmani ochish" }).click();
    await expect(page).toHaveURL(/\/#order\?lang=uz$/);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator("#order-title")).toHaveText(
      `№ ${ordNumber} buyurtma`,
    );
    await expect(page.locator(".order-state")).toHaveText("Toʻlov kutilmoqda");
    await expect(page.locator(".order-pay")).toHaveText(
      `${await shown(page, "180000.00", "uz")} toʻlash`,
    );
    await noOverflow(page);

    // 7. Double-click Pay (WS-08, PY-02, NT-01): one invoice and one "НОВЫЙ ЗАКАЗ" message.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/#order?lang=ru");
    await expect(pay).toBeEnabled();
    await pay.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await page.waitForURL(/\/api\/__g1\/pay\/g1-browser-/);
    const payPageUrl = page.url();
    const payments = seen.filter(
      (r) => r.path === "/api/v1/guest/order/payment",
    );
    expect(payments).toHaveLength(1);
    expect(JSON.parse(payments[0]?.body ?? "")).toEqual({ lang: "ru" });
    expect(payments[0]?.csrf).toBe(tokens.at(-1));
    expect(await counts(page)).toEqual({
      orders: before.orders + 1,
      creates: before.creates + 1,
      deletes: before.deletes,
      new_order_messages: before.new_order_messages + 1,
      paid_messages: before.paid_messages,
    });

    // 8. Return without callback (#g1-return) & repeated Pay reuses invoice (WS-01, WS-07, PY-02).
    await page.locator("#g1-return").click();
    await page.waitForURL(/\/#order\?lang=ru$/);
    expect(new URL(page.url()).search).toBe("");
    await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");
    await expect(pay).toBeEnabled();
    expect(await badge(page)).toBe("4");

    await pay.click();
    await page.waitForURL(/\/api\/__g1\/pay\/g1-browser-/);
    expect(page.url()).toBe(payPageUrl);
    expect(await counts(page)).toEqual({
      orders: before.orders + 1,
      creates: before.creates + 1,
      deletes: before.deletes,
      new_order_messages: before.new_order_messages + 1,
      paid_messages: before.paid_messages,
    });
    await page.locator("#g1-return").click();
    await page.waitForURL(/\/#order\?lang=ru$/);
    await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");
    await expect(pay).toBeEnabled();

    // Trigger signed callback and verify "Check status" transitions order to paid and cleans up basket (WS-07, WS-09).
    const callbackRes = await page.request.get(
      `${new URL(payPageUrl).pathname}/paid`,
      { maxRedirects: 0 },
    );
    expect(callbackRes.status()).toBe(303);
    await page
      .getByRole("button", { name: "Проверить статус", exact: true })
      .click();
    await expect(page.locator(".order-state")).toHaveText(
      "Заказ оплачен. Мы свяжемся с вами для доставки.",
    );
    await expect(pay).toHaveCount(0);
    await expect.poll(() => badge(page)).toBe("1");

    // 9. Follow #g1-pay on the substitute payment page -> signed callback, redirect to /?view=order&lang=ru,
    // URL normalization to /#order?lang=ru, paid state, selective basket cleanup, and exactly 1 paid message (ST-02, WS-01, WS-09).
    await page.goto(payPageUrl);
    await page.evaluate(
      ({ key, items }) =>
        localStorage.setItem(key, JSON.stringify({ version: 1, items })),
      {
        key: BASKET_STORAGE_KEY,
        items: [
          { product_id: 4201, size: null, quantity: 2 },
          { product_id: 4203, size: "L", quantity: 1 },
          { product_id: 4202, size: null, quantity: 1 },
        ],
      },
    );
    await page.locator("#g1-pay").click();
    await page.waitForURL(/\/#order\?lang=ru$/);
    expect(new URL(page.url()).search).toBe("");
    await expect(page.locator(".order-state")).toHaveText(
      "Заказ оплачен. Мы свяжемся с вами для доставки.",
    );
    await expect(pay).toHaveCount(0);
    await expect.poll(() => badge(page)).toBe("1");
    expect(await counts(page)).toEqual({
      orders: before.orders + 1,
      creates: before.creates + 1,
      deletes: before.deletes,
      new_order_messages: before.new_order_messages + 1,
      paid_messages: before.paid_messages + 1,
    });

    await page.goto("/?view=order&lang=uz");
    await page.waitForURL(/\/#order\?lang=uz$/);
    expect(new URL(page.url()).search).toBe("");
    await expect(page.locator(".order-state")).toHaveText(
      "Buyurtma toʻlandi. Yetkazib berish uchun siz bilan bogʻlanamiz.",
    );

    // WS-04 negative check: when the device's order is already paid, review shows no unpaid-order notice.
    await page.goto("/#catalogue?lang=ru");
    const paidOrderRead = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/v1/guest/order" &&
        r.request().method() === "GET",
    );
    await toReview(page, "ru");
    await paidOrderRead;
    await expect(page.locator(".guest-unpaid")).toHaveCount(0);

    // 10. Privacy (WS-11, BD-04): storage, URL and console logs contain no private guest or order data.
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      url: location.href,
    }));
    expect(storage.local).toEqual({
      [BASKET_STORAGE_KEY]: JSON.stringify({
        version: 1,
        items: [{ product_id: 4202, size: null, quantity: 1 }],
      }),
    });
    expect(storage.session).toEqual({});
    const secrets = [
      ordNumber,
      ...keys,
      ...tokens,
      "Guest-Private",
      buyer.phone,
    ];
    const stored = JSON.stringify(storage);
    for (const secret of secrets) expect(stored).not.toContain(secret);
    const logged = (await Promise.all(consoleMessages)).join("\n");
    for (const secret of secrets) expect(logged).not.toContain(secret);
  } finally {
    await setPrice(page, 4201, "60000.00");
  }
});
