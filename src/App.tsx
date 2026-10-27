import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Account from "./Account";
import Assistant, { type BeforeAdd } from "./Assistant";
import SizePicker from "./SizePicker";
import Hero, { ExampleMaterial } from "./Hero";
import Basket, {
  basketCopy,
  CartIcon,
  Quantity,
  type Purchases,
} from "./Basket";
import * as api from "./catalogue";
import { useGuestBasket } from "./guestBasket";
import type { Order } from "./guest";
import OrderView from "./Order";
import { href, parseLocation, type Location } from "./navigation";

const copy = {
  ru: {
    home: "Главная",
    catalogue: "Каталог",
    account: "Аккаунт",
    all: "Все товары",
    search: "Поиск товаров",
    find: "Найти",
    loading: "Загружаем…",
    error: "Не удалось загрузить данные. Проверьте соединение и повторите.",
    retry: "Повторить",
    empty: "Товары не найдены",
    unavailable: "Категория недоступна",
    preview: "Первые товары каталога",
    previewNote:
      "Небольшой обзор — до четырёх товаров. Полный ассортимент доступен в каталоге.",
    details: "Подробнее о товаре",
    noImage: "Нет изображения",
    inStock: "В наличии",
    outOfStock: "Нет в наличии",
    noPurchase: "Недоступен для покупки",
    sizes: "Доступные размеры",
    description: "Описание",
    advantages: "Преимущества",
    info: "Дополнительная информация",
    disclaimer: "Примечание",
    video: "Смотреть видео",
    notFound: "Товар не найден",
    invalid: "Адрес недоступен",
    first: "На первую страницу",
    next: "Следующая",
    previous: "Предыдущая",
    page: "Страница",
    count: "Товаров",
    menu: "Меню",
    close: "Закрыть меню",
    groups: [
      "Нутриенты и витамины",
      "Наборы",
      "Кухонная техника",
      "Товары для жизни",
    ],
    missing: "Недоступно",
    searchNote:
      "Поиск по русскому названию. Символы % и _ работают как шаблоны поиска.",
    gallery: "Изображение",
    ai: "ИИ-консультант",
    aiShort: "ИИ · помощь",
    product: "Товар",
    publicContext: "Публичный каталог · без данных аккаунта",
  },
  uz: {
    home: "Bosh sahifa",
    catalogue: "Katalog",
    account: "Akkaunt",
    all: "Barcha mahsulotlar",
    search: "Mahsulot qidirish",
    find: "Qidirish",
    loading: "Yuklanmoqda…",
    error:
      "Maʼlumotlarni yuklab boʻlmadi. Ulanishni tekshirib, qayta urinib koʻring.",
    retry: "Qayta urinish",
    empty: "Mahsulotlar topilmadi",
    unavailable: "Turkum mavjud emas",
    preview: "Katalogdagi dastlabki mahsulotlar",
    previewNote:
      "Qisqa koʻrinish — toʻrttagacha mahsulot. Toʻliq assortiment katalogda.",
    details: "Mahsulot haqida batafsil",
    noImage: "Rasm mavjud emas",
    inStock: "Mavjud",
    outOfStock: "Mavjud emas",
    noPurchase: "Xarid qilish mumkin emas",
    sizes: "Mavjud oʻlchamlar",
    description: "Tavsif",
    advantages: "Afzalliklari",
    info: "Qoʻshimcha maʼlumot",
    disclaimer: "Eslatma",
    video: "Videoni koʻrish",
    notFound: "Mahsulot topilmadi",
    invalid: "Manzil mavjud emas",
    first: "Birinchi sahifaga",
    next: "Keyingi",
    previous: "Oldingi",
    page: "Sahifa",
    count: "Mahsulotlar",
    menu: "Menyu",
    close: "Menyuni yopish",
    groups: [
      "Nutriyentlar va vitaminlar",
      "Toʻplamlar",
      "Oshxona texnikasi",
      "Hayot uchun mahsulotlar",
    ],
    missing: "Mavjud emas",
    searchNote:
      "Ruscha nom boʻyicha qidirish. % va _ belgilaridan qidiruv andozasi sifatida foydalaniladi.",
    gallery: "Rasm",
    ai: "AI-maslahatchi",
    aiShort: "AI · yordam",
    product: "Mahsulot",
    publicContext: "Ochiq katalog · akkaunt maʼlumotlarisiz",
  },
};
const slugs = ["product", "vitaminy-set", "tehnika", "active-life"];
type Read<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };
function useRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState<{ key: string; result: Read<T> }>();
  const requestKey = `${key}:${revision}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    void load(controller.signal).then(
      (data) => {
        if (active)
          setSaved({ key: requestKey, result: { status: "ready", data } });
      },
      (error: unknown) => {
        if (active)
          setSaved({ key: requestKey, result: { status: "error", error } });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
    // key identifies all load inputs; inline load closures must not restart a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled]);
  const result: Read<T> =
    enabled && saved?.key === requestKey ? saved.result : { status: "loading" };
  return { result, retry: () => setRevision((n) => n + 1) };
}
function State({
  result,
  lang,
  retry,
  children,
}: {
  result: Read<unknown>;
  lang: api.Language;
  retry: () => void;
  children?: ReactNode;
}) {
  const t = copy[lang];
  if (result.status === "loading") return <p role="status">{t.loading}</p>;
  if (result.status === "error")
    return (
      <div className="read-state" role="alert">
        <p>{t.error}</p>
        <button onClick={retry}>{t.retry}</button>
      </div>
    );
  return children;
}
function Image({
  src,
  name,
  lang,
}: {
  src: string | null;
  name: string;
  lang: api.Language;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const safe = api.safeMedia(src);
  return safe && failed !== safe ? (
    <img src={safe} alt={name} onError={() => setFailed(safe)} />
  ) : (
    <span
      className="image-fallback"
      role="img"
      aria-label={`${name}: ${copy[lang].noImage}`}
    >
      <span aria-hidden="true">◇</span>
      <small>{copy[lang].noImage}</small>
    </span>
  );
}
function Price({
  product,
  lang,
}: {
  product: api.Product;
  lang: api.Language;
}) {
  const values = api.price(product);
  return (
    <p className="price">
      <strong>{api.money(values.current, product.currency, lang)}</strong>
      {values.previous && (
        <del>{api.money(values.previous, product.currency, lang)}</del>
      )}
    </p>
  );
}
function Availability({
  product,
  lang,
}: {
  product: api.Product;
  lang: api.Language;
}) {
  return (
    <p className="availability">
      {!product.is_purchasable
        ? copy[lang].noPurchase
        : product.is_in_stock
          ? copy[lang].inStock
          : copy[lang].outOfStock}
    </p>
  );
}
interface CardPurchases extends Purchases {
  chooseSize: (
    product: api.Product,
    trigger: HTMLButtonElement,
    onAdded: (size: string) => void,
  ) => void;
}
function Card({
  product,
  lang,
  lines,
  change,
  chooseSize,
  disabled = false,
}: CardPurchases & {
  product: api.Product;
  lang: api.Language;
  disabled?: boolean;
}) {
  const target = href({ view: "product", lang, page: 1, id: product.id });
  const [selectedSize, setSelectedSize] = useState("");
  const productLines = lines.filter((line) => line.product.id === product.id);
  const size = product.requires_size
    ? productLines.find((line) => line.size === selectedSize)?.size ||
      productLines[0]?.size ||
      null
    : null;
  const validSize =
    !product.requires_size ||
    (size !== null && product.available_sizes.includes(size));
  const count = productLines.find((line) => line.size === size)?.quantity || 0;
  const t = basketCopy[lang];
  return (
    <article className="product-card" data-product-id={product.id}>
      {product.is_sale && (
        <span className="promotion-badge">{t.promotion}</span>
      )}
      <a href={target} className="card-media" aria-label={product.name}>
        <Image
          src={product.image_url || product.images[0] || null}
          name={product.name}
          lang={lang}
        />
      </a>
      <div className="card-copy">
        <Price product={product} lang={lang} />
        <h3>
          <a href={target}>{product.name}</a>
        </h3>
        <Availability product={product} lang={lang} />
      </div>
      <Quantity
        add
        count={count}
        name={`${product.name}${size ? ` · ${size}` : ""}`}
        lang={lang}
        disabled={
          disabled ||
          !product.is_purchasable ||
          !product.is_in_stock ||
          (product.requires_size &&
            (size
              ? !validSize
              : !product.available_sizes.some((v) => v.trim())))
        }
        size={size}
        {...(product.requires_size
          ? {
              onChooseSize: (trigger: HTMLButtonElement) =>
                chooseSize(product, trigger, setSelectedSize),
            }
          : {})}
        onChange={(delta) => change(product, size, delta)}
      />
    </article>
  );
}
function Grid({
  products,
  lang,
  home = false,
  lines,
  change,
  chooseSize,
}: CardPurchases & {
  products: api.Product[];
  lang: api.Language;
  home?: boolean;
}) {
  return (
    <div className={`product-grid${home ? " home-grid" : ""}`}>
      {products.map((p) => (
        <Card
          key={p.id}
          product={p}
          lang={lang}
          lines={lines}
          change={change}
          chooseSize={chooseSize}
        />
      ))}
    </div>
  );
}
function Recovery({ lang, title }: { lang: api.Language; title: string }) {
  return (
    <div className="read-state">
      <h1>{title}</h1>
      <div className="actions">
        <a href={href({ view: "home", lang, page: 1 })}>{copy[lang].home}</a>
        <a href={href({ view: "catalogue", lang, page: 1 })}>
          {copy[lang].all}
        </a>
      </div>
    </div>
  );
}
function Home({
  lang,
  categories,
  retry,
  lines,
  change,
  obscured,
  onAnnouncement,
  chooseSize,
}: CardPurchases & {
  obscured: boolean;
  onAnnouncement: (index: number, trigger: HTMLButtonElement) => void;
  lang: api.Language;
  categories: Read<api.Category[]>;
  retry: () => void;
}) {
  const t = copy[lang],
    preview = useRead(lang, (s) => api.products(lang, s, 1, 4));
  return (
    <>
      <Hero lang={lang} obscured={obscured} onOpen={onAnnouncement} />
      <div className="section-head">
        <h1>{t.catalogue}</h1>
        <a href={href({ view: "catalogue", lang, page: 1 })}>{t.all} →</a>
      </div>
      <State result={categories} lang={lang} retry={retry}>
        {categories.status === "ready" && (
          <div className="group-grid">
            {slugs.map((slug, i) => {
              const c = categories.data.find((item) => item.slug === slug);
              const body = (
                <>
                  <div className="group-media">
                    <Image
                      src={c?.image_url || null}
                      name={c?.name || t.groups[i] || slug}
                      lang={lang}
                    />
                  </div>
                  <div className="group-copy">
                    <h2>{c?.name || t.groups[i]}</h2>
                    {c?.description && <p>{c.description}</p>}
                    {!c && <p className="muted">{t.missing}</p>}
                  </div>
                </>
              );
              return c ? (
                <a
                  className="group-tile"
                  key={slug}
                  href={href({
                    view: "catalogue",
                    lang,
                    page: 1,
                    category: c.id,
                  })}
                >
                  {body}
                </a>
              ) : (
                <div className="group-tile unavailable" key={slug}>
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </State>
      <section className="preview">
        <div className="section-head">
          <h2>{t.preview}</h2>
          <a href={href({ view: "catalogue", lang, page: 1 })}>{t.all} →</a>
        </div>
        <p className="muted preview-note">{t.previewNote}</p>
        <State result={preview.result} lang={lang} retry={preview.retry}>
          {preview.result.status === "ready" &&
            (preview.result.data.items.length ? (
              <Grid
                products={preview.result.data.items}
                lang={lang}
                home
                lines={lines}
                change={change}
                chooseSize={chooseSize}
              />
            ) : (
              <p role="status">{t.empty}</p>
            ))}
        </State>
      </section>
    </>
  );
}
function Catalogue({
  loc,
  categories,
  retry,
  lines,
  change,
  chooseSize,
}: CardPurchases & {
  loc: Location;
  categories: Read<api.Category[]>;
  retry: () => void;
}) {
  const { lang } = loc,
    t = copy[lang];
  const selected =
    categories.status === "ready"
      ? categories.data.find((c) => c.id === loc.category)
      : undefined;
  const allowed =
    categories.status === "ready" && (!loc.category || !!selected);
  const data = useRead(
    href(loc),
    (s) => api.products(lang, s, loc.page, 20, loc.category, loc.q),
    allowed,
  );
  return (
    <>
      <h1>{selected?.name || t.catalogue}</h1>
      <State result={categories} lang={lang} retry={retry}>
        {categories.status === "ready" && (
          <>
            <nav className="filter-row" aria-label={t.catalogue}>
              <a
                aria-current={!loc.category ? "page" : undefined}
                href={href({ view: "catalogue", lang, page: 1 })}
              >
                {t.all}
              </a>
              {categories.data.map((c) => (
                <a
                  key={c.id}
                  aria-current={loc.category === c.id ? "page" : undefined}
                  href={href({
                    view: "catalogue",
                    lang,
                    page: 1,
                    category: c.id,
                  })}
                >
                  {c.name}
                </a>
              ))}
            </nav>
            {loc.category && !selected ? (
              <Recovery lang={lang} title={t.unavailable} />
            ) : (
              <>
                {loc.q && (
                  <p className="search-summary">
                    {t.search}: «{loc.q}»
                  </p>
                )}
                <p className="muted search-note">{t.searchNote}</p>
                <State result={data.result} lang={lang} retry={data.retry}>
                  {data.result.status === "ready" && (
                    <>
                      <p className="result-count" role="status">
                        {t.count}: {data.result.data.total} · {t.page}{" "}
                        {loc.page} / {data.result.data.pages}
                      </p>
                      {data.result.data.items.length ? (
                        <Grid
                          products={data.result.data.items}
                          lang={lang}
                          lines={lines}
                          change={change}
                          chooseSize={chooseSize}
                        />
                      ) : (
                        <p>{t.empty}</p>
                      )}
                      <nav className="pagination" aria-label={t.page}>
                        {loc.page > 1 && (
                          <a
                            className="button"
                            href={href({ ...loc, page: loc.page - 1 })}
                          >
                            {t.previous}
                          </a>
                        )}
                        {loc.page < data.result.data.pages && (
                          <a
                            className="button"
                            href={href({ ...loc, page: loc.page + 1 })}
                          >
                            {t.next}
                          </a>
                        )}
                        {loc.page > data.result.data.pages && (
                          <a href={href({ ...loc, page: 1 })}>{t.first}</a>
                        )}
                      </nav>
                    </>
                  )}
                </State>
              </>
            )}
          </>
        )}
      </State>
    </>
  );
}
function Product({
  loc,
  categories,
  lines,
  change,
}: Purchases & {
  loc: Location;
  categories: Read<api.Category[]>;
}) {
  const { lang } = loc,
    t = copy[lang];
  const read = useRead(href(loc), (s) =>
    loc.id ? api.detail(loc.id, lang, s) : Promise.reject(new api.ReadError()),
  );
  const [selected, setSelected] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  if (
    read.result.status === "error" &&
    read.result.error instanceof api.ReadError &&
    read.result.error.status === 404
  )
    return <Recovery lang={lang} title={t.notFound} />;
  if (read.result.status !== "ready")
    return <State result={read.result} lang={lang} retry={read.retry} />;
  const p = read.result.data;
  const size = p.requires_size ? selectedSize || null : null;
  const validSize =
    !p.requires_size || (size !== null && p.available_sizes.includes(size));
  const count = validSize
    ? lines.find((line) => line.product.id === p.id && line.size === size)
        ?.quantity || 0
    : 0;
  const basket = basketCopy[lang];
  const media = [
    ...new Set(
      [p.image_url, ...p.images].filter(
        (s): s is string => !!s && !!api.safeMedia(s),
      ),
    ),
  ];
  const c =
    categories.status === "ready"
      ? categories.data.find((item) => item.id === p.category_id)
      : undefined;
  const video = api.safeMedia(p.video_url, true);
  return (
    <>
      <nav className="breadcrumbs" aria-label={t.catalogue}>
        <a href={href({ view: "catalogue", lang, page: 1 })}>{t.all}</a>
        {c && (
          <>
            <span aria-hidden="true">/</span>
            <a
              href={href({ view: "catalogue", lang, page: 1, category: c.id })}
            >
              {c.name}
            </a>
          </>
        )}
      </nav>
      <div className="product-main" data-product-id={p.id}>
        <div>
          <div className="detail-media">
            <Image
              src={media[selected] || media[0] || null}
              name={p.name}
              lang={lang}
            />
          </div>
          {media.length > 1 && (
            <div className="gallery">
              {media.map((src, i) => (
                <button
                  key={src}
                  aria-label={`${t.gallery} ${i + 1}`}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                >
                  <Image src={src} name={`${p.name} ${i + 1}`} lang={lang} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-summary">
          <h1>{p.name}</h1>
          <Price product={p} lang={lang} />
          <Availability product={p} lang={lang} />
          {p.requires_size && p.available_sizes.length > 0 && (
            <p>
              {t.sizes}: {p.available_sizes.join(", ")}
            </p>
          )}
          <div className="detail-purchase">
            {p.requires_size && (
              <label className="size-choice">
                {basket.size}
                <select
                  aria-label={`${basket.size}: ${p.name}`}
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                >
                  <option value="">{basket.choose}</option>
                  {p.available_sizes.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Quantity
              add
              count={count}
              name={`${p.name}${size ? ` · ${size}` : ""}`}
              lang={lang}
              disabled={!p.is_purchasable || !p.is_in_stock || !validSize}
              onChange={(delta) => change(p, size, delta)}
            />
          </div>
          {video && (
            <a href={video} target="_blank" rel="noopener noreferrer">
              {t.video} ↗
            </a>
          )}
        </div>
      </div>
      {p.description && (
        <section className="product-text">
          <h2>{t.description}</h2>
          <p>{p.description}</p>
        </section>
      )}
      {p.advantages.length > 0 && (
        <section className="product-text">
          <h2>{t.advantages}</h2>
          <ul>
            {p.advantages.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {p.additional_info && (
        <section className="product-text">
          <h2>{p.additional_info_title || t.info}</h2>
          <p>{p.additional_info}</p>
        </section>
      )}
      {p.disclaimer && (
        <section className="product-text">
          <h2>{t.disclaimer}</h2>
          <p>{p.disclaimer}</p>
        </section>
      )}
    </>
  );
}
function Search({ loc }: { loc: Location }) {
  const [search, setSearch] = useState(loc.q || "");
  const t = copy[loc.lang];
  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.hash =
          href({
            view: "catalogue",
            lang: loc.lang,
            page: 1,
            ...(search.trim() ? { q: search.trim() } : {}),
          }).split("#")[1] || "";
      }}
    >
      <input
        aria-label={t.search}
        placeholder={t.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button type="submit">{t.find}</button>
    </form>
  );
}
export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const loc = parseLocation(hash),
    t = copy[loc.lang];
  const [expanded, setExpanded] = useState(true);
  const [basketLanguageRevision, setBasketLanguageRevision] = useState(0);
  const basket = useGuestBasket(loc.lang);
  const { lines, change: changeQuantity, units } = basket;
  const [surface, setSurface] = useState<
    "menu" | "assistant" | "basket" | "announcement" | "size" | null
  >(null);
  const [sizeRequest, setSizeRequest] = useState<{
    product: api.Product;
    onAdded: (size: string) => void;
    beforeAdd?: BeforeAdd;
  } | null>(null);
  const [announcement, setAnnouncement] = useState(0);
  // The latest creation response (with its CSRF token) stays in memory for the next order view.
  const [created, setCreated] = useState<{ order: Order; epoch: number }>();
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 999px)").matches,
  );
  const hashRef = useRef(hash);
  const dialog = useRef<HTMLDialogElement>(null),
    assistantDialog = useRef<HTMLDialogElement>(null),
    basketDialog = useRef<HTMLDialogElement>(null),
    exampleDialog = useRef<HTMLDialogElement>(null),
    sizeDialog = useRef<HTMLDialogElement>(null),
    sizeOrigin = useRef<HTMLElement | null>(null),
    sizeEpoch = useRef(0),
    origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const change = () => {
      const previous = parseLocation(hashRef.current);
      const next = parseLocation(window.location.hash);
      const languageOnly =
        href({ ...previous, lang: "ru" }) === href({ ...next, lang: "ru" });
      // Cached language projections also invalidate a previous local review.
      if (previous.lang !== next.lang) setBasketLanguageRevision((n) => n + 1);
      if (next.view !== "order") setCreated(undefined);
      hashRef.current = window.location.hash;
      setHash(window.location.hash);
      setSurface((current) =>
        current === "announcement" ||
        current === "size" ||
        (current === "basket" && !languageOnly)
          ? null
          : current,
      );
      setSizeRequest(null);
      if (
        exampleDialog.current?.open ||
        sizeDialog.current?.open ||
        (basketDialog.current?.open && !languageOnly)
      )
        requestAnimationFrame(() =>
          document.getElementById("content")?.focus(),
        );
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.lang = loc.lang;
  }, [loc.lang]);
  const cats = useRead(
    hash,
    (s) => api.categories(loc.lang, s),
    loc.view !== "invalid",
  );
  function dismiss() {
    sizeEpoch.current += 1;
    setSurface(sizeRequest?.beforeAdd ? "assistant" : null);
    setSizeRequest(null);
    const card = sizeOrigin.current;
    sizeOrigin.current = null;
    requestAnimationFrame(() => {
      const target = origin.current;
      if (
        target?.getClientRects().length &&
        !target.closest("dialog:not([open])")
      )
        target.focus();
      else if (card?.isConnected)
        card
          .querySelector<HTMLElement>(
            ".card-action .size-summary, .card-action .add",
          )
          ?.focus();
      else
        document
          .querySelector<HTMLElement>(compact ? ".top-ai" : ".ai-nav")
          ?.focus();
    });
  }
  function show(
    next: "menu" | "assistant" | "basket" | "announcement" | "size",
    trigger: HTMLElement,
  ) {
    origin.current = trigger;
    if (next !== "size") {
      setSizeRequest(null);
      sizeOrigin.current = null;
    }
    setSurface(next);
  }
  function chooseSize(
    product: api.Product,
    trigger: HTMLButtonElement,
    onAdded: (size: string) => void,
    beforeAdd?: BeforeAdd,
  ) {
    if (
      !product.is_purchasable ||
      !product.is_in_stock ||
      !product.requires_size ||
      !product.available_sizes.some((v) => v.trim())
    )
      return;
    sizeEpoch.current += 1;
    sizeOrigin.current = trigger.closest<HTMLElement>(".product-card");
    setSizeRequest({ product, onAdded, ...(beforeAdd ? { beforeAdd } : {}) });
    show("size", trigger);
  }
  function dialogKeys(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key !== "Tab" || !e.currentTarget.matches(":modal")) return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        "a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)",
      ),
    ).filter((node) => node.getClientRects().length > 0);
    const first = items[0],
      last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 999px)");
    const change = () => {
      setCompact(media.matches);
      if (!media.matches) {
        if (dialog.current?.contains(document.activeElement))
          requestAnimationFrame(() =>
            document.querySelector<HTMLElement>(".sidebar .brand")?.focus(),
          );
        setSurface((current) => (current === "menu" ? null : current));
      }
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const target =
      surface === "menu"
        ? dialog.current
        : surface === "assistant"
          ? assistantDialog.current
          : surface === "basket"
            ? basketDialog.current
            : surface === "announcement"
              ? exampleDialog.current
              : surface === "size"
                ? sizeDialog.current
                : null;
    const modal = surface !== "assistant" || compact;
    const moveFocus =
      target && (!target.open || target.contains(document.activeElement));
    for (const node of [
      dialog.current,
      assistantDialog.current,
      basketDialog.current,
      exampleDialog.current,
      sizeDialog.current,
    ]) {
      if (node?.open && (node !== target || node.matches(":modal") !== modal))
        node.close();
    }
    if (target && !target.open) {
      if (modal) target.showModal();
      else target.show();
      if (moveFocus)
        target.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    }
    document.documentElement.classList.toggle("modal-open", !!target && modal);
  }, [surface, compact, hash]);
  useEffect(
    () => () => document.documentElement.classList.remove("modal-open"),
    [],
  );
  const context =
    loc.view === "home"
      ? t.home
      : loc.view === "catalogue"
        ? t.catalogue
        : loc.view === "product"
          ? `${t.product} №${loc.id}`
          : t.publicContext;
  const all = href({ view: "catalogue", lang: loc.lang, page: 1 });
  const navigation = (
    <>
      <a
        className="brand"
        href={href({ view: "home", lang: loc.lang, page: 1 })}
      >
        BIOTACT
      </a>
      <nav className="nav-primary" aria-label={t.menu}>
        <a
          aria-current={loc.view === "home" ? "page" : undefined}
          href={href({ view: "home", lang: loc.lang, page: 1 })}
        >
          {t.home}
        </a>
        <button aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {t.catalogue}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
        {expanded && (
          <div className="category-nav">
            <a href={all}>{t.all}</a>
            {slugs.map((slug, i) => {
              const c =
                cats.result.status === "ready"
                  ? cats.result.data.find((v) => v.slug === slug)
                  : undefined;
              return c ? (
                <a
                  key={slug}
                  href={href({
                    view: "catalogue",
                    lang: loc.lang,
                    page: 1,
                    category: c.id,
                  })}
                >
                  {c.name}
                </a>
              ) : (
                <span key={slug} className="muted">
                  {t.groups[i]} —{" "}
                  {cats.result.status === "ready"
                    ? t.missing
                    : cats.result.status === "error"
                      ? t.error
                      : t.loading}
                </span>
              );
            })}
          </div>
        )}
        <button
          className="ai-nav"
          aria-controls="consultant"
          aria-expanded={surface === "assistant"}
          onClick={(e) => show("assistant", e.currentTarget)}
        >
          {t.ai}
          <span aria-hidden="true">↗</span>
        </button>
        <a
          aria-current={loc.view === "account" ? "page" : undefined}
          href={href({ view: "account", lang: loc.lang, page: 1 })}
        >
          {t.account}
        </a>
      </nav>
    </>
  );
  return (
    <div className={surface === "assistant" ? "app assistant-open" : "app"}>
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        {t.catalogue} ↓
      </a>
      <aside className="sidebar">{navigation}</aside>
      <dialog
        ref={dialog}
        className="drawer"
        aria-label={t.menu}
        onClose={() => {
          if (surface === "menu" && !dialog.current?.open) dismiss();
        }}
        onCancel={(e) => {
          e.preventDefault();
          dismiss();
        }}
        onKeyDown={dialogKeys}
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest("a")) dismiss();
        }}
      >
        <button className="drawer-close" data-initial-focus onClick={dismiss}>
          {t.close} ×
        </button>
        {navigation}
      </dialog>
      <div className="workspace">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={(e) => show("menu", e.currentTarget)}
          >
            {t.menu} ☰
          </button>
          <Search key={loc.q || ""} loc={loc} />
          <div className="top-utilities">
            <button
              className="top-ai"
              aria-controls="consultant"
              aria-expanded={surface === "assistant"}
              onClick={(e) => show("assistant", e.currentTarget)}
            >
              {t.aiShort}
            </button>
            <button
              className="basket-button"
              aria-label={`${basketCopy[loc.lang].title}${units ? ` · ${units}` : ""}`}
              onClick={(e) => show("basket", e.currentTarget)}
            >
              <CartIcon />
              <span className="basket-label">{basketCopy[loc.lang].title}</span>
              {units > 0 && (
                <span className="basket-badge" aria-hidden="true">
                  {units}
                </span>
              )}
            </button>
            <a href={href({ view: "account", lang: loc.lang, page: 1 })}>
              {t.account}
            </a>
            <div className="languages" aria-label="Language">
              <a
                lang="ru"
                aria-current={loc.lang === "ru" ? "true" : undefined}
                href={href({ ...loc, lang: "ru" })}
              >
                RU
              </a>
              <a
                lang="uz"
                aria-current={loc.lang === "uz" ? "true" : undefined}
                href={href({ ...loc, lang: "uz" })}
              >
                UZ
              </a>
            </div>
          </div>
        </header>
        <main id="content" className="content" tabIndex={-1}>
          {loc.view === "home" && (
            <Home
              key={hash}
              lang={loc.lang}
              categories={cats.result}
              retry={cats.retry}
              lines={lines}
              change={changeQuantity}
              chooseSize={chooseSize}
              obscured={surface !== null}
              onAnnouncement={(index, trigger) => {
                setAnnouncement(index);
                show("announcement", trigger);
              }}
            />
          )}
          {loc.view === "catalogue" && (
            <Catalogue
              key={hash}
              loc={loc}
              categories={cats.result}
              retry={cats.retry}
              lines={lines}
              change={changeQuantity}
              chooseSize={chooseSize}
            />
          )}
          {loc.view === "product" && (
            <Product
              key={hash}
              loc={loc}
              categories={cats.result}
              lines={lines}
              change={changeQuantity}
            />
          )}
          {loc.view === "account" && <Account />}
          {loc.view === "order" && (
            <OrderView
              key={created?.epoch ?? 0}
              lang={loc.lang}
              initial={created?.order ?? null}
              sizeLabel={basketCopy[loc.lang].size}
              onPaid={basket.removeBought}
            />
          )}
          {loc.view === "invalid" && (
            <Recovery lang={loc.lang} title={t.invalid} />
          )}
        </main>
        <footer className="page-footer">BIOTACT</footer>
      </div>
      <dialog
        ref={exampleDialog}
        className="hero-example"
        aria-labelledby="example-title"
        onClose={() => {
          if (surface === "announcement" && !exampleDialog.current?.open)
            dismiss();
        }}
        onCancel={(e) => {
          e.preventDefault();
          dismiss();
        }}
        onKeyDown={dialogKeys}
      >
        <ExampleMaterial
          lang={loc.lang}
          index={announcement}
          onClose={dismiss}
        />
      </dialog>
      <Assistant
        key={href(loc)}
        active={surface === "assistant"}
        pageProductId={loc.view === "product" ? loc.id || null : null}
        change={changeQuantity}
        chooseSize={chooseSize}
        renderCard={(product, actions, disabled) => (
          <Card
            product={product}
            lang={loc.lang}
            lines={lines}
            change={actions.change}
            chooseSize={actions.chooseSize}
            disabled={disabled}
          />
        )}
        lang={loc.lang}
        context={context}
        dialogRef={assistantDialog}
        onClose={() => {
          if (surface === "assistant") dismiss();
        }}
        onKeyDown={dialogKeys}
      />
      {sizeRequest && (
        <SizePicker
          product={sizeRequest.product}
          lang={loc.lang}
          lines={lines}
          dialogRef={sizeDialog}
          onClose={() => {
            if (surface === "size") dismiss();
          }}
          onKeyDown={dialogKeys}
          onConfirm={async (size) => {
            const epoch = sizeEpoch.current;
            if (
              !sizeOrigin.current?.isConnected ||
              !sizeRequest.product.available_sizes.includes(size)
            )
              return;
            const fresh = sizeRequest.beforeAdd
              ? await sizeRequest.beforeAdd(size)
              : sizeRequest.product;
            if (
              !fresh ||
              epoch !== sizeEpoch.current ||
              !sizeOrigin.current?.isConnected
            )
              return;
            changeQuantity(fresh, size, 1);
            sizeRequest.onAdded(size);
            dismiss();
          }}
        />
      )}
      {surface === "basket" && (
        <Basket
          lang={loc.lang}
          entries={basket.entries}
          change={changeQuantity}
          remove={basket.remove}
          retry={basket.retry}
          notice={basket.notice}
          revision={basket.revision + basketLanguageRevision}
          onLanguage={(lang) => {
            window.location.assign(href({ ...loc, lang }));
          }}
          dialogRef={basketDialog}
          onClose={() => {
            if (surface === "basket") dismiss();
          }}
          onKeyDown={dialogKeys}
          onCreated={(order) => {
            setCreated((old) => ({ order, epoch: (old?.epoch ?? 0) + 1 }));
            setSurface(null);
            window.location.hash =
              href({ view: "order", lang: loc.lang, page: 1 }).split("#")[1] ||
              "";
            requestAnimationFrame(() =>
              document.getElementById("content")?.focus(),
            );
          }}
        />
      )}
    </div>
  );
}
