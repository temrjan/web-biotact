import { test, expect } from "@playwright/test";

test("native Assistant to Shop/PG/provider boundary to cards and size basket, with refresh changes", async ({
  page,
  request,
}) => {
  expect(process.env.CONSULTANT_BROWSER_FIXTURE).toBe("1");
  const turns: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/consultant/turns"))
      turns.push(r.postDataJSON() as Record<string, unknown>);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.locator(".sidebar .ai-nav").click();
  const panel = page.locator(".assistant-panel");
  const draft = panel.getByRole("textbox");
  await draft.fill("ACTIVE");
  await panel.getByRole("button", { name: "Отправить", exact: true }).click();
  const card = panel.locator('[data-product-id="20"]');
  await expect(card).toBeVisible();
  await expect(panel.locator(".ai-answer")).toContainText("Состав указан");
  expect(turns[0]?.history).toEqual([]);
  expect(turns[0]?.page_context).toEqual({ view: "home", category_id: null });
  // Commercial change consumes no Add. The second explicit click opens native sizes.
  await request.post("/__fixture/change", { data: { change: "price" } });
  await card.locator(".add").click();
  await expect(panel.getByRole("status")).toContainText("изменились");
  await expect(page.locator(".basket-badge")).toHaveCount(0);
  await card.locator(".add").click();
  const picker = page.locator(".size-picker");
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "L", exact: true }).click();
  await request.post("/__fixture/change", { data: { change: "size" } });
  await picker.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(page.locator(".basket-badge")).toHaveCount(0);
  await picker.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(panel).toBeVisible();
  await card.locator(".add").click();
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "L", exact: true }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: "XL", exact: true }).click();
  await picker
    .getByRole("button", { name: "В корзину", exact: true })
    .dblclick();
  await expect(page.locator(".basket-badge")).toHaveText("1");
  await expect(panel).toBeVisible();
  await expect(card.locator(".size-summary")).toContainText("XL");
  await draft.fill("Теперь DERMACOMPLEX");
  await draft.press("Control+Enter");
  await expect(panel.locator('[data-product-id="4"]')).toBeVisible();
  await expect(panel.locator('[data-product-id="20"]')).toHaveCount(0);
  await draft.fill("цена");
  await draft.press("Control+Enter");
  await expect(panel.locator(".ai-answer").last()).toContainText("100");
  expect(turns[2]?.context_token).not.toBeNull();
  expect(turns[2]?.page_context).toEqual({ view: "home", category_id: null });
  await expect(panel.locator('[data-product-id="4"] .add')).toBeDisabled();
  await expect(page.locator(".basket-badge")).toHaveText("1");
  // UX-W02 + UX-R01 + UX-R03: route remount resets chat and sends product page_context for bare price query.
  await page.goto("/#product?id=20&lang=ru");
  await expect(panel.locator(".ai-answer")).toHaveCount(0);
  await draft.fill("цена");
  await draft.press("Control+Enter");
  await expect(panel.locator(".ai-answer").last()).toContainText("250");
  await expect(panel.locator('[data-product-id="20"]')).toBeVisible();
  expect(turns[3]?.page_context).toEqual({ view: "product", category_id: null });
  expect(turns[3]?.page_product_id).toBe(20);
  expect(turns[3]?.context_token).toBeNull();
});
