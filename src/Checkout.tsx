import { useEffect, useRef, useState } from "react";
import { money, type Language } from "./catalogue";
import type { DeliveryDetails } from "./GuestDetails";
import type { BasketEntry } from "./guestBasket";
import {
  GuestError,
  keyHolder,
  POLICY_URL,
  QUOTE_CURRENCY,
  readOrder,
  requestQuote,
  retryMinutes,
  submitOrder,
  TERMS_URL,
  unavailableIds,
  type Order,
  type Quote,
} from "./guest";
import { href } from "./navigation";

/** Guest checkout copy (spec S2 §7 text table). */
export const checkoutCopy = {
  ru: {
    quoteLoading: "Проверяем цены…",
    quoteConfirmed:
      "Цены и сумма подтверждены магазином. Доставка оплачивается отдельно.",
    quoteChanged: "Цены или наличие изменились. Проверьте заказ ещё раз.",
    accept: [
      "Я принимаю ",
      "Условия продажи",
      " и ",
      "Политику конфиденциальности",
      "",
    ],
    acceptError: "Чтобы оформить заказ, примите условия.",
    place: "Оформить заказ",
    unpaid: (n: string) =>
      `На этом устройстве есть неоплаченный заказ № ${n}. Новый заказ заменит его здесь, а неоплаченный заказ отменится автоматически.`,
    openOrder: "Открыть заказ",
    checking: "Проверяем результат…",
    placeAgain:
      "Не удалось подтвердить заказ на этом устройстве. Оформите заказ ещё раз.",
    itemsUnavailable: "Некоторые товары больше недоступны. Проверьте корзину.",
    tooLarge:
      "Слишком большой заказ: не более 20 позиций и не более 10 штук товаров с размером.",
    tooMany: (m: number) => `Слишком много попыток. Повторите через ${m} мин.`,
    disabled: "Оформление заказа на сайте временно недоступно.",
    failure: "Не удалось выполнить запрос. Повторите попытку.",
    orderTitle: (n: string) => `Заказ № ${n}`,
    order: "Заказ",
    awaiting: "Ожидает оплаты",
    awaitingNote:
      "Неоплаченный заказ отменяется автоматически примерно через 30 минут после оформления.",
    pay: (sum: string) => `Оплатить ${sum}`,
    check: "Проверить статус",
    paid: "Заказ оплачен. Мы свяжемся с вами для доставки.",
    cancelled:
      "Заказ отменён или не был оплачен вовремя. Оформите новый заказ.",
    notFound:
      "Заказ не найден на этом устройстве. Если вы оплатили заказ, мы свяжемся с вами по указанному телефону.",
    payUnavailable: "Не удалось начать оплату. Попробуйте ещё раз.",
    payChecking: "Оплата проверяется. Мы свяжемся с вами.",
    total: "Итого",
    retry: "Повторить",
    catalogue: "Перейти в каталог",
  },
  uz: {
    quoteLoading: "Narxlar tekshirilmoqda…",
    quoteConfirmed:
      "Narxlar va summa doʻkon tomonidan tasdiqlangan. Yetkazib berish alohida toʻlanadi.",
    quoteChanged:
      "Narxlar yoki mavjudlik oʻzgardi. Buyurtmani qayta tekshiring.",
    accept: [
      "",
      "Sotish shartlari",
      " va ",
      "Maxfiylik siyosati",
      "ni qabul qilaman",
    ],
    acceptError: "Buyurtma berish uchun shartlarni qabul qiling.",
    place: "Buyurtma berish",
    unpaid: (n: string) =>
      `Bu qurilmada toʻlanmagan № ${n} buyurtma bor. Yangi buyurtma uni bu yerda almashtiradi, toʻlanmagan buyurtma esa avtomatik bekor qilinadi.`,
    openOrder: "Buyurtmani ochish",
    checking: "Natija tekshirilmoqda…",
    placeAgain:
      "Buyurtmani bu qurilmada tasdiqlab boʻlmadi. Buyurtmani qaytadan bering.",
    itemsUnavailable: "Ayrim mahsulotlar endi mavjud emas. Savatni tekshiring.",
    tooLarge:
      "Buyurtma juda katta: koʻpi bilan 20 ta pozitsiya va oʻlchamli mahsulotlardan koʻpi bilan 10 dona.",
    tooMany: (m: number) =>
      `Urinishlar juda koʻp. ${m} daqiqadan keyin qayta urining.`,
    disabled: "Saytda buyurtma berish vaqtincha mavjud emas.",
    failure: "Soʻrovni bajarib boʻlmadi. Qayta urining.",
    orderTitle: (n: string) => `№ ${n} buyurtma`,
    order: "Buyurtma",
    awaiting: "Toʻlov kutilmoqda",
    awaitingNote:
      "Toʻlanmagan buyurtma rasmiylashtirilganidan taxminan 30 daqiqa oʻtgach avtomatik bekor qilinadi.",
    pay: (sum: string) => `${sum} toʻlash`,
    check: "Holatni tekshirish",
    paid: "Buyurtma toʻlandi. Yetkazib berish uchun siz bilan bogʻlanamiz.",
    cancelled:
      "Buyurtma bekor qilingan yoki oʻz vaqtida toʻlanmagan. Yangi buyurtma bering.",
    notFound:
      "Buyurtma bu qurilmada topilmadi. Agar buyurtmani toʻlagan boʻlsangiz, koʻrsatilgan telefon orqali siz bilan bogʻlanamiz.",
    payUnavailable: "Toʻlovni boshlab boʻlmadi. Qayta urining.",
    payChecking: "Toʻlov tekshirilmoqda. Siz bilan bogʻlanamiz.",
    total: "Jami",
    retry: "Qayta urinish",
    catalogue: "Katalogga oʻtish",
  },
};
/** Text for a definitive refusal shared by quote and order creation. */
export function refusalText(lang: Language, error: GuestError): string {
  const c = checkoutCopy[lang];
  if (error.code === "order_too_large") return c.tooLarge;
  if (error.code === "try_later") return c.tooMany(retryMinutes(error));
  if (error.code === "guest_checkout_disabled") return c.disabled;
  if (error.code === "items_unavailable") return c.itemsUnavailable;
  return c.failure;
}
export function Lines({
  lines,
  currency,
  lang,
  names,
  sizeLabel,
}: {
  lines: {
    product_id: number | null;
    product_name: string;
    size: string | null;
    quantity: number;
    unit_price: string;
    line_total: string;
  }[];
  currency: string;
  lang: Language;
  names?: Map<number, string>;
  sizeLabel: string;
}) {
  return (
    <ul className="basket-items">
      {lines.map((line, index) => (
        <li
          className="basket-row"
          key={index}
          data-line-product={line.product_id ?? ""}
          data-line-size={line.size ?? ""}
        >
          <div>
            <p className="basket-name">
              {(line.product_id !== null && names?.get(line.product_id)) ||
                line.product_name}
            </p>
            {line.size !== null && (
              <p>
                {sizeLabel}: {line.size}
              </p>
            )}
            <p className="basket-unit">
              {money(line.unit_price, currency, lang)} × {line.quantity}
            </p>
          </div>
          <p className="basket-subtotal">
            {money(line.line_total, currency, lang)}
          </p>
        </li>
      ))}
    </ul>
  );
}

