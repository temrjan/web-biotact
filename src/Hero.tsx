import { useEffect, useRef, useState } from "react";
import type { Language } from "./catalogue";
import "./hero.css";

const copy = {
  ru: {
    title: "В фокусе Biotact",
    note: "Все три анонса — примеры содержания для демонстрации.",
    carousel: "карусель",
    slide: "слайд",
    of: "из",
    previous: "Предыдущий анонс",
    next: "Следующий анонс",
    pause: "Приостановить автоматическую смену",
    play: "Включить автоматическую смену",
    playing: "Автосмена · каждые 8 секунд",
    paused: "Автосмена приостановлена",
    stopped: "Автосмена выключена",
    reduced: "Автосмена выключена · меньше движения",
    sample: "Пример материала",
    close: "Вернуться к анонсам",
    announcements: [
      {
        eyebrow: "Журнал · Новая история",
        title: ["Ближе", "к истокам"],
        description:
          "От первого вопроса до больших идей. Знакомимся с миром Biotact.",
        action: "Читать историю",
        body: "Здесь мог бы появиться рассказ о людях и идеях Biotact. Этот локальный пример показывает, как анонс открывает материал. Он не сообщает о реальной публикации.",
      },
      {
        eyebrow: "События · Встречи",
        title: ["Время", "для диалога"],
        description:
          "Вопросы, мысли и живое общение. Пространство для новой встречи.",
        action: "О встречах",
        body: "Здесь можно рассказать о формате встречи и программе, когда они будут утверждены. В этом примере нет действующего события, даты или регистрации.",
      },
      {
        eyebrow: "Выбор редакции · Вдохновение",
        title: ["Замечать", "больше"],
        description:
          "Небольшие открытия каждый день. Собираем то, чем хочется поделиться.",
        action: "Посмотреть подборку",
        body: "Здесь могла бы открыться редакционная подборка историй и наблюдений. Это демонстрационный материал, а не опубликованная рекомендация.",
      },
    ],
  },
  uz: {
    title: "Biotact diqqat markazida",
    note: "Uchala eʼlon ham namoyish uchun mazmun namunalaridir.",
    carousel: "karusel",
    slide: "slayd",
    of: "/",
    previous: "Oldingi eʼlon",
    next: "Keyingi eʼlon",
    pause: "Avtomatik almashishni toʻxtatish",
    play: "Avtomatik almashishni yoqish",
    playing: "Avtomatik almashish · har 8 soniyada",
    paused: "Avtomatik almashish vaqtincha toʻxtatilgan",
    stopped: "Avtomatik almashish oʻchirilgan",
    reduced: "Avtomatik almashish oʻchirilgan · kamroq harakat",
    sample: "Material namunasi",
    close: "Eʼlonlarga qaytish",
    announcements: [
      {
        eyebrow: "Jurnal · Yangi hikoya",
        title: ["Ildizlarga", "yaqinroq"],
        description:
          "Birinchi savoldan katta gʻoyalargacha. Biotact olami bilan tanishamiz.",
        action: "Hikoyani oʻqish",
        body: "Bu yerda Biotact odamlari va gʻoyalari haqida hikoya paydo boʻlishi mumkin. Ushbu mahalliy namuna eʼlondan material qanday ochilishini koʻrsatadi. Bu haqiqiy nashr haqida xabar emas.",
      },
      {
        eyebrow: "Tadbirlar · Uchrashuvlar",
        title: ["Muloqot", "vaqti"],
        description:
          "Savollar, fikrlar va jonli muloqot. Yangi uchrashuv uchun makon.",
        action: "Uchrashuvlar haqida",
        body: "Uchrashuv shakli va dasturi tasdiqlangach, ular haqida shu yerda maʼlumot berish mumkin. Bu namunada amaldagi tadbir, sana yoki roʻyxatdan oʻtish yoʻq.",
      },
      {
        eyebrow: "Tahririyat tanlovi · Ilhom",
        title: ["Koʻproq", "ilgʻash"],
        description:
          "Har kuni kichik kashfiyotlar. Ulashishga arziydigan narsalarni jamlaymiz.",
        action: "Toʻplamni koʻrish",
        body: "Bu yerda hikoyalar va kuzatuvlardan iborat tahririyat toʻplami ochilishi mumkin. Bu namoyish materiali, eʼlon qilingan tavsiya emas.",
      },
    ],
  },
};

