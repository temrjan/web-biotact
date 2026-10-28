import { test, expect, type Page } from "@playwright/test";
const BASE = "/api/v1/buyer/auth";
async function saved(page: Page) {
  return page.evaluate(() => {
    const v: unknown = JSON.parse(
      sessionStorage.getItem("biotact.tg1.request") || "null",
    );
    if (
      typeof v !== "object" ||
      v === null ||
      !("id" in v) ||
      typeof v.id !== "string"
    )
      throw new Error("Missing request");
    return v.id;
  });
}
async function approve(page: Page, actor: number) {
  await expect(
    page.getByRole("link", { name: "Открыть официальный бот" }),
  ).toBeVisible();
  const id = await saved(page);
  const response = await page.request.post(
    "/api/v1/bot/buyer/telegram/decision",
    {
      headers: { "X-Bot-Token": "synthetic-browser-bot-authority" },
      data: { request_id: id, telegram_id: actor, decision: "confirm" },
    },
  );
  expect(response.status()).toBe(200);
}
async function focus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
test("deliberate link/QR, reload, explicit approval, Club restore and logout preserve basket", async ({
  page,
  context,
}) => {
  await page.goto("/#account?lang=ru");
  await page.evaluate(() =>
    localStorage.setItem("basket-fixture", '{"sku":17,"quantity":2}'),
  );
  await page.getByRole("button", { name: "Войти через Telegram" }).click();
  await expect(
    page.getByRole("link", { name: "Открыть официальный бот" }),
  ).toHaveAttribute(
    "href",
    /^https:\/\/t.me\/synthetic_bot\?start=web_[0-9a-f]{32}$/,
  );
  // The QR image; the logo images of the page are not part of this check.
  await expect(page.getByRole("img", { name: /^QR-код/ })).toBeVisible();
  const id = await saved(page);
  await page.reload();
  await expect(
    page.getByText("Ожидаем подтверждения в Telegram"),
  ).toBeVisible();
  expect(await saved(page)).toBe(id);
  await approve(page, 99101);
  await focus(page);
  await expect(page.getByRole("heading", { name: "Вы вошли" })).toBeVisible();
  await expect(page.getByText("Вы пока не участник")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Вы вошли" })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "__Host-biotact_buyer",
  );
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Войти через Telegram" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("basket-fixture")),
  ).toBe('{"sku":17,"quantity":2}');
});
for (const recovery of [false, true])
  for (const after of [false, true])
    test(`same-context held ${recovery ? "recovery" : "initial"} cookie ${after ? "after" : "before"} B`, async ({
      page,
      context,
    }) => {
      await page.goto("/#account?lang=ru");
      await page.getByRole("button", { name: "Войти через Telegram" }).click();
      await approve(page, 99201);
      const idA = await saved(page);
      if (recovery) {
        const completed = await page.evaluate(async (id) => {
          const c = (await fetch("/api/v1/buyer/auth/context", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: location.origin,
            },
            body: "{}",
          }).then((r) => r.json())) as unknown;
          if (
            typeof c !== "object" ||
            c === null ||
            !("csrf_token" in c) ||
            typeof c.csrf_token !== "string"
          )
            throw new Error("Invalid context");
          return (
            await fetch("/api/v1/buyer/auth/telegram/complete", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": c.csrf_token,
              },
              body: JSON.stringify({ request_id: id }),
            })
          ).status;
        }, idA);
        expect(completed).toBe(200);
        const cookies = (await context.cookies()).filter(
          (c) => c.name !== "__Host-biotact_buyer",
        );
        await context.clearCookies();
        await context.addCookies(cookies);
      }
      await page.request.get("/__test/hold");
      await focus(page);
      await expect
        .poll(async () => (await page.request.get("/__test/held")).json())
        .toEqual({ held: true });
      const other = await context.newPage();
      await other.goto("/#account?lang=ru");
      await other.getByRole("button", { name: "Войти через Telegram" }).click();
      await expect(
        other.getByText("Вход уже завершён в этом браузере"),
      ).toBeVisible();
      const requests = await other.request.post(BASE + "/telegram/requests", {
        headers: {
          Origin: "https://localhost:4173",
          "X-CSRF-Token": (
            await (
              await other.request.post(BASE + "/context", {
                headers: { Origin: "https://localhost:4173" },
                data: {},
              })
            ).json()
          ).csrf_token,
        },
        data: { request_key: "b".repeat(32) },
      });
      expect(requests.status()).toBe(409);
      await other
        .getByRole("button", { name: "Выйти и начать заново" })
        .click();
      await expect(
        other.getByRole("button", { name: "Войти через Telegram" }),
      ).toBeVisible();
      await other.getByRole("button", { name: "Войти через Telegram" }).click();
      await approve(other, 99202);
      if (!after) {
        await page.request.get("/__test/release");
        await expect
          .poll(async () =>
            (await other.request.get(BASE + "/session")).status(),
          )
          .toBe(401);
      }
      await focus(other);
      await expect(
        other.getByRole("heading", { name: "Вы вошли" }),
      ).toBeVisible();
      const btoken = (await context.cookies()).find(
        (c) => c.name === "__Host-biotact_buyer",
      )?.value;
      expect(btoken).toBeTruthy();
      if (after) {
        await other.request.get("/__test/hold");
        await page.request.get("/__test/release");
        await expect
          .poll(async () =>
            (await other.request.get(BASE + "/session")).status(),
          )
          .toBe(401);
        expect((await other.request.get(BASE + "/club")).status()).toBe(401);
        await focus(other);
        await expect
          .poll(async () => (await other.request.get("/__test/held")).json(), {
            timeout: 15000,
          })
          .toEqual({ held: true });
        await expect(
          other.getByRole("heading", { name: "Вы вошли" }),
        ).toHaveCount(0);
        await other.request.get("/__test/release");
        await expect(
          other.getByRole("heading", { name: "Вы вошли" }),
        ).toBeVisible();
      }
      const current = await other.request.get(BASE + "/session");
      expect((await current.json()).user.telegram_id).toBe(99202);
    });

