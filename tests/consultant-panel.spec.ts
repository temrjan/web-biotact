import { test, expect, type Locator, type Page } from "@playwright/test";
import { fixture, products } from "./catalogue.fixture";

// Storefront task 3 (Captain 2026-11-12, C-97…C-99): the header and the form stay in
// place, the examples come first, the header stands out from the page, and the
// instruction's caution stays visible under «Из инструкции», without layout marks.

const passage =
  "■ Способ применения\n────────────\n• взрослым — 1 капсула в день;\n• детям с 3 лет — 1 стик в день";

async function mockAnswer(page: Page) {
  await page.route("**/api/v1/consultant/turns", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        request_id: body.request_id,
        context_revision: body.context_revision,
        language: body.language,
        status: "answer",
        answer: "Взрослым по 1 капсуле в день во время еды.",
        sources: [
          {
            source_id: "use-1",
            title: "IMMUNOCOMPLEX",
            form: "капсулы",
            language: body.language,
            revision: "r1",
            section_title: "Способ применения",
            pdf_title: "Инструкция",
            pdf_page: 1,
            passage,
          },
        ],
        cautions: ["use-1"],
        products: [products[4]],
        open_product_id: null,
        context_token: "synthetic-token",
        context_expires_at: new Date(Date.now() + 1800000).toISOString(),
        commercial_checked_at: "2026-11-12T07:00:56.000Z",
      },
    });
  });
}

/** The whole box of `locator` is inside the window, without scrolling anything. */
async function inWindow(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
}

/** WCAG contrast of two computed `rgb(...)` colours. */
function contrast(a: string, b: string) {
  const lum = (c: string) => {
    const [r = 0, g = 0, bl = 0] = (c.match(/\d+(\.\d+)?/g) ?? [])
      .map(Number)
      .map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

for (const width of [1440, 433])
  test(`consultant panel keeps examples, field and caution in view at 863 px height (${width} px)`, async ({
    page,
  }) => {
    await fixture(page);
    await mockAnswer(page);
    await page.setViewportSize({ width, height: 863 });
    await page.goto("/#home?lang=ru");
    await page.locator(width >= 1000 ? ".sidebar .ai-nav" : ".top-ai").click();
    const panel = page.locator(".assistant-panel");
    await expect(panel).toBeVisible();
    const field = panel.getByRole("textbox", { name: "Ваш вопрос" });
    // Before the first question: the examples and the whole field, no scroll.
    await inWindow(page, panel.locator(".ai-examples"));
    await inWindow(page, field);
    await inWindow(page, panel.getByRole("button", { name: "Отправить" }));
    // The header stands out from the page (at least 3:1) and carries light text.
    const [header, canvas, title] = await Promise.all([
      panel
        .locator(".ai-head")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      ),
      panel.locator(".ai-head h2").evaluate((e) => getComputedStyle(e).color),
    ]);
    expect(contrast(header, canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(header, title)).toBeGreaterThanOrEqual(4.5);
    // After an answer: the field stays in view, the caution is shown cleaned.
    await field.fill("Как принимать IMMUNOCOMPLEX?");
    await field.press("Enter");
    const answer = panel.locator(".ai-answer");
    await expect(answer).toContainText("Взрослым по 1 капсуле");
    await expect(answer.locator(".ai-question")).toHaveText(
      "Как принимать IMMUNOCOMPLEX?",
    );
    const caution = answer.locator(".ai-caution");
    await expect(caution.locator(".ai-caution-label")).toHaveText(
      "Из инструкции",
    );
    await expect(caution.locator(".ai-plain")).toHaveText(
      "Способ применения\nвзрослым — 1 капсула в день;\nдетям с 3 лет — 1 стик в день",
    );
    await expect(answer).not.toContainText("■");
    await expect(answer).not.toContainText("─");
    await expect(answer).not.toContainText("•");
    await expect(answer.locator(".ai-checked")).toHaveText(
      /^Цена и наличие актуальны на \d{2}:\d{2}$/,
    );
    await inWindow(page, field);
    // Scrolling the feed leaves the header and the form where they are.
    const head = await panel.locator(".ai-head").boundingBox();
    await panel
      .locator(".ai-body")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    expect(await panel.locator(".ai-head").boundingBox()).toEqual(head);
    await inWindow(page, field);
    // The card in the feed comes after the answer, as before (C-99).
    expect(
      await panel.evaluate(
        (p) =>
          !!(
            p
              .querySelector(".ai-answer")!
              .compareDocumentPosition(
                p.querySelector(".assistant-cards .product-card")!,
              ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBe(true);
  });
