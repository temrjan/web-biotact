import {
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type RefObject,
} from "react";
import { money, price, type Language, type Product } from "./catalogue";
import GuestDetails, {
  detailsCopy,
  type DeliveryDetails,
} from "./GuestDetails";
import { selectionAvailable, type BasketEntry } from "./guestBasket";
import Checkout, { checkoutCopy } from "./Checkout";
import type { Order } from "./guest";

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
    note: "Корзина сохраняется в этом браузере. Заказ можно оформить без аккаунта.",
    prices:
      "Предварительная стоимость по каталогу. Товары не резервируются; цена и наличие могут измениться. Доставка оплачивается отдельно.",
    total: "По каталогу, предварительно",
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
    note: "Savat shu brauzerda saqlanadi. Buyurtmani akkauntsiz berish mumkin.",
    prices:
      "Katalog boʻyicha taxminiy narx. Mahsulotlar band qilinmaydi; narx va mavjudlik oʻzgarishi mumkin. Yetkazib berish alohida toʻlanadi.",
    total: "Katalog boʻyicha taxminan",
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
            disabled={disabled || count >= 99}
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
const flowCopy = {
  ru: {
    invalid:
      "Сохранённая корзина повреждена или устарела. Добавьте товары заново.",
    unavailable:
      "Не удаётся сохранить корзину в браузере. Пока страница открыта, ею можно пользоваться.",
    loading: "Проверяем товар…",
    error: "Не удалось проверить товар. Повторите или уберите его.",
    missing: "Товар не найден.",
    blocked: "Товар недоступен для покупки.",
    size: "Выбранный размер недоступен. Уберите эту строку и выберите доступный вариант в каталоге.",
    retry: "Повторить",
    product: "Товар",
    continue: "Данные доставки",
    review: "Проверьте данные",
    back: "Назад к данным",
    check: "Сначала проверьте все товары в корзине.",
  },
  uz: {
    invalid:
      "Saqlangan savat buzilgan yoki eskirgan. Mahsulotlarni qayta qoʻshing.",
    unavailable:
      "Savatni brauzerda saqlab boʻlmadi. Sahifa ochiq turganda undan foydalanish mumkin.",
    loading: "Mahsulot tekshirilmoqda…",
    error: "Mahsulotni tekshirib boʻlmadi. Qayta urining yoki olib tashlang.",
    missing: "Mahsulot topilmadi.",
    blocked: "Mahsulotni xarid qilib boʻlmaydi.",
    size: "Tanlangan oʻlcham mavjud emas. Bu qatorni olib tashlang va katalogdan mavjud variantni tanlang.",
    retry: "Qayta urinish",
    product: "Mahsulot",
    continue: "Yetkazib berish maʼlumotlari",
    review: "Maʼlumotlarni tekshiring",
    back: "Maʼlumotlarga qaytish",
    check: "Avval savatdagi barcha mahsulotlarni tekshiring.",
  },
};
export default function Basket({
  lang,
  entries,
  change,
  remove,
  retry,
  notice,
  revision,
  dialogRef,
  onClose,
  onKeyDown,
  onCreated,
}: {
  lang: Language;
  entries: BasketEntry[];
  change: Purchases["change"];
  remove: (id: number, size: string | null) => void;
  retry: (id: number) => void;
  notice: "invalid" | "unavailable" | null;
  revision: number;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onKeyDown: KeyboardEventHandler<HTMLDialogElement>;
  onCreated: (order: Order) => void;
}) {
  const t = basketCopy[lang],
    f = flowCopy[lang],
    d = detailsCopy[lang],
    c = checkoutCopy[lang];
  const [stage, setStage] = useState<"basket" | "form" | "review">("basket");
  const [draft, setDraft] = useState<DeliveryDetails>({
    name: "",
    phone: "",
    address: "",
  });
  const [reviewRevision, setReviewRevision] = useState<number | null>(null);
  // Products the Shop refused at review; marked until the buyer continues again.
  const [marked, setMarked] = useState<number[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const available =
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry.status === "ready" &&
        selectionAvailable(entry.product, entry.size),
    );
  // A monotonic basket revision prevents an old review from returning after an edit/retry.
  const currentStage =
    stage === "review" && (reviewRevision !== revision || !available)
      ? "form"
      : stage;
  useEffect(() => {
    heading.current?.focus();
  }, [currentStage]);
  const totals = new Map<string, number>();
  for (const entry of entries)
    if (entry.status === "ready") {
      const { product, quantity } = entry;
      totals.set(
        product.currency,
        (totals.get(product.currency) || 0) +
          Number(price(product).current) * quantity,
      );
    }
  function removeEntry(entry: BasketEntry) {
    dialogRef.current
      ?.querySelector<HTMLButtonElement>(".close-control")
      ?.focus();
    remove(entry.product_id, entry.size);
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
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="dialog-heading">
        <h2 id="basket-title" ref={heading} tabIndex={-1}>
          {currentStage === "basket"
            ? t.title
            : currentStage === "form"
              ? d.title
              : f.review}
        </h2>
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
      {notice && (
        <p className="basket-notice" role="status">
          {f[notice]}
        </p>
      )}
      {currentStage === "form" ? (
        <>
          {!available && (
            <p className="basket-notice" role="status">
              {f.check}
            </p>
          )}
          <GuestDetails
            lang={lang}
            value={draft}
            available={available}
            onChange={(value) => {
              setDraft(value);
              setReviewRevision(null);
              setStage("form");
            }}
            onBack={() => setStage("basket")}
            onReview={() => {
              if (available) {
                setReviewRevision(revision);
                setStage("review");
              }
            }}
          />
        </>
      ) : currentStage === "review" ? (
        <>
          <dl className="guest-review">
            <dt>{d.name}</dt>
            <dd>{draft.name}</dd>
            <dt>{d.phone}</dt>
            <dd>{draft.phone}</dd>
            <dt>{d.address}</dt>
            <dd>{draft.address}</dd>
          </dl>
          <Checkout
            lang={lang}
            entries={entries}
            details={draft}
            sizeLabel={t.size}
            backLabel={f.back}
            onBack={() => {
              setReviewRevision(null);
              setStage("form");
            }}
            onUnavailable={(ids) => {
              setMarked(ids);
              setReviewRevision(null);
              setStage("basket");
            }}
            onOpenOrder={onClose}
            onCreated={onCreated}
          />
        </>
      ) : (
        <>
          {marked.length > 0 && (
            <p className="basket-notice" role="status">
              {c.itemsUnavailable}
            </p>
          )}
          {entries.length === 0 ? (
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
                {entries.map((entry) => {
                  const { product_id: id, size, quantity } = entry;
                  const p = entry.status === "ready" ? entry.product : null;
                  const name = `${p?.name || `${f.product} №${id}`}${size ? ` · ${size}` : ""}`;
                  const reason =
                    entry.status !== "ready"
                      ? f[entry.status]
                      : !p?.is_purchasable || !p.is_in_stock
                        ? f.blocked
                        : !selectionAvailable(p, size)
                          ? f.size
                          : null;
                  return (
                    <li
                      className="basket-row"
                      key={JSON.stringify([id, size])}
                      data-basket-product={id}
                      data-basket-size={size || ""}
                    >
                      <div>
                        <p className="basket-name">
                          {p?.name || `${f.product} №${id}`}
                        </p>
                        {size !== null && (
                          <p>
                            {t.size}: {size}
                          </p>
                        )}
                        {p && (
                          <p className="basket-unit">
                            {money(price(p).current, p.currency, lang)} ×{" "}
                            {quantity}
                          </p>
                        )}
                        {(reason || marked.includes(id)) && (
                          <p className="basket-notice" role="status">
                            {reason || f.blocked}
                          </p>
                        )}
                      </div>
                      {p ? (
                        <Quantity
                          count={quantity}
                          name={name}
                          lang={lang}
                          disabled={!!reason}
                          onChange={(delta) => {
                            if (quantity + delta <= 0) removeEntry(entry);
                            else change(p, size, delta);
                          }}
                        />
                      ) : (
                        <span>
                          {t.count}: {quantity}
                        </span>
                      )}
                      <button
                        className="basket-remove"
                        aria-label={`${t.remove}: ${name}`}
                        onClick={() => removeEntry(entry)}
                      >
                        {t.remove}
                      </button>
                      {(entry.status === "error" ||
                        entry.status === "missing") && (
                        <button onClick={() => retry(id)}>{f.retry}</button>
                      )}
                      {p && (
                        <p className="basket-subtotal">
                          {money(
                            String(Number(price(p).current) * quantity),
                            p.currency,
                            lang,
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {totals.size > 0 && (
                <div className="basket-total">
                  <span>{t.total}</span>
                  <div>
                    {[...totals].map(([currency, total]) => (
                      <p key={currency}>
                        {money(String(total), currency, lang)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <p className="basket-note">{t.prices}</p>
              <button
                className="guest-continue"
                disabled={!available}
                onClick={() => {
                  setMarked([]);
                  setStage("form");
                }}
              >
                {f.continue}
              </button>
            </>
          )}
        </>
      )}
    </dialog>
  );
}
