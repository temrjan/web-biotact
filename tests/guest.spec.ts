import { test, expect, type Page, type Request } from "@playwright/test";
import { fixture } from "./catalogue.fixture";
import { BASKET_STORAGE_KEY } from "../src/guestBasket";

/**
 * Website guest checkout (G1 spec S2 WS-01, WS-02, WS-03, WS-04, WS-05, WS-06, WS-07, WS-08,
 * WS-09, WS-10, WS-11, U-5, D-1, D-3, D-4, G1C-CARRY-O1) against the synthetic guest boundary
 * `tests/guest.boundary.mjs`. It proves the website side of CK-19 only; the paired run against
 * the real Shop API is separate.
 */
type Lang = "ru" | "uz";
interface ServerState {
  counters: Record<
    "quote" | "create" | "read" | "payment" | "invoices" | "messages",
    number
  >;
  orders: { number: string; state: string; key: string; contact: unknown }[];
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

async function control(page: Page, path: string) {
  const response = await page.request.get(`/__test/guest/${path}`);
  expect(response.ok(), path).toBe(true);
}
async function server(page: Page): Promise<ServerState> {
  return (await (
    await page.request.get("/__test/guest/state")
  ).json()) as ServerState;
}
/** Guest API requests with their bodies and headers, in order. */
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
async function start(
  page: Page,
  lang: Lang,
  items: { product_id: number; size: string | null; quantity: number }[],
) {
  await control(page, "reset");
  await fixture(page);
  await page.goto(`/#catalogue?lang=${lang}`);
  await expect(page.locator(".product-grid article")).toHaveCount(20);
  await page.evaluate(
    ({ key, items }) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, items })),
    { key: BASKET_STORAGE_KEY, items },
  );
  await page.reload();
  await expect(page.locator(".product-grid article")).toHaveCount(20);
}
/** Fill the delivery form and open review; `quoted` waits for the server quote. */
async function toReview(page: Page, lang: Lang, quoted = true) {
  const l = labels[lang];
  await page.locator(".basket-button").click();
  await page.locator(".guest-continue").click();
  await page.getByLabel(l.name, { exact: true }).fill(buyer.name);
  await page.getByLabel(l.phone).fill(buyer.phone);
  await page.getByLabel(l.address).fill(buyer.address);
  await page.getByRole("button", { name: l.review, exact: true }).click();
  if (quoted)
    await expect(page.locator(".guest-checkout .basket-total")).toBeVisible();
}
async function place(page: Page, lang: Lang) {
  const accept = page.locator("#guest-accept");
  if (!(await accept.isChecked())) await accept.check();
  await page
    .getByRole("button", { name: labels[lang].place, exact: true })
    .click();
}
/** The website's own formatting of a server amount, read in the page's locale. */
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

