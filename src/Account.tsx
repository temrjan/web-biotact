import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import * as api from "./api";

type View =
  | "loading"
  | "ready"
  | "waiting"
  | "conflict"
  | "authenticated"
  | "unavailable"
  | "recovery";
export default function Account() {
  const [view, setView] = useState<View>("loading");
  const [current, setCurrent] = useState<api.Session | null>(null);
  const [club, setClub] = useState<api.Club | null>(null);
  const [attempt, setAttempt] = useState<api.Attempt | null>(null);
  const [notice, setNotice] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const context = useRef<api.Context | null>(null);
  const generation = useRef(0);
  const reconciliation = useRef(0);
  const principal = useRef<number | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const paused = useRef(false);
  const polling = useRef(false);
  const next = useRef(0);
  const clearAccount = useCallback(() => {
    reconciliation.current++;
    principal.current = null;
    setCurrent(null);
    setClub(null);
  }, []);
  const reconcile = useCallback(async (): Promise<boolean> => {
    const epoch = generation.current;
    const request = ++reconciliation.current;
    const active = () =>
      mounted.current &&
      epoch === generation.current &&
      request === reconciliation.current;
    try {
      const session = await api.request("/session", api.session);
      if (!active()) return false;
      polling.current = false;
      if (principal.current !== session.user.id) {
        setClub(null);
        principal.current = session.user.id;
      }
      setCurrent(session);
      setView("authenticated");
      try {
        const data = await api.request("/club", api.club);
        if (active()) {
          setClub(data);
          setNotice("");
        }
      } catch (e) {
        if (!active()) return false;
        setClub(null);
        if (e instanceof api.ApiError && e.status === 401) {
          clearAccount();
          setView("recovery");
          return false;
        }
        setNotice("Статус Клуба временно недоступен.");
      }
      return true;
    } catch (e) {
      if (!active()) return false;
      clearAccount();
      if (e instanceof api.ApiError && e.status === 401) return false;
      throw e;
    }
  }, [clearAccount]);
  const getContext = useCallback(async () => {
    const c = await api.request("/context", api.context, undefined, {});
    if (!mounted.current) return c;
    context.current = c;
    setTelegramEnabled(c.telegram_enabled);
    return c;
  }, []);
  const handleError = useCallback(
    (e: unknown) => {
      if (
        e instanceof api.ApiError &&
        e.status === 409 &&
        e.code === "already_authenticated"
      ) {
        paused.current = true;
        polling.current = false;
        clearAccount();
        setView("conflict");
        setNotice(
          "В этом браузере уже завершён вход. Возобновите его или выйдите перед новым входом.",
        );
        return;
      }
      if (e instanceof api.ApiError && e.status === 429) {
        next.current = Date.now() + e.retry * 1000;
        setNotice(`Слишком много запросов. Повторите через ${e.retry} сек.`);
        return;
      }
      if (e instanceof api.ApiError && e.status === 401) {
        polling.current = false;
        clearAccount();
        setView("recovery");
        setNotice(
          "Сеанс недоступен. Возобновите вход или выйдите и начните заново.",
        );
        return;
      }
      if (e instanceof api.ApiError && e.status === 403) context.current = null;
      setView((value) => (value === "loading" ? "unavailable" : value));
      setNotice(
        "Сервис временно недоступен. Проверьте соединение и повторите.",
      );
    },
    [clearAccount],
  );
  const finish = useCallback(
    async (row: api.Attempt, c: api.Context) => {
      if (await reconcile()) return;
      const epoch = generation.current;
      if (!mounted.current) return;
      await api.request("/telegram/complete", api.session, c.csrf_token, {
        request_id: row.request_id,
      });
      // Set-Cookie can arrive late; only the CURRENT cookie's authority may be rendered.
      if (epoch === generation.current && mounted.current) {
        if (!(await reconcile())) {
          clearAccount();
          setView("recovery");
        }
      }
    },
    [reconcile, clearAccount],
  );
  const refresh = useCallback(async () => {
    if (running.current || document.hidden || Date.now() < next.current) return;
    if (!navigator.onLine) {
      setNotice("Нет соединения. Вход продолжится после подключения.");
      setView((value) => (value === "loading" ? "unavailable" : value));
      return;
    }
    running.current = true;
    const epoch = generation.current;
    try {
      if (await reconcile()) return;
      if (!mounted.current || epoch !== generation.current) return;
      const c = context.current || (await getContext());
      if (!mounted.current || epoch !== generation.current) return;
      if (!c.telegram_enabled) {
        setView("unavailable");
        setNotice("Вход через Telegram сейчас недоступен.");
        return;
      }
      if (paused.current) return;
      const old = api.saved();
      if (!old) {
        if (epoch === generation.current) {
          setView("ready");
          setAttempt(null);
        }
        return;
      }
      const row = old.id
        ? await api.request("/telegram/status", api.attempt, c.csrf_token, {
            request_id: old.id,
          })
        : await api.request("/telegram/requests", api.attempt, c.csrf_token, {
            request_key: old.key,
          });
      if (!mounted.current || epoch !== generation.current) return;
      api.save({ key: old.key, id: row.request_id });
      setAttempt(row);
      setView("waiting");
      paused.current = ["declined", "expired", "cancelled"].includes(row.state);
      polling.current = !paused.current;
      if (row.state === "approved" || row.state === "completed")
        await finish(row, c);
    } catch (e) {
      if (mounted.current && epoch === generation.current) {
        if (e instanceof api.ApiError && e.status === 404) {
          polling.current = false;
          setTelegramEnabled(false);
          setView("unavailable");
          setNotice("Вход через Telegram сейчас недоступен.");
        } else {
          handleError(e);
          if (e instanceof api.ApiError && e.status === 409) {
            try {
              await reconcile();
            } catch {
              /* Keep the neutral conflict. */
            }
          }
        }
      }
    } finally {
      running.current = false;
    }
  }, [getContext, reconcile, finish, handleError]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (polling.current) void refresh();
    }, 6100);
    const resume = () => {
      void refresh();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      // mounted gates all asynchronous continuations after this component leaves.
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    if (attempt) {
      void QRCode.toDataURL(attempt.bot_url, { width: 220, margin: 2 })
        .then((value) => {
          if (active) setQr(value);
        })
        .catch(() => {
          if (active) setQr("");
        });
    }
    return () => {
      active = false;
    };
  }, [attempt]);
  async function initiate() {
    if (busy || Date.now() < next.current) return;
    setBusy(true);
    setNotice("");
    paused.current = false;
    const epoch = ++generation.current;
    try {
      if (await reconcile()) return;
      if (!mounted.current || epoch !== generation.current) return;
      const c = await getContext();
      if (!mounted.current || epoch !== generation.current) return;
      if (!c.telegram_enabled) {
        setView("unavailable");
        setNotice("Вход через Telegram сейчас недоступен.");
        return;
      }
      const old = api.saved();
      const key = old?.key || api.newKey();
      api.save({ key });
      const row = await api.request(
        "/telegram/requests",
        api.attempt,
        c.csrf_token,
        { request_key: key },
      );
      if (!mounted.current || epoch !== generation.current) return;
      api.save({ key, id: row.request_id });
      setAttempt(row);
      setView("waiting");
      polling.current = true;
    } catch (e) {
      if (!mounted.current || epoch !== generation.current) return;
      handleError(e);
      if (e instanceof api.ApiError && e.status === 409) {
        try {
          await reconcile();
        } catch {
          /* Keep conflict. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    const epoch = ++generation.current;
    polling.current = false;
    clearAccount();
    try {
      let token = current?.csrf_token;
      if (!token) token = (context.current || (await getContext())).csrf_token;
      if (!mounted.current || epoch !== generation.current) return;
      await api.request("/logout", api.empty, token, {});
      if (!mounted.current || epoch !== generation.current) return;
      api.save(null);
      context.current = null;
      paused.current = false;
      setAttempt(null);
      const fresh = await getContext();
      if (!mounted.current || epoch !== generation.current) return;
      setNotice(
        fresh.telegram_enabled ? "" : "Вход через Telegram сейчас недоступен.",
      );
      setView(fresh.telegram_enabled ? "ready" : "unavailable");
    } catch (e) {
      if (!mounted.current || epoch !== generation.current) return;
      handleError(e);
      setView("recovery");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!attempt || busy) return;
    setBusy(true);
    const epoch = ++generation.current;
    polling.current = false;
    try {
      const c = context.current || (await getContext());
      if (!mounted.current || epoch !== generation.current) return;
      const row = await api.request(
        "/telegram/cancel",
        api.attempt,
        c.csrf_token,
        { request_id: attempt.request_id },
      );
      if (!mounted.current || epoch !== generation.current) return;
      setAttempt(row);
      if (row.state === "completed") {
        setView("conflict");
      } else {
        api.save(null);
        setView("ready");
      }
    } catch (e) {
      if (!mounted.current || epoch !== generation.current) return;
      polling.current = true;
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  const terminal =
    attempt && ["declined", "expired", "cancelled"].includes(attempt.state);
  return (
    <div className="account">
      <a className="brand" href="/#home?lang=ru">
        BIOTACT
      </a>
      <section>
        <p className="eyebrow">Ваш Biotact Club</p>
        <h1>Вход в Biotact Club</h1>
        {telegramEnabled && (
          <p>Подтвердите вход в официальном боте и вернитесь в этот браузер.</p>
        )}
        {view === "loading" && <p role="status">Проверяем сеанс…</p>}
        {view === "ready" && telegramEnabled && (
          <button
            disabled={busy}
            onClick={() => {
              void initiate();
            }}
          >
            Войти через Telegram
          </button>
        )}
        {view === "waiting" && attempt && (
          <div>
            <p role="status">
              {terminal
                ? {
                    declined: "Вход отклонён",
                    expired: "Время запроса истекло",
                    cancelled: "Вход отменён",
                  }[
                    attempt.state === "declined"
                      ? "declined"
                      : attempt.state === "expired"
                        ? "expired"
                        : "cancelled"
                  ]
                : "Ожидаем подтверждения в Telegram"}
            </p>
            <p>
              Номер для сравнения: <strong>{attempt.comparison}</strong>
            </p>
            <p>
              Действует до {new Date(attempt.expires_at).toLocaleTimeString()}
            </p>
            {!terminal && (
              <>
                <a
                  className="button"
                  href={attempt.bot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть официальный бот
                </a>
                {qr && (
                  <img
                    src={qr}
                    width="220"
                    height="220"
                    alt="QR-код: открыть этот запрос в официальном Telegram-боте"
                  />
                )}
                <p>
                  На другом устройстве отсканируйте QR-код. Подтверждайте только
                  свой запрос.
                </p>
                {attempt.delivery !== "sent" && (
                  <p>
                    Можно продолжить по ссылке или QR-коду, даже если
                    уведомление не пришло.
                  </p>
                )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    void cancel();
                  }}
                >
                  Отменить
                </button>
              </>
            )}
            {terminal && (
              <button
                onClick={() => {
                  api.save(null);
                  setAttempt(null);
                  setView("ready");
                }}
              >
                Начать новый вход
              </button>
            )}
          </div>
        )}
        {(view === "conflict" || view === "recovery") && (
          <div>
            <p role="status">
              {view === "conflict"
                ? "Вход уже завершён в этом браузере"
                : "Нужно восстановить вход"}
            </p>
            <button
              disabled={busy}
              onClick={() => {
                next.current = 0;
                paused.current = false;
                void refresh();
              }}
            >
              Возобновить вход
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                void logout();
              }}
            >
              Выйти и начать заново
            </button>
          </div>
        )}
        {view === "authenticated" && current && (
          <div>
            <h2>Вы вошли</h2>
            {club ? (
              <>
                <p>
                  {club.is_member
                    ? "Вы участник Biotact Club"
                    : "Вы пока не участник Biotact Club"}
                </p>
                <p>
                  Всего баллов: <strong>{club.balance}</strong>
                </p>
                <p>
                  Доступно: <strong>{club.available}</strong>
                </p>
                {club.reserved_until && (
                  <p>
                    Часть баллов зарезервирована до{" "}
                    {new Date(club.reserved_until).toLocaleString()}
                  </p>
                )}
              </>
            ) : (
              <p>Статус Клуба недоступен.</p>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                void logout();
              }}
            >
              Выйти
            </button>
          </div>
        )}
        {notice && <p role="alert">{notice}</p>}
        {view === "unavailable" && (
          <button
            onClick={() => {
              next.current = 0;
              paused.current = false;
              void refresh();
            }}
          >
            Повторить проверку
          </button>
        )}
      </section>
      <footer>Подтверждение входа не меняет вашу регистрацию в боте.</footer>
    </div>
  );
}
