import { expect, test } from "vitest";
import {
  changeSelection,
  parseBasket,
  removePurchased,
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
test("delivery validation equals the guest order limits: trimmed name 1-100 and address 1-300 code points, phone syntax with 9-15 digits in at most 20 characters", () => {
  const value = {
    name: " 李 / Ой ",
    phone: " +998 (90) 123-45.67 ",
    address: " 東京, 1 \r\nвход 2 ",
  };
  const ok = { name: false, phone: false, address: false };
  expect(validateDetails(value)).toEqual(ok);
  for (const name of [
    "a",
    "a".repeat(100),
    ` ${"a".repeat(100)} `,
    "😀".repeat(100),
  ])
    expect(validateDetails({ ...value, name }).name, name).toBe(false);
  for (const name of [
    "",
    " \n ",
    "a".repeat(101),
    "😀".repeat(101),
    "a\tb",
    "a\u007fb",
    "a\u0085b",
    "a\nb",
  ])
    expect(validateDetails({ ...value, name }).name, JSON.stringify(name)).toBe(
      true,
    );
  for (const address of ["a", "a".repeat(300), "line 1\nline 2\r\nline 3"])
    expect(validateDetails({ ...value, address }).address, address).toBe(false);
  for (const address of ["", " \t ", "a".repeat(301), "a\tb", "a\u0000b"])
    expect(
      validateDetails({ ...value, address }).address,
      JSON.stringify(address),
    ).toBe(true);
  for (const phone of [
    "901234567",
    "+998901234567",
    "123456789012345",
    "1 ".repeat(9) + "12",
    ` ${"1 ".repeat(9)}12 `,
    "(90) 123.45-67",
  ])
    expect(validateDetails({ ...value, phone }).phone, phone).toBe(false);
  for (const phone of [
    "",
    "12345678",
    "1234567890123456",
    "1 ".repeat(10) + "1",
    "a123456789",
    "1+23456789",
    "++123456789",
    "123456789/",
    "12345\t6789",
    "１２３４５６７８９",
  ])
    expect(
      validateDetails({ ...value, phone }).phone,
      JSON.stringify(phone),
    ).toBe(true);
});
test("a paid order removes exactly its product and size lines, keeps others and repeats without change", () => {
  const items = [
    { product_id: 4004, size: null, quantity: 2 },
    { product_id: 4001, size: "L", quantity: 1 },
    { product_id: 4001, size: "XL", quantity: 3 },
    { product_id: 4005, size: null, quantity: 1 },
  ];
  const paid = [
    { product_id: 4004, size: null },
    { product_id: 4001, size: "L" },
    { product_id: null, size: null },
  ];
  const kept = removePurchased(items, paid);
  expect(kept).toEqual([
    { product_id: 4001, size: "XL", quantity: 3 },
    { product_id: 4005, size: null, quantity: 1 },
  ]);
  expect(removePurchased(kept, paid)).toBe(kept);
  expect(removePurchased(items, [{ product_id: 4001, size: null }])).toBe(
    items,
  );
});