test("lost create and complete responses recover without a new approval or key", async ({
  page,
}) => {
  await page.goto("/#account?lang=ru");
  await expect(
    page.getByRole("button", { name: "Войти через Telegram" }),
  ).toBeVisible();
  await page.request.get("/__test/hold?kind=create");
  await page.getByRole("button", { name: "Войти через Telegram" }).click();
  await expect
    .poll(async () => (await page.request.get("/__test/held")).json())
    .toEqual({ held: true });
  const key = await page.evaluate(() =>
    sessionStorage.getItem("biotact.tg1.request"),
  );
  await page.request.get("/__test/drop");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Войти через Telegram" }).click();
  await expect(
    page.getByRole("link", { name: "Открыть официальный бот" }),
  ).toBeVisible();
  const id = await saved(page);
  expect(
    await page.evaluate(() => sessionStorage.getItem("biotact.tg1.request")),
  ).toContain(JSON.parse(key || "null").key);
  await approve(page, 99301);
  await page.request.get("/__test/hold");
  await focus(page);
  await expect
    .poll(async () => (await page.request.get("/__test/held")).json(), {
      timeout: 15000,
    })
    .toEqual({ held: true });
  await page.request.get("/__test/drop");
  await focus(page);
  await expect(page.getByRole("heading", { name: "Вы вошли" })).toBeVisible({
    timeout: 15000,
  });
  expect(await saved(page)).toBe(id);
});

test("offline reconnect and cancellation keep the unrelated basket bytes", async ({
  page,
  context,
}) => {
  await page.goto("/#account?lang=ru");
  await expect(
    page.getByRole("button", { name: "Войти через Telegram" }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("basket-fixture", "unchanged-by-auth"),
  );
  await context.setOffline(true);
  await focus(page);
  await expect(
    page.getByText("Нет соединения. Вход продолжится после подключения."),
  ).toBeVisible();
  await context.setOffline(false);
  await focus(page);
  await page.getByRole("button", { name: "Войти через Telegram" }).click();
  await expect(
    page.getByRole("link", { name: "Открыть официальный бот" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Войти через Telegram" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("basket-fixture")),
  ).toBe("unchanged-by-auth");
});

test("UI polling serializes requests, respects Retry-After and stops at a terminal state", async ({
  page,
}) => {
  // Only the rate/terminal response is controlled here; this asserts browser scheduling.
  await page.clock.install();
  let calls = 0;
  let apiCalls = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on("request", (request) => {
    if (request.url().includes(BASE)) apiCalls++;
  });
  await page.route("**/telegram/status", async (route) => {
    calls++;
    if (calls === 1) {
      await held;
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "30" },
        json: { error: "rate_limited" },
      });
    } else {
      const response = await route.fetch();
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null)
        throw new Error("Invalid attempt fixture");
      await route.fulfill({ response, json: { ...body, state: "expired" } });
    }
  });
  await page.goto("/#account?lang=ru");
  await page.getByRole("button", { name: "Войти через Telegram" }).click();
  await expect(
    page.getByText("Ожидаем подтверждения в Telegram"),
  ).toBeVisible();
  await page.clock.runFor(6100);
  await expect.poll(() => calls).toBe(1);
  await page.clock.runFor(12200);
  await focus(page);
  expect(calls).toBe(1);
  release?.();
  await expect(page.getByRole("alert")).toContainText("30 сек.");
  await page.clock.runFor(29000);
  expect(calls).toBe(1);
  await page.clock.runFor(10000);
  await expect(page.getByText("Время запроса истекло")).toBeVisible();
  expect(calls).toBe(2);
  const stopped = apiCalls;
  await page.clock.runFor(61000);
  expect(apiCalls).toBe(stopped);
  await focus(page);
  await expect.poll(() => apiCalls).toBeGreaterThan(stopped);
  expect(calls).toBe(2);
});

