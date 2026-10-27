import { expect, type Locator, type Page } from "@playwright/test";
/** Cards of a home product row that are fully inside its scroll viewport. */
export function visibleCards(row: Locator) {
  return row.evaluate((node) => {
    const box = node.getBoundingClientRect(),
      style = getComputedStyle(node),
      left = box.left + parseFloat(style.paddingLeft),
      right = box.right - parseFloat(style.paddingRight);
    return [...node.children].filter((child) => {
      const r = child.getBoundingClientRect();
      return r.left >= left - 1 && r.right <= right + 1;
    }).length;
  });
}
export const categories = [
  {
    id: 301,
    slug: "product",
    name: "Нутриенты",
    description: "Описание из API",
    image_url: null,
    is_active: true,
  },
  {
    id: 302,
    slug: "vitaminy-set",
    name: "Наборы",
    description: null,
    image_url: null,
    is_active: true,
  },
  {
    id: 303,
    slug: "tehnika",
    name: "Техника",
    description: null,
    image_url: null,
    is_active: true,
  },
  ...Array.from({ length: 99 }, (_, i) => ({
    id: 1001 + i,
    slug: `extra-${i}`,
    name: `Дополнительная ${i + 1}`,
    description: null,
    image_url: null,
    is_active: true,
  })),
];
export const products = Array.from({ length: 45 }, (_, i) => ({
  id: 4001 + i,
  slug: `synthetic-${i}`,
  name: `Synthetic Match ${String(i + 1).padStart(2, "0")}${i === 3 ? " — Very long localized product name that must wrap without hiding the price or details link" : ""}`,
  price: "112233.44",
  old_price: i === 1 ? "125000.55" : null,
  sale_price: i === 0 ? "98765.43" : null,
  currency: "UZS",
  is_sale: i === 0,
  is_in_stock: i !== 2,
  is_purchasable: i !== 1,
  requires_size: i === 0,
  available_sizes: i === 0 ? ["L", "XL"] : [],
  stock_quantity: i === 0 ? null : 0,
  category_id: i < 40 ? 301 : i < 44 ? 1099 : null,
  is_active: true,
  image_url: i === 0 ? "/synthetic-image.svg" : "/broken-image.png",
  images:
    i === 0
      ? ["/synthetic-image.svg", "/synthetic-second.svg", "/broken-image.png"]
      : [],
  description: i === 0 ? "<b>Plain API description</b>" : null,
  advantages: i === 0 ? ["API advantage"] : [],
  video_url:
    i === 0
      ? "https://video.example.test/exact/watch?v=17"
      : "javascript:alert(1)",
  additional_info_title: null,
  additional_info: i === 0 ? "API information" : null,
  disclaimer: null,
}));
export const banners = [
  {
    id: 6,
    title: "Баннер 4",
    title_uz: null,
    subtitle: null,
    subtitle_uz: null,
    image_url: "/synthetic-banner-6.svg",
    gradient: null,
    link_url: "/catalog",
    sort_order: 0,
    is_active: true,
  },
  {
    id: 5,
    title: "Синтетический баннер",
    title_uz: "Sintetik banner",
    subtitle: null,
    subtitle_uz: null,
    image_url: "/synthetic-banner-5.svg",
    gradient: null,
    link_url: "/catalog/product",
    sort_order: 1,
    is_active: true,
  },
  {
    id: 1,
    title: "Баннер товара",
    title_uz: null,
    subtitle: null,
    subtitle_uz: null,
    image_url: "/synthetic-banner-1.svg",
    gradient: null,
    link_url: "/product/4004",
    sort_order: 2,
    is_active: true,
  },
];
export interface Controls {
  categoryFailure?: "status" | "malformed";
  empty?: boolean;
  banners: typeof banners;
  interval: string | null;
  requests: URL[];
}
export async function fixture(
  page: Page,
  sourceProducts = products,
): Promise<Controls> {
  const controls: Controls = { requests: [], banners, interval: "4000" };
  await page.route("**/synthetic-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#e2e6e3"/><text x="35" y="210" fill="#444" font-size="24">Synthetic test image</text></svg>',
    }),
  );
  await page.route("**/broken-image.png", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  // Video previews and frames are third-party; tests never reach YouTube.
  await page.route(
    /^https:\/\/(i\.ytimg\.com|www\.youtube-nocookie\.com)\//,
    (route) =>
      route.fulfill(
        route.request().url().includes("ytimg")
          ? {
              contentType: "image/svg+xml",
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#30403a"/></svg>',
            }
          : {
              contentType: "text/html",
              body: "<title>synthetic player</title>",
            },
      ),
  );
  await page.route("**/api/v1/banners?*", async (route) => {
    const u = new URL(route.request().url());
    controls.requests.push(u);
    expect(u.searchParams.get("is_active")).toBe("true");
    expect(u.searchParams.get("limit")).toBe("100");
    expect(u.searchParams.get("skip")).toBe("0");
    await route.fulfill({
      json: { items: controls.banners, total: controls.banners.length },
    });
  });
  await page.route("**/api/v1/settings/banner_interval", async (route) => {
    controls.requests.push(new URL(route.request().url()));
    await route.fulfill(
      controls.interval === null
        ? { status: 404, json: { detail: "Not found" } }
        : { json: { key: "banner_interval", value: controls.interval } },
    );
  });
  await page.route("**/api/v1/categories?*", async (route) => {
    const u = new URL(route.request().url()),
      n = Number(u.searchParams.get("page"));
    controls.requests.push(u);
    expect(u.searchParams.get("size")).toBe("100");
    expect(route.request().headers()["authorization"]).toBeUndefined();
    if (n === 2 && controls.categoryFailure) {
      await route.fulfill(
        controls.categoryFailure === "status"
          ? { status: 503, json: {} }
          : { json: { items: [], total: 102, page: 2, size: 100, pages: 2 } },
      );
      return;
    }
    const uz = route.request().headers()["x-language"] === "uz";
    await route.fulfill({
      json: {
        items: categories.slice((n - 1) * 100, n * 100).map((c) => ({
          ...c,
          name: uz && c.id === 301 ? "Nutriyentlar API" : c.name,
        })),
        page: n,
        size: 100,
        total: 102,
        pages: 2,
      },
    });
  });
  await page.route("**/api/v1/products?*", async (route) => {
    const u = new URL(route.request().url());
    controls.requests.push(u);
    const n = Number(u.searchParams.get("page")),
      size = Number(u.searchParams.get("size"));
    expect([8, 20, 100]).toContain(size);
    expect(u.searchParams.has("limit")).toBe(false);
    expect(u.searchParams.has("category")).toBe(false);
    expect(route.request().headers()["x-language"]).toMatch(/^(ru|uz)$/);
    let items = controls.empty
      ? []
      : sourceProducts.filter(
          (p) =>
            (u.searchParams.get("on_sale") !== "true" || p.is_sale) &&
            (!u.searchParams.has("category_id") ||
              p.category_id === Number(u.searchParams.get("category_id"))) &&
            (!u.searchParams.has("search") ||
              p.name
                .toLowerCase()
                .includes((u.searchParams.get("search") || "").toLowerCase())),
        );
    const total = items.length;
    items = items.slice((n - 1) * size, n * size);
    await route.fulfill({
      json: {
        items,
        page: n,
        size,
        total,
        pages: Math.max(1, Math.ceil(total / size)),
      },
    });
  });
  await page.route("**/api/v1/products/*", async (route) => {
    const p = sourceProducts.find(
      (p) =>
        p.id ===
        Number(new URL(route.request().url()).pathname.split("/").pop()),
    );
    await route.fulfill(p ? { json: p } : { status: 404, json: {} });
  });
  return controls;
}