function Artwork({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <svg className="hero-art" viewBox="0 0 500 402" aria-hidden="true">
          <circle cx="293" cy="207" r="154" fill="#c5d7c8" />
          <circle cx="293" cy="207" r="130" className="hero-fine" />
          <path
            d="M117 351c50-79 99-103 147-128 42-22 74-75 102-127"
            fill="none"
            stroke="#527f62"
            strokeWidth="2"
          />
          <path
            d="M241 235c-80 12-117-39-105-83 65-14 108 28 105 83Z"
            fill="#769b7d"
          />
          <path
            d="M277 207c-10-83 41-122 90-107 2 65-36 107-90 107Z"
            fill="#255c43"
          />
          <path
            d="M185 278c-65 7-89-24-85-61 51-10 88 20 85 61Z"
            fill="#a0bca0"
          />
          <path
            d="M310 165c-28-63-8-102 31-115 33 43 19 86-31 115Z"
            fill="#a6bea2"
          />
          <path d="M123 351h285" className="hero-fine" />
          <text
            x="399"
            y="350"
            fontFamily="Arial,sans-serif"
            fontSize="11"
            letterSpacing="3"
            fill="#3b6650"
            textAnchor="end"
          >
            ORIGINS / 01
          </text>
        </svg>
      );
    case 1:
      return (
        <svg className="hero-art" viewBox="0 0 500 402" aria-hidden="true">
          <circle cx="295" cy="198" r="155" fill="#d9bcaa" />
          <path
            d="M140 123h154a34 34 0 0 1 34 34v81a34 34 0 0 1-34 34h-54l-45 39v-39h-55a34 34 0 0 1-34-34v-81a34 34 0 0 1 34-34Z"
            fill="#a96c55"
          />
          <path
            d="M277 178h100a28 28 0 0 1 28 28v64a28 28 0 0 1-28 28h-20v31l-37-31h-43a28 28 0 0 1-28-28v-64a28 28 0 0 1 28-28Z"
            fill="#f3e7dc"
          />
          <path
            d="M147 174h131m-131 27h96m37 19h94m-94 25h62"
            fill="none"
            stroke="#f3e7dc"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M280 220h91m-91 25h61"
            fill="none"
            stroke="#9c6c56"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="378" cy="99" r="18" fill="none" stroke="#9c6c56" />
          <path d="M117 351h285" className="hero-fine" />
          <text
            x="399"
            y="350"
            fontFamily="Arial,sans-serif"
            fontSize="11"
            letterSpacing="3"
            fill="#7c5140"
            textAnchor="end"
          >
            TOGETHER / 02
          </text>
        </svg>
      );
    case 2:
      return (
        <svg className="hero-art" viewBox="0 0 500 402" aria-hidden="true">
          <circle cx="295" cy="200" r="155" fill="#c6d3df" />
          <g transform="translate(186 92) rotate(-12 100 105)">
            <rect
              x="-20"
              y="13"
              width="151"
              height="214"
              rx="8"
              fill="#a4b8c9"
            />
            <rect
              x="21"
              y="-5"
              width="154"
              height="214"
              rx="8"
              fill="#f5f3ea"
            />
            <path
              d="M43 30h110M43 151h110m-110 18h83m-83 18h62"
              fill="none"
              stroke="#8da3b6"
              strokeWidth="3"
            />
            <circle cx="99" cy="90" r="39" fill="#d3ae8b" />
            <path
              d="m79 95 14 14 30-35"
              fill="none"
              stroke="#f5f3ea"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <path
            d="m380 109 8 14 16 2-11 12 3 16-16-7-14 7 2-16-11-12 17-2Z"
            fill="#667f97"
          />
          <path d="M117 351h285" className="hero-fine" />
          <text
            x="399"
            y="350"
            fontFamily="Arial,sans-serif"
            fontSize="11"
            letterSpacing="3"
            fill="#516b83"
            textAnchor="end"
          >
            DISCOVER / 03
          </text>
        </svg>
      );
    default:
      return null;
  }
}

export function ExampleMaterial({
  lang,
  index,
  onClose,
}: {
  lang: Language;
  index: number;
  onClose: () => void;
}) {
  const t = copy[lang],
    item = t.announcements[index];
  return (
    <>
      <div className="dialog-heading">
        <h2 id="example-title">{t.sample}</h2>
        <button
          className="close-control"
          data-initial-focus
          aria-label={t.close}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <h3>{item?.title.join(" ")}</h3>
      <p>{item?.body}</p>
      <button onClick={onClose}>{t.close}</button>
    </>
  );
}

