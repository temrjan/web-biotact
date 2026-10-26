import { expect, test } from "vitest";
import {
  changeSelection,
  parseBasket,
  selectionAvailable,
} from "./guestBasket";
import { validateDetails } from "./GuestDetails";
import { product } from "./catalogue";

const valid = { product_id: 17, size: " L ", quantity: 99 };
const payload = (items: unknown[], version = 1) =>
  JSON.stringify({ version, items });
test("storage boundary preserves exact selections and rejects malformed, duplicate or unsupported data without coercion", () => {
  expect(parseBasket(null)).toEqual([]);
  expect(parseBasket(payload([valid, { ...valid, size: null }]))).toEqual([
    valid,
    { ...valid, size: null },
  ]);
  for (const raw of [
    "{",
    "null",
    "[]",
    payload([], 2),
    JSON.stringify({ items: [] }),
    payload([valid, valid]),
    ...[
      { product_id: 0 },
      { product_id: Number.MAX_SAFE_INTEGER + 1 },
      { product_id: "17" },
      { size: "" },
      { size: 4 },
      { quantity: "1" },
      { quantity: 0 },
      { quantity: 100 },
      { quantity: 1.5 },
      { quantity: null },
      { price: "1" },
    ].map((override) => payload([{ ...valid, ...override }])),
  ]) {
    expect(() => parseBasket(raw), raw).toThrow();
  }
});
test("quantity changes cap each exact variant independently and remove only the requested last unit", () => {
  const l = { product_id: 17, size: "L", quantity: 99 },
    xl = { ...l, size: "XL", quantity: 1 };
  expect(changeSelection([l, xl], 17, "L", 1)).toEqual([l, xl]);
  expect(changeSelection([l, xl], 17, "XL", 1)).toEqual([
    l,
    { ...xl, quantity: 2 },
  ]);
  expect(changeSelection([l, xl], 17, "XL", -1)).toEqual([l]);
  expect(changeSelection([l], 18, null, -1)).toEqual([l]);
});
test("a resolved product never substitutes a removed, missing or obsolete size", () => {
  const p = product({
    id: 17,
    name: "Item",
    price: "10",
    currency: "UZS",
    is_sale: false,
    is_in_stock: true,
    is_purchasable: true,
    requires_size: true,
    stock_quantity: null,
    available_sizes: ["L"],
  });
  expect(selectionAvailable(p, "L")).toBe(true);
  for (const size of [null, "XL", " L "])
    expect(selectionAvailable(p, size)).toBe(false);
  expect(selectionAvailable({ ...p, requires_size: false }, "L")).toBe(false);
  expect(selectionAvailable({ ...p, is_in_stock: false }, "L")).toBe(false);
});
test("delivery validation accepts minimal Unicode details and common phone separators, rejecting only the specified invalid data", () => {
  const value = {
    name: " 李 / Ой ",
    phone: " +1 (2)-3.4 ",
    address: " 東京, 1 \n",
  };
  expect(validateDetails(value)).toEqual({
    name: false,
    phone: false,
    address: false,
  });
  expect(validateDetails({ ...value, phone: "1" }).phone).toBe(false);
  expect(
    validateDetails({ name: " \n", phone: "() .-", address: " \t" }),
  ).toEqual({ name: true, phone: true, address: true });
  for (const phone of ["a12", "1+2", "++1", "1/2", "1\t2", "1\n2"])
    expect(validateDetails({ ...value, phone }).phone, phone).toBe(true);
});
