import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changedQuote,
  closedState,
  GuestError,
  keyHolder,
  order,
  paymentUrl,
  quote,
  readOrder,
  replay,
  RESEND_DELAY_MS,
  retryMinutes,
  startPayment,
  submitOrder,
  unavailableIds,
  type OrderRequest,
} from "./guest";
import { href, parseLocation, returnAddress } from "./navigation";

const quoteLine = {
  product_id: 4004,
  product_name: "Item",
  quantity: 2,
  unit_price: "100000.00",
  line_total: "200000.00",
  size: null,
};
const validQuote = {
  lines: [quoteLine, { ...quoteLine, product_id: 4001, size: "L" }],
  subtotal: "400000.00",
  delivery_fee: "0.00",
  total: "400000.00",
  max_redeemable: 0,
  points_to_apply: 0,
  quote_fingerprint: "a".repeat(64),
};
const orderLine = {
  product_id: 4004,
  product_name: "Item",
  size: null,
  quantity: 2,
  unit_price: "100000.00",
  line_total: "200000.00",
};
const validOrder = {
  order_number: "ORD-20261026120000-ABC123",
  state: "awaiting_payment",
  lines: [orderLine, { ...orderLine, product_id: null, size: "XL" }],
  total: "400000.00",
  currency: "UZS",
  csrf_token: "b".repeat(64),
};
/** Copy `base` with one key changed; `undefined` removes the key. */
function variant(base: Record<string, unknown>, key: string, value: unknown) {
  const copy = { ...base };
  if (value === undefined) delete copy[key];
  else copy[key] = value;
  return copy;
}

describe("guest response validators", () => {
  it("accept the S2 shapes and reject missing, wrongly typed and wrong-format fields", () => {
    expect(quote(validQuote)).toBe(true);
    for (const [key, value] of [
      ["lines", undefined],
      ["lines", []],
      ["subtotal", undefined],
      ["subtotal", 400000],
      ["delivery_fee", null],
      ["total", "400000"],
      ["total", "4e5.00"],
      ["max_redeemable", "0"],
      ["points_to_apply", -1],
      ["quote_fingerprint", "A".repeat(64)],
      ["quote_fingerprint", "a".repeat(63)],
    ] as const)
      expect(quote(variant(validQuote, key, value)), key).toBe(false);
    for (const [key, value] of [
      ["product_id", "4004"],
      ["product_id", 0],
      ["product_name", ""],
      ["quantity", 0],
      ["quantity", 1.5],
      ["unit_price", "100000.0"],
      ["unit_price", 100000],
      ["line_total", undefined],
      ["size", undefined],
      ["size", ""],
    ] as const)
      expect(
        quote({ ...validQuote, lines: [variant(quoteLine, key, value)] }),
        `line ${key}`,
      ).toBe(false);

    expect(order(validOrder)).toBe(true);
    for (const [key, value] of [
      ["order_number", undefined],
      ["order_number", 5],
      ["order_number", "ORD 1"],
      ["state", "pending"],
      ["lines", []],
      ["total", "1"],
      ["currency", "uzs"],
      ["currency", undefined],
      ["csrf_token", "b".repeat(63)],
      ["csrf_token", "B".repeat(64)],
    ] as const)
      expect(order(variant(validOrder, key, value)), key).toBe(false);
    for (const [key, value] of [
      ["product_id", "4004"],
      ["product_id", 0],
      ["product_name", undefined],
      ["size", 1],
      ["quantity", 1.5],
      ["unit_price", "1"],
      ["line_total", null],
    ] as const)
      expect(
        order({ ...validOrder, lines: [variant(orderLine, key, value)] }),
        `line ${key}`,
      ).toBe(false);

    expect(
      replay({ order_number: validOrder.order_number, state: "paid" }),
    ).toBe(true);
    expect(
      replay({ order_number: validOrder.order_number, state: "new" }),
    ).toBe(false);
    expect(replay({ state: "paid" })).toBe(false);
  });

  it("accept only an absolute https payment address", () => {
    expect(
      paymentUrl({ payment_url: "https://pay.example.test/i/1?x=2" }),
    ).toBe("https://pay.example.test/i/1?x=2");
    for (const payment_url of [
      "http://pay.example.test/i/1",
      "javascript:alert(1)",
      "/pay",
      "//pay.example.test/i/1",
      "",
      42,
    ])
      expect(paymentUrl({ payment_url }), String(payment_url)).toBeNull();
    expect(paymentUrl(null)).toBeNull();
  });

  it("read refusal details only when the code and its fields are valid", () => {
    const ids = new GuestError(409, "items_unavailable", 0, {
      error: "items_unavailable",
      product_ids: [4002, 4003],
    });
    expect(unavailableIds(ids)).toEqual([4002, 4003]);
    expect(
      unavailableIds(
        new GuestError(409, "items_unavailable", 0, { product_ids: ["1"] }),
      ),
    ).toBeNull();
    expect(
      changedQuote(
        new GuestError(409, "quote_changed", 0, { quote: validQuote }),
      ),
    ).toEqual(validQuote);
    expect(
      changedQuote(new GuestError(409, "quote_changed", 0, { quote: {} })),
    ).toBeNull();
    expect(
      closedState(
        new GuestError(409, "order_not_payable", 0, { state: "paid" }),
      ),
    ).toBe("paid");
    expect(
      closedState(
        new GuestError(409, "order_not_payable", 0, {
          state: "awaiting_payment",
        }),
      ),
    ).toBeNull();
    expect(retryMinutes(new GuestError(429, "try_later", 61))).toBe(2);
    expect(retryMinutes(new GuestError(429, "try_later", 0))).toBe(1);
  });
});

