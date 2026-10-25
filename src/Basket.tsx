import {
  useEffect,
  useRef,
  type KeyboardEventHandler,
  type RefObject,
} from "react";
import { money, price, type Language, type Product } from "./catalogue";

export const basketCopy = {
  ru: {
    title: "Корзина",
    add: "В корзину",
    count: "Количество",
    less: "Уменьшить количество",
    more: "Увеличить количество",
    close: "Закрыть корзину",
    remove: "Убрать",
    empty: "В корзине пока пусто",
    emptyNote: "Добавьте понравившийся товар из каталога.",
    note: "Локальная корзина для просмотра. Выбор сбрасывается при обновлении страницы. Оформление заказа пока недоступно.",
    prices:
      "Цены из каталога на момент добавления. Товары не резервируются; цена и наличие могут измениться.",
    total: "Итого",
    size: "Размер",
    choose: "Выберите размер",
    cancel: "Отмена",
    promotion: "Акция",
  },
  uz: {
    title: "Savat",
    add: "Savatga",
    count: "Miqdor",
    less: "Miqdorni kamaytirish",
    more: "Miqdorni oshirish",
    close: "Savatni yopish",
    remove: "Olib tashlash",
    empty: "Savat hozircha boʻsh",
    emptyNote: "Katalogdan yoqqan mahsulotni qoʻshing.",
    note: "Koʻrish uchun mahalliy savat. Sahifa yangilanganda tanlov oʻchadi. Buyurtma rasmiylashtirish hali mavjud emas.",
    prices:
      "Narxlar qoʻshish paytidagi katalogdan. Mahsulotlar band qilinmaydi; narx va mavjudlik oʻzgarishi mumkin.",
    total: "Jami",
    size: "Oʻlcham",
    choose: "Oʻlchamni tanlang",
    cancel: "Bekor qilish",
    promotion: "Aksiya",
  },
};
export interface BasketLine {
  product: Product;
  size: string | null;
  quantity: number;
}
export interface Purchases {
  lines: BasketLine[];
  change: (product: Product, size: string | null, delta: number) => void;
}
export function CartIcon() {
  return (
    <svg
      className="cart-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h8.3a2 2 0 0 0 1.9-1.4L21 8H6" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </svg>
  );
}
export function Quantity({
  count,
  name,
  lang,
  disabled = false,
  onChange,
  add = false,
  size = null,
  onChooseSize,
}: {
  count: number;
  name: string;
  lang: Language;
  disabled?: boolean;
  onChange: (delta: number) => void;
  add?: boolean;
  size?: string | null;
  onChooseSize?: (trigger: HTMLButtonElement) => void;
}) {
  const t = basketCopy[lang],
    root = useRef<HTMLDivElement>(null),
    restore = useRef(false);
  useEffect(() => {
    if (restore.current) {
      root.current
        ?.querySelector<HTMLButtonElement>(count ? "[data-more]" : ".add")
        ?.focus();
      restore.current = false;
    }
  }, [count]);
  function change(delta: number) {
    restore.current = add && (count === 0 || (count === 1 && delta === -1));
    onChange(delta);
  }
  return (
    <div ref={root} className={add ? "card-action" : "basket-quantity"}>
      {add && count === 0 ? (
        <button
          className="add"
          disabled={disabled}
          aria-label={`${t.add}: ${name}`}
          onClick={(e) =>
            onChooseSize ? onChooseSize(e.currentTarget) : change(1)
          }
        >
          <CartIcon />
          <span>{t.add}</span>
        </button>
      ) : (
        <div
          className="quantity"
          role="group"
          aria-label={`${t.count}: ${name}`}
        >
          <button aria-label={`${t.less}: ${name}`} onClick={() => change(-1)}>
            −
          </button>
          {onChooseSize && size ? (
            <button
              className="size-summary"
              aria-label={`${t.choose}: ${name}`}
              aria-haspopup="dialog"
              onClick={(e) => onChooseSize(e.currentTarget)}
            >
              <output aria-label={`${t.count}: ${name}`}>{count}</output>
              <span>·{size}⌄</span>
            </button>
          ) : (
            <output aria-label={`${t.count}: ${name}`}>{count}</output>
          )}
          <button
            data-more
            disabled={disabled}
            aria-label={`${t.more}: ${name}`}
            onClick={() => change(1)}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
export default function Basket({
  lang,
  lines,
  change,
  dialogRef,
  onClose,
  onKeyDown,
}: Purchases & {
  lang: Language;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onKeyDown: KeyboardEventHandler<HTMLDialogElement>;
}) {
  const t = basketCopy[lang];
  const totals = new Map<string, number>();
  for (const { product, quantity } of lines)
    totals.set(
      product.currency,
      (totals.get(product.currency) || 0) +
        Number(price(product).current) * quantity,
    );
  function update(line: BasketLine, delta: number) {
    if (line.quantity + delta <= 0)
      dialogRef.current
        ?.querySelector<HTMLButtonElement>(".close-control")
        ?.focus();
    change(line.product, line.size, delta);
  }
  return (
    <dialog
      ref={dialogRef}
      className="basket-panel"
      aria-labelledby="basket-title"
      aria-describedby="basket-note"
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="dialog-heading">
        <h2 id="basket-title">{t.title}</h2>
        <button
          className="close-control"
          data-initial-focus
          aria-label={t.close}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="basket-note" id="basket-note">
        {t.note}
      </p>
      {lines.length === 0 ? (
        <div className="empty-state">
          <CartIcon />
          <p>
            <strong>{t.empty}</strong>
          </p>
          <p>{t.emptyNote}</p>
        </div>
      ) : (
        <>
          <ul className="basket-items">
            {lines.map((line) => {
              const { product: p, size, quantity } = line,
                name = `${p.name}${size ? ` · ${size}` : ""}`;
              return (
                <li
                  className="basket-row"
                  key={`${p.id}:${size || ""}`}
                  data-basket-product={p.id}
                  data-basket-size={size || ""}
                >
                  <div>
                    <p className="basket-name">{p.name}</p>
                    {size && (
                      <p>
                        {t.size}: {size}
                      </p>
                    )}
                    <p className="basket-unit">
                      {money(price(p).current, p.currency, lang)} × {quantity}
                    </p>
                  </div>
                  <Quantity
                    count={quantity}
                    name={name}
                    lang={lang}
                    disabled={!p.is_purchasable || !p.is_in_stock}
                    onChange={(delta) => update(line, delta)}
                  />
                  <button
                    className="basket-remove"
                    aria-label={`${t.remove}: ${name}`}
                    onClick={() => update(line, -quantity)}
                  >
                    {t.remove}
                  </button>
                  <p className="basket-subtotal">
                    {money(
                      String(Number(price(p).current) * quantity),
                      p.currency,
                      lang,
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="basket-total">
            <span>{t.total}</span>
            <div>
              {[...totals].map(([currency, total]) => (
                <p key={currency}>{money(String(total), currency, lang)}</p>
              ))}
            </div>
          </div>
          <p className="basket-note">{t.prices}</p>
        </>
      )}
    </dialog>
  );
}
