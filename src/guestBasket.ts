import { useEffect, useState } from "react";
import { detail, ReadError, type Language, type Product } from "./catalogue";

export const BASKET_STORAGE_KEY = "biotact.website.basket.v1";
export interface Selection {
  product_id: number;
  size: string | null;
  quantity: number;
}
export type Resolution =
  | { status: "ready"; product: Product }
  | { status: "loading" | "error" | "missing"; product?: never };
export type BasketEntry = Selection & Resolution;
type Notice = "invalid" | "unavailable" | null;

export function parseBasket(raw: string | null): Selection[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("version" in value) ||
    value.version !== 1 ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    Object.keys(value).some((key) => key !== "version" && key !== "items")
  )
    throw new Error("Invalid basket");
  const identities = new Set<string>();
  return value.items.map((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      !("product_id" in item) ||
      typeof item.product_id !== "number" ||
      !Number.isSafeInteger(item.product_id) ||
      item.product_id <= 0 ||
      !("size" in item) ||
      !(
        item.size === null ||
        (typeof item.size === "string" && item.size.length > 0)
      ) ||
      !("quantity" in item) ||
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99 ||
      Object.keys(item).some(
        (key) => !["product_id", "size", "quantity"].includes(key),
      )
    )
      throw new Error("Invalid basket selection");
    const identity = JSON.stringify([item.product_id, item.size]);
    if (identities.has(identity)) throw new Error("Duplicate basket selection");
    identities.add(identity);
    return {
      product_id: item.product_id,
      size: item.size,
      quantity: item.quantity,
    };
  });
}
export function selectionAvailable(product: Product, size: string | null) {
  return (
    product.is_purchasable &&
    product.is_in_stock &&
    (product.requires_size
      ? size !== null && product.available_sizes.includes(size)
      : size === null)
  );
}
export function changeSelection(
  items: Selection[],
  id: number,
  size: string | null,
  delta: number,
): Selection[] {
  const index = items.findIndex(
    (item) => item.product_id === id && item.size === size,
  );
  const quantity = Math.min(99, (items[index]?.quantity || 0) + delta);
  if (quantity <= 0)
    return index === -1 ? items : items.filter((_, i) => i !== index);
  if (items[index]?.quantity === quantity) return items;
  const item = { product_id: id, size, quantity };
  return index === -1
    ? [...items, item]
    : items.map((old, i) => (i === index ? item : old));
}
function initialBasket() {
  let items: Selection[] = [],
    notice: Notice = null;
  try {
    const raw = localStorage.getItem(BASKET_STORAGE_KEY);
    try {
      items = parseBasket(raw);
    } catch {
      notice = "invalid";
    }
  } catch {
    notice = "unavailable";
  }
  return {
    items,
    notice,
    revision: 0,
    resolutions: {} as Record<string, Resolution>,
  };
}

export function useGuestBasket(lang: Language) {
  // Read before the first persistence effect; never save an unread empty basket.
  const [state, setState] = useState(initialBasket);
  const [retry, setRetry] = useState(0);
  const ids = [...new Set(state.items.map((item) => item.product_id))]
    .sort((a, b) => a - b)
    .join(",");
  const saved = JSON.stringify({ version: 1, items: state.items });
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        localStorage.setItem(BASKET_STORAGE_KEY, saved);
      } catch {
        setState((old) => ({ ...old, notice: "unavailable" }));
      }
    });
    return () => {
      active = false;
    };
  }, [saved]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    for (const id of ids ? ids.split(",").map(Number) : []) {
      const key = `${lang}:${id}`;
      if (state.resolutions[key]) continue;
      void detail(id, lang, controller.signal).then(
        (product) => complete({ status: "ready", product }),
        (error: unknown) =>
          complete({
            status:
              error instanceof ReadError && error.status === 404
                ? "missing"
                : "error",
          }),
      );
      function complete(resolution: Resolution) {
        if (active)
          setState((old) => ({
            ...old,
            revision: old.revision + 1,
            resolutions: { ...old.resolutions, [key]: resolution },
          }));
      }
    }
    return () => {
      active = false;
      controller.abort();
    };
    // IDs, language and deliberate retry own the read lifecycle. Quantities do not restart reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, lang, retry]);
  const entries: BasketEntry[] = state.items.map((item) => ({
    ...item,
    ...(state.resolutions[`${lang}:${item.product_id}`] || {
      status: "loading" as const,
    }),
  }));
  const lines = entries.flatMap((entry) =>
    entry.status === "ready"
      ? [{ product: entry.product, size: entry.size, quantity: entry.quantity }]
      : [],
  );
  function change(product: Product, size: string | null, delta: number) {
    if (delta > 0 && !selectionAvailable(product, size)) return;
    setState((old) => {
      const items = changeSelection(old.items, product.id, size, delta);
      if (items === old.items) return old;
      return {
        ...old,
        items,
        revision: old.revision + 1,
        resolutions: {
          ...old.resolutions,
          [`${lang}:${product.id}`]: { status: "ready", product },
        },
      };
    });
  }
  return {
    entries,
    lines,
    change,
    notice: state.notice,
    revision: state.revision,
    units: state.items.reduce((sum, item) => sum + item.quantity, 0),
    remove(id: number, size: string | null) {
      setState((old) => ({
        ...old,
        revision: old.revision + 1,
        items: old.items.filter(
          (item) => item.product_id !== id || item.size !== size,
        ),
      }));
    },
    retry(id: number) {
      setState((old) => {
        const resolutions = { ...old.resolutions };
        delete resolutions[`${lang}:${id}`];
        return { ...old, revision: old.revision + 1, resolutions };
      });
      setRetry((n) => n + 1);
    },
  };
}
