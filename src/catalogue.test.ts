import { afterEach, expect, test, vi } from "vitest";
import {
  banner,
  bannerInterval,
  banners,
  categories,
  pageData,
  product,
  saleProducts,
  safeMedia,
  youtubeId,
  price,
  money,
  DEFAULT_BANNER_INTERVAL,
} from "./catalogue";
import { bannerTarget, parseLocation, href } from "./navigation";
const item = {
  id: 7,
  name: "API product",
  price: "112233.44",
  sale_price: "98765.43",
  old_price: null,
  currency: "UZS",
  is_sale: true,
  is_in_stock: true,
  is_purchasable: false,
  requires_size: true,
  stock_quantity: null,
  available_sizes: ["L"],
};
afterEach(() => vi.unstubAllGlobals());
test("consumed decimal/availability/optional values are validated without inventing stock or text", () => {
  const p = product(item);
  expect(price(p)).toEqual({ current: "98765.43", previous: "112233.44" });
  expect(money("98765.43", "UZS", "ru")).toBe("98 765,43 UZS");
  expect(p.stock_quantity).toBeNull();
  expect(p.description).toBeNull();
  expect(p.is_purchasable).toBe(false);
  for (const override of [
    { id: 0 },
    { price: "NaN" },
    { sale_price: "200000" },
    { is_purchasable: "true" },
    { images: [7] },
    { disclaimer: {} },
    { stock_quantity: -1 },
  ])
    expect(() => product({ ...item, ...override })).toThrow();
});
test("page envelopes reject truncation, malformed counts and wrong page/size", () => {
  const valid = { items: [], total: 0, pages: 1, page: 1, size: 20 };
  expect(pageData(valid, product, 1, 20).total).toBe(0);
  for (const override of [
    { total: 1 },
    { pages: 0 },
    { page: 2 },
    { size: 10 },
    { total: -1 },
  ])
    expect(() => pageData({ ...valid, ...override }, product, 1, 20)).toThrow();
});
test("complete discovery rejects duplicate identities and changed traversal counts", async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    slug: `c-${i}`,
    name: `C${i}`,
    is_active: true,
  }));
  for (const second of [
    { items: [first[0]], total: 101 },
    { items: [], total: 100 },
  ]) {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: first,
            total: 101,
            pages: 2,
            page: 1,
            size: 100,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...second, pages: 2, page: 2, size: 100 }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      categories("ru", new AbortController().signal),
    ).rejects.toThrow();
  }
});
test("safe media retains HTTPS authority/path and rejects executable and network-relative schemes", () => {
  expect(safeMedia("https://media.example.test/a%20b.png?q=1")).toBe(
    "https://media.example.test/a%20b.png?q=1",
  );
  expect(safeMedia("/media/a.png")).toBe("/media/a.png");
  for (const s of [
    "//other.test/a",
    "/\\other.test/a",
    "javascript:alert(1)",
    "data:text/html,x",
    "http://other.test/a",
  ])
    expect(safeMedia(s)).toBeNull();
  expect(safeMedia("/video/a", true)).toBeNull();
});
test("product video links give an embeddable YouTube ID only for YouTube addresses", () => {
  for (const [link, id] of [
    ["https://youtu.be/avRmBAElLYQ", "avRmBAElLYQ"],
    ["https://youtu.be/d-O7SD2Z6Nw?si=x", "d-O7SD2Z6Nw"],
    ["https://www.youtube.com/watch?v=loU8hZKb_gU&t=4", "loU8hZKb_gU"],
    ["https://m.youtube.com/watch?v=loU8hZKb_gU", "loU8hZKb_gU"],
    ["https://www.youtube.com/embed/MaA4Rtf9ZXA", "MaA4Rtf9ZXA"],
  ] as const)
    expect(youtubeId(link)).toBe(id);
  for (const link of [
    null,
    "",
    "http://youtu.be/avRmBAElLYQ",
    "javascript:alert(1)",
    "https://video.example.test/exact/watch?v=17",
    "https://youtu.be.example.test/avRmBAElLYQ",
    "https://youtu.be/short",
    "https://www.youtube.com/watch?v=avRmBAElLYQ%22",
    "https://www.youtube.com/channel/avRmBAElLYQ",
  ])
    expect(youtubeId(link)).toBeNull();
});
test("hash contract restores identity/filter/page and URLSearchParams encodes literal search", () => {
  const loc = parseLocation("#catalogue?category=301&q=A%26B&page=2&lang=uz");
  expect(loc).toEqual({
    view: "catalogue",
    category: 301,
    q: "A&B",
    page: 2,
    lang: "uz",
  });
  expect(href(loc)).toBe("/#catalogue?category=301&q=A%26B&page=2&lang=uz");
  for (const s of [
    "#catalogue?page=0",
    "#catalogue?category=NaN",
    "#product?id=1.1",
    "#product",
    "#unknown",
  ])
    expect(parseLocation(s).view).toBe("invalid");
  expect(parseLocation("")).toEqual({ view: "home", lang: "ru", page: 1 });
});
const adminBanner = {
  id: 6,
  title: "Баннер 4",
  title_uz: null,
  subtitle: null,
  subtitle_uz: null,
  image_url: "https://app.biotact.uz/uploads/banners/a.jpg",
  gradient: null,
  link_url: "/catalog",
  sort_order: 0,
  is_active: true,
};
test("admin banners keep server order and language title; unusable images are skipped", async () => {
  expect(banner(adminBanner, "uz")).toEqual({
    id: 6,
    title: "Баннер 4",
    image_url: "https://app.biotact.uz/uploads/banners/a.jpg",
    link_url: "/catalog",
  });
  expect(banner({ ...adminBanner, title_uz: "Banner" }, "uz")?.title).toBe(
    "Banner",
  );
  expect(banner({ ...adminBanner, title_uz: "Banner" }, "ru")?.title).toBe(
    "Баннер 4",
  );
  for (const image of [null, "javascript:alert(1)", "http://x.test/a.jpg"])
    expect(banner({ ...adminBanner, image_url: image }, "ru")).toBeNull();
  for (const override of [
    { id: 0 },
    { title: 7 },
    { sort_order: 1.5 },
    { is_active: false },
    { link_url: {} },
  ])
    expect(() => banner({ ...adminBanner, ...override }, "ru")).toThrow();
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [
          { ...adminBanner, id: 9, sort_order: 0 },
          { ...adminBanner, id: 2, sort_order: 1, image_url: null },
          { ...adminBanner, id: 4, sort_order: 2 },
        ],
        total: 3,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  expect(
    (await banners("ru", new AbortController().signal)).map((b) => b.id),
  ).toEqual([9, 4]);
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/banners?is_active=true&limit=100&skip=0",
    expect.objectContaining({ headers: { "X-Language": "ru" } }),
  );
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ items: [adminBanner], total: 2 })),
  );
  await expect(banners("ru", new AbortController().signal)).rejects.toThrow();
});
test("banner interval uses the admin setting and the Mini App default otherwise", async () => {
  const signal = new AbortController().signal;
  for (const [body, status, expected] of [
    [{ value: "4000" }, 200, 4000],
    [{ value: "" }, 200, DEFAULT_BANNER_INTERVAL],
    [{ value: "-5" }, 200, DEFAULT_BANNER_INTERVAL],
    [{ value: "soon" }, 200, DEFAULT_BANNER_INTERVAL],
    [{ detail: "Not found" }, 404, DEFAULT_BANNER_INTERVAL],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
    );
    expect(await bannerInterval(signal)).toBe(expected);
  }
  expect(DEFAULT_BANNER_INTERVAL).toBe(3000);
});
test("sale products read every on-sale page and reject duplicates", async () => {
  const sale = (id: number) => ({
    ...item,
    id,
    name: `Sale ${id}`,
    is_active: true,
    is_purchasable: true,
  });
  const page = (items: unknown[], n: number) =>
    new Response(
      JSON.stringify({ items, total: 101, pages: 2, page: n, size: 100 }),
    );
  const first = Array.from({ length: 100 }, (_, i) => sale(i + 1));
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(page(first, 1))
    .mockResolvedValueOnce(page([sale(101)], 2));
  vi.stubGlobal("fetch", fetch);
  expect(await saleProducts("uz", new AbortController().signal)).toHaveLength(
    101,
  );
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    "/api/v1/products?on_sale=true&page=1&size=100",
    "/api/v1/products?on_sale=true&page=2&size=100",
  ]);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(page(first, 1))
      .mockResolvedValueOnce(page([sale(1)], 2)),
  );
  await expect(
    saleProducts("uz", new AbortController().signal),
  ).rejects.toThrow();
});
test("banner links map Mini App routes to website views and open only HTTPS externally", () => {
  const cats = [{ id: 301, slug: "product" }];
  const target = (link: string | null) => bannerTarget(link, "uz", cats);
  expect(target("/catalog")).toEqual({
    href: "/#catalogue?page=1&lang=uz",
    external: false,
  });
  expect(target(null)).toEqual(target("/catalog"));
  expect(target("  ")).toEqual(target("/catalog"));
  expect(target("/catalog/product")).toEqual({
    href: "/#catalogue?category=301&page=1&lang=uz",
    external: false,
  });
  expect(target("/catalog/unknown")).toEqual(target("/catalog"));
  expect(target("/product/39")).toEqual({
    href: "/#product?id=39&lang=uz",
    external: false,
  });
  expect(target("/")).toEqual({ href: "/#home?lang=uz", external: false });
  expect(target("/sales")).toEqual(target("/catalog"));
  expect(target("https://biotact.uz/ru/")).toEqual({
    href: "https://biotact.uz/ru/",
    external: true,
  });
  for (const unsafe of [
    "http://biotact.uz/",
    "javascript:alert(1)",
    "https://user:pass@biotact.uz/",
  ])
    expect(target(unsafe)).toEqual(target("/catalog"));
});
