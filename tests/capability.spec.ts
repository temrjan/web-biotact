import { test, expect } from "@playwright/test";
// Captain 2026-11-12 (C-100): while the server keeps Telegram login off, the page
// explains how sign-in works instead of only saying it is unavailable.
const explainedRu =
  "Вход в Biotact Club — через официальный Telegram-бот: вы подтверждаете вход в боте и возвращаетесь в этот браузер. На сайте вход пока не открыт; когда откроется, здесь появится кнопка входа.";
const explainedUz =
  "Biotact Clubʼga kirish rasmiy Telegram-bot orqali: botda kirishni tasdiqlaysiz va shu brauzerga qaytasiz. Saytda kirish hozircha ochilmagan; ochilganda shu yerda kirish tugmasi paydo boʻladi.";
test("email-only context does not advertise disabled Telegram", async ({
  page,
}) => {
  expect(process.env.TG1_BROWSER_EMAIL_ONLY).toBe("1");
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/telegram/requests")) requests++;
  });
  await page.goto("/#account?lang=ru");
  await expect(page.getByText(explainedRu)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Войти через Telegram" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Открыть официальный бот" }),
  ).toHaveCount(0);
  await page.locator('.languages [lang="uz"]').click();
  await expect(page.getByRole("alert")).toHaveText(explainedUz);
  await expect(page.getByText(explainedRu)).toHaveCount(0);
  await page.locator('.languages [lang="ru"]').click();
  await expect(page.getByRole("alert")).toHaveText(explainedRu);
  expect(requests).toBe(0);
});
