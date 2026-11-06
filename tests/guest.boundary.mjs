/**
 * Synthetic guest checkout boundary for browser UI tests: the HTTP contract of G1 spec S2
 * (§4–§6) with in-memory orders, a provider page substitute and test controls. It is never
 * evidence of the Shop implementation, its database, rate limits or provider behaviour.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ORIGIN = "https://localhost:4173";
const COOKIE = "__Host-biotact_guest";
const protection = randomBytes(32);
const keyed = (purpose, value) =>
  createHmac("sha256", protection).update(`${purpose}\n${value}`).digest("hex");
const cents = (money) => Math.round(Number(money) * 100);
const money = (value) =>
  `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
const object = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v, keys) =>
  object(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => k in v);
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const length = (s) => [...s].length;
const controlChar = (s, allowed = "") =>
  [...s].some((c) => {
    const n = c.charCodeAt(0);
    return (n < 0x20 || (n >= 0x7f && n <= 0x9f)) && !allowed.includes(c);
  });

let products, orders, faults, counters;
/** Catalogue ids 4001…4045 as in tests/catalogue.fixture.ts; prices and stock are server-owned. */
export function reset() {
  products = new Map();
  for (let i = 0; i < 45; i++)
    products.set(4001 + i, {
      name: `Server product ${4001 + i}`,
      price: i === 0 ? "98765.43" : "112233.44",
      sizes: i === 0 ? { L: 50, XL: 50 } : null,
      available: i !== 1 && i !== 2,
    });
  orders = [];
  faults = new Map();
  counters = {
    quote: 0,
    create: 0,
    read: 0,
    payment: 0,
    invoices: 0,
    messages: 0,
  };
}
reset();

function reply(res, status, value, headers = {}) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(value));
}
const fail = (res, status, error, extra = {}, headers = {}) =>
  reply(res, status, { error, ...extra }, headers);
function cookie(req) {
  for (const part of (req.headers.cookie || "").split("; ")) {
    const [name, value] = part.split("=");
    if (name === COOKIE) return value;
  }
  return null;
}
const state = (o) =>
  o.status === "cancelled" || ["failed", "refunded"].includes(o.payment)
    ? "cancelled"
    : o.payment === "paid"
      ? "paid"
      : "awaiting_payment";
function projection(o, secret) {
  return {
    order_number: o.number,
    state: state(o),
    lines: o.lines.map((l) => ({
      product_id: l.product_id,
      product_name: l.product_name,
      size: l.size,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
    })),
    total: o.total,
    currency: "UZS",
    csrf_token: keyed("guest-csrf", `${secret}:${o.reads}`),
  };
}
function validItems(items) {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.every(
      (i) =>
        exact(i, ["product_id", "quantity", "size"]) &&
        int(i.product_id, 1, 2147483647) &&
        int(i.quantity, 1, 99) &&
        (i.size === null ||
          (typeof i.size === "string" &&
            i.size.length >= 1 &&
            i.size.length <= 3)),
    )
  );
}
const tooLarge = (items) =>
  items.length > 20 ||
  items.filter((i) => i.size !== null).reduce((n, i) => n + i.quantity, 0) > 10;
