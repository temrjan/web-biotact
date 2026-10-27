import { useEffect, useRef, useState } from "react";
import type { Banner, Language } from "./catalogue";
import { bannerTarget } from "./navigation";
import "./hero.css";

const copy = {
  ru: {
    label: "Баннеры",
    carousel: "карусель",
    slide: "баннер",
    of: "из",
    banner: "Баннер",
    previous: "Предыдущий баннер",
    next: "Следующий баннер",
    pause: "Приостановить автоматическую смену",
    play: "Включить автоматическую смену",
    playing: (seconds: string) => `Автосмена · каждые ${seconds} с`,
    paused: "Автосмена приостановлена",
    stopped: "Автосмена выключена",
    reduced: "Автосмена выключена · меньше движения",
  },
  uz: {
    label: "Bannerlar",
    carousel: "karusel",
    slide: "banner",
    of: "/",
    banner: "Banner",
    previous: "Oldingi banner",
    next: "Keyingi banner",
    pause: "Avtomatik almashishni to'xtatish",
    play: "Avtomatik almashishni yoqish",
    playing: (seconds: string) =>
      `Avtomatik almashish · har ${seconds} soniyada`,
    paused: "Avtomatik almashish vaqtincha to'xtatilgan",
    stopped: "Avtomatik almashish o'chirilgan",
    reduced: "Avtomatik almashish o'chirilgan · kamroq harakat",
  },
};

/** Admin banner carousel with the website's accessible rotation controls. */
export default function Hero({
  lang,
  banners,
  interval,
  categories,
  obscured,
}: {
  lang: Language;
  banners: Banner[];
  interval: number;
  categories: readonly { id: number; slug: string }[];
  obscured: boolean;
}) {
  const t = copy[lang],
    count = banners.length,
    rotating = count > 1;
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
  const name = (index: number) =>
    banners[index]?.title.trim() || `${t.banner} ${index + 1}`;
  const position = (index: number) => `${index + 1} ${t.of} ${count}`;

  function show(target: number) {
    setPlaying(false);
    if (busy || target === slide.index) return;
    setSlide({ index: target, previous: reduced ? null : slide.index });
    setAnnouncement(`${position(target)}: ${name(target)}`);
  }
  function advance(direction: number) {
    if (!busy)
      (direction > 0 ? next : previous).current?.focus({
        preventScroll: true,
      });
    show((slide.index + direction + count) % count);
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
    if (!rotating || !playing || hovered || hidden || obscured || busy) return;
    const timer = setTimeout(
      () =>
        setSlide((s) => ({
          index: (s.index + 1) % count,
          previous: reduced ? null : s.index,
        })),
      interval,
    );
    return () => clearTimeout(timer);
  }, [
    rotating,
    playing,
    hovered,
    hidden,
    obscured,
    busy,
    reduced,
    slide.index,
    count,
    interval,
  ]);
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
  const seconds = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "uz-UZ", {
    maximumFractionDigits: 1,
  }).format(interval / 1000);
  const state = !playing
    ? reduced
      ? t.reduced
      : t.stopped
    : hovered || hidden || obscured
      ? t.paused
      : t.playing(seconds);
  return (
    <section
      className="hero"
      aria-label={t.label}
      aria-roledescription={rotating ? t.carousel : undefined}
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
        if (!rotating) return;
        if (e.key === "Tab") setPlaying(false);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          advance(e.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <div
        className="hero-stage"
        data-busy={busy}
        onPointerDown={(e) => {
          if (
            !rotating ||
            e.pointerType !== "touch" ||
            !(e.target instanceof Element) ||
            e.target.closest("button")
          )
            return;
          start.current = {
            x: e.clientX,
            y: e.clientY,
            time: performance.now(),
            id: e.pointerId,
          };
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
        {banners.map((item, index) => {
          const active = index === slide.index,
            outgoing = index === slide.previous,
            target = bannerTarget(item.link_url, lang, categories);
          return (
            <div
              key={item.id}
              className="hero-banner"
              data-banner-id={item.id}
              data-position={
                active
                  ? busy
                    ? "incoming"
                    : "main"
                  : outgoing
                    ? "outgoing"
                    : "hidden"
              }
              role={rotating ? "group" : undefined}
              aria-roledescription={rotating ? t.slide : undefined}
              aria-label={rotating ? position(index) : undefined}
              aria-hidden={!active || busy}
              inert={!active || busy}
            >
              <a
                className="hero-link"
                href={target.href}
                draggable={false}
                {...(target.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                <img
                  src={item.image_url}
                  alt={name(index)}
                  draggable={false}
                  decoding="async"
                />
              </a>
            </div>
          );
        })}
        {rotating && (
          <>
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
            <div className="hero-dots">
              {banners.map((item, index) => (
                <button
                  key={item.id}
                  className="hero-dot"
                  aria-label={`${t.banner} ${position(index)}`}
                  aria-current={index === slide.index ? "true" : undefined}
                  onClick={() => show(index)}
                />
              ))}
            </div>
            <span className="hero-sr-only" id="hero-play-state">
              {state}
            </span>
          </>
        )}
      </div>
      <p className="hero-sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
