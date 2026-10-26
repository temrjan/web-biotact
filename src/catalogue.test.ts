import { afterEach, expect, test, vi } from "vitest";
import {
  categories,
  pageData,
  product,
  safeMedia,
  price,
  money,
} from "./catalogue";
import { parseLocation, href } from "./navigation";
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