test("RU wide (WS-01, WS-02, WS-03, WS-04, WS-05, WS-07, WS-08, WS-09, WS-11): server quote, required terms, order view, one payment start, signed return and paid basket cleanup", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const consoleMessages: Promise<string>[] = [];
  page.on("console", (m) =>
    consoleMessages.push(
      Promise.all(
        m.args().map((a) => a.jsonValue().catch(() => undefined)),
      ).then((args) => `${m.text()} ${JSON.stringify(args)}`),
    ),
  );
  await start(page, "ru", [
    { product_id: 4004, size: null, quantity: 2 },
    { product_id: 4001, size: "L", quantity: 1 },
  ]);
  // The server price differs from the catalogue price (112233.44); the review must show the server's.
  await control(page, "product?id=4004&price=120000.00");
  const seen = track(page);
  const tokens: string[] = [];
  page.on("response", async (r) => {
    const path = new URL(r.url()).pathname;
    if (
      (path === "/api/v1/guest/orders" && r.status() === 201) ||
      (path === "/api/v1/guest/order" && r.status() === 200)
    )
      tokens.push(((await r.json()) as { csrf_token: string }).csrf_token);
  });
  await toReview(page, "ru");

  const rows = page.locator(".guest-checkout .basket-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(
    `${await shown(page, "120000.00", "ru")} × 2`,
  );
  await expect(rows.nth(0)).toContainText(await shown(page, "240000.00", "ru"));
  await expect(rows.nth(1)).toContainText("L");
  await expect(page.locator(".guest-checkout .basket-total")).toContainText(
    await shown(page, "338765.43", "ru"),
  );
  await expect(page.locator(".basket-panel")).not.toContainText(
    await shown(page, "323232.31", "ru"),
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

  // WS-03: links checked on the elements, not opened; unchecked box sends nothing.
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
  await page.screenshot({
    path: testInfo.outputPath("ru-1440-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Оформить заказ" }).click();
  await expect(page.locator("#guest-accept-error")).toHaveText(
    "Чтобы оформить заказ, примите условия.",
  );
  expect(creates(seen)).toEqual([]);

  // A double press with accepted terms sends one create request (WS-05).
  await page.locator("#guest-accept").check();
  await page.locator(".guest-place").evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page).toHaveURL(/\/#order\?lang=ru$/);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(creates(seen)).toHaveLength(1);
  const [created] = (await server(page)).orders;
  expect(created).toBeDefined();
  await expect(page.locator("#order-title")).toHaveText(
    `Заказ № ${created?.number}`,
  );
  await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");
  await expect(page.locator(".order-view")).toContainText(
    "Неоплаченный заказ отменяется автоматически примерно через 30 минут после оформления.",
  );
  const [body] = creates(seen);
  expect(Object.keys(body ?? {}).sort()).toEqual([
    "accept_terms",
    "address",
    "idempotency_key",
    "items",
    "name",
    "phone",
    "quote_fingerprint",
  ]);
  expect(body).toMatchObject({
    items: [
      { product_id: 4004, quantity: 2, size: null },
      { product_id: 4001, quantity: 1, size: "L" },
    ],
    name: buyer.name,
    phone: buyer.phone,
    address: buyer.address,
    accept_terms: true,
  });
  expect(body?.idempotency_key).toMatch(/^[0-9a-f]{32}$/);
  expect(body?.quote_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  await page.screenshot({ path: testInfo.outputPath("ru-1440-order.png") });

  // WS-08: a double press starts payment once; the token is the latest status response token, not initial.
  const pay = page.locator(".order-pay");
  await expect(pay).toHaveText(
    `Оплатить ${await shown(page, "338765.43", "ru")}`,
  );
  await expect(pay).toBeEnabled();
  expect(tokens.length).toBeGreaterThanOrEqual(2);
  expect(tokens.at(-1)).not.toBe(tokens[0]);
  await pay.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await page.waitForURL(/\/__test\/guest\/pay\?invoice=/);
  const payments = seen.filter((r) => r.path === "/api/v1/guest/order/payment");
  expect(payments).toHaveLength(1);
  expect(JSON.parse(payments[0]?.body ?? "")).toEqual({ lang: "ru" });
  expect(payments[0]?.csrf).toBe(tokens.at(-1));
  expect((await server(page)).counters).toMatchObject({
    payment: 1,
    invoices: 1,
    messages: 1,
  });
  const payPageUrl = page.url();

  // WS-09: a line added after the order is not part of it and must survive the paid cleanup.
  await page.goto("/#catalogue?lang=ru");
  await page.locator('[data-product-id="4006"] .add').click();
  expect(await badge(page)).toBe("4");
  await page.goto(payPageUrl);

  // WS-01, WS-07, WS-09: signed success callback, then the provider returns the buyer to /?view=order&lang=ru.
  await page.locator("#pay").click();
  await page.waitForURL(/\/#order\?lang=ru$/);
  await expect(page.locator(".order-state")).toHaveText(
    "Заказ оплачен. Мы свяжемся с вами для доставки.",
  );
  await expect(page.locator(".order-pay")).toHaveCount(0);
  await expect.poll(() => badge(page)).toBe("1");
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    url: location.href,
  }));
  expect(storage.local).toEqual({
    [BASKET_STORAGE_KEY]: JSON.stringify({
      version: 1,
      items: [{ product_id: 4006, size: null, quantity: 1 }],
    }),
  });
  expect(storage.session).toEqual({});
  const stored = JSON.stringify(storage);
  for (const secret of [
    created?.number ?? "-",
    created?.key ?? "-",
    ...tokens,
    "Guest-Private",
    buyer.phone,
  ])
    expect(stored).not.toContain(secret);
  const logged = (await Promise.all(consoleMessages)).join("\n");
  for (const secret of [
    created?.number ?? "-",
    created?.key ?? "-",
    ...tokens,
    "Guest-Private",
    buyer.phone,
  ])
    expect(logged).not.toContain(secret);
  // Reopening the paid order repeats the removal without touching other lines.
  await page.reload();
  await expect(page.locator(".order-state")).toHaveText(
    "Заказ оплачен. Мы свяжемся с вами для доставки.",
  );
  expect(await badge(page)).toBe("1");
  await page.screenshot({ path: testInfo.outputPath("ru-1440-paid.png") });

  // WS-04: when this device's order is already paid, opening review does not show the unpaid-order notice.
  const paidOrderRead = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/v1/guest/order" &&
      r.request().method() === "GET",
  );
  await toReview(page, "ru");
  await paidOrderRead;
  await expect(page.locator(".guest-unpaid")).toHaveCount(0);
});

