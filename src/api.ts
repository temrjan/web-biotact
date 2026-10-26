/** Runtime-checked private API boundary. Credentials stay in HttpOnly cookies. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retry: number,
  ) {
    super(code);
  }
}
export const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const time = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const hex = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
interface Proof {
  csrf_token: string;
  expires_at: string;
}
export interface Context extends Proof {
  telegram_enabled: boolean;
}
export interface Session extends Proof {
  user: { id: number; telegram_id: number | null };
  authenticated_at: string;
}
export interface Attempt {
  request_id: string;
  state:
    | "pending"
    | "approved"
    | "declined"
    | "expired"
    | "cancelled"
    | "completed";
  created_at: string;
  expires_at: string;
  comparison: string;
  bot_url: string;
  delivery: string;
}
export interface Club {
  is_member: boolean;
  tier: "newbie" | "biotact_friend";
  balance: number;
  available: number;
  reserved_until: string | null;
}
function proof(v: unknown): v is Proof {
  return (
    object(v) &&
    typeof v.csrf_token === "string" &&
    /^[0-9a-f]{64}$/.test(v.csrf_token) &&
    time(v.expires_at)
  );
}
export function context(v: unknown): v is Context {
  return proof(v) && object(v) && typeof v.telegram_enabled === "boolean";
}
export function session(v: unknown): v is Session {
  return (
    proof(v) &&
    object(v) &&
    object(v.user) &&
    Number.isSafeInteger(v.user.id) &&
    typeof v.user.id === "number" &&
    v.user.id > 0 &&
    (v.user.telegram_id === null ||
      (typeof v.user.telegram_id === "number" &&
        Number.isSafeInteger(v.user.telegram_id) &&
        v.user.telegram_id > 0)) &&
    time(v.authenticated_at)
  );
}
export function attempt(v: unknown): v is Attempt {
  if (
    !object(v) ||
    !hex(v.request_id) ||
    typeof v.state !== "string" ||
    ![
      "pending",
      "approved",
      "declined",
      "expired",
      "cancelled",
      "completed",
    ].includes(v.state) ||
    !time(v.created_at) ||
    !time(v.expires_at) ||
    typeof v.comparison !== "string" ||
    !/^\d{6}$/.test(v.comparison) ||
    typeof v.bot_url !== "string" ||
    typeof v.delivery !== "string" ||
    !["not_requested", "sending", "sent", "unavailable", "uncertain"].includes(
      v.delivery,
    )
  )
    return false;
  return new RegExp(
    "^https://t\\.me/[A-Za-z0-9_]{5,32}\\?start=web_" + v.request_id + "$",
  ).test(v.bot_url);
}
export function club(v: unknown): v is Club {
  return (
    object(v) &&
    typeof v.is_member === "boolean" &&
    ["newbie", "biotact_friend"].includes(String(v.tier)) &&
    typeof v.balance === "number" &&
    Number.isSafeInteger(v.balance) &&
    typeof v.available === "number" &&
    Number.isSafeInteger(v.available) &&
    v.available >= 0 &&
    (v.reserved_until === null || time(v.reserved_until))
  );
}
export async function request<T>(
  path: string,
  valid: (v: unknown) => v is T,
  csrf?: string,
  body?: object,
): Promise<T> {
  const response = await fetch("/api/v1/buyer/auth" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value: unknown = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      object(value) && typeof value.error === "string"
        ? value.error
        : "unavailable",
      Math.max(1, Number(response.headers.get("Retry-After")) || 6),
    );
  if (!valid(value)) throw new ApiError(503, "invalid_response", 6);
  return value;
}
export const empty = (v: unknown): v is null => v === null;
export function newKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export const STORAGE = "biotact.tg1.request";
export interface Saved {
  key: string;
  id?: string;
}
export function saved(): Saved | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || "null");
    if (object(raw) && hex(raw.key) && (raw.id === undefined || hex(raw.id)))
      return raw.id === undefined
        ? { key: raw.key }
        : { key: raw.key, id: raw.id };
  } catch {
    /* Storage is optional. */
  }
  return null;
}
export function save(value: Saved | null): void {
  try {
    if (value) sessionStorage.setItem(STORAGE, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE);
  } catch {
    /* A reload may require a fresh login. */
  }
}