type Read =
  | { status: "loading" }
  | { status: "ready"; quote: Quote; changed: boolean }
  | { status: "error"; error: GuestError };
type Phase =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "checking" }
  | { kind: "unknown" }
  | { kind: "place_again" }
  | { kind: "refused"; error: GuestError };

/** Review step: server quote, unpaid-order notice, required terms and order placement. */
export default function Checkout({
  lang,
  entries,
  details,
  sizeLabel,
  backLabel,
  onBack,
  onUnavailable,
  onOpenOrder,
  onCreated,
}: {
  lang: Language;
  entries: BasketEntry[];
  details: DeliveryDetails;
  sizeLabel: string;
  backLabel: string;
  onBack: () => void;
  onUnavailable: (ids: number[]) => void;
  onOpenOrder?: () => void;
  onCreated: (order: Order) => void;
}) {
  const c = checkoutCopy[lang];
  const items = entries.map(({ product_id, quantity, size }) => ({
    product_id,
    quantity,
    size,
  }));
  const names = new Map(
    entries.flatMap((entry): [number, string][] =>
      entry.status === "ready" ? [[entry.product_id, entry.product.name]] : [],
    ),
  );
  const itemsKey = JSON.stringify(items);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<{ attempt: number; read: Read }>();
  const read: Read =
    saved?.attempt === attempt ? saved.read : { status: "loading" };
  const [unpaid, setUnpaid] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [keys] = useState(() => keyHolder());
  const busy = useRef(false),
    alive = useRef(true),
    acceptBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void requestQuote(items).then(
      (quote) => {
        if (active)
          setSaved({
            attempt,
            read: { status: "ready", quote, changed: false },
          });
      },
      (e: unknown) => {
        if (!active) return;
        const error =
          e instanceof GuestError ? e : new GuestError(0, "network");
        const ids = unavailableIds(error);
        if (ids) onUnavailable(ids);
        else setSaved({ attempt, read: { status: "error", error } });
      },
    );
    return () => {
      active = false;
    };
    // The basket lines and deliberate retry own the quote; callbacks must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, attempt]);
  useEffect(() => {
    let active = true;
    void readOrder().then(
      (order) => {
        if (active && order.state === "awaiting_payment")
          setUnpaid(order.order_number);
      },
      () => {
        /* The notice is optional; any failure leaves ordering unchanged. */
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function place(automatic: boolean) {
    if (busy.current || read.status !== "ready") return;
    if (!accepted) {
      setAcceptError(true);
      acceptBox.current?.focus();
      return;
    }
    busy.current = true;
    setPhase({ kind: automatic ? "pending" : "checking" });
    const form = {
      name: details.name.trim(),
      phone: details.phone.trim(),
      address: details.address.trim(),
    };
    const fingerprint = read.quote.quote_fingerprint;
    const result = await submitOrder(
      {
        items,
        quote_fingerprint: fingerprint,
        ...form,
        accept_terms: true,
        idempotency_key: keys.key(JSON.stringify([items, form, fingerprint])),
      },
      {
        automatic,
        onChecking: () => {
          if (alive.current) setPhase({ kind: "checking" });
        },
      },
    );
    busy.current = false;
    if (!alive.current) return;
    switch (result.kind) {
      case "created":
        onCreated(result.order);
        return;
      case "place_again":
        keys.reset();
        setPhase({ kind: "place_again" });
        return;
      case "quote_changed":
        keys.reset();
        setSaved({
          attempt,
          read: { status: "ready", quote: result.quote, changed: true },
        });
        setPhase({ kind: "idle" });
        return;
      case "unavailable":
        onUnavailable(result.ids);
        return;
      case "refused":
        setPhase({ kind: "refused", error: result.error });
        return;
      case "unknown":
        setPhase({ kind: "unknown" });
    }
  }

  const working = phase.kind === "pending" || phase.kind === "checking";
  return (
    <div className="guest-checkout">
      {unpaid && (
        <p className="basket-notice guest-unpaid" role="status">
          {c.unpaid(unpaid)}{" "}
          <a
            href={href({ view: "order", lang, page: 1 })}
            onClick={onOpenOrder}
          >
            {c.openOrder}
          </a>
        </p>
      )}
      {read.status === "loading" && <p role="status">{c.quoteLoading}</p>}
      {read.status === "error" && (
        <div className="read-state" role="alert">
          <p>{refusalText(lang, read.error)}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>{c.retry}</button>
        </div>
      )}
      {read.status === "ready" && (
        <>
          {read.changed && (
            <p className="basket-notice" role="status">
              {c.quoteChanged}
            </p>
          )}
          <Lines
            lines={read.quote.lines}
            currency={QUOTE_CURRENCY}
            lang={lang}
            names={names}
            sizeLabel={sizeLabel}
          />
          <div className="basket-total">
            <span>{c.total}</span>
            <div>
              <p>{money(read.quote.total, QUOTE_CURRENCY, lang)}</p>
            </div>
          </div>
          <p className="basket-note">{c.quoteConfirmed}</p>
          <div className="guest-accept">
            <input
              ref={acceptBox}
              id="guest-accept"
              type="checkbox"
              checked={accepted}
              aria-invalid={acceptError}
              aria-describedby={acceptError ? "guest-accept-error" : undefined}
              onChange={(e) => {
                setAccepted(e.target.checked);
                if (e.target.checked) setAcceptError(false);
              }}
            />
            <label htmlFor="guest-accept">
              {c.accept[0]}
              <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">
                {c.accept[1]}
              </a>
              {c.accept[2]}
              <a href={POLICY_URL} target="_blank" rel="noopener noreferrer">
                {c.accept[3]}
              </a>
              {c.accept[4]}
            </label>
          </div>
          {acceptError && (
            <p className="guest-error" id="guest-accept-error">
              {c.acceptError}
            </p>
          )}
          {phase.kind === "checking" && (
            <p className="basket-notice" role="status">
              {c.checking}
            </p>
          )}
          {phase.kind === "unknown" && (
            <div className="basket-notice" role="alert">
              <p>{c.failure}</p>
              <button onClick={() => void place(false)}>{c.retry}</button>
            </div>
          )}
          {phase.kind === "place_again" && (
            <p className="basket-notice" role="alert">
              {c.placeAgain}
            </p>
          )}
          {phase.kind === "refused" && (
            <p className="basket-notice" role="alert">
              {refusalText(lang, phase.error)}
            </p>
          )}
        </>
      )}
      <div className="guest-actions">
        <button disabled={working} onClick={onBack}>
          {backLabel}
        </button>
        <button
          className="guest-place"
          disabled={
            read.status !== "ready" || working || phase.kind === "unknown"
          }
          onClick={() => void place(true)}
        >
          {c.place}
        </button>
      </div>
    </div>
  );
}