test("UZ phone (WS-01, WS-02, WS-03, WS-05, WS-07, WS-08, WS-09): changed quote needs a new press and key; return without callback stays awaiting until Check status reads paid", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, "uz", [{ product_id: 4004, size: null, quantity: 1 }]);
  const seen = track(page);
  await toReview(page, "uz");
  await expect(page.locator(".guest-checkout")).toContainText(
    "Narxlar va summa doʻkon tomonidan tasdiqlangan. Yetkazib berish alohida toʻlanadi.",
  );
  await expect(page.locator(".guest-accept label")).toHaveText(
    "Sotish shartlari va Maxfiylik siyosatini qabul qilaman",
  );
  await expect(
    page.getByRole("link", { name: "Sotish shartlari" }),
  ).toHaveAttribute("href", "https://app.biotact.uz/legal/terms");
  await expect(
    page.getByRole("link", { name: "Maxfiylik siyosati" }),
  ).toHaveAttribute("href", "https://app.biotact.uz/legal/policy");
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("uz-390-review.png"),
    fullPage: true,
  });

  // The price changes between review and submit: new amounts, no order, a new press.
  await control(page, "product?id=4004&price=130000.00");
  await place(page, "uz");
  await expect(page.locator(".guest-checkout")).toContainText(
    "Narxlar yoki mavjudlik oʻzgardi. Buyurtmani qayta tekshiring.",
  );
  await expect(page.locator(".guest-checkout .basket-total")).toContainText(
    await shown(page, "130000.00", "uz"),
  );
  expect((await server(page)).orders).toHaveLength(0);
  expect(creates(seen)).toHaveLength(1);
  await page
    .getByRole("button", { name: "Buyurtma berish", exact: true })
    .click();
  await expect(page).toHaveURL(/\/#order\?lang=uz$/);
  const keys = creates(seen).map((b) => b.idempotency_key);
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
  const [order] = (await server(page)).orders;
  await expect(page.locator("#order-title")).toHaveText(
    `№ ${order?.number} buyurtma`,
  );
  await expect(page.locator(".order-state")).toHaveText("Toʻlov kutilmoqda");
  await expect(page.locator(".order-pay")).toHaveText(
    `${await shown(page, "130000.00", "uz")} toʻlash`,
  );
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("uz-390-order.png"),
    fullPage: true,
  });

  await page.locator(".order-pay").click();
  await page.waitForURL(/\/__test\/guest\/pay\?invoice=/);
  expect(JSON.parse(seen.at(-1)?.body ?? "")).toEqual({ lang: "uz" });
  // The buyer comes back without a settled payment: still awaiting, basket unchanged.
  await page.locator("#leave").click();
  await page.waitForURL(/\/#order\?lang=uz$/);
  await expect(page.locator(".order-state")).toHaveText("Toʻlov kutilmoqda");
  expect(await badge(page)).toBe("1");
  // A repeated start returns the stored invoice; no second invoice.
  await page.locator(".order-pay").click();
  await page.waitForURL(/\/__test\/guest\/pay\?invoice=/);
  expect((await server(page)).counters.invoices).toBe(1);
  await page.goBack();
  await page.waitForURL(/\/#order\?lang=uz$/);
  // The status read of the reloaded view must finish before the callback settles the order.
  await expect(page.locator(".order-state")).toHaveText("Toʻlov kutilmoqda");
  await expect(page.locator(".order-pay")).toBeEnabled();
  await control(page, `callback?invoice=${order?.number}`);
  await page
    .getByRole("button", { name: "Holatni tekshirish", exact: true })
    .click();
  await expect(page.locator(".order-state")).toHaveText(
    "Buyurtma toʻlandi. Yetkazib berish uchun siz bilan bogʻlanamiz.",
  );
  await expect.poll(() => badge(page)).toBe("0");

  // WS-01: the provider return address becomes the order view in its language.
  await page.goto("/?view=order&lang=uz");
  await page.waitForURL(/\/#order\?lang=uz$/);
  expect(new URL(page.url()).search).toBe("");
  await expect(page.locator(".order-state")).toHaveText(
    "Buyurtma toʻlandi. Yetkazib berish uchun siz bilan bogʻlanamiz.",
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
  }
  await page.screenshot({
    path: testInfo.outputPath("uz-320-paid.png"),
    fullPage: true,
  });
});

test("review refusals (WS-02, WS-05, D-4): unavailable items return to the basket marked; too large, rate-limited and disabled show their texts without orders", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page, "ru", [
    { product_id: 4004, size: null, quantity: 1 },
    { product_id: 4005, size: null, quantity: 1 },
  ]);
  const seen = track(page);
  await control(page, "product?id=4005&available=0");
  await toReview(page, "ru", false);
  await expect(page.locator(".guest-continue")).toBeVisible();
  await expect(page.locator(".basket-panel")).toContainText(
    "Некоторые товары больше недоступны. Проверьте корзину.",
  );
  const rows = page.locator(".basket-panel .basket-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("Товар недоступен для покупки.");
  await expect(rows.nth(0)).not.toContainText("Товар недоступен для покупки.");

  // The buyer removes the refused line and continues with the kept form values.
  await page.locator(".basket-panel .basket-remove").nth(1).click();
  await page.locator(".guest-continue").click();
  await expect(page.getByLabel("Имя", { exact: true })).toHaveValue(buyer.name);
  await page.getByRole("button", { name: "Проверить данные" }).click();
  await expect(page.locator(".guest-checkout .basket-row")).toHaveCount(1);

  for (const [fault, text] of [
    [
      "status=422&error=order_too_large",
      "Слишком большой заказ: не более 20 позиций и не более 10 штук товаров с размером.",
    ],
    [
      "status=429&error=try_later&retry=120",
      "Слишком много попыток. Повторите через 2 мин.",
    ],
    [
      "status=404&error=guest_checkout_disabled",
      "Оформление заказа на сайте временно недоступно.",
    ],
  ] as const) {
    await control(page, `fault?route=create&${fault}`);
    await place(page, "ru");
    await expect(page.locator(".guest-checkout [role=alert]")).toHaveText(text);
    await expect(page.locator(".guest-place")).toBeEnabled();
  }
  expect((await server(page)).orders).toHaveLength(0);
  expect(creates(seen)).toHaveLength(3);

  // A failed quote read offers a retry.
  await page.getByRole("button", { name: "Назад к данным" }).click();
  await control(page, "fault?route=quote&status=503&error=service_unavailable");
  await page.getByRole("button", { name: "Проверить данные" }).click();
  await expect(page.locator(".guest-checkout [role=alert]")).toContainText(
    "Не удалось выполнить запрос. Повторите попытку.",
  );
  await page
    .locator(".guest-checkout")
    .getByRole("button", { name: "Повторить" })
    .click();
  await expect(page.locator(".guest-checkout .basket-row")).toHaveCount(1);

  // WS-02, WS-05: an item becoming unavailable after quote and before create returns to the basket and marks the line.
  await control(page, "product?id=4004&available=0");
  await place(page, "ru");
  await expect(page.locator(".guest-continue")).toBeVisible();
  await expect(page.locator(".basket-panel")).toContainText(
    "Некоторые товары больше недоступны. Проверьте корзину.",
  );
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("Товар недоступен для покупки.");
  expect((await server(page)).orders).toHaveLength(0);
  expect(creates(seen)).toHaveLength(4);
});

