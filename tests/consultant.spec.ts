import { test, expect } from "@playwright/test";
import { fixture, products } from "./catalogue.fixture";
import { BASKET_STORAGE_KEY } from "../src/guestBasket";

for (const language of ["ru", "uz"])
  test(`consultant ${language} sends one message at a time, drops late replies and resets context while ordinary browsing stays available`, async ({
    page,
  }) => {
    await fixture(page);
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/v1/consultant/cancel", (r) =>
      r.fulfill({ status: 204 }),
    );
    await page.route("**/api/v1/consultant/turns", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      requests.push(body);
      if (body.question === "slow")
        await new Promise((resolve) => setTimeout(resolve, 400));
      await route
        .fulfill({
          json: {
            request_id: body.request_id,
            context_revision: body.context_revision,
            language,
            status: "answer",
            answer: body.question === "slow" ? "STALE" : "CURRENT",
            sources: [],
            cautions: [],
            products: [products[3]],
            open_product_id: null,
            context_token: "synthetic-token",
            context_expires_at: new Date(Date.now() + 1800000).toISOString(),
            commercial_checked_at: new Date().toISOString(),
          },
        })
        .catch(() => undefined);
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/#home?lang=${language}`);
    await page.locator(".sidebar .ai-nav").click();
    const panel = page.locator(".assistant-panel");
    const draft = panel.getByRole("textbox");
    await draft.fill("slow");
    await draft.press("Control+Enter");
    await expect.poll(() => requests.length).toBe(1);
    // One message at a time (OM1): a second send waits; reset drops the late reply.
    await draft.fill("current");
    await draft.press("Enter");
    await page.waitForTimeout(100);
    expect(requests).toHaveLength(1);
    await panel
      .getByRole("button", {
        name: language === "ru" ? "Начать заново" : "Qayta boshlash",
        exact: true,
      })
      .click();
    await draft.fill("current");
    await draft.press("Enter");
    await expect(panel.locator(".ai-answer")).toContainText("CURRENT");
    await page.waitForTimeout(500);
    await expect(panel).not.toContainText("STALE");
    expect(requests[1]?.history).toEqual([]);
    expect(requests[1]?.context_token).toBeNull();
    expect(requests[1]?.request_id).not.toBe(requests[0]?.request_id);
    await draft.fill("followup");
    await draft.press("Control+Enter");
    await expect.poll(() => requests.length).toBe(3);
    expect(requests[2]?.history).toEqual([
      { question: "current", answer: "CURRENT" },
    ]);
    expect(requests[2]?.context_token).toBe("synthetic-token");
    await page.locator(".sidebar .brand").click();
    await panel.locator(".close-control").click();
    await page.locator(".sidebar .ai-nav").click();
    await expect(draft).toHaveValue("");
    await panel.locator(".assistant-cards h3 a").first().click();
    await expect(panel.locator(".ai-answer")).toHaveCount(0);
    await draft.fill("fresh");
    await draft.press("Control+Enter");
    await expect.poll(() => requests.length).toBe(4);
    expect(requests[3]?.context_token).toBeNull();
    expect(requests[3]?.history).toEqual([]);
    expect(requests[3]?.page_product_id).toBe(4004);
    // The remembered guest basket is the only stored value; no consultant data.
    expect(
      await page.evaluate(() => [
        Object.keys(localStorage),
        sessionStorage.length,
      ]),
    ).toEqual([[BASKET_STORAGE_KEY], 0]);
  });

test("consultant shows a 20,000-character answer instead of an error", async ({
  page,
}) => {
  await fixture(page);
  const answer = "Длинный ответ. ".repeat(1334).slice(0, 20000);
  await page.route("**/api/v1/consultant/turns", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        request_id: body.request_id,
        context_revision: body.context_revision,
        language: "ru",
        status: "answer",
        answer,
        sources: [],
        cautions: [],
        products: [],
        open_product_id: null,
        context_token: "synthetic-token",
        context_expires_at: new Date(Date.now() + 1800000).toISOString(),
        commercial_checked_at: null,
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#home?lang=ru");
  await page.locator(".sidebar .ai-nav").click();
  const panel = page.locator(".assistant-panel");
  await panel.getByRole("textbox").fill("long");
  await panel.getByRole("textbox").press("Enter");
  const shown = panel.locator(".ai-answer .ai-plain");
  await expect(shown).toHaveCount(1);
  expect(await shown.textContent()).toBe(answer);
  await expect(panel.getByRole("status")).not.toContainText("Ответ недоступен");
});
