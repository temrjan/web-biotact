import { useEffect, useRef, useState } from "react";
import { money, type Language } from "./catalogue";
import { checkoutCopy, Lines, refusalText } from "./Checkout";
import {
  closedState,
  GuestError,
  readOrder,
  startPayment,
  type Order,
  type OrderLine,
} from "./guest";
import { href } from "./navigation";

type Message =
  | { text: "checking" | "failure" | "payUnavailable" | "payChecking" }
  | { error: GuestError };

/** Guest order view (`#order`): status from the purchase cookie, payment start and paid cleanup. */
export default function OrderView({
  lang,
  initial,
  sizeLabel,
  onPaid,
}: {
  lang: Language;
  /** The creation response, shown until the first status read completes. */
  initial: Order | null;
  sizeLabel: string;
  onPaid: (lines: OrderLine[]) => void;
}) {
  const c = checkoutCopy[lang];
  const [order, setOrder] = useState<Order | null>(initial);
  const [failure, setFailure] = useState<GuestError | null>(null);
  const [reading, setReading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const busy = useRef(false);
  function apply(next: Order) {
    setOrder(next);
    setFailure(null);
    setReading(false);
  }
  function fail(e: unknown) {
    const error = e instanceof GuestError ? e : new GuestError(0, "network");
    if (
      error.code === "order_not_found" ||
      error.code === "guest_checkout_disabled"
    )
      setOrder(null);
    setFailure(error);
    setReading(false);
  }
  useEffect(() => {
    let active = true;
    void readOrder().then(
      (next) => {
        if (active) apply(next);
      },
      (e: unknown) => {
        if (active) fail(e);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  // Each paid projection removes its exact lines from the basket; repeating changes nothing.
  useEffect(() => {
    if (order?.state === "paid") onPaid(order.lines);
  }, [order, onPaid]);
  /** Read the order again; `after` replaces the message once the read completes. */
  function reread(after: Message | null) {
    setReading(true);
    setFailure(null);
    setMessage(after === null ? null : { text: "checking" });
    void readOrder().then(
      (next) => {
        apply(next);
        setMessage(after);
      },
      (e: unknown) => {
        fail(e);
        setMessage(null);
      },
    );
  }
  async function pay() {
    if (!order || busy.current) return;
    busy.current = true;
    setPaying(true);
    setMessage(null);
    try {
      window.location.assign(await startPayment(lang, order.csrf_token));
      return;
    } catch (e) {
      const error = e instanceof GuestError ? e : new GuestError(0, "network");
      const state = closedState(error);
      if (state) setOrder({ ...order, state });
      else if (error.status === 403) reread({ text: "failure" });
      else if (error.status === 0) reread({ text: "payUnavailable" });
      else if (error.code === "order_not_found") fail(error);
      else if (error.code === "payment_check_pending")
        setMessage({ text: "payChecking" });
      else if (
        error.code === "try_later" ||
        error.code === "guest_checkout_disabled"
      )
        setMessage({ error });
      else setMessage({ text: "payUnavailable" });
    } finally {
      busy.current = false;
    }
    setPaying(false);
  }

  if (!order)
    return (
      <section className="order-view" aria-labelledby="order-title">
        <h1 id="order-title">{c.order}</h1>
        {reading ? (
          <p role="status">{c.checking}</p>
        ) : failure?.code === "order_not_found" ? (
          <p role="alert">{c.notFound}</p>
        ) : (
          <div className="read-state" role="alert">
            <p>{failure ? refusalText(lang, failure) : c.failure}</p>
            <button onClick={() => reread(null)}>{c.retry}</button>
          </div>
        )}
      </section>
    );
  const sum = money(order.total, order.currency, lang);
  const messageText =
    message === null
      ? null
      : "text" in message
        ? c[message.text]
        : refusalText(lang, message.error);
  return (
    <section className="order-view" aria-labelledby="order-title">
      <h1 id="order-title">{c.orderTitle(order.order_number)}</h1>
      <p className="order-state" data-state={order.state}>
        {order.state === "paid"
          ? c.paid
          : order.state === "cancelled"
            ? c.cancelled
            : c.awaiting}
      </p>
      <Lines
        lines={order.lines}
        currency={order.currency}
        lang={lang}
        sizeLabel={sizeLabel}
      />
      <div className="basket-total">
        <span>{c.total}</span>
        <div>
          <p>{sum}</p>
        </div>
      </div>
      {order.state === "awaiting_payment" && (
        <>
          <p className="basket-note">{c.awaitingNote}</p>
          <div className="guest-actions">
            <button
              className="order-pay"
              disabled={paying || reading}
              onClick={() => void pay()}
            >
              {c.pay(sum)}
            </button>
            <button disabled={paying || reading} onClick={() => reread(null)}>
              {c.check}
            </button>
          </div>
        </>
      )}
      {order.state === "cancelled" && (
        <p>
          <a href={href({ view: "catalogue", lang, page: 1 })}>{c.catalogue}</a>
        </p>
      )}
      {failure && !reading && (
        <p className="basket-notice" role="alert">
          {refusalText(lang, failure)}
        </p>
      )}
      {messageText && (
        <p className="basket-notice" role="status">
          {messageText}
        </p>
      )}
    </section>
  );
}