function price(items) {
  const refused = new Set();
  for (const i of items) {
    const p = products.get(i.product_id);
    if (
      !p ||
      !p.available ||
      (p.sizes
        ? !(i.size in p.sizes) || p.sizes[i.size] < i.quantity
        : i.size !== null)
    )
      refused.add(i.product_id);
  }
  if (refused.size) return { refused: [...refused].sort((a, b) => a - b) };
  const lines = items.map((i) => {
    const p = products.get(i.product_id),
      unit = cents(p.price);
    return {
      product_id: i.product_id,
      product_name: p.name,
      quantity: i.quantity,
      unit_price: money(unit),
      line_total: money(unit * i.quantity),
      size: i.size,
    };
  });
  const total = money(lines.reduce((n, l) => n + cents(l.line_total), 0));
  const canonical = lines.map((l) => [
    l.product_id,
    l.size,
    l.quantity,
    l.unit_price,
    l.line_total,
  ]);
  return {
    quote: {
      lines,
      subtotal: total,
      delivery_fee: "0.00",
      total,
      max_redeemable: 0,
      points_to_apply: 0,
      quote_fingerprint: createHash("sha256")
        .update(JSON.stringify([canonical, total]))
        .digest("hex"),
    },
  };
}
function details(body) {
  const name = typeof body.name === "string" ? body.name.trim() : null,
    phone = typeof body.phone === "string" ? body.phone.trim() : null,
    address = typeof body.address === "string" ? body.address.trim() : null;
  const digits = phone?.replace(/[^0-9]/g, "").length ?? 0;
  return name &&
    length(name) <= 100 &&
    !controlChar(name) &&
    phone !== null &&
    length(phone) <= 20 &&
    /^\+?[0-9 ().-]+$/.test(phone) &&
    digits >= 9 &&
    digits <= 15 &&
    address &&
    length(address) <= 300 &&
    !controlChar(address, "\r\n")
    ? { name, phone: phone.replace(/[^0-9+]/g, ""), address }
    : null;
}
function injected(res, route) {
  const fault = faults.get(route);
  if (!fault || fault.corrupt) return false;
  faults.delete(route);
  if (fault.url) reply(res, 200, { payment_url: fault.url });
  else
    fail(
      res,
      fault.status,
      fault.error,
      fault.state ? { state: fault.state } : {},
      fault.retry ? { "Retry-After": String(fault.retry) } : {},
    );
  return true;
}
function find(secret) {
  return typeof secret === "string" && /^[0-9a-f]{64}$/.test(secret)
    ? orders.find((o) => o.access === keyed("guest-access", secret))
    : undefined;
}