test("uncertain creation (WS-04, WS-05, U-5, G1C-CARRY-O1) is resent once with the same key: lost request, lost response, cut-off response and a manual retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page, "ru", [{ product_id: 4004, size: null, quantity: 1 }]);
  const seen = track(page);
  const back = page.getByRole("button", {
    name: "Назад к данным",
    exact: true,
  });

  // 1. The request never reaches the server; the automatic resend creates the order.
  let lose = 1;
  await page.route("**/api/v1/guest/orders", async (route) => {
    if (lose-- > 0) await route.abort("connectionreset");
    else await route.fallback();
  });
  await toReview(page, "ru");
  await place(page, "ru");
  await expect(page.locator(".guest-checkout")).toContainText(
    "Проверяем результат…",
  );
  // U-5: Back is disabled during the checking phase as well as pending.
  await expect(back).toBeDisabled();
  await expect(page).toHaveURL(/\/#order\?lang=ru$/);
  let keys = creates(seen).map((b) => b.idempotency_key);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  let state = await server(page);
  expect(state.orders).toHaveLength(1);
  const first = state.orders[0]?.number ?? "";

  // WS-04, G1C-CARRY-O1: an unpaid order on this device is announced at review without blocking,
  // and clicking "Открыть заказ" while already on #order closes the basket dialog and reveals #order.
  await toReview(page, "ru");
  const notice = page.locator(".guest-unpaid");
  await expect(notice).toContainText(
    `На этом устройстве есть неоплаченный заказ № ${first}. Новый заказ заменит его здесь, а неоплаченный заказ отменится автоматически.`,
  );
  const openOrder = notice.getByRole("link", { name: "Открыть заказ" });
  await expect(openOrder).toHaveAttribute("href", "/#order?lang=ru");
  await expect(page.locator(".guest-place")).toBeEnabled();
  await openOrder.click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#order-title")).toHaveText(`Заказ № ${first}`);
  await toReview(page, "ru");

  // 2. The response is held and then lost (503 without its cookie) after the order exists:
  // the same-key resend is replayed, but this browser holds another order, so the buyer is
  // asked to place again; that press uses a new key.
  await page.request.get("/__test/hold?kind=guest-order");
  await place(page, "ru");
  await expect
    .poll(async () => (await page.request.get("/__test/held")).json())
    .toEqual({ held: true });
  await expect(page.locator(".guest-place")).toBeDisabled();
  // The buyer cannot leave the review while the order request is pending (Captain decision U-5).
  await expect(back).toBeDisabled();
  await page.request.get("/__test/drop");
  await expect(page.locator(".guest-checkout [role=alert]")).toHaveText(
    "Не удалось подтвердить заказ на этом устройстве. Оформите заказ ещё раз.",
  );
  await expect(back).toBeEnabled();
  keys = creates(seen).map((b) => b.idempotency_key);
  expect(keys).toHaveLength(4);
  expect(keys[3]).toBe(keys[2]);
  expect(keys[2]).not.toBe(keys[0]);
  expect((await server(page)).orders).toHaveLength(2);
  await page.locator(".guest-place").click();
  // The page is already at #order; only a created order closes the basket dialog.
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  keys = creates(seen).map((b) => b.idempotency_key);
  expect(keys).toHaveLength(5);
  expect(keys[4]).not.toBe(keys[2]);
  state = await server(page);
  expect(state.orders).toHaveLength(3);
  await expect(page.locator("#order-title")).toHaveText(
    `Заказ № ${state.orders[2]?.number}`,
  );

  // 3. The cookie arrives but the 201 body is cut off: the same-key resend is replayed and
  // this browser's order confirms the number.
  await toReview(page, "ru");
  await control(page, "fault?route=create&corrupt=1");
  await place(page, "ru");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  keys = creates(seen).map((b) => b.idempotency_key);
  expect(keys).toHaveLength(7);
  expect(keys[6]).toBe(keys[5]);
  state = await server(page);
  expect(state.orders).toHaveLength(4);
  await expect(page.locator("#order-title")).toHaveText(
    `Заказ № ${state.orders[3]?.number}`,
  );

  // 4. Both automatic attempts fail: only the buyer's retry resends, with the same key.
  lose = 2;
  await page.unroute("**/api/v1/guest/orders");
  await page.route("**/api/v1/guest/orders", async (route) => {
    if (lose-- > 0) await route.abort("connectionreset");
    else await route.fallback();
  });
  await toReview(page, "ru");
  await place(page, "ru");
  await expect(page.locator(".guest-checkout [role=alert]")).toContainText(
    "Не удалось выполнить запрос. Повторите попытку.",
  );
  await expect(page.locator(".guest-place")).toBeDisabled();
  expect(creates(seen)).toHaveLength(9);
  await page.request.get("/__test/hold?kind=guest-order");
  await page
    .locator(".guest-checkout [role=alert]")
    .getByRole("button", { name: "Повторить" })
    .click();
  await expect
    .poll(async () => (await page.request.get("/__test/held")).json())
    .toEqual({ held: true });
  // U-5: Back is also disabled while a manual retry ("checking" phase) is in flight.
  await expect(back).toBeDisabled();
  await page.request.get("/__test/release");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  keys = creates(seen).map((b) => b.idempotency_key);
  expect(keys).toHaveLength(10);
  expect(new Set(keys.slice(7))).toEqual(new Set([keys[7]]));
  expect((await server(page)).orders).toHaveLength(5);
});