describe("idempotency key lifecycle", () => {
  it("keeps one 32-hex key per submission scope and changes it only for a new scope or reset", () => {
    const keys = keyHolder();
    const first = keys.key("basket-1|form-1|quote-1");
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(keys.key("basket-1|form-1|quote-1")).toBe(first);
    const changed = keys.key("basket-1|form-1|quote-2");
    expect(changed).toMatch(/^[0-9a-f]{32}$/);
    expect(changed).not.toBe(first);
    keys.reset();
    const again = keys.key("basket-1|form-1|quote-2");
    expect(again).not.toBe(changed);
    expect(keys.key("basket-1|form-1|quote-2")).toBe(again);
  });
});

const request: OrderRequest = {
  items: [{ product_id: 4004, quantity: 2, size: null }],
  quote_fingerprint: "a".repeat(64),
  name: "Name",
  phone: "+998901234567",
  address: "Address",
  accept_terms: true,
  idempotency_key: "c".repeat(32),
};
const json = (status: number, body: unknown, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    ...(headers ? { headers } : {}),
  });
function stubFetch(...answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = answers.shift();
      if (!next) throw new Error("unexpected request");
      if (next instanceof Error) throw next;
      return next;
    }),
  );
  return calls;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("order submission", () => {
  it("resends an uncertain outcome once automatically with the same key, then waits for the buyer", async () => {
    vi.useFakeTimers();
    for (const failure of [
      new TypeError("Failed to fetch"),
      new DOMException("The operation timed out.", "TimeoutError"),
      json(503, { error: "service_unavailable" }),
      json(201, '{"order_number":'),
    ]) {
      const calls = stubFetch(failure, json(502, "<html>"));
      const onChecking = vi.fn();
      const pending = submitOrder(request, { automatic: true, onChecking });
      await vi.advanceTimersByTimeAsync(RESEND_DELAY_MS);
      expect(await pending).toEqual({ kind: "unknown" });
      expect(onChecking).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(2);
      expect(calls.map((c) => c.init.body)).toEqual([
        JSON.stringify(request),
        JSON.stringify(request),
      ]);
    }
    const calls = stubFetch(new TypeError("Failed to fetch"));
    const onChecking = vi.fn();
    expect(
      await submitOrder(request, { automatic: false, onChecking }),
    ).toEqual({
      kind: "unknown",
    });
    expect(onChecking).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("sends the S2 request and returns the created order after a lost first answer", async () => {
    vi.useFakeTimers();
    const calls = stubFetch(
      new TypeError("Failed to fetch"),
      json(201, validOrder),
    );
    const pending = submitOrder(request, {
      automatic: true,
      onChecking: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(RESEND_DELAY_MS);
    expect(await pending).toEqual({ kind: "created", order: validOrder });
    for (const { url, init } of calls) {
      expect(url).toBe("/api/v1/guest/orders");
      expect(init).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("confirms a replay through this browser's order and otherwise asks to place again", async () => {
    const replayed = json(200, {
      order_number: validOrder.order_number,
      state: "awaiting_payment",
    });
    let calls = stubFetch(replayed.clone(), json(200, validOrder));
    expect(
      await submitOrder(request, { automatic: true, onChecking: vi.fn() }),
    ).toEqual({ kind: "created", order: validOrder });
    expect(calls[1]?.url).toBe("/api/v1/guest/order");
    expect(calls[1]?.init).toMatchObject({ method: "GET" });
    expect(calls[1]?.init.body).toBeUndefined();
    for (const second of [
      json(404, { error: "order_not_found" }),
      json(200, { ...validOrder, order_number: "ORD-20261026120000-OTHER1" }),
    ]) {
      calls = stubFetch(replayed.clone(), second);
      expect(
        await submitOrder(request, { automatic: true, onChecking: vi.fn() }),
      ).toEqual({ kind: "place_again" });
      expect(calls).toHaveLength(2);
    }
  });

  it("maps definitive refusals without resending", async () => {
    const cases: [Response, unknown][] = [
      [
        json(409, { error: "quote_changed", quote: validQuote }),
        { kind: "quote_changed", quote: validQuote },
      ],
      [
        json(409, { error: "items_unavailable", product_ids: [4003] }),
        { kind: "unavailable", ids: [4003] },
      ],
    ];
    for (const [answer, expected] of cases) {
      const calls = stubFetch(answer);
      expect(
        await submitOrder(request, { automatic: true, onChecking: vi.fn() }),
      ).toEqual(expected);
      expect(calls).toHaveLength(1);
    }
    for (const [answer, code, retry] of [
      [
        json(429, { error: "try_later" }, { "Retry-After": "120" }),
        "try_later",
        120,
      ],
      [json(422, { error: "order_too_large" }), "order_too_large", 0],
      [
        json(404, { error: "guest_checkout_disabled" }),
        "guest_checkout_disabled",
        0,
      ],
      [json(422, { error: "invalid_request" }), "invalid_request", 0],
    ] as const) {
      const calls = stubFetch(answer);
      const result = await submitOrder(request, {
        automatic: true,
        onChecking: vi.fn(),
      });
      expect(result.kind).toBe("refused");
      if (result.kind === "refused") {
        expect(result.error.code).toBe(code);
        expect(result.error.retryAfter).toBe(retry);
      }
      expect(calls).toHaveLength(1);
    }
  });
});

describe("status and payment requests", () => {
  it("send the CSRF header and language, and refuse a non-https payment address", async () => {
    let calls = stubFetch(
      json(200, { payment_url: "https://pay.example.test/1" }),
    );
    expect(await startPayment("uz", "d".repeat(64))).toBe(
      "https://pay.example.test/1",
    );
    expect(calls[0]?.url).toBe("/api/v1/guest/order/payment");
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      body: '{"lang":"uz"}',
      headers: { "X-CSRF-Token": "d".repeat(64) },
    });
    calls = stubFetch(json(200, { payment_url: "http://pay.example.test/1" }));
    await expect(startPayment("ru", "d".repeat(64))).rejects.toMatchObject({
      code: "invalid_response",
    });
    stubFetch(json(200, { ...validOrder, csrf_token: undefined }));
    await expect(readOrder()).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("order view address", () => {
  it("routes #order and converts the payment return query", () => {
    expect(parseLocation("#order?lang=uz")).toEqual({
      view: "order",
      lang: "uz",
      page: 1,
    });
    expect(href({ view: "order", lang: "uz", page: 1 })).toBe(
      "/#order?lang=uz",
    );
    expect(returnAddress("?view=order&lang=uz")).toBe("/#order?lang=uz");
    expect(returnAddress("?view=order")).toBe("/#order?lang=ru");
    expect(returnAddress("?view=order&lang=en&invoice_id=7")).toBe(
      "/#order?lang=ru",
    );
    expect(returnAddress("?lang=uz")).toBeNull();
    expect(returnAddress("")).toBeNull();
  });
});