/** Serve `/api/v1/guest/*` with the S2 boundary precedence: origin/host, JSON, body cap, route. */
export async function guest(req, res) {
  const path = new URL(req.url, ORIGIN).pathname.replace(
    /^\/api\/v1\/guest/,
    "",
  );
  const post = req.method === "POST";
  if (
    (post || req.headers.origin !== undefined) &&
    (req.headers.origin !== ORIGIN || req.headers.host !== "localhost:4173")
  )
    return fail(res, 403, "request_forbidden");
  if (
    post &&
    (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase() !==
      "application/json"
  )
    return fail(res, 415, "json_required");
  let raw = "",
    size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) return fail(res, 413, "request_too_large");
    raw += chunk.toString("utf8");
  }
  let body = null;
  if (post)
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(res, 422, "invalid_request");
    }
  if (post && path === "/quote") {
    counters.quote++;
    if (!exact(body, ["items"]) || !validItems(body.items))
      return fail(res, 422, "invalid_request");
    if (tooLarge(body.items)) return fail(res, 422, "order_too_large");
    if (injected(res, "quote")) return;
    const priced = price(body.items);
    return priced.refused
      ? fail(res, 409, "items_unavailable", { product_ids: priced.refused })
      : reply(res, 200, priced.quote);
  }
  if (post && path === "/orders") {
    counters.create++;
    const fields = [
      "items",
      "quote_fingerprint",
      "name",
      "phone",
      "address",
      "accept_terms",
      "idempotency_key",
    ];
    const known =
      object(body) && Object.keys(body).every((k) => fields.includes(k));
    const contact = object(body) ? details(body) : null;
    if (
      !known ||
      !validItems(body.items) ||
      typeof body.quote_fingerprint !== "string" ||
      !/^[0-9a-f]{64}$/.test(body.quote_fingerprint) ||
      typeof body.idempotency_key !== "string" ||
      !/^[0-9a-f]{32}$/.test(body.idempotency_key) ||
      !contact
    )
      return fail(res, 422, "invalid_request");
    if (body.accept_terms !== true) return fail(res, 422, "terms_not_accepted");
    if (tooLarge(body.items)) return fail(res, 422, "order_too_large");
    if (injected(res, "create")) return;
    const idempotency = keyed("guest-idempotency", body.idempotency_key);
    const previous = orders.find((o) => o.idempotency === idempotency);
    if (previous)
      return reply(res, 200, {
        order_number: previous.number,
        state: state(previous),
      });
    const priced = price(body.items);
    if (priced.refused)
      return fail(res, 409, "items_unavailable", {
        product_ids: priced.refused,
      });
    if (priced.quote.quote_fingerprint !== body.quote_fingerprint)
      return fail(res, 409, "quote_changed", { quote: priced.quote });
    for (const i of body.items)
      if (i.size !== null)
        products.get(i.product_id).sizes[i.size] -= i.quantity;
    const secret = randomBytes(32).toString("hex");
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const o = {
      number: `ORD-${stamp}-${randomBytes(3).toString("hex").toUpperCase()}`,
      access: keyed("guest-access", secret),
      idempotency,
      key: body.idempotency_key,
      lines: priced.quote.lines,
      total: priced.quote.total,
      contact,
      status: "pending",
      payment: "unpaid",
      reads: 0,
      checkout: null,
      back: null,
    };
    orders.push(o);
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${secret}; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax`,
    );
    const fault = faults.get("create");
    if (fault?.corrupt) {
      faults.delete("create");
      res.statusCode = 201;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      return res.end('{"order_number":');
    }
    return reply(res, 201, projection(o, secret));
  }
  if (!post && path === "/order") {
    counters.read++;
    if (injected(res, "order")) return;
    const secret = cookie(req),
      o = find(secret);
    if (!o) return fail(res, 404, "order_not_found");
    o.reads++;
    return reply(res, 200, projection(o, secret));
  }
  if (post && path === "/order/payment") {
    counters.payment++;
    if (!exact(body, ["lang"]) || !["ru", "uz"].includes(body.lang))
      return fail(res, 422, "invalid_request");
    const secret = cookie(req);
    if (typeof secret !== "string" || !/^[0-9a-f]{64}$/.test(secret))
      return fail(res, 404, "order_not_found");
    const o = find(secret);
    const expected = Buffer.from(
        keyed("guest-csrf", o ? `${secret}:${o.reads}` : secret),
      ),
      given = Buffer.from(String(req.headers["x-csrf-token"] || ""));
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return fail(res, 403, "request_forbidden");
    if (injected(res, "payment")) return;
    if (!o) return fail(res, 404, "order_not_found");
    if (state(o) !== "awaiting_payment")
      return fail(res, 409, "order_not_payable", { state: state(o) });
    if (o.checkout) return reply(res, 200, { payment_url: o.checkout });
    counters.invoices++;
    // PY-02 (c): the return address comes from the configured website origin only.
    o.back = `${ORIGIN}/?view=order&lang=${body.lang}`;
    o.checkout = `${ORIGIN}/__test/guest/pay?invoice=${o.number}`;
    o.payment = "pending";
    counters.messages++;
    return reply(res, 200, { payment_url: o.checkout });
  }
  return fail(res, 404, "not_found");
}

/** Test controls under `/__test/guest/`; the payment page stands in for the provider page. */
export function control(req, res, url) {
  const q = url.searchParams,
    op = url.pathname.replace("/__test/guest/", "");
  const done = (value = { ok: true }) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(value));
  };
  const target = orders.find((o) => o.number === q.get("invoice"));
  if (op === "reset") {
    reset();
    return done();
  }
  if (op === "state")
    return done({
      counters,
      orders: orders.map((o) => ({
        number: o.number,
        state: state(o),
        payment: o.payment,
        key: o.key,
        lines: o.lines.map((l) => [l.product_id, l.size, l.quantity]),
        contact: o.contact,
      })),
      sizes: products.get(4001).sizes,
    });
  if (op === "product") {
    const p = products.get(Number(q.get("id")));
    if (q.has("price")) p.price = q.get("price");
    if (q.has("available")) p.available = q.get("available") === "1";
    return done();
  }
  if (op === "fault") {
    faults.set(q.get("route"), {
      status: Number(q.get("status")),
      error: q.get("error"),
      retry: Number(q.get("retry")) || 0,
      state: q.get("state"),
      url: q.get("url"),
      corrupt: q.get("corrupt") === "1",
    });
    return done();
  }
  if (op === "cancel" && target) {
    target.status = "cancelled";
    return done();
  }
  // A settled provider callback without the buyer's return (a late callback).
  if (op === "callback" && target) {
    target.payment = "paid";
    return done();
  }
  if (op === "pay" && target?.back) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(
      `<!doctype html><meta charset="utf-8"><title>Synthetic payment page</title>` +
        `<h1>Synthetic payment page (test substitute)</h1><p>${target.number}</p>` +
        `<p><a id="pay" href="/__test/guest/settle?invoice=${target.number}">Pay with signed callback</a></p>` +
        `<p><a id="leave" href="${target.back}">Return without callback</a></p>`,
    );
  }
  // The signed success callback settles the order, then the provider returns the buyer.
  if (op === "settle" && target?.back) {
    target.payment = "paid";
    res.statusCode = 302;
    res.setHeader("Location", target.back);
    return res.end();
  }
  res.statusCode = 404;
  res.end("unknown control");
}
