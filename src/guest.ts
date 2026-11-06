/**
 * Guest checkout boundary (G1 spec S2 §4–§7). Every response is validated before use. The
 * CSRF token, idempotency key, order data and form values live only in memory: never in URLs,
 * storage or the console.
 */
import { newKey, object } from "./api";
import type { Language } from "./catalogue";

export const TERMS_URL = "https://app.biotact.uz/legal/terms";
export const POLICY_URL = "https://app.biotact.uz/legal/policy";
/** OrderQuote carries no currency; Shop orders are priced and charged in UZS. */
export const QUOTE_CURRENCY = "UZS";
export const REQUEST_TIMEOUT_MS = 30_000;
export const RESEND_DELAY_MS = 1_500;
const BASE = "/api/v1/guest";

export type State = "awaiting_payment" | "paid" | "cancelled";
export interface Item {
  product_id: number;
  quantity: number;
  size: string | null;
}
export interface QuoteLine extends Item {
  product_name: string;
  unit_price: string;
  line_total: string;
}
export interface Quote {
  lines: QuoteLine[];
  subtotal: string;
  delivery_fee: string;
  total: string;
  quote_fingerprint: string;
}
export interface OrderLine {
  product_id: number | null;
  product_name: string;
  size: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
}
export interface Order {
  order_number: string;
  state: State;
  lines: OrderLine[];
  total: string;
  currency: string;
  csrf_token: string;
}
export interface OrderRequest {
  items: Item[];
  quote_fingerprint: string;
  name: string;
  phone: string;
  address: string;
  accept_terms: true;
  idempotency_key: string;
}

export class GuestError extends Error {
  constructor(
    /** HTTP status; 0 for a network failure or timeout. */
    readonly status: number,
    readonly code: string,
    /** Seconds from `Retry-After`, 0 when absent. */
    readonly retryAfter = 0,
    readonly detail: unknown = null,
  ) {
    super(code);
  }
}
/** The request may have taken effect: network failure, timeout, 5xx or an invalid response. */
export const uncertain = (e: GuestError) =>
  e.status === 0 || e.status >= 500 || e.code === "invalid_response";

const money = (v: unknown): v is string =>
  typeof v === "string" && /^\d+\.\d{2}$/.test(v);
const whole = (v: unknown, min: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const size = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && v.length > 0);
const text = (v: unknown): v is string => typeof v === "string" && v !== "";
const digest = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const number = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9-]{1,50}$/.test(v);
export const isState = (v: unknown): v is State =>
  v === "awaiting_payment" || v === "paid" || v === "cancelled";

function quoteLine(v: unknown): v is QuoteLine {
  return (
    object(v) &&
    whole(v.product_id, 1) &&
    text(v.product_name) &&
    whole(v.quantity, 1) &&
    money(v.unit_price) &&
    money(v.line_total) &&
    size(v.size)
  );
}
export function quote(v: unknown): v is Quote {
  return (
    object(v) &&
    Array.isArray(v.lines) &&
    v.lines.length > 0 &&
    v.lines.every(quoteLine) &&
    money(v.subtotal) &&
    money(v.delivery_fee) &&
    money(v.total) &&
    whole(v.max_redeemable, 0) &&
    whole(v.points_to_apply, 0) &&
    digest(v.quote_fingerprint)
  );
}
function orderLine(v: unknown): v is OrderLine {
  return (
    object(v) &&
    (v.product_id === null || whole(v.product_id, 1)) &&
    text(v.product_name) &&
    size(v.size) &&
    whole(v.quantity, 1) &&
    money(v.unit_price) &&
    money(v.line_total)
  );
}
export function order(v: unknown): v is Order {
  return (
    object(v) &&
    number(v.order_number) &&
    isState(v.state) &&
    Array.isArray(v.lines) &&
    v.lines.length > 0 &&
    v.lines.every(orderLine) &&
    money(v.total) &&
    typeof v.currency === "string" &&
    /^[A-Z]{3}$/.test(v.currency) &&
    digest(v.csrf_token)
  );
}
export function replay(
  v: unknown,
): v is { order_number: string; state: State } {
  return object(v) && number(v.order_number) && isState(v.state);
}
/** The provider page address, only as an absolute `https:` URL. */
export function paymentUrl(v: unknown): string | null {
  if (!object(v) || typeof v.payment_url !== "string") return null;
  try {
    return new URL(v.payment_url).protocol === "https:" ? v.payment_url : null;
  } catch {
    return null;
  }
}
export function unavailableIds(e: GuestError): number[] | null {
  const ids = object(e.detail) ? e.detail.product_ids : null;
  return e.code === "items_unavailable" &&
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((id) => whole(id, 1))
    ? ids
    : null;
}
export function changedQuote(e: GuestError): Quote | null {
  const value = object(e.detail) ? e.detail.quote : null;
  return e.code === "quote_changed" && quote(value) ? value : null;
}
export function closedState(e: GuestError): "paid" | "cancelled" | null {
  const state = object(e.detail) ? e.detail.state : null;
  return e.code === "order_not_payable" &&
    (state === "paid" || state === "cancelled")
    ? state
    : null;
}
/** Minutes for the "try later" text; at least one. */
export const retryMinutes = (e: GuestError) =>
  Math.max(1, Math.ceil(e.retryAfter / 60));

