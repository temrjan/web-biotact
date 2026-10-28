import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Account from "./Account";
import Assistant, { type BeforeAdd } from "./Assistant";
import SizePicker from "./SizePicker";
import Hero from "./Hero";
import {
  CompanyFooter,
  Consultation,
  Faq,
  Video,
  VideoPlayer,
} from "./HomeSections";
import Basket, {
  basketCopy,
  CartIcon,
  Quantity,
  type Purchases,
} from "./Basket";
import * as api from "./catalogue";
import { useGuestBasket } from "./guestBasket";
import { href, parseLocation, type Location } from "./navigation";
import logoUrl from "./assets/logo-biotact.svg";
import {
  ChevronLeft,
  ChevronRight,
  CloseIcon,
  CookingPotIcon,
  GiftIcon,
  GlobeIcon,
  HeartPulseIcon,
  LayoutGridIcon,
  PillIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
} from "./icons";

const copy = {
  ru: {
    home: "Главная",
    catalogue: "Каталог",
    account: "Аккаунт",
    all: "Все товары",
    search: "Поиск товаров",
    find: "Найти",
    closeSearch: "Закрыть поиск",
    language: "Язык",
    loading: "Загружаем…",
    error: "Не удалось загрузить данные. Проверьте соединение и повторите.",
    retry: "Повторить",
    empty: "Товары не найдены",
    unavailable: "Категория недоступна",
    viewAll: "Все",
    sales: "Акции",
    details: "Подробнее о товаре",
    noImage: "Нет изображения",
    inStock: "В наличии",
    outOfStock: "Нет в наличии",
    noPurchase: "Недоступен для покупки",
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
    previousItems: "Предыдущие товары",
    nextItems: "Следующие товары",
    recommended: "Рекомендуемые продукты",
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
    closeSearch: "Qidiruvni yopish",
    language: "Til",
    loading: "Yuklanmoqda…",
    error:
      "Maʼlumotlarni yuklab boʻlmadi. Ulanishni tekshirib, qayta urinib koʻring.",
    retry: "Qayta urinish",
    empty: "Mahsulotlar topilmadi",
    unavailable: "Turkum mavjud emas",
    viewAll: "Hammasi",
    sales: "Aksiyalar",
    details: "Mahsulot haqida batafsil",
    noImage: "Rasm mavjud emas",
    inStock: "Mavjud",
    outOfStock: "Mavjud emas",
    noPurchase: "Xarid qilish mumkin emas",
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
    previousItems: "Oldingi mahsulotlar",
    nextItems: "Keyingi mahsulotlar",
    recommended: "Tavsiya etilgan mahsulotlar",
    gallery: "Rasm",
    ai: "AI-maslahatchi",
    aiShort: "AI · yordam",
    product: "Mahsulot",
    publicContext: "Ochiq katalog · akkaunt maʼlumotlarisiz",
  },
};
const slugs = ["product", "vitaminy-set", "tehnika", "active-life"];
/** Approved menu icon set A (D9), keyed by category slug. */
const categoryIcons: Record<string, () => ReactNode> = {
  product: PillIcon,
  "vitaminy-set": GiftIcon,
  tehnika: CookingPotIcon,
  "active-life": HeartPulseIcon,
};
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
  lazy = false,
}: {
  src: string | null;
  name: string;
  lang: api.Language;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const safe = api.safeMedia(src);
  return safe && failed !== safe ? (
    <img
      src={safe}
      alt={name}
      loading={lazy ? "lazy" : undefined}
      onError={() => setFailed(safe)}
    />
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
  lazy = false,
}: CardPurchases & {
  product: api.Product;
  lang: api.Language;
  disabled?: boolean;
  lazy?: boolean;
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
          lazy={lazy}
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
  lines,
  change,
  chooseSize,
}: CardPurchases & {
  products: api.Product[];
  lang: api.Language;
}) {
  return (
    <div className="product-grid">
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
/** The site's one layout breakpoint: phones and tablets below 1000px. */
const COMPACT_QUERY = "(max-width: 999px)";
function subscribeCompact(change: () => void) {
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
function useCompactWidth() {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
  );
}
/** Phone row hint (M6): random delay after the row comes into view, in ms. */
const ROW_HINT_DELAY = [200, 600] as const;
/** Phone row hint distance as a share of one card, so the first card stays partly visible. */
const ROW_HINT_SHARE = [0.3, 0.55] as const;
const between = ([low, high]: readonly [number, number]) =>
  low + Math.random() * (high - low);
/**
 * Phones (M6): a row whose cards do not fit, when it first comes into view,
 * waits a small random delay and smoothly scrolls a small random distance, and
 * stays there. Once per page view; not under reduced motion; not after the
 * visitor touched, focused or scrolled that row. Snapping is off for a shifted
 * row (re-enabling it would snap the row straight back).
 */
function useRowHint(row: HTMLDivElement | null, enabled: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!row || !enabled || done.current) return;
    let timer = 0;
    const touched = () => {
      done.current = true;
      window.clearTimeout(timer);
    };
    const inputs = [
      "pointerdown",
      "touchstart",
      "wheel",
      "keydown",
      "focusin",
      "scroll",
    ];
    for (const type of inputs)
      row.addEventListener(type, touched, { passive: true });
    const observer = new IntersectionObserver(
      (entries) => {
        if (done.current) observer.disconnect();
        if (
          done.current ||
          !entries.some((entry) => entry.isIntersecting) ||
          !window.matchMedia(COMPACT_QUERY).matches
        )
          return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          const card = row.firstElementChild,
            max = row.scrollWidth - row.clientWidth;
          if (
            done.current ||
            row.scrollLeft > 1 ||
            max <= 1 ||
            !(card instanceof HTMLElement) ||
            !window.matchMedia(COMPACT_QUERY).matches ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
          )
            return;
          done.current = true;
          row.dataset.hint = "";
          row.scrollTo({
            left: Math.min(
              max,
              Math.round(card.offsetWidth * between(ROW_HINT_SHARE)),
            ),
            behavior: "smooth",
          });
        }, between(ROW_HINT_DELAY));
      },
      { threshold: 0.5 },
    );
    observer.observe(row);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const type of inputs) row.removeEventListener(type, touched);
    };
  }, [row, enabled]);
}
/** Scroll state of one horizontal product row, for its header control. */
function useSlider({ hint = false }: { hint?: boolean } = {}) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({
    start: true,
    end: true,
    overflow: false,
  });
  const compact = useCompactWidth();
  useEffect(() => {
    if (!row) return;
    const measure = () => {
      const max = row.scrollWidth - row.clientWidth;
      // A row without overflow is at both ends.
      const next = {
        start: row.scrollLeft <= 1,
        end: row.scrollLeft >= max - 1,
        overflow: max > 1,
      };
      setEdges((current) =>
        current.start === next.start &&
        current.end === next.end &&
        current.overflow === next.overflow
          ? current
          : next,
      );
    };
    // The first observation also measures the row once it is in the layout.
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    row.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, [row]);
  useRowHint(row, hint);
  return {
    ...edges,
    // Arrows only on desktop, for a row that exists and scrolls (V1, DES-01, M6).
    arrows: !compact && row !== null && edges.overflow,
    attach: setRow,
    scroll(direction: -1 | 1) {
      if (!row) return;
      row.scrollBy({
        left: direction * row.clientWidth,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    },
  };
}
type Slider = ReturnType<typeof useSlider>;
/**
 * Row header control. With arrows (desktop, the row exists and scrolls): the
 * basket stepper frame [‹] Все [›], or the arrows only for rows without a
 * catalogue target; an arrow at its end stays focusable. Without arrows (phones,
 * loading, error, no overflow): the plain "Все ›" link, or nothing.
 */
function SliderControls({
  slider,
  rowId,
  lang,
  more,
}: {
  slider: Slider;
  rowId: string;
  lang: api.Language;
  more?: { href: string; title: string };
}) {
  const t = copy[lang];
  if (!slider.arrows)
    return more ? (
      <a
        className="view-all-link"
        href={more.href}
        aria-label={`${t.viewAll}: ${more.title}`}
      >
        {t.viewAll}
        <ChevronRight />
      </a>
    ) : null;
  const arrow = (direction: -1 | 1) => {
    const disabled = direction < 0 ? slider.start : slider.end;
    return (
      <button
        type="button"
        className="slider-arrow"
        aria-label={direction < 0 ? t.previousItems : t.nextItems}
        aria-controls={rowId}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) slider.scroll(direction);
        }}
      >
        {direction < 0 ? <ChevronLeft /> : <ChevronRight />}
      </button>
    );
  };
  return (
    <div className="slider-controls">
      {arrow(-1)}
      {more && (
        <a
          className="view-all"
          href={more.href}
          aria-label={`${t.viewAll}: ${more.title}`}
        >
          {t.viewAll}
        </a>
      )}
      {arrow(1)}
    </div>
  );
}
function ProductRow({
  products,
  lang,
  lines,
  change,
  chooseSize,
  id,
  rowRef,
  lazy = false,
}: CardPurchases & {
  products: api.Product[];
  lang: api.Language;
  id: string;
  rowRef: (node: HTMLDivElement | null) => void;
  lazy?: boolean;
}) {
  return (
    <div className="product-row" id={id} ref={rowRef}>
      {products.map((p) => (
        <Card
          key={p.id}
          product={p}
          lang={lang}
          lines={lines}
          change={change}
          chooseSize={chooseSize}
          lazy={lazy}
        />
      ))}
    </div>
  );
}
function CategoryRow({
  category,
  title,
  lang,
  lines,
  change,
  chooseSize,
}: CardPurchases & {
  category: api.Category;
  title: string;
  lang: api.Language;
}) {
  // Swiping a home row must reach every product of its category.
  const read = useRead(`${lang}:${category.id}`, (s) =>
    api.categoryProducts(lang, s, category.id),
  );
  const slider = useSlider({ hint: true });
  // The Mini App hides a category section without products.
  if (read.result.status === "ready" && !read.result.data.length) return null;
  const id = `home-${category.slug}`;
  return (
    <section
      className="home-section"
      data-category={category.slug}
      aria-labelledby={id}
    >
      <div className="section-head slider-head">
        <h2 id={id}>{title}</h2>
        <SliderControls
          slider={slider}
          rowId={`${id}-row`}
          lang={lang}
          more={{
            href: href({
              view: "catalogue",
              lang,
              page: 1,
              category: category.id,
            }),
            title,
          }}
        />
      </div>
      <State result={read.result} lang={lang} retry={read.retry}>
        {read.result.status === "ready" && (
          <ProductRow
            id={`${id}-row`}
            rowRef={slider.attach}
            products={read.result.data}
            lang={lang}
            lines={lines}
            change={change}
            chooseSize={chooseSize}
            lazy
          />
        )}
      </State>
    </section>
  );
}
/** Mini App home order on the shared Shop data, then video, FAQ and consultation. */
function Home({
  lang,
  categories,
  retry,
  lines,
  change,
  obscured,
  chooseSize,
}: CardPurchases & {
  obscured: boolean;
  lang: api.Language;
  categories: Read<api.Category[]>;
  retry: () => void;
}) {
  const t = copy[lang];
  const promo = useRead(lang, (s) =>
    Promise.all([api.banners(lang, s), api.bannerInterval(s)]),
  );
  const sale = useRead(lang, (s) => api.saleProducts(lang, s));
  const saleSlider = useSlider({ hint: true });
  const ready = categories.status === "ready" ? categories.data : [];
  return (
    <>
      <h1 className="visually-hidden">BIOTACT</h1>
      {promo.result.status === "loading" ? (
        <div className="hero-stage hero-loading" aria-hidden="true" />
      ) : (
        promo.result.status === "ready" &&
        promo.result.data[0].length > 0 && (
          <Hero
            lang={lang}
            banners={promo.result.data[0]}
            interval={promo.result.data[1]}
            categories={ready}
            obscured={obscured}
          />
        )
      )}
      {sale.result.status === "ready" && sale.result.data.length > 0 && (
        <section
          className="home-section"
          data-category="sale"
          aria-labelledby="home-sale"
        >
          <div className="section-head slider-head">
            <h2 id="home-sale">{t.sales}</h2>
            <SliderControls
              slider={saleSlider}
              rowId="home-sale-row"
              lang={lang}
            />
          </div>
          <ProductRow
            id="home-sale-row"
            rowRef={saleSlider.attach}
            products={sale.result.data}
            lang={lang}
            lines={lines}
            change={change}
            chooseSize={chooseSize}
          />
        </section>
      )}
      <State result={categories} lang={lang} retry={retry}>
        {slugs.map((slug) => {
          const c = ready.find((item) => item.slug === slug);
          return c ? (
            <CategoryRow
              key={slug}
              category={c}
              title={c.name}
              lang={lang}
              lines={lines}
              change={change}
              chooseSize={chooseSize}
            />
          ) : null;
        })}
      </State>
      <Video lang={lang} />
      <Faq lang={lang} />
      <Consultation lang={lang} />
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
/** Admin text with the Mini App's **bold** markup; everything else stays plain text. */
function RichText({ text }: { text: string }) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.length > 4 && part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
/** Mini App "similar products": up to five others of the same category, hidden otherwise. */
function Recommended({
  product,
  lang,
  lines,
  change,
  chooseSize,
}: CardPurchases & { product: api.Product; lang: api.Language }) {
  const t = copy[lang];
  const category = product.category_id;
  const read = useRead(
    `${lang}:${category}:${product.id}`,
    (s) => api.products(lang, s, 1, 6, category ?? undefined),
    category !== null,
  );
  const slider = useSlider();
  if (read.result.status !== "ready") return null;
  const items = read.result.data.items
    .filter((item) => item.id !== product.id && item.category_id === category)
    .slice(0, 5);
  if (!items.length) return null;
  return (
    <section
      className="home-section product-recommended"
      aria-labelledby="product-recommended"
      onClickCapture={(e) => {
        // As in the Mini App, an opened recommendation starts at the top of its page.
        if (e.target instanceof Element && e.target.closest("a[href]"))
          window.scrollTo(0, 0);
      }}
    >
      <div className="section-head slider-head">
        <h2 id="product-recommended">{t.recommended}</h2>
        <SliderControls
          slider={slider}
          rowId="product-recommended-row"
          lang={lang}
        />
      </div>
      <ProductRow
        id="product-recommended-row"
        rowRef={slider.attach}
        products={items}
        lang={lang}
        lines={lines}
        change={change}
        chooseSize={chooseSize}
      />
    </section>
  );
}
function Product({
  loc,
  categories,
  lines,
  change,
  chooseSize,
}: CardPurchases & {
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
  const sizes = [...new Set(p.available_sizes.filter((v) => v.trim()))];
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
  const video = api.youtubeId(p.video_url);
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
          <div className="detail-purchase">
            {p.requires_size && sizes.length > 0 && (
              // One button per available size (SZ1), as in the card size dialog.
              <div className="size-choice">
                <span aria-hidden="true">{basket.size}</span>
                <div
                  className="size-chips"
                  role="group"
                  aria-label={`${basket.size}: ${p.name}`}
                >
                  {sizes.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selectedSize === value}
                      onClick={() => setSelectedSize(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
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
          {p.description && (
            <section className="product-text product-description">
              <h2>{t.description}</h2>
              <p>
                <RichText text={p.description} />
              </p>
            </section>
          )}
        </div>
      </div>
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
          <p>
            <RichText text={p.additional_info} />
          </p>
        </section>
      )}
      {p.disclaimer && (
        <section className="product-text product-note-section">
          <p className="product-note" role="note" aria-label={t.disclaimer}>
            {p.disclaimer}
          </p>
        </section>
      )}
      {video && (
        <section className="product-text product-video" aria-label={t.video}>
          <VideoPlayer
            videoId={video}
            label={`${t.video}: ${p.name}`}
            frameTitle={`${p.name} · YouTube`}
          />
        </section>
      )}
      <Recommended
        product={p}
        lang={lang}
        lines={lines}
        change={change}
        chooseSize={chooseSize}
      />
    </>
  );
}
/**
 * Product search. On phones it is the in-place expanded form of the header
 * search icon (`onClose`): it takes focus, and submit closes it.
 */
function Search({ loc, onClose }: { loc: Location; onClose?: () => void }) {
  const [search, setSearch] = useState(loc.q || "");
  const t = copy[loc.lang];
  return (
    <form
      className="search"
      role="search"
      {...(onClose ? { id: "top-search" } : {})}
      onSubmit={(e) => {
        e.preventDefault();
        window.location.hash =
          href({
            view: "catalogue",
            lang: loc.lang,
            page: 1,
            ...(search.trim() ? { q: search.trim() } : {}),
          }).split("#")[1] || "";
        onClose?.();
      }}
    >
      {onClose && <SearchIcon />}
      <input
        autoFocus={!!onClose}
        aria-label={t.search}
        placeholder={t.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button type="submit">{t.find}</button>
    </form>
  );
}
/** Scroll travel that changes the phone header state; smaller moves accumulate. */
const HEADER_SCROLL_THRESHOLD = 10;
/**
 * Phone header hides on downward scroll and returns on upward scroll (M5).
 * `active` is false on desktop and while a surface or the search is open; the
 * header is shown on every change of `active` or `view`. Travel counts only
 * after the visitor's own scroll input since that change, so content loading
 * into a new view (and the browser's scroll clamping and restoration) never
 * hides it. The position is clamped, so overscroll bounce is not travel.
 */
function useHiddenHeader(
  active: boolean,
  view: string,
  header: RefObject<HTMLElement | null>,
) {
  const [hidden, setHidden] = useState(false);
  const [seen, setSeen] = useState({ active, view });
  if (seen.active !== active || seen.view !== view) {
    setSeen({ active, view });
    setHidden(false);
  }
  useEffect(() => {
    if (!active) return;
    const position = () =>
      Math.min(
        Math.max(window.scrollY, 0),
        Math.max(document.documentElement.scrollHeight - window.innerHeight, 0),
      );
    let last = position(),
      frame = 0,
      armed = false;
    const arm = () => {
      armed = true;
    };
    const update = () => {
      frame = 0;
      const y = position();
      if (!armed) last = y;
      if (Math.abs(y - last) < HEADER_SCROLL_THRESHOLD) return;
      setHidden(y > last && y > (header.current?.offsetHeight ?? 0));
      last = y;
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"];
    for (const type of inputs)
      window.addEventListener(type, arm, { capture: true, passive: true });
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      for (const type of inputs)
        window.removeEventListener(type, arm, { capture: true });
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(frame);
    };
  }, [active, view, header]);
  return { hidden, reveal: () => setHidden(false) };
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
    "menu" | "assistant" | "basket" | "size" | null
  >(null);
  const [sizeRequest, setSizeRequest] = useState<{
    product: api.Product;
    onAdded: (size: string) => void;
    beforeAdd?: BeforeAdd;
  } | null>(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 999px)").matches,
  );
  // Phone header search: an icon that expands into the form in place (M2).
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggle = useRef<HTMLButtonElement>(null),
    searchFocusReturn = useRef(false);
  const header = useRef<HTMLElement>(null);
  const headerScroll = useHiddenHeader(
    compact && surface === null && !searchOpen,
    hash,
    header,
  );
  const hashRef = useRef(hash);
  const dialog = useRef<HTMLDialogElement>(null),
    assistantDialog = useRef<HTMLDialogElement>(null),
    basketDialog = useRef<HTMLDialogElement>(null),
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
      hashRef.current = window.location.hash;
      setHash(window.location.hash);
      setSearchOpen(false);
      setSurface((current) =>
        current === "size" || (current === "basket" && !languageOnly)
          ? null
          : current,
      );
      setSizeRequest(null);
      if (
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
      let target = origin.current;
      // The basket button moves between the side menu and the top bar at the breakpoint.
      if (target && !target.isConnected && target.matches(".basket-button"))
        target = document.querySelector<HTMLElement>(".basket-button");
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
    next: "menu" | "assistant" | "basket" | "size",
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
        setSearchOpen(false);
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
  useEffect(() => {
    // Closing the expanded search returns focus to its icon once it is back.
    if (!searchOpen && searchFocusReturn.current) {
      searchFocusReturn.current = false;
      searchToggle.current?.focus();
    }
  }, [searchOpen]);
  function closeSearch() {
    searchFocusReturn.current = true;
    setSearchOpen(false);
  }
  const context =
    loc.view === "home"
      ? t.home
      : loc.view === "catalogue"
        ? t.catalogue
        : loc.view === "product"
          ? `${t.product} №${loc.id}`
          : t.publicContext;
  const all = href({ view: "catalogue", lang: loc.lang, page: 1 });
  const basketButton = (
    <button
      className={compact ? "basket-button top-icon" : "basket-button"}
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
  );
  const languages = (labelledBy?: string) => (
    <div
      className="languages"
      {...(labelledBy
        ? { role: "group", "aria-labelledby": labelledBy }
        : { "aria-label": "Language" })}
    >
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
  );
  // The basket sits in the visible side menu on desktop and in the top bar on phones.
  const navigation = (sidebar: boolean) => (
    <>
      <a
        className="brand"
        href={href({ view: "home", lang: loc.lang, page: 1 })}
      >
        <img
          className="brand-logo"
          src={logoUrl}
          alt="BIOTACT"
          width={351}
          height={125}
        />
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
            <a href={all}>
              <LayoutGridIcon />
              {t.all}
            </a>
            {slugs.map((slug, i) => {
              const c =
                cats.result.status === "ready"
                  ? cats.result.data.find((v) => v.slug === slug)
                  : undefined;
              const CategoryIcon = categoryIcons[slug];
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
                  {CategoryIcon && <CategoryIcon />}
                  {c.name}
                </a>
              ) : cats.result.status === "ready" ? (
                <span key={slug} className="muted">
                  {CategoryIcon && <CategoryIcon />}
                  {t.groups[i]} — {t.missing}
                </span>
              ) : null;
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
        {sidebar && !compact && basketButton}
        <a
          className={sidebar ? undefined : "nav-account"}
          aria-current={loc.view === "account" ? "page" : undefined}
          href={href({ view: "account", lang: loc.lang, page: 1 })}
        >
          {!sidebar && <UserIcon />}
          {t.account}
        </a>
      </nav>
      {/* Phones choose the language once in the menu, not in the top bar. */}
      {!sidebar && compact && (
        <div className="drawer-language">
          <GlobeIcon />
          <span id="drawer-language-label">{t.language}</span>
          {languages("drawer-language-label")}
        </div>
      )}
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
      <aside className="sidebar">{navigation(true)}</aside>
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
        {navigation(false)}
      </dialog>
      <div className="workspace">
        <header
          ref={header}
          className="topbar"
          data-hidden={headerScroll.hidden || undefined}
          // Focus that reaches the header (Tab, focus return) shows it.
          onFocus={headerScroll.reveal}
          // Focus leaving it after a scroll made while focus was inside does
          // not slide it away by itself; the next downward scroll does.
          onBlur={(e) => {
            if (
              !(e.relatedTarget instanceof Node) ||
              !e.currentTarget.contains(e.relatedTarget)
            )
              headerScroll.reveal();
          }}
          onKeyDown={(e) => {
            if (compact && searchOpen && e.key === "Escape") {
              e.preventDefault();
              closeSearch();
            }
          }}
        >
          {compact && searchOpen ? (
            // Expanded phone search takes the place of the whole row (D2).
            <>
              <Search key={loc.q || ""} loc={loc} onClose={closeSearch} />
              <button
                className="top-icon search-close"
                aria-label={t.closeSearch}
                onClick={closeSearch}
              >
                <CloseIcon />
              </button>
            </>
          ) : (
            <>
              <button
                className="menu-toggle"
                onClick={(e) => show("menu", e.currentTarget)}
              >
                {t.menu} ☰
              </button>
              {!compact && <Search key={loc.q || ""} loc={loc} />}
              <div className="top-utilities">
                {compact && (
                  <button
                    ref={searchToggle}
                    className="top-icon top-search"
                    aria-label={t.search}
                    // The form exists only while expanded, and then this
                    // icon is not rendered: no aria-controls to a missing id.
                    aria-expanded={false}
                    onClick={() => setSearchOpen(true)}
                  >
                    <SearchIcon />
                  </button>
                )}
                <button
                  className={compact ? "top-icon top-ai" : "top-ai"}
                  aria-label={compact ? t.ai : undefined}
                  aria-controls="consultant"
                  aria-expanded={surface === "assistant"}
                  onClick={(e) => show("assistant", e.currentTarget)}
                >
                  {compact ? <SparklesIcon /> : t.aiShort}
                </button>
                {compact && basketButton}
                {/* Phones reach Account and the language in the menu (M3, M4). */}
                {!compact && (
                  <a href={href({ view: "account", lang: loc.lang, page: 1 })}>
                    {t.account}
                  </a>
                )}
                {!compact && languages()}
              </div>
            </>
          )}
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
              chooseSize={chooseSize}
            />
          )}
          {loc.view === "account" && <Account lang={loc.lang} />}
          {loc.view === "invalid" && (
            <Recovery lang={loc.lang} title={t.invalid} />
          )}
        </main>
        <CompanyFooter lang={loc.lang} />
      </div>
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
          dialogRef={basketDialog}
          onClose={() => {
            if (surface === "basket") dismiss();
          }}
          onKeyDown={dialogKeys}
        />
      )}
    </div>
  );
}
