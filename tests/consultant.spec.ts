import { test, expect } from "@playwright/test";
import { fixture, products } from "./catalogue.fixture";

for (const language of ["ru", "uz"])
  test(`consultant ${language} drops late replies and resets context while ordinary browsing stays available`, async ({
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
    await draft.fill("current");
    await draft.press("Control+Enter");
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
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);
  });
