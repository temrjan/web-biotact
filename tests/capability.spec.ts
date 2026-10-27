import { test, expect } from "@playwright/test";
test("email-only context does not advertise disabled Telegram", async ({
  page,
}) => {
  expect(process.env.TG1_BROWSER_EMAIL_ONLY).toBe("1");
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/telegram/requests")) requests++;
  });
  await page.goto("/#account?lang=ru");
  await expect(
    page.getByText("Вход через Telegram сейчас недоступен."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Войти через Telegram" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Открыть официальный бот" }),
  ).toHaveCount(0);
  await page.locator('.languages [lang="uz"]').click();
  await expect(page.getByRole("alert")).toHaveText(
    "Telegram orqali kirish hozircha mavjud emas.",
  );
  await expect(
    page.getByText("Вход через Telegram сейчас недоступен."),
  ).toHaveCount(0);
  await page.locator('.languages [lang="ru"]').click();
  await expect(page.getByRole("alert")).toHaveText(
    "Вход через Telegram сейчас недоступен.",
  );
  expect(requests).toBe(0);
});