async function call(
  path: string,
  body?: object,
  csrf?: string,
): Promise<{ status: number; value: unknown }> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GuestError(0, "network");
  }
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    if (response.ok) throw new GuestError(response.status, "invalid_response");
  }
  if (response.ok) return { status: response.status, value };
  const seconds = Number(response.headers.get("Retry-After"));
  throw new GuestError(
    response.status,
    object(value) && typeof value.error === "string"
      ? value.error
      : "unavailable",
    Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 0,
    value,
  );
}
function invalid(status: number): never {
  throw new GuestError(status, "invalid_response");
}

export async function requestQuote(items: Item[]): Promise<Quote> {
  const { status, value } = await call("/quote", { items });
  return status === 200 && quote(value) ? value : invalid(status);
}
export async function readOrder(): Promise<Order> {
  const { status, value } = await call("/order");
  return status === 200 && order(value) ? value : invalid(status);
}
export async function createOrder(
  body: OrderRequest,
): Promise<{ order: Order } | { replay: string }> {
  const { status, value } = await call("/orders", body);
  if (status === 201 && order(value)) return { order: value };
  if (status === 200 && replay(value)) return { replay: value.order_number };
  return invalid(status);
}
export async function startPayment(
  lang: Language,
  csrf: string,
): Promise<string> {
  const { status, value } = await call("/order/payment", { lang }, csrf);
  const url = status === 200 ? paymentUrl(value) : null;
  return url ?? invalid(status);
}

/**
 * One idempotency key per submission scope (basket lines, form values and quote). A new scope,
 * a `quote_changed` answer or "place again" (`reset`) creates a new key; nothing else does.
 */
export function keyHolder(make: () => string = newKey) {
  let held: { scope: string; key: string } | null = null;
  return {
    key(scope: string): string {
      if (held?.scope !== scope) held = { scope, key: make() };
      return held.key;
    },
    reset() {
      held = null;
    },
  };
}

export type Submission =
  | { kind: "created"; order: Order }
  | { kind: "place_again" }
  | { kind: "quote_changed"; quote: Quote }
  | { kind: "unavailable"; ids: number[] }
  | { kind: "refused"; error: GuestError }
  | { kind: "unknown" };
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Send one order submission. An uncertain outcome is resent with the same body and key,
 * automatically at most once; afterwards only a new buyer action resends it. A replay is
 * confirmed by reading this browser's order: another or no order means "place again".
 */
export async function submitOrder(
  body: OrderRequest,
  options: { automatic: boolean; onChecking: () => void },
): Promise<Submission> {
  for (let attempt = 0; ; attempt++) {
    try {
      const created = await createOrder(body);
      if ("order" in created) return { kind: "created", order: created.order };
      try {
        const current = await readOrder();
        return current.order_number === created.replay
          ? { kind: "created", order: current }
          : { kind: "place_again" };
      } catch (e) {
        if (e instanceof GuestError && e.code === "order_not_found")
          return { kind: "place_again" };
        throw e;
      }
    } catch (e) {
      const error = e instanceof GuestError ? e : new GuestError(0, "network");
      if (!uncertain(error)) {
        const next = changedQuote(error),
          ids = unavailableIds(error);
        if (next) return { kind: "quote_changed", quote: next };
        if (ids) return { kind: "unavailable", ids };
        return { kind: "refused", error };
      }
      if (attempt > 0 || !options.automatic) return { kind: "unknown" };
      options.onChecking();
      await sleep(RESEND_DELAY_MS);
    }
  }
}
