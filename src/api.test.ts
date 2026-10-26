import { describe, it, expect } from "vitest";
import { attempt, club, context, session } from "./api";
describe("external data boundaries", () => {
  it("refuses untrusted links, actor strings and invalid session proofs", () => {
    expect(
      attempt({
        request_id: "a".repeat(32),
        state: "pending",
        created_at: "2030-01-01",
        expires_at: "2030-01-01",
        comparison: "123456",
        bot_url: "https://evil.test",
        delivery: "sent",
      }),
    ).toBe(false);
    expect(
      session({
        csrf_token: "a".repeat(64),
        expires_at: "2030-01-01",
        authenticated_at: "2030-01-01",
        user: { id: 1, telegram_id: "2" },
      }),
    ).toBe(false);
    expect(context({ csrf_token: "short", expires_at: "2030-01-01" })).toBe(
      false,
    );
  });
  it("distinguishes a non-member ledger balance from available points", () => {
    expect(
      club({
        is_member: false,
        tier: "newbie",
        balance: 120,
        available: 0,
        reserved_until: null,
      }),
    ).toBe(true);
    expect(
      club({
        is_member: true,
        tier: "newbie",
        balance: 120,
        available: -1,
        reserved_until: null,
      }),
    ).toBe(false);
  });
});

describe("context entry capability", () => {
  const base = {
    csrf_token: "a".repeat(64),
    expires_at: "2030-01-01T00:00:00Z",
  };
  it("requires a boolean capability without adding it to session credentials", () => {
    expect(context(base)).toBe(false);
    expect(context({ ...base, telegram_enabled: "true" })).toBe(false);
    expect(context({ ...base, telegram_enabled: false })).toBe(true);
    expect(context({ ...base, telegram_enabled: true })).toBe(true);
    expect(
      session({
        ...base,
        user: { id: 1, telegram_id: 2 },
        authenticated_at: "2030-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });
});
