import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import type { Language, Product } from "./catalogue";
import { afterAnswer, reveal, type Box } from "./chatScroll";
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
    hint: "Не пишите в вопросе личные данные. Enter — отправить.",
    fromInstruction: "Из инструкции",
    abilities:
      "Помогу выбрать товар, расскажу о составе, способе приёма и цене. Например:",
    examples: [
      "Как принимать IMMUNOCOMPLEX?",
      "Как принимать NEUROCOMPLEX KIDS?",
      "Сколько стоит IMMUNOCOMPLEX KIDS?",
    ],
    privacy:
      "Для ответа ваш вопрос и все сообщения этой вкладки будут переданы OpenAI; для подбора товара текст вопроса также может передаваться OpenRouter. Не указывайте ФИО, контакты, документы или другие личные сведения. OpenAI и OpenRouter могут хранить данные по своим правилам. Ответ не заменяет консультацию врача. Отправляя вопрос, вы соглашаетесь с такой обработкой.",
    retention:
      "Передаются вопрос, предыдущие сообщения этой вкладки и публичные сведения о товарах. Данные аккаунта, корзины и заказа не передаются. Защитные идентификаторы хранятся до 24 часов, события без переписки и идентификаторов — до 7 дней. Проверка личных данных не гарантирует их полного обнаружения.",
    error:
      "Ответ недоступен. Измените вопрос или попробуйте отправить его снова. Каталог продолжает работать.",
    busy: "Консультант сейчас временно не может ответить. Ваш вопрос сохранён — отправьте его ещё раз чуть позже.",
    expired:
      "Контекст истёк или недействителен. Вопрос сохранён: отправьте его снова явно.",
    sensitive: "Уберите контакты, документы и секретные сведения из вопроса.",
    changed:
      "Цена или доступность изменились. Проверьте карточку и нажмите «В корзину» снова.",
    unavailable: "Сведения о товаре недоступны. Добавление остановлено.",
    shop: (time: string) => `Цена и наличие актуальны на ${time}`,
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
    hint: "Savolda shaxsiy maʼlumotlarni yozmang. Enter — yuborish.",
    fromInstruction: "Yoʻriqnomadan",
    abilities:
      "Mahsulot tanlashga yordam beraman, tarkibi, qabul qilish usuli va narxi haqida aytib beraman. Masalan:",
    examples: [
      "IMMUNOCOMPLEX KIDS qanday qabul qilinadi?",
      "IMMUNOCOMPLEX qanday qabul qilinadi?",
      "IMMUNOCOMPLEX KIDS qancha turadi?",
    ],
    privacy:
      "Javob olish uchun savolingiz va shu varaqdagi barcha xabarlar OpenAIʼga yuboriladi; mahsulot tanlash uchun savol matni OpenRouterʼga ham yuborilishi mumkin. Ism-familiya, aloqa maʼlumotlari, hujjatlar yoki boshqa shaxsiy maʼlumotlarni kiritmang. OpenAI va OpenRouter maʼlumotlarni oʻz qoidalari asosida saqlashi mumkin. Javob shifokor maslahatini almashtirmaydi. Savolni yuborish orqali bunday qayta ishlashga rozilik bildirasiz.",
    retention:
      "Savol, shu varaqdagi oldingi xabarlar va ochiq mahsulot maʼlumotlari yuboriladi. Hisob, savat va buyurtma maʼlumotlari yuborilmaydi. Himoya identifikatorlari 24 soatgacha, matn va identifikatorsiz hodisalar 7 kungacha saqlanadi. Shaxsiy maʼlumotlarni tekshirish ularning barchasini aniqlashni kafolatlamaydi.",
    error:
      "Javob mavjud emas. Savolni oʻzgartiring yoki qayta yuboring. Katalog ishlashda davom etadi.",
    busy: "Maslahatchi hozircha javob bera olmayapti. Savolingiz saqlandi — birozdan keyin qayta yuboring.",
    expired:
      "Kontekst eskirgan yoki notoʻgʻri. Savol saqlandi: uni qayta yuboring.",
    sensitive: "Savoldan aloqa, hujjat va maxfiy maʼlumotlarni olib tashlang.",
    changed:
      "Narx yoki mavjudlik oʻzgardi. Kartani tekshirib, «Savatga» tugmasini yana bosing.",
    unavailable: "Mahsulot maʼlumotlari mavjud emas. Qoʻshish toʻxtatildi.",
    shop: (time: string) => `Narx va mavjudlik ${time} holatiga koʻra`,
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
  // The customer message of the request in flight, shown as the pending entry (CH-01).
  const [asked, setAsked] = useState<string | null>(null);
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
  const progress = useRef<HTMLParagraphElement>(null);
  // The message feed scrolls; the header and the form stay in place.
  const feed = useRef<HTMLDivElement>(null);
  const latest = useRef<HTMLElement>(null);
  const cardList = useRef<HTMLDivElement>(null);
  // The progress line's box when the answer arrived; the layout effect places the new
  // entry by it (CH-04, CH-05).
  const arrived = useRef<Box | null>(null);
  const draftLength = api.questionLength(draft);
  const showCount = draftLength >= api.QUESTION_COUNTER_FROM;
  const sendOff =
    pending ||
    !draft.trim() ||
    api.questionLength(draft.trim()) > api.QUESTION_LIMIT;

  /** Returns a question that got no answer to an empty textarea (CH-07, CH-08). */
  function restore(question: string) {
    setAsked(null);
    setDraft((current) => (current.trim() ? current : question));
  }
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
      restore(current.turn.question);
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
      restore(current.turn.question);
    }
  }, [active]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Date.now() - touched.current >= 30 * 60 * 1000) reset();
    }, 1000);
    return () => window.clearInterval(interval);
  });
  function panelBox(): Parameters<typeof reveal>[0] | null {
    const panel = feed.current;
    if (!panel) return null;
    return {
      top: panel.getBoundingClientRect().top + panel.clientTop,
      clientHeight: panel.clientHeight,
      scrollTop: panel.scrollTop,
      maxScroll: panel.scrollHeight - panel.clientHeight,
    };
  }
  // CH-01: the whole progress line in view (nearest position) once the question is sent.
  useLayoutEffect(() => {
    const box = panelBox();
    const line = progress.current?.getBoundingClientRect();
    if (asked === null || !box || !line || !feed.current) return;
    const top = reveal(box, line);
    if (top !== null) feed.current.scrollTop = top;
    // Only a new pending entry moves the feed.
  }, [asked]);
  // CH-04, CH-05: after the new entry is in the DOM and before the paint, a short answer
  // stays where it is and a long one is read from its question down. Scrolls are instant.
  useLayoutEffect(() => {
    const line = arrived.current;
    arrived.current = null;
    const box = panelBox();
    const entry = latest.current?.getBoundingClientRect();
    if (!line || !box || !entry || !feed.current) return;
    const list = cardList.current?.getBoundingClientRect();
    const bottom =
      list && list.height > 0
        ? Math.max(entry.bottom, list.bottom)
        : entry.bottom;
    // The entry's padding box: its question sits one top padding below it.
    const start = entry.top + (latest.current?.clientTop ?? 0);
    const top = afterAnswer(box, line, { top: start, bottom });
    if (top !== null) feed.current.scrollTop = top;
    // Runs when an answer is added.
  }, [entries]);

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
    // CH-01: the question moves into the conversation and the textarea clears.
    setAsked(question);
    setDraft("");
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
      arrived.current = progress.current?.getBoundingClientRect() ?? null;
      setAsked(null);
      setEntries((old) => [...old, { question, response }]);
      // An empty-selection response must remove stale cards. Same-subject source-only
      // preservation is encoded by the server; display only the latest returned cards.
      setCards(response.products);
      // CH-10: text typed during the request stays in the textarea.
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
      // The token and the entries stay as they were and the question returns to an
      // empty textarea, so the visitor can send again from the same state; an invalid
      // context resets (CH-07).
      const notice = api.errorNotice(
        error instanceof api.ConsultantError ? error.code : "unavailable",
      );
      restore(question);
      if (notice === "expired") reset(true);
      setNotice(t[notice]);
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
          <button type="button" className="ai-reset" onClick={() => reset()}>
            {t.reset}
          </button>
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
        <p className="ai-context">
          {t.context}: <strong>{context}</strong>
        </p>
      </div>
      <div className="ai-body" ref={feed}>
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
        {entries.map((entry, index) => (
          <section
            className="ai-answer"
            key={entry.response.request_id}
            ref={index === entries.length - 1 ? latest : undefined}
          >
            <p className="ai-question">{entry.question}</p>
            <p className="ai-plain">{entry.response.answer}</p>
            {entry.response.cautions.length > 0 && (
              // C-98: the instruction's cautions stay visible, apart from the answer.
              <div className="ai-caution">
                <p className="ai-caution-label">{t.fromInstruction}</p>
                {entry.response.cautions.map((id) => (
                  <p className="ai-plain" key={id}>
                    {api.plainPassage(
                      entry.response.sources.find((s) => s.source_id === id)
                        ?.passage ?? "",
                    )}
                  </p>
                ))}
              </div>
            )}
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
                    <p className="ai-plain">{api.plainPassage(s.passage)}</p>
                  </section>
                ))}
              </details>
            )}
            {entry.response.commercial_checked_at && (
              <p className="muted ai-checked">
                {t.shop(
                  new Date(
                    entry.response.commercial_checked_at,
                  ).toLocaleTimeString(lang, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                )}
              </p>
            )}
          </section>
        ))}
        <div className="assistant-cards" ref={cardList}>
          {cards.map((p) => (
            <div key={p.id}>
              {renderCard(p, actions, busyCards.includes(p.id))}
            </div>
          ))}
        </div>
        {asked !== null && (
          <section className="ai-pending">
            <p className="ai-question">{asked}</p>
          </section>
        )}
        <p role="status" aria-live="polite" ref={progress}>
          {notice || (pending && active ? <Progress label={t.progress} /> : "")}
        </p>
      </div>
      <form
        className="ai-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="visually-hidden" htmlFor="assistant-draft">
          {t.draft}
        </label>
        <textarea
          id="assistant-draft"
          placeholder={t.draft}
          rows={2}
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
        {/* CH-01: a disabled Send stays focusable (aria-disabled), so the focus stays
            on it after a click; while disabled a click sends nothing (CH-09). */}
        <button
          type="submit"
          className="ai-send"
          aria-disabled={sendOff || undefined}
          onClick={(e) => {
            if (sendOff) e.preventDefault();
          }}
        >
          {t.send}
        </button>
        {pending && active && (
          <button type="button" onClick={cancel}>
            {t.cancel}
          </button>
        )}
        <p className="muted ai-hint">{t.hint}</p>
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
      </form>
    </dialog>
  );
}

/**
 * The progress line (CH-02): the label with three dots bouncing in turn and a soft
 * band moving across it. Its text is exactly `label`; the trailing ellipsis is read
 * but not shown, and the moving parts are hidden from assistive technology.
 */
function Progress({ label }: { label: string }) {
  const text = label.replace(/…$/, "");
  return (
    <span className="ai-progress">
      <span className="ai-progress-label">
        {text}
        {text !== label && <span className="ai-progress-hidden">…</span>}
        <span className="ai-progress-band" aria-hidden="true" />
      </span>
      <span className="ai-progress-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}
