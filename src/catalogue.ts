/** Anonymous catalogue boundary. Server projection owns all translations. */
export type Language = "ru" | "uz";
export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
}
export interface Product {
  id: number;
  name: string;
  price: string;
  old_price: string | null;
  sale_price: string | null;
  currency: string;
  is_sale: boolean;
  is_in_stock: boolean;
  is_purchasable: boolean;
  requires_size: boolean;
  stock_quantity: number | null;
  available_sizes: string[];
  category_id: number | null;
  image_url: string | null;
  images: string[];
  description: string | null;
  advantages: string[];
  video_url: string | null;
  additional_info_title: string | null;
  additional_info: string | null;
  disclaimer: string | null;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
export class ReadError extends Error {
  constructor(public status = 0) {
    super("Catalogue read failed");
  }
}
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function object(v: unknown): Record<string, unknown> {
  if (!isObject(v)) throw new ReadError();
  return v;
}
function integer(v: unknown, min = 0): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min)
    throw new ReadError();
  return v;
}
function text(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) throw new ReadError();
  return v;
}
function optional(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") throw new ReadError();
  return v;
}
function flag(v: unknown): boolean {
  if (typeof v !== "boolean") throw new ReadError();
  return v;
}
function strings(v: unknown): string[] {
  if (v == null) return [];
  if (!Array.isArray(v) || !v.every((s: unknown) => typeof s === "string"))
    throw new ReadError();
  return v;
}
function decimal(v: unknown): string {
  if (
    (typeof v !== "string" && typeof v !== "number") ||
    !/^\d+(\.\d+)?$/.test(String(v)) ||
    !Number.isFinite(Number(v)) ||
    Number(v) <= 0
  )
    throw new ReadError();
  return String(v);
}
export function category(v: unknown): Category {
  const d = object(v);
  return {
    id: integer(d.id, 1),
    slug: text(d.slug),
    name: text(d.name),
    description: optional(d.description),
    image_url: optional(d.image_url),
    is_active: flag(d.is_active),
  };
}
export function product(v: unknown): Product {
  const d = object(v);
  const p = {
    id: integer(d.id, 1),
    name: text(d.name),
    price: decimal(d.price),
    old_price: d.old_price == null ? null : decimal(d.old_price),
    sale_price: d.sale_price == null ? null : decimal(d.sale_price),
    currency: text(d.currency),
    is_sale: flag(d.is_sale),
    is_in_stock: flag(d.is_in_stock),
    is_purchasable: flag(d.is_purchasable),
    requires_size: flag(d.requires_size),
    stock_quantity:
      d.stock_quantity === null ? null : integer(d.stock_quantity),
    available_sizes: strings(d.available_sizes),
    category_id: d.category_id == null ? null : integer(d.category_id, 1),
    image_url: optional(d.image_url),
    images: strings(d.images),
    description: optional(d.description),
    advantages: strings(d.advantages),
    video_url: optional(d.video_url),
    additional_info_title: optional(d.additional_info_title),
    additional_info: optional(d.additional_info),
    disclaimer: optional(d.disclaimer),
  };
  if (
    p.is_sale &&
    (p.sale_price === null || Number(p.sale_price) >= Number(p.price))
  )
    throw new ReadError();
  return p;
}
export function pageData<T>(
  v: unknown,
  parse: (v: unknown) => T,
  requested: number,
  size: number,
): Page<T> {
  const d = object(v),
    total = integer(d.total),
    pages = integer(d.pages, 1);
  if (
    integer(d.page, 1) !== requested ||
    integer(d.size, 1) !== size ||
    pages !== Math.max(1, Math.ceil(total / size)) ||
    !Array.isArray(d.items) ||
    d.items.length !==
      Math.min(size, Math.max(0, total - (requested - 1) * size))
  )
    throw new ReadError();
  return { items: d.items.map(parse), total, pages, page: requested, size };
}
async function get(
  path: string,
  lang: Language,
  signal: AbortSignal,
): Promise<unknown> {
  const r = await fetch("/api/v1" + path, {
    headers: { "X-Language": lang },
    cache: "no-store",
    signal,
  });
  if (!r.ok) throw new ReadError(r.status);
  return r.json();
}
export async function categories(
  lang: Language,
  signal: AbortSignal,
): Promise<Category[]> {
  const result: Category[] = [],
    ids = new Set<number>(),
    slugs = new Set<string>();
  let total: number | undefined;
  for (let n = 1; ; n++) {
    const p = pageData(
      await get(`/categories?page=${n}&size=100`, lang, signal),
      category,
      n,
      100,
    );
    if (total !== undefined && p.total !== total) throw new ReadError();
    total = p.total;
    for (const item of p.items) {
      if (!item.is_active || ids.has(item.id) || slugs.has(item.slug))
        throw new ReadError();
      ids.add(item.id);
      slugs.add(item.slug);
      result.push(item);
    }
    if (n === p.pages) return result;
  }
}
export async function products(
  lang: Language,
  signal: AbortSignal,
  n: number,
  size: number,
  categoryId?: number,
  search?: string,
): Promise<Page<Product>> {
  const q = new URLSearchParams({ page: String(n), size: String(size) });
  if (categoryId !== undefined) q.set("category_id", String(categoryId));
  if (search) q.set("search", search);
  const p = pageData(
    await get(`/products?${q}`, lang, signal),
    (v) => {
      const d = object(v);
      if (d.is_active !== true) throw new ReadError();
      return product(d);
    },
    n,
    size,
  );
  if (new Set(p.items.map((item) => item.id)).size !== p.items.length)
    throw new ReadError();
  return p;
}
export async function detail(
  id: number,
  lang: Language,
  signal: AbortSignal,
): Promise<Product> {
  const p = product(await get(`/products/${id}`, lang, signal));
  if (p.id !== id) throw new ReadError();
  return p;
}
/** Permit existing same-origin media and absolute HTTPS, never active URL schemes. */
export function safeMedia(value: string | null, video = false): string | null {
  if (!value) return null;
  if (
    !video &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  )
    return value;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? value : null;
  } catch {
    return null;
  }
}
export function price(p: Product): {
  current: string;
  previous: string | null;
} {
  return {
    current: p.is_sale && p.sale_price !== null ? p.sale_price : p.price,
    previous: p.is_sale ? p.price : p.old_price,
  };
}
export function money(value: string, currency: string, lang: Language): string {
  return `${new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}
