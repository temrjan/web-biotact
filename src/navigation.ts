import type { Language } from "./catalogue";
export interface Location {
  view: "home" | "catalogue" | "product" | "account" | "order" | "invalid";
  lang: Language;
  category?: number;
  q?: string;
  page: number;
  id?: number;
}
function id(s: string | null): number | undefined {
  return s !== null && /^[1-9]\d*$/.test(s) && Number.isSafeInteger(Number(s))
    ? Number(s)
    : undefined;
}
export function parseLocation(hash: string): Location {
  const [name, query] = hash.replace(/^#/, "").split("?");
  const p = new URLSearchParams(query);
  const lang: Language = p.get("lang") === "uz" ? "uz" : "ru";
  const view = name || "home",
    base = { lang, page: 1 };
  if (view === "home" || view === "account" || view === "order")
    return { ...base, view };
  if (view === "product") {
    const value = id(p.get("id"));
    return value ? { ...base, view, id: value } : { ...base, view: "invalid" };
  }
  if (view === "catalogue") {
    const category = id(p.get("category")),
      page = p.has("page") ? id(p.get("page")) : 1;
    if ((p.has("category") && !category) || !page)
      return { ...base, view: "invalid" };
    const q = p.get("q")?.trim();
    return {
      ...base,
      view,
      page,
      ...(category ? { category } : {}),
      ...(q ? { q } : {}),
    };
  }
  return { ...base, view: "invalid" };
}
/**
 * Website destination of an admin banner link. Mini App paths map to the same
 * catalogue view; absolute HTTPS links open separately, other schemes are ignored.
 */
export function bannerTarget(
  link: string | null,
  lang: Language,
  categories: readonly { id: number; slug: string }[],
): { href: string; external: boolean } {
  const value = link?.trim() || "/catalog";
  const catalogue = {
    href: href({ view: "catalogue", lang, page: 1 }),
    external: false,
  };
  if (/^https?:/i.test(value)) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password
        ? { href: u.href, external: true }
        : catalogue;
    } catch {
      return catalogue;
    }
  }
  const path = value.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/";
  if (path === "/")
    return { href: href({ view: "home", lang, page: 1 }), external: false };
  const slug = /^\/catalog\/([^/]+)$/.exec(path)?.[1];
  const category = slug ? categories.find((c) => c.slug === slug) : undefined;
  if (category)
    return {
      href: href({ view: "catalogue", lang, page: 1, category: category.id }),
      external: false,
    };
  const product = id(/^\/product\/([^/]+)$/.exec(path)?.[1] ?? null);
  if (product)
    return {
      href: href({ view: "product", lang, page: 1, id: product }),
      external: false,
    };
  return catalogue;
}
export function href(loc: Location): string {
  const p = new URLSearchParams();
  if (loc.view === "catalogue") {
    if (loc.category) p.set("category", String(loc.category));
    if (loc.q) p.set("q", loc.q);
    p.set("page", String(loc.page));
  }
  if (loc.view === "product" && loc.id) p.set("id", String(loc.id));
  p.set("lang", loc.lang);
  return `/#${loc.view}?${p}`;
}
/** The payment return address `/?view=order&lang=…` becomes the order view. */
export function returnAddress(search: string): string | null {
  const p = new URLSearchParams(search);
  return p.get("view") === "order"
    ? href({
        view: "order",
        lang: p.get("lang") === "uz" ? "uz" : "ru",
        page: 1,
      })
    : null;
}
/**
 * The logo and the home menu link show the home view from its top, also when it is
 * already shown (the hash then does not change). A click with a modifier key or another
 * mouse button keeps the browser's default; Enter on a focused link clicks with button 0.
 */
export function homeTop(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): void {
  if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey)
    window.scrollTo(0, 0);
}
