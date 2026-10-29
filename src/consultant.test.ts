import { describe, expect, it } from "vitest";
import {
  commercial,
  history,
  parseAnswer,
  QUESTION_LIMIT,
  questionLength,
  type Turn,
} from "./consultant";
import { product } from "./catalogue";

const turn: Turn = {
  request_id: "request",
  tab_id: "tab",
  context_revision: 2,
  language: "ru",
  question: "состав",
  history: [],
  page_product_id: null,
  context_token: null,
};
const raw = {
  request_id: "request",
  context_revision: 2,
  language: "ru",
  status: "clarification",
  answer: "Назовите товар",
  sources: [],
  cautions: [],
  products: [],
  open_product_id: null,
  context_token: "opaque",
  context_expires_at: "2026-10-25T00:30:00Z",
  commercial_checked_at: null,
};
describe("consultant response boundary", () => {
  it("rejects stale envelopes, unsupported source/action references and unexpected fields", () => {
    expect(parseAnswer(raw, turn).status).toBe("clarification");
    for (const patch of [
      { context_revision: 1 },
      { language: "uz" },
      { request_id: "old" },
      { open_product_id: 20 },
      { cautions: ["unknown"] },
      { private_field: "hidden" },
      { context_expires_at: "not a date" },
    ])
      expect(() => parseAnswer({ ...raw, ...patch }, turn)).toThrow();
  });
  it("caps a question at 1,000 code points, counting an emoji or Cyrillic letter once", () => {
    expect(QUESTION_LIMIT).toBe(1000);
    expect(questionLength("Как принимать?")).toBe(14);
    // One astral symbol is two UTF-16 units but one code point.
    expect(questionLength("😀".repeat(3))).toBe(3);
  });
  it("accepts a long answer: 20,000 characters is shown, not an error", () => {
    const answer = "Ответ ".repeat(3334).slice(0, 20000);
    expect(parseAnswer({ ...raw, answer }, turn).answer).toBe(answer);
    expect(() => parseAnswer({ ...raw, answer: " " }, turn)).toThrow();
  });
  it("keeps complete history pairs within both caps", () => {
    const pairs = Array.from({ length: 6 }, (_, i) => ({
      question: String(i),
      answer: "x".repeat(4000),
    }));
    expect(history(pairs).map((p) => p.question)).toEqual(["4", "5"]);
    expect(history(pairs.slice(0, 2))).toHaveLength(2);
  });
  it("detects commercial and size changes without treating descriptions as purchase changes", () => {
    const p = product({
      id: 20,
      name: "Fixture",
      price: "100",
      old_price: null,
      sale_price: null,
      currency: "UZS",
      is_sale: false,
      is_in_stock: true,
      is_purchasable: true,
      requires_size: true,
      stock_quantity: null,
      available_sizes: ["L"],
      category_id: null,
    });
    expect(commercial(p)).not.toBe(commercial({ ...p, available_sizes: [] }));
    expect(commercial(p)).not.toBe(commercial({ ...p, price: "101" }));
    expect(commercial(p)).toBe(
      commercial({ ...p, description: "New description" }),
    );
  });
});
