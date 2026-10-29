import {
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import type { Language, Product } from "./catalogue";
import * as api from "./consultant";
import { href } from "./navigation";

export type BeforeAdd = (size: string) => Promise<Product | null>;
export interface AssistantCardActions {
  change: (product: Product, size: string | null, delta: number) => void;
  chooseSize: (
    product: Product,
    trigger: HTMLButtonElement,
    onAdded: (size: string) => void,
  ) => void;
}
const copy = {
  ru: {
    title: "ИИ-консультант",
    close: "Закрыть консультанта",
    scope:
      "Помогу разобраться в товарах и их инструкциях. Не ставлю диагноз и не назначаю лечение.",
    context: "Сейчас на странице",
    draft: "Ваш вопрос",
    send: "Отправить",
    cancel: "Отменить",
    reset: "Начать заново",
    cleared: "Контекст сброшен. Можно задать новый вопрос.",
    progress: "Готовлю ответ…",
    sources: "Источники",
    data: "Обработка данных",
    hint: "Не пишите в вопросе личные данные. Подробнее — в «Обработка данных».",
    abilities:
      "Помогу выбрать товар, расскажу о составе, способе приёма и цене. Например:",
    examples: [
      "Как принимать IMMUNOCOMPLEX?",
      "Как принимать NEUROCOMPLEX KIDS?",
      "Сколько стоит IMMUNOCOMPLEX KIDS?",
    ],
    privacy:
      "Для ответа ваш вопрос и последние сообщения этой вкладки будут переданы OpenAI; для подбора товара текст вопроса также может передаваться OpenRouter. Не указывайте ФИО, контакты, документы или другие личные сведения. Мы не сохраняем переписку на сервере; OpenAI и OpenRouter могут хранить данные по своим правилам. Ответ не заменяет консультацию врача. Отправляя вопрос, вы соглашаетесь с такой обработкой.",
    retention:
      "Передаются вопрос, до четырёх завершённых пар сообщений и публичные сведения о товарах. Данные аккаунта, корзины и заказа не передаются. Контекст хранится только в памяти вкладки до сброса или 30 минут бездействия. Защитные идентификаторы хранятся до 24 часов, события без переписки и идентификаторов — до 7 дней. Проверка личных данных не гарантирует их полного обнаружения.",
    error:
      "Ответ недоступен. Измените вопрос или попробуйте отправить его снова. Каталог продолжает работать.",
    expired:
      "Контекст истёк или недействителен. Вопрос сохранён: отправьте его снова явно.",
    sensitive: "Уберите контакты, документы и секретные сведения из вопроса.",
    changed:
      "Цена или доступность изменились. Проверьте карточку и нажмите «В корзину» снова.",
    unavailable: "Сведения о товаре недоступны. Добавление остановлено.",
    shop: "Цена и наличие: Shop, проверено",
    shortcut: "Enter — отправить. Shift+Enter — новая строка.",
    count: "Символов",
  },
  uz: {
    title: "AI-maslahatchi",
    close: "Maslahatchini yopish",
    scope:
      "Mahsulotlar va ularning yoʻriqnomalarini tushunishga yordam beraman. Tashxis qoʻymayman va davolash buyurmayman.",
    context: "Hozirgi sahifa",
    draft: "Savolingiz",
    send: "Yuborish",
    cancel: "Bekor qilish",
    reset: "Qayta boshlash",
    cleared: "Kontekst tozalandi. Yangi savol berishingiz mumkin.",
    progress: "Javob tayyorlanmoqda…",
    sources: "Manbalar",
    data: "Maʼlumotlarni qayta ishlash",
    hint: "Savolda shaxsiy maʼlumotlarni yozmang. Batafsil — «Maʼlumotlarni qayta ishlash» boʻlimida.",
    abilities:
      "Mahsulot tanlashga yordam beraman, tarkibi, qabul qilish usuli va narxi haqida aytib beraman. Masalan:",
    examples: [
      "IMMUNOCOMPLEX KIDS qanday qabul qilinadi?",
      "IMMUNOCOMPLEX qanday qabul qilinadi?",
      "IMMUNOCOMPLEX KIDS qancha turadi?",
    ],
    privacy:
      "Javob olish uchun savolingiz va shu varaqdagi oxirgi xabarlar OpenAIʼga yuboriladi; mahsulot tanlash uchun savol matni OpenRouterʼga ham yuborilishi mumkin. Ism-familiya, aloqa maʼlumotlari, hujjatlar yoki boshqa shaxsiy maʼlumotlarni kiritmang. Yozishmalarni serverda saqlamaymiz; OpenAI va OpenRouter maʼlumotlarni oʻz qoidalari asosida saqlashi mumkin. Javob shifokor maslahatini almashtirmaydi. Savolni yuborish orqali bunday qayta ishlashga rozilik bildirasiz.",
    retention:
      "Savol, toʻrttagacha yakunlangan xabar juftligi va ochiq mahsulot maʼlumotlari yuboriladi. Hisob, savat va buyurtma maʼlumotlari yuborilmaydi. Kontekst faqat varaq xotirasida, tozalashgacha yoki 30 daqiqa harakatsizlikkacha saqlanadi. Himoya identifikatorlari 24 soatgacha, matn va identifikatorsiz hodisalar 7 kungacha saqlanadi. Shaxsiy maʼlumotlarni tekshirish ularning barchasini aniqlashni kafolatlamaydi.",
    error:
      "Javob mavjud emas. Savolni oʻzgartiring yoki qayta yuboring. Katalog ishlashda davom etadi.",
    expired:
      "Kontekst eskirgan yoki notoʻgʻri. Savol saqlandi: uni qayta yuboring.",
    sensitive: "Savoldan aloqa, hujjat va maxfiy maʼlumotlarni olib tashlang.",
    changed:
      "Narx yoki mavjudlik oʻzgardi. Kartani tekshirib, «Savatga» tugmasini yana bosing.",
    unavailable: "Mahsulot maʼlumotlari mavjud emas. Qoʻshish toʻxtatildi.",
    shop: "Narx va mavjudlik: Shop, tekshirildi",
    shortcut: "Enter — yuborish. Shift+Enter — yangi qator.",
    count: "Belgilar",
  },
};
interface Entry {
  question: string;
  response: api.Answer;
}

export default function Assistant({
  lang,
  context,
  pageProductId,
  active,
  dialogRef,
  onClose,
  onKeyDown,
  renderCard,
  change,
  chooseSize,
}: {
  lang: Language;
  context: string;
  pageProductId: number | null;
  active: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onKeyDown: KeyboardEventHandler<HTMLDialogElement>;
  renderCard: (
    product: Product,
    actions: AssistantCardActions,
    disabled: boolean,
  ) => ReactNode;
  change: AssistantCardActions["change"];
  chooseSize: (
    product: Product,
    trigger: HTMLButtonElement,
    onAdded: (size: string) => void,
    beforeAdd: BeforeAdd,
  ) => void;
}) {
  const t = copy[lang];
  const [draft, setDraft] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cards, setCards] = useState<Product[]>([]);
  const [pending, setPending] = useState(false);
  const [busyCards, setBusyCards] = useState<number[]>([]);
  const [notice, setNotice] = useState(t.cleared);
  const tab = useRef(crypto.randomUUID());
  const revision = useRef(0);
  const token = useRef<string | null>(null);
  const run = useRef<{ turn: api.Turn; controller: AbortController } | null>(
    null,
  );
  const busy = useRef(new Set<number>());
  const refreshes = useRef(new Set<AbortController>());
  const touched = useRef(Date.now());
  const alive = useRef(true);
  const visible = useRef(active);
  visible.current = active;
  const draftLength = api.questionLength(draft);
  const showCount = draftLength >= api.QUESTION_COUNTER_FROM;

  function cancel() {
    const current = run.current;
    run.current = null;
    revision.current += 1;
    if (current) {
      current.controller.abort();
      api.cancel({
        tab_id: current.turn.tab_id,
        request_id: current.turn.request_id,
      });
    }
    setPending(false);
  }
  function reset(preserveDraft = false) {
    cancel();
    for (const controller of refreshes.current) controller.abort();
    token.current = null;
    tab.current = crypto.randomUUID();
    setEntries([]);
    setCards([]);
    if (!preserveDraft) setDraft("");
    setNotice(t.cleared);
    touched.current = Date.now();
  }
  useEffect(() => {
    alive.current = true;
    const requests = refreshes.current;
    return () => {
      alive.current = false;
      const current = run.current;
      if (current) {
        current.controller.abort();
        api.cancel({
          tab_id: current.turn.tab_id,
          request_id: current.turn.request_id,
        });
      }
      for (const controller of requests) controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!active && run.current) {
      const current = run.current;
      run.current = null;
      revision.current += 1;
      current.controller.abort();
      api.cancel({
        tab_id: current.turn.tab_id,
        request_id: current.turn.request_id,
      });
    }
  }, [active]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Date.now() - touched.current >= 30 * 60 * 1000) reset();
    }, 1000);
    return () => window.clearInterval(interval);
  });

  /** Sends the draft, or an example question exactly as if it were typed. */
  async function submit(text: string = draft) {
    // One message at a time: a new question waits until the pending answer,
    // its error or its cancellation (OM1).
    if (run.current) return;
    const question = text.trim();
    if (!question || api.questionLength(question) > api.QUESTION_LIMIT) return;
    if (api.sensitive(question)) {
      setNotice(t.sensitive);
      return;
    }
    if (Date.now() - touched.current >= 30 * 60 * 1000) {
      reset(true);
      return;
    }
    cancel();
    touched.current = Date.now();
    setNotice("");
    const turn: api.Turn = {
      request_id: crypto.randomUUID(),
      tab_id: tab.current,
      context_revision: revision.current,
      language: lang,
      question,
      history: api.history(
        entries.map((e) => ({
          question: e.question,
          answer: e.response.answer,
        })),
      ),
      page_product_id: pageProductId,
      context_token: token.current,
    };
    const controller = new AbortController();
    run.current = { turn, controller };
    setPending(true);
    try {
      const response = await api.send(turn, controller.signal);
      if (
        !alive.current ||
        !visible.current ||
        run.current?.turn.request_id !== turn.request_id ||
        revision.current !== turn.context_revision
      )
        return;
      token.current = response.context_token;
      setEntries((old) => [...old, { question, response }].slice(-4));
      // An empty-selection response must remove stale cards. Same-subject source-only
      // preservation is encoded by the server; display only the latest returned cards.
      setCards(response.products);
      setDraft((current) => (current.trim() === question ? "" : current));
      if (response.open_product_id !== null) {
        onClose();
        window.location.hash =
          href({
            view: "product",
            lang,
            page: 1,
            id: response.open_product_id,
          }).split("#")[1] || "";
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        !alive.current ||
        run.current?.turn.request_id !== turn.request_id
      )
        return;
      const code =
        error instanceof api.ConsultantError ? error.code : "unavailable";
      if (code === "context_invalid" || code === "context_expired") {
        reset(true);
        setNotice(t.expired);
      } else setNotice(code === "sensitive_input" ? t.sensitive : t.error);
    } finally {
      if (alive.current) {
        if (run.current?.turn.request_id === turn.request_id)
          run.current = null;
        // Whatever stopped this run (answer, error, cancel, reset or hiding the
        // panel), Send is enabled again once no run is in flight (OM1).
        if (run.current === null) setPending(false);
      }
    }
  }
  async function checked(
    product: Product,
    size: string | null,
  ): Promise<Product | null> {
    if (busy.current.has(product.id)) return null;
    busy.current.add(product.id);
    setBusyCards([...busy.current]);
    const controller = new AbortController();
    refreshes.current.add(controller);
    const capturedTab = tab.current;
    const capturedRevision = revision.current;
    try {
      const fresh = await api.refresh(product.id, lang, controller.signal);
      if (
        !alive.current ||
        tab.current !== capturedTab ||
        revision.current !== capturedRevision
      )
        return null;
      if (!fresh) {
        setCards((old) =>
          old.map((p) =>
            p.id === product.id ? { ...p, is_purchasable: false } : p,
          ),
        );
        setNotice(t.unavailable);
        return null;
      }
      setCards((old) => old.map((p) => (p.id === product.id ? fresh : p)));
      if (api.commercial(fresh) !== api.commercial(product)) {
        setNotice(t.changed);
        return null;
      }
      if (
        !fresh.is_in_stock ||
        !fresh.is_purchasable ||
        (size !== null && !fresh.available_sizes.includes(size))
      ) {
        setNotice(t.unavailable);
        return null;
      }
      return fresh;
    } catch {
      if (alive.current && !controller.signal.aborted) {
        setNotice(t.unavailable);
        setCards((old) =>
          old.map((p) =>
            p.id === product.id ? { ...p, is_purchasable: false } : p,
          ),
        );
      }
      return null;
    } finally {
      refreshes.current.delete(controller);
      busy.current.delete(product.id);
      if (alive.current) setBusyCards([...busy.current]);
    }
  }
  const actions: AssistantCardActions = {
    change: (p, size, delta) => {
      if (delta <= 0) change(p, size, delta);
      else
        void checked(p, size).then((fresh) => {
          if (fresh) change(fresh, size, delta);
        });
    },
    chooseSize: (p, trigger, onAdded) => {
      void checked(p, null).then((fresh) => {
        if (fresh && trigger.isConnected)
          chooseSize(fresh, trigger, onAdded, (size) => checked(fresh, size));
      });
    },
  };
  return (
    <dialog
      ref={dialogRef}
      className="assistant-panel"
      id="consultant"
      aria-labelledby="assistant-title"
      aria-describedby="assistant-preview"
      onPointerDown={() => {
        touched.current = Date.now();
      }}
      onClose={() => {
        if (!dialogRef.current?.open) {
          cancel();
          onClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        cancel();
        onClose();
      }}
      onKeyDown={(e) => {
        touched.current = Date.now();
        onKeyDown(e);
      }}
    >
      <div className="ai-head">
        <div className="dialog-heading">
          <h2 id="assistant-title">{t.title}</h2>
          <button
            className="close-control"
            data-initial-focus
            aria-label={t.close}
            onClick={() => {
              cancel();
              onClose();
            }}
          >
            ×
          </button>
        </div>
        <p className="ai-caption" id="assistant-preview">
          {t.scope}
        </p>
      </div>
      <div className="ai-context">
        {t.context}
        <strong>{context}</strong>
      </div>
      <div className="ai-body">
        <p className="ai-hint">{t.hint}</p>
        <details className="ai-data">
          <summary>{t.data}</summary>
          <p>{t.privacy}</p>
          <p>{t.retention}</p>
          <p className="ai-links">
            <a
              href="https://developers.openai.com/api/docs/guides/your-data"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenAI
            </a>
            <a
              href="https://openrouter.ai/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenRouter
            </a>
          </p>
        </details>
        {entries.length === 0 && (
          <div className="ai-examples">
            <p>{t.abilities}</p>
            <div className="suggestions">
              {t.examples.map((example) => (
                <button
                  type="button"
                  key={example}
                  disabled={pending}
                  onClick={() => {
                    touched.current = Date.now();
                    setDraft(example);
                    void submit(example);
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => reset()}>{t.reset}</button>
        {entries.map((entry) => (
          <section className="ai-answer" key={entry.response.request_id}>
            <p>
              <strong>{entry.question}</strong>
            </p>
            <p className="ai-plain">{entry.response.answer}</p>
            {entry.response.cautions.map((id) => (
              <p className="ai-caution ai-plain" key={id}>
                {
                  entry.response.sources.find((s) => s.source_id === id)
                    ?.passage
                }
              </p>
            ))}
            {entry.response.sources.length > 0 && (
              <details>
                <summary>{t.sources}</summary>
                {entry.response.sources.map((s) => (
                  <section key={s.source_id}>
                    <h4>
                      {s.title} · {s.form} · {s.language}
                    </h4>
                    <p>
                      {s.revision} · {s.section_title} · {s.pdf_title},{" "}
                      {s.pdf_page}
                    </p>
                    <p className="ai-plain">{s.passage}</p>
                  </section>
                ))}
              </details>
            )}
            {entry.response.commercial_checked_at && (
              <p className="muted">
                {t.shop}{" "}
                {new Date(
                  entry.response.commercial_checked_at,
                ).toLocaleTimeString(lang)}
              </p>
            )}
          </section>
        ))}
        <div className="assistant-cards">
          {cards.map((p) => (
            <div key={p.id}>
              {renderCard(p, actions, busyCards.includes(p.id))}
            </div>
          ))}
        </div>
        <p role="status" aria-live="polite">
          {notice || (pending && active ? t.progress : "")}
        </p>
      </div>
      <form
        className="ai-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="assistant-draft">{t.draft}</label>
        <textarea
          id="assistant-draft"
          value={draft}
          maxLength={api.QUESTION_LIMIT}
          {...(showCount ? { "aria-describedby": "assistant-count" } : {})}
          onChange={(e) => {
            touched.current = Date.now();
            setDraft(e.target.value);
          }}
          enterKeyHint="send"
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter keeps the native new line. An Enter that
            // confirms IME composition (keyCode 229 in Safari) never sends.
            if (
              e.key !== "Enter" ||
              e.shiftKey ||
              e.altKey ||
              e.nativeEvent.isComposing ||
              e.keyCode === 229
            )
              return;
            e.preventDefault();
            void submit();
          }}
        />
        {showCount && (
          <p className="ai-count" id="assistant-count">
            {t.count}: {draftLength} / {api.QUESTION_LIMIT}
          </p>
        )}
        <button
          type="submit"
          disabled={
            pending ||
            !draft.trim() ||
            api.questionLength(draft.trim()) > api.QUESTION_LIMIT
          }
        >
          {t.send}
        </button>
        {pending && active && (
          <button type="button" onClick={cancel}>
            {t.cancel}
          </button>
        )}
        <p className="muted">
          {t.sensitive} {t.shortcut}
        </p>
      </form>
    </dialog>
  );
}