export default function Hero({
  lang,
  obscured,
  onOpen,
}: {
  lang: Language;
  obscured: boolean;
  onOpen: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const t = copy[lang];
  const [slide, setSlide] = useState<{
    index: number;
    previous: number | null;
  }>({ index: 0, previous: null });
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [playing, setPlaying] = useState(
    () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [announcement, setAnnouncement] = useState("");
  const previous = useRef<HTMLButtonElement>(null),
    next = useRef<HTMLButtonElement>(null);
  const start = useRef<{
    x: number;
    y: number;
    time: number;
    id: number;
  } | null>(null);
  const busy = slide.previous !== null;

  function advance(direction: number) {
    setPlaying(false);
    if (busy) return;
    const target = (slide.index + direction + 3) % 3;
    (direction > 0 ? next : previous).current?.focus({ preventScroll: true });
    setSlide({ index: target, previous: reduced ? null : slide.index });
    setAnnouncement(
      `${target + 1} ${t.of} 3: ${t.announcements[target]?.title.join(" ")}`,
    );
  }
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(
      () => setSlide((s) => ({ ...s, previous: null })),
      280,
    );
    return () => clearTimeout(timer);
  }, [busy]);
  useEffect(() => {
    if (!playing || hovered || hidden || obscured || busy) return;
    const timer = setTimeout(
      () =>
        setSlide((s) => ({
          index: (s.index + 1) % 3,
          previous: reduced ? null : s.index,
        })),
      8000,
    );
    return () => clearTimeout(timer);
  }, [playing, hovered, hidden, obscured, busy, reduced, slide.index]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () =>
      setSlide((s) => (s.previous === null ? s : { ...s, previous: null }));
    const visibility = () => {
      setHidden(document.hidden);
      if (document.hidden) finish();
    };
    const motion = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
      finish();
    };
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", motion);
    window.addEventListener("resize", finish);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", motion);
      window.removeEventListener("resize", finish);
    };
  }, []);
  const state = !playing
    ? reduced
      ? t.reduced
      : t.stopped
    : hovered || hidden || obscured
      ? t.paused
      : t.playing;
  return (
    <section
      className="hero"
      aria-labelledby="hero-title"
      aria-describedby="hero-note"
      aria-roledescription={t.carousel}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") setHovered(false);
      }}
      onFocusCapture={(e) => {
        if (e.target.matches(":focus-visible")) setPlaying(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Tab") setPlaying(false);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          advance(e.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <div className="hero-heading">
        <h2 id="hero-title">{t.title}</h2>
        <p id="hero-note">{t.note}</p>
      </div>
      <div
        className="hero-stage"
        data-busy={busy}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            !(e.target instanceof Element) ||
            e.target.closest("button") ||
            (e.pointerType !== "touch" && !e.target.closest(".hero-art"))
          )
            return;
          start.current = {
            x: e.clientX,
            y: e.clientY,
            time: performance.now(),
            id: e.pointerId,
          };
          if (e.pointerType !== "touch")
            e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const initial = start.current;
          if (!initial || e.pointerId !== initial.id) return;
          start.current = null;
          const dx = e.clientX - initial.x,
            dy = e.clientY - initial.y;
          if (
            Math.abs(dx) > 55 &&
            Math.abs(dx) > Math.abs(dy) * 1.6 &&
            performance.now() - initial.time < 900
          )
            advance(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        {t.announcements.map((item, index) => {
          const active = index === slide.index,
            outgoing = index === slide.previous;
          return (
            <article
              key={index}
              className={`hero-banner hero-${["news", "event", "highlight"][index]}`}
              data-position={
                active
                  ? busy
                    ? "incoming"
                    : "main"
                  : outgoing
                    ? "outgoing"
                    : "hidden"
              }
              role="group"
              aria-roledescription={t.slide}
              aria-label={`${index + 1} ${t.of} 3: ${item.title.join(" ")}`}
              aria-hidden={!active || busy}
              inert={!active || busy}
            >
              <div className="hero-copy">
                <p className="hero-eyebrow">{item.eyebrow}</p>
                <h2>
                  {item.title[0]}
                  <br />
                  {item.title[1]}
                </h2>
                <p className="hero-description">{item.description}</p>
                <button
                  className="hero-details"
                  onClick={(e) => {
                    setPlaying(false);
                    onOpen(index, e.currentTarget);
                  }}
                >
                  {item.action}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
              <Artwork index={index} />
            </article>
          );
        })}
        <button
          className="hero-edge hero-previous"
          ref={previous}
          aria-label={t.previous}
          aria-disabled={busy || undefined}
          onClick={() => advance(-1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          className="hero-edge hero-next"
          ref={next}
          aria-label={t.next}
          aria-disabled={busy || undefined}
          onClick={() => advance(1)}
        >
          <span aria-hidden="true">→</span>
        </button>
        <button
          className="hero-rotation"
          aria-label={playing ? t.pause : t.play}
          title={playing ? t.pause : t.play}
          aria-describedby="hero-play-state"
          onClick={() => setPlaying((p) => !p)}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        </button>
        <span className="hero-sr-only" id="hero-play-state">
          {state}
        </span>
      </div>
      <p className="hero-sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
