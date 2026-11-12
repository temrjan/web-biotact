import { product, type Product, type Language } from "./catalogue";

export interface Source {
  source_id: string;
  title: string;
  form: string;
  language: Language;
  revision: string;
  section_title: string;
  pdf_title: string;
  pdf_page: number;
  passage: string;
}
export interface Pair {
  question: string;
  answer: string;
}
export interface Turn {
  request_id: string;
  tab_id: string;
  context_revision: number;
  language: Language;
  question: string;
  history: Pair[];
  page_product_id: number | null;
  context_token: string | null;
}
export interface Answer {
  request_id: string;
  context_revision: number;
  language: Language;
  status: "answer" | "clarification" | "limited" | "refused";
  answer: string;
  sources: Source[];
  cautions: string[];
  products: Product[];
  open_product_id: number | null;
  context_token: string;
  context_expires_at: string;
  commercial_checked_at: string | null;
}
/** Longest question the consultant accepts, in Unicode code points (API cap). */
export const QUESTION_LIMIT = 1000;
/** The draft counter appears from this many code points. */
export const QUESTION_COUNTER_FROM = 800;
export function questionLength(value: string): number {
  return Array.from(value).length;
}
export class ConsultantError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
function fail(): never {
  throw new ConsultantError("invalid_answer");
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
}
function exact(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).sort().join() !== keys.sort().join()) fail();
}
function text(v: unknown, max = 8000): string {
  if (typeof v !== "string" || !v.trim() || v.length > max) return fail();
  return v;
}
function date(v: unknown): string {
  const s = text(v, 100);
  if (!/Z$|\+00:00$/.test(s) || !Number.isFinite(Date.parse(s))) return fail();
  return s;
}
function ids(v: unknown, max: number): number[] {
  if (
    !Array.isArray(v) ||
    v.length > max ||
    v.some(
      (i: unknown) =>
        typeof i !== "number" || !Number.isSafeInteger(i) || i <= 0,
    ) ||
    new Set(v).size !== v.length
  )
    return fail();
  return v as number[];
}
function sources(v: unknown, lang: Language): Source[] {
  if (!Array.isArray(v) || v.length > 12) return fail();
  const parsed = v.map((item: unknown): Source => {
    const s = object(item);
    exact(s, [
      "source_id",
      "title",
      "form",
      "language",
      "revision",
      "section_title",
      "pdf_title",
      "pdf_page",
      "passage",
    ]);
    if (s.language !== lang) return fail();
    const page = ids([s.pdf_page], 1)[0];
    if (page === undefined) return fail();
    return {
      source_id: text(s.source_id),
      title: text(s.title),
      form: text(s.form),
      language: lang,
      revision: text(s.revision),
      section_title: text(s.section_title),
      pdf_title: text(s.pdf_title),
      pdf_page: page,
      passage: text(s.passage, 16000),
    };
  });
  if (new Set(parsed.map((s) => s.source_id)).size !== parsed.length) fail();
  return parsed;
}
function products(v: unknown): Product[] {
  if (!Array.isArray(v) || v.length > 2) return fail();
  const parsed = v.map(product);
  ids(
    parsed.map((p) => p.id),
    2,
  );
  return parsed;
}
export function parseAnswer(raw: unknown, turn: Turn): Answer {
  const d = object(raw);
  exact(d, [
    "request_id",
    "context_revision",
    "language",
    "status",
    "answer",
    "sources",
    "cautions",
    "products",
    "open_product_id",
    "context_token",
    "context_expires_at",
    "commercial_checked_at",
  ]);
  if (
    d.request_id !== turn.request_id ||
    d.context_revision !== turn.context_revision ||
    d.language !== turn.language ||
    !["answer", "clarification", "limited", "refused"].includes(
      String(d.status),
    )
  )
    fail();
  const ss = sources(d.sources, turn.language),
    ps = products(d.products);
  if (
    !Array.isArray(d.cautions) ||
    d.cautions.some(
      (s: unknown) =>
        typeof s !== "string" || !ss.some((source) => source.source_id === s),
    ) ||
    new Set(d.cautions).size !== d.cautions.length
  )
    return fail();
  if (d.open_product_id !== null && !ps.some((p) => p.id === d.open_product_id))
    fail();
  return {
    request_id: turn.request_id,
    context_revision: turn.context_revision,
    language: turn.language,
    status: d.status as Answer["status"],
    // The API sets no answer length cap (Shop #172); a long answer is shown.
    answer: text(d.answer, Number.POSITIVE_INFINITY),
    sources: ss,
    cautions: d.cautions as string[],
    products: ps,
    open_product_id: d.open_product_id as number | null,
    context_token: text(d.context_token, 2048),
    context_expires_at: date(d.context_expires_at),
    commercial_checked_at:
      d.commercial_checked_at === null ? null : date(d.commercial_checked_at),
  };
}
async function post(
  path: string,
  value: object,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch("/api/v1/consultant" + path, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    ...(signal ? { signal } : {}),
  });
  if (response.status === 204) return null;
  const raw: unknown = await response.json();
  if (!response.ok) {
    const d = object(raw);
    throw new ConsultantError(
      typeof d.code === "string" ? d.code : "unavailable",
    );
  }
  return raw;
}
export async function send(turn: Turn, signal: AbortSignal): Promise<Answer> {
  return parseAnswer(await post("/turns", turn, signal), turn);
}
export function cancel(turn: Pick<Turn, "tab_id" | "request_id">) {
  void post("/cancel", turn).catch(() => undefined);
}
export async function refresh(
  id: number,
  language: Language,
  signal: AbortSignal,
): Promise<Product | null> {
  const d = object(
    await post("/products/refresh", { product_ids: [id], language }, signal),
  );
  exact(d, ["products", "unavailable_ids", "checked_at"]);
  const ps = products(d.products),
    unavailable = ids(d.unavailable_ids, 2);
  date(d.checked_at);
  const all = [...ps.map((p) => p.id), ...unavailable];
  if (all.length !== 1 || all[0] !== id) return fail();
  return ps[0] || null;
}
export function commercial(p: Product): string {
  return JSON.stringify([
    p.price,
    p.old_price,
    p.sale_price,
    p.currency,
    p.is_sale,
    p.is_in_stock,
    p.is_purchasable,
    p.requires_size,
    p.available_sizes,
  ]);
}
/** Every completed pair of the tab conversation, oldest first, with no count or length cut. */
export function history(pairs: readonly Pair[]): Pair[] {
  return [...pairs];
}
/** Which panel notice an error code shows; every other code keeps the general one. */
export type ErrorNotice = "expired" | "sensitive" | "busy" | "error";
export function errorNotice(code: string): ErrorNotice {
  if (code === "context_invalid" || code === "context_expired")
    return "expired";
  if (code === "sensitive_input") return "sensitive";
  if (code === "answer_unavailable") return "busy";
  return "error";
}

export function sensitive(value: string): boolean {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s()-]*){9,}|\b(?:sk-|Bearer\s|password\s*[:=]|пароль\s*[:=])/i.test(
    value,
  );
}
/**
 * A source passage for display: the layout marks of the PDF text (■ and other filled
 * squares, • bullets, box-drawing rules such as ────) are removed, each line is trimmed
 * and empty lines collapse. The words, numbers and line order stay as supplied.
 */
export function plainPassage(text: string): string {
  return text
    .replace(/[■-▫•─-╿]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
