import type { Language } from "./catalogue";
export interface Location {
  view: "home" | "catalogue" | "product" | "account" | "invalid";
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
  if (view === "home" || view === "account") return { ...base, view };
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