for (const fails of [false, true])
  test(`account switch clears old Club while the new response is held then ${fails ? "fails" : "loads"}`, async ({
    page,
  }) => {
    let actor = 1;
    let hold = false;
    let fail = false;
    let clubCalls = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/buyer/auth/**", async (route) => {
      if (route.request().url().endsWith("/session")) {
        await route.fulfill({
          json: {
            csrf_token: "a".repeat(64),
            expires_at: "2030-01-01T00:00:00Z",
            authenticated_at: "2026-10-22T00:00:00Z",
            user: { id: actor, telegram_id: actor + 9000 },
          },
        });
      } else if (route.request().url().endsWith("/club")) {
        const selected = actor;
        const failed = fail;
        clubCalls++;
        if (hold) await gate;
        await route.fulfill(
          failed
            ? { status: 503, json: { error: "authentication_unavailable" } }
            : {
                json: {
                  is_member: selected === 1,
                  tier: selected === 1 ? "biotact_friend" : "newbie",
                  balance: selected === 1 ? 111 : 222,
                  available: selected === 1 ? 111 : 222,
                  reserved_until: null,
                },
              },
        );
      } else throw new Error("Unexpected API request");
    });
    const old = page.getByText("Всего баллов:").filter({ hasText: "111" });
    const current = page.getByText("Всего баллов:").filter({ hasText: "222" });
    try {
      await page.goto("/#account?lang=ru");
      await expect(old).toBeVisible();
      await page.evaluate(() =>
        localStorage.setItem("basket-fixture", "account-switch-bytes"),
      );
      actor = 2;
      hold = true;
      fail = fails;
      await focus(page);
      await expect.poll(() => clubCalls).toBe(2);
      // B's /session has resolved; its Club response cannot arrive yet.
      await expect(old).toHaveCount(0);
      await expect(
        page.getByText("Вы участник Biotact Club", { exact: true }),
      ).toHaveCount(0);
      hold = false;
      release();
      if (fails) {
        await expect(page.getByRole("alert")).toContainText(
          "Статус Клуба временно недоступен",
        );
        await expect(old).toHaveCount(0);
        fail = false;
        await focus(page);
      }
      await expect(current).toBeVisible();
      await focus(page);
      await expect.poll(() => clubCalls).toBe(fails ? 4 : 3);
      await expect(current).toBeVisible();
      expect(
        await page.evaluate(() => localStorage.getItem("basket-fixture")),
      ).toBe("account-switch-bytes");
    } finally {
      release();
    }
  });

test("late Club response cannot repopulate a superseded account after logout", async ({
  page,
}) => {
  let actor = 1;
  let authenticated = true;
  let hold = false;
  let held = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/buyer/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session")) {
      await route.fulfill(
        authenticated
          ? {
              json: {
                csrf_token: "a".repeat(64),
                expires_at: "2030-01-01T00:00:00Z",
                authenticated_at: "2026-10-22T00:00:00Z",
                user: { id: actor, telegram_id: actor + 9000 },
              },
            }
          : { status: 401, json: { error: "invalid_authentication" } },
      );
    } else if (path.endsWith("/club")) {
      const selected = actor;
      if (hold) {
        held = true;
        await gate;
      }
      await route.fulfill({
        json: {
          is_member: true,
          tier: "biotact_friend",
          balance: selected === 1 ? 111 : 222,
          available: selected === 1 ? 111 : 222,
          reserved_until: null,
        },
      });
    } else if (path.endsWith("/logout")) {
      authenticated = false;
      await route.fulfill({ status: 204 });
    } else if (path.endsWith("/context")) {
      await route.fulfill({
        json: {
          csrf_token: "b".repeat(64),
          expires_at: "2030-01-01T00:00:00Z",
          telegram_enabled: true,
        },
      });
    } else throw new Error("Unexpected API request");
  });
  try {
    await page.goto("/#account?lang=ru");
    await expect(
      page.getByText("Всего баллов:").filter({ hasText: "111" }),
    ).toBeVisible();
    hold = true;
    await focus(page);
    await expect.poll(() => held).toBe(true);
    // Same-account restore keeps its own cached Club while awaiting refresh.
    await expect(
      page.getByText("Всего баллов:").filter({ hasText: "111" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Войти через Telegram" }),
    ).toBeVisible();
    actor = 2;
    authenticated = true;
    hold = false;
    await page.getByRole("button", { name: "Войти через Telegram" }).click();
    await expect(
      page.getByText("Всего баллов:").filter({ hasText: "222" }),
    ).toBeVisible();
    const late = page.waitForResponse((response) =>
      response.url().endsWith("/club"),
    );
    release();
    await late;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect
      .poll(() => page.getByText("Всего баллов:").allTextContents())
      .toEqual(["Всего баллов: 222"]);
  } finally {
    release();
  }
});