test("payment start failures (WS-04, WS-07, WS-08, WS-09, WS-11, D-4) keep the order usable; 403 re-reads the token; only https addresses open; closed and missing orders show their texts", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page, "ru", [{ product_id: 4004, size: null, quantity: 1 }]);
  const seen = track(page);
  await toReview(page, "ru");
  // WS-07, D-4: 404 guest_checkout_disabled on status read clears the initial order and shows the disabled refusal text.
  await control(
    page,
    "fault?route=order&status=404&error=guest_checkout_disabled",
  );
  await place(page, "ru");
  await expect(page.locator("#order-title")).toHaveText("Заказ");
  await expect(page.locator(".order-state")).toHaveCount(0);
  await expect(page.locator(".order-view [role=alert]")).toContainText(
    "Оформление заказа на сайте временно недоступно.",
  );
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");

  // WS-11, U-4: leaving #order clears the in-memory creation response so returning on a failed read does not show stale data.
  await page.goto("/#catalogue?lang=ru");
  await control(page, "fault?route=order&status=503&error=service_unavailable");
  await page.goto("/#order?lang=ru");
  await expect(page.locator("#order-title")).toHaveText("Заказ");
  await expect(page.locator(".order-state")).toHaveCount(0);
  await expect(page.locator(".order-view [role=alert]")).toContainText(
    "Не удалось выполнить запрос. Повторите попытку.",
  );
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");
  const pay = page.locator(".order-pay");
  const notice = page.locator(".order-view .basket-notice");

  for (const [fault, text] of [
    [
      "status=502&error=payment_unavailable",
      "Не удалось начать оплату. Попробуйте ещё раз.",
    ],
    [
      "status=409&error=payment_check_pending",
      "Оплата проверяется. Мы свяжемся с вами.",
    ],
    [
      "status=429&error=try_later&retry=60",
      "Слишком много попыток. Повторите через 1 мин.",
    ],
    [
      "url=http://localhost:4173/__test/guest/pay",
      "Не удалось начать оплату. Попробуйте ещё раз.",
    ],
  ] as const) {
    await control(page, `fault?route=payment&${fault}`);
    await pay.click();
    await expect(notice).toHaveText(text);
    await expect(page).toHaveURL(/\/#order\?lang=ru$/);
    await expect(pay).toBeEnabled();
  }
  expect((await server(page)).counters.invoices).toBe(0);

  // 403: the website reads the status again for a fresh token and lets the buyer retry.
  const reads = () =>
    seen.filter((r) => r.path === "/api/v1/guest/order").length;
  const before = reads();
  await control(page, "fault?route=payment&status=403&error=request_forbidden");
  await pay.click();
  await expect.poll(reads).toBe(before + 1);
  await expect(notice).toHaveText(
    "Не удалось выполнить запрос. Повторите попытку.",
  );
  await expect(pay).toBeEnabled();
  // A network failure also re-reads the status.
  await page.route(
    "**/api/v1/guest/order/payment",
    (route) => route.abort("connectionreset"),
    { times: 1 },
  );
  await pay.click();
  await expect.poll(reads).toBe(before + 2);
  await expect(notice).toHaveText(
    "Не удалось начать оплату. Попробуйте ещё раз.",
  );
  await pay.click();
  await page.waitForURL(/\/__test\/guest\/pay\?invoice=/);
  await page.goto("/#order?lang=ru");
  // The status read of the loaded view must finish before the one-shot fault is set.
  await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");
  await expect(pay).toBeEnabled();

  // A failed status read offers a retry.
  await control(page, "fault?route=order&status=503&error=service_unavailable");
  await page.reload();
  await expect(page.locator(".order-view [role=alert]")).toContainText(
    "Не удалось выполнить запрос. Повторите попытку.",
  );
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");

  // WS-08: 404 order_not_found on payment start clears the order and shows the not-found text.
  await control(page, "fault?route=payment&status=404&error=order_not_found");
  await pay.click();
  await expect(page.locator("#order-title")).toHaveText("Заказ");
  await expect(page.locator(".order-view [role=alert]")).toHaveText(
    "Заказ не найден на этом устройстве. Если вы оплатили заказ, мы свяжемся с вами по указанному телефону.",
  );
  await expect(pay).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".order-state")).toHaveText("Ожидает оплаты");
  await expect(pay).toBeEnabled();

  // The server cancelled the order meanwhile: Pay re-renders the closed state.
  const [order] = (await server(page)).orders;
  await control(page, `cancel?invoice=${order?.number}`);
  await pay.click();
  await expect(page.locator(".order-state")).toHaveText(
    "Заказ отменён или не был оплачен вовремя. Оформите новый заказ.",
  );
  await expect(
    page.getByRole("link", { name: "Перейти в каталог" }),
  ).toHaveAttribute("href", "/#catalogue?page=1&lang=ru");
  await expect(pay).toHaveCount(0);
  expect(await badge(page)).toBe("1");

  // WS-04: when this device's order is cancelled, opening review does not show the unpaid-order notice.
  const cancelledOrderRead = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/v1/guest/order" &&
      r.request().method() === "GET",
  );
  await toReview(page, "ru");
  await cancelledOrderRead;
  await expect(page.locator(".guest-unpaid")).toHaveCount(0);
  await page.locator(".basket-panel .close-control").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  // Without the purchase cookie the order is not found on this device.
  await context.clearCookies();
  await page.reload();
  await expect(page.locator(".order-view [role=alert]")).toHaveText(
    "Заказ не найден на этом устройстве. Если вы оплатили заказ, мы свяжемся с вами по указанному телефону.",
  );
  await page.goto("/#order?lang=uz");
  await page.reload();
  await expect(page.locator(".order-view [role=alert]")).toHaveText(
    "Buyurtma bu qurilmada topilmadi. Agar buyurtmani toʻlagan boʻlsangiz, koʻrsatilgan telefon orqali siz bilan bogʻlanamiz.",
  );
});
