/** Actual HTTPS ingress → native FastAPI → migrated SQL. No page routes/mocks. */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

test("V6 synthetic native catalogue IDs, decimal sale, RU/UZ fallback and SQL agree", async ({
  page,
}) => {
  expect(process.env.TG1_BROWSER_BOUNDARY).not.toBe("1");
  expect(process.env.W1_CATALOGUE_SEED).toBe("1");
  const observed: {
    path: string;
    lang: string | undefined;
    status: number;
    cache: string | undefined;
  }[] = [];
  page.on("response", (r) => {
    if (
      r.url().includes("/api/v1/categories") ||
      r.url().includes("/api/v1/products")
    )
      observed.push({
        path: new URL(r.url()).pathname + new URL(r.url()).search,
        lang: r.request().headers()["x-language"],
        status: r.status(),
        cache: r.headers()["cache-control"],
      });
  });
  await page.goto("/");
  await expect(page.locator(".home-grid article")).toHaveCount(4);
  expect(
    await page
      .locator(".home-grid article[data-product-id]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-product-id")),
      ),
  ).toEqual(["4101", "4102", "4103", "4104"]);
  await page.locator('.group-tile[href*="category=301&"]').click();
  await expect(page.locator("article[data-product-id]")).toHaveCount(1);
  await expect(
    page.locator('[data-product-id="4101"] .price strong'),
  ).toContainText(/98\s?765,43 UZS/);
  await page.locator("article[data-product-id] h3 a").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "W1 Synthetic sale",
  );
  await page.getByRole("link", { name: "UZ", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "W1 UZ sale",
  );
  await expect(
    page.getByText("W1 Russian fallback description", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".product-main")).toHaveAttribute(
    "data-product-id",
    "4101",
  );
  await page
    .locator(".breadcrumbs")
    .getByRole("link", { name: "W1 Nutriyentlar", exact: true })
    .click();
  await expect(page.locator("article[data-product-id]")).toHaveCount(1);
  expect(
    observed.some(
      (r) =>
        r.path === "/api/v1/products?page=1&size=20&category_id=301" &&
        r.lang === "ru",
    ),
  ).toBe(true);
  expect(
    observed.some((r) => r.path === "/api/v1/products/4101" && r.lang === "uz"),
  ).toBe(true);
  expect(
    observed.every((r) => r.status === 200 && r.cache === "no-store"),
  ).toBe(true);
  // These expected SQL values are fixed independently of the web adapter.
  const databaseUrl = process.env.TG1_BROWSER_DATABASE_URL;
  expect(databaseUrl).toMatch(
    /^postgresql:\/\/tg1:tg1_synthetic@127\.0\.0\.1:\d+\/postgres$/,
  );
  const script = `import json,os,psycopg2
admin_url=os.environ['TG1_BROWSER_DATABASE_URL']
with psycopg2.connect(admin_url) as admin:
 with admin.cursor() as c:
  c.execute("SELECT datname FROM pg_database WHERE datname LIKE 'tg1_browser_%' AND pg_get_userbyid(datdba)=current_user")
  names=c.fetchall()
  if len(names)!=1: raise RuntimeError('Expected one owned running browser fixture')
  name=names[0][0]
with psycopg2.connect(admin_url.rsplit('/',1)[0]+'/'+name) as fixture:
 with fixture.cursor() as c:
  c.execute('SELECT id,name,name_uz,price::text,sale_price::text,description_uz,category_id FROM products WHERE id=4101')
  row=c.fetchone()
  c.execute('SELECT id,slug,name_uz FROM categories WHERE id=301')
  category=c.fetchone()
  print(json.dumps({'product':row,'category':category}))
`;
  const sql: unknown = JSON.parse(
    execFileSync(
      process.env.TG1_PYTHON ||
        resolve("../miniapp-biotact/packages/api/.venv/bin/python"),
      ["-c", script],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH || "",
          TG1_BROWSER_DATABASE_URL: databaseUrl,
        },
      },
    ),
  );
  expect(sql).toEqual({
    product: [
      4101,
      "W1 Synthetic sale",
      "W1 UZ sale",
      "112233.44",
      "98765.43",
      null,
      301,
    ],
    category: [301, "product", "W1 Nutriyentlar"],
  });
  console.log(
    "V6 actual API observations",
    JSON.stringify(observed),
    "SQL",
    JSON.stringify(sql),
  );
});
