/** Synthetic HTTP boundary for CI UI tests; never evidence of Shop authentication. */
import { randomBytes } from "node:crypto";
import { guest } from "./guest.boundary.mjs";
const contexts = new Map(),
  attempts = new Map(),
  sessions = new Map();
const token = () => randomBytes(32).toString("hex");
const cookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie || "")
      .split("; ")
      .filter(Boolean)
      .map((x) => x.split("=")),
  );
const set = (res, name, value) =>
  res.setHeader(
    "Set-Cookie",
    `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax`,
  );
export async function boundary(req, res) {
  const path = new URL(req.url, "https://localhost:4173").pathname;
  if (path === "/api/v1/guest" || path.startsWith("/api/v1/guest/"))
    return guest(req, res);
  const jar = cookies(req);
  let input = {};
  for await (const chunk of req) {
    input = { ...input, ...JSON.parse(chunk.toString() || "{}") };
  }
  const reply = (status, value) => {
    res.statusCode = status;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(value === null ? "" : JSON.stringify(value));
  };
  const c = contexts.get(jar["__Host-biotact_auth"]);
  const s = sessions.get(jar["__Host-biotact_buyer"]);
  const shape = (s) => ({
    user: { id: s.actor, telegram_id: s.actor },
    csrf_token: s.csrf,
    authenticated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
  if (path.endsWith("/context")) {
    if (c) {
      reply(200, {
        csrf_token: c.csrf,
        expires_at: c.expires,
        telegram_enabled: process.env.TG1_BROWSER_EMAIL_ONLY !== "1",
      });
      return;
    }
    const id = token();
    const next = {
      csrf: token(),
      expires: new Date(Date.now() + 1800000).toISOString(),
    };
    contexts.set(id, next);
    set(res, "__Host-biotact_auth", id);
    reply(200, {
      csrf_token: next.csrf,
      expires_at: next.expires,
      telegram_enabled: process.env.TG1_BROWSER_EMAIL_ONLY !== "1",
    });
    return;
  }
  if (path.endsWith("/session")) {
    reply(
      s && !s.revoked ? 200 : 401,
      s && !s.revoked ? shape(s) : { error: "invalid_authentication" },
    );
    return;
  }
  if (path.endsWith("/club")) {
    reply(
      s && !s.revoked ? 200 : 401,
      s && !s.revoked
        ? {
            is_member: false,
            tier: "newbie",
            balance: 0,
            available: 0,
            reserved_until: null,
          }
        : { error: "invalid_authentication" },
    );
    return;
  }
  if (path.endsWith("/logout")) {
    if (c) {
      for (const row of attempts.values())
        if (row.context === c) {
          if (row.session) row.session.revoked = true;
          else row.state = "cancelled";
        }
    }
    if (s) s.revoked = true;
    res.setHeader("Set-Cookie", [
      "__Host-biotact_auth=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
      "__Host-biotact_buyer=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    ]);
    reply(204, null);
    return;
  }
  if (path.includes("/bot/buyer/telegram/")) {
    const row = attempts.get(input.request_id);
    if (!row) {
      reply(401, { error: "invalid_authentication" });
      return;
    }
    if (row.state === "pending") {
      row.state = input.decision === "confirm" ? "approved" : "declined";
      row.actor = input.telegram_id;
    }
    reply(200, { state: row.state });
    return;
  }
  if (!c) {
    reply(401, { error: "invalid_authentication" });
    return;
  }
  const shapeRow = (row) => ({
    request_id: row.id,
    state: row.state,
    created_at: row.created,
    expires_at: row.expires,
    comparison: "123456",
    bot_url: `https://t.me/synthetic_bot?start=web_${row.id}`,
    delivery: "not_requested",
  });
  if (path.endsWith("/requests")) {
    const rows = [...attempts.values()].filter((row) => row.context === c);
    const previous = rows.find((row) => row.key === input.request_key);
    if (previous) {
      reply(202, shapeRow(previous));
      return;
    }
    if (rows.some((row) => row.state === "completed") || (s && !s.revoked)) {
      reply(409, { error: "already_authenticated" });
      return;
    }
    for (const row of rows)
      if (["pending", "approved"].includes(row.state)) row.state = "cancelled";
    const row = {
      id: randomBytes(16).toString("hex"),
      key: input.request_key,
      context: c,
      state: "pending",
      created: new Date().toISOString(),
      expires: new Date(Date.now() + 600000).toISOString(),
    };
    attempts.set(row.id, row);
    reply(202, shapeRow(row));
    return;
  }
  const row = attempts.get(input.request_id);
  if (!row || row.context !== c) {
    reply(401, { error: "invalid_authentication" });
    return;
  }
  if (path.endsWith("/status")) {
    reply(200, shapeRow(row));
    return;
  }
  if (path.endsWith("/cancel")) {
    if (["pending", "approved"].includes(row.state)) row.state = "cancelled";
    reply(200, shapeRow(row));
    return;
  }
  if (path.endsWith("/complete")) {
    if (row.state === "approved") {
      row.state = "completed";
      row.session = {
        actor: row.actor,
        csrf: token(),
        token: token(),
        revoked: false,
      };
      sessions.set(row.session.token, row.session);
    }
    if (row.state !== "completed" || row.session.revoked) {
      reply(401, { error: "invalid_authentication" });
      return;
    }
    set(res, "__Host-biotact_buyer", row.session.token);
    reply(200, shape(row.session));
    return;
  }
  reply(404, { error: "unavailable" });
}
