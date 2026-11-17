import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Banner, Language } from "./catalogue";
import { bannerTarget } from "./navigation";
import "./hero.css";

/** Starting start-budget reference (ms) for auto-started clips (D-14). */
const START_BUDGET_MS = 4000;
/** Container width threshold (px) matching `@container hero (max-width: 700px)`. */
const NARROW_MAX_WIDTH = 700;

type LayoutMode = "wide" | "phone" | "fallback";
type StillState = "loaded" | "error";
type ClipStatus =
  | "idle"
  | "playing"
  | "paused"
  | "ended"
  | "refused"
  | "still-only";

interface ClipState {
  key: string;
  status: ClipStatus;
  frameReady: boolean;
  visitorPaused: boolean;
  visibilityPaused: boolean;
  budgetExpiredAt: number | null;
  manual: boolean;
}

interface NetworkConnection extends EventTarget {
  saveData?: boolean;
}

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
    videoPause: "Пауза видео",
    videoPlay: "Воспроизвести видео",
    more: "Подробнее",
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
    videoPause: "Videoni to'xtatish",
    videoPlay: "Videoni ijro etish",
    more: "Batafsil",
    playing: (seconds: string) =>
      `Avtomatik almashish · har ${seconds} soniyada`,
    paused: "Avtomatik almashish vaqtincha to'xtatilgan",
    stopped: "Avtomatik almashish o'chirilgan",
    reduced: "Avtomatik almashish o'chirilgan · kamroq harakat",
  },
};

function createClipState(key: string): ClipState {
  return {
    key,
    status: "idle",
    frameReady: false,
    visitorPaused: false,
    visibilityPaused: false,
    budgetExpiredAt: null,
    manual: false,
  };
}

function readSaveData(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkConnection })
    .connection;
  return conn?.saveData === true;
}

function isVideoBanner(item: Banner): boolean {
  return item.video_url !== null;
}

function bannerText(
  item: Banner,
  lang: Language,
): { title: string; subtitle: string | null } {
  if (!isVideoBanner(item)) {
    return { title: item.title.trim(), subtitle: null };
  }
  if (lang === "uz") {
    return {
      title: item.title_uz?.trim() || "",
      subtitle: item.subtitle_uz?.trim() || null,
    };
  }
  return {
    title: item.title.trim(),
    subtitle: item.subtitle?.trim() || null,
  };
}

function VideoControlIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.25 2.75a.75.75 0 0 1 1.14-.64l8 5.25a.75.75 0 0 1 0 1.28l-8 5.25a.75.75 0 0 1-1.14-.64V2.75Z" />
    </svg>
  );
}

/** Admin banner carousel implementing shared video, text, phone-format and access rules. */
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
  const heroRef = useRef<HTMLElement>(null);
  const firstImgRef = useRef<HTMLImageElement>(null);
  const activeImgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const budgetTimerRef = useRef<number | null>(null);
  const currentKeyRef = useRef("");
  const settledKeyRef = useRef("");
  const activatedAtRef = useRef(0);
  const autoStartedRef = useRef(false);
  const playPendingRef = useRef(false);
  const clipSnapshotRef = useRef<ClipState>(createClipState(""));

  const [layout, setLayout] = useState<{ measured: boolean; narrow: boolean }>({
    measured: false,
    narrow: false,
  });
  const [slide, setSlide] = useState<{
    index: number;
    previous: number | null;
  }>({ index: 0, previous: null });
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [saveData, setSaveData] = useState(readSaveData);
  const [playing, setPlaying] = useState(
    () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [onScreen, setOnScreen] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [imageStates, setImageStates] = useState<Record<string, StillState>>(
    {},
  );
  const [clipState, setClipState] = useState<ClipState>(() =>
    createClipState(""),
  );

  const previous = useRef<HTMLButtonElement>(null),
    next = useRef<HTMLButtonElement>(null);
  const start = useRef<{
    x: number;
    y: number;
    time: number;
    id: number;
  } | null>(null);

  const busy = slide.previous !== null;
  const safeIndex = count > 0 ? slide.index % count : 0;
  const hasPhonePictures =
    count > 0 && banners.every((b) => b.image_mobile_url !== null);
  const layoutMode: LayoutMode =
    layout.narrow && hasPhonePictures
      ? "phone"
      : layout.narrow
        ? "fallback"
        : "wide";
  const hasVideoBanner = banners.some(isVideoBanner);

  const stillUrlFor = (item: Banner): string =>
    layoutMode === "phone"
      ? (item.image_mobile_url ?? item.image_url)
      : item.image_url;
  const clipUrlFor = (item: Banner): string | null =>
    isVideoBanner(item)
      ? layoutMode === "phone"
        ? item.video_mobile_url
        : item.video_url
      : null;

  const firstStillUrl = banners[0] ? stillUrlFor(banners[0]) : null;
  const firstStillSettled =
    layout.measured &&
    (firstStillUrl === null || imageStates[firstStillUrl] !== undefined);

  const activeBanner = banners[safeIndex];
  const activeStillUrl = activeBanner ? stillUrlFor(activeBanner) : null;
  const activeClipUrl = activeBanner ? clipUrlFor(activeBanner) : null;
  const activeStillState = activeStillUrl
    ? imageStates[activeStillUrl]
    : undefined;
  const activeStillLoaded =
    layout.measured && firstStillSettled && activeStillState === "loaded";
  const activeStillFailed =
    layout.measured && activeStillState === "error";
  const stillOnlyByEnv = reduced || saveData || activeStillFailed;

  const activationKey = activeBanner
    ? `${safeIndex}:${activeBanner.id}:${activeClipUrl ?? ""}`
    : "";

  if (clipState.key !== activationKey) {
    setClipState(createClipState(activationKey));
  }

  const effectiveClip =
    clipState.key === activationKey
      ? clipState
      : createClipState(activationKey);
  const isVideoSlide = activeClipUrl !== null;
  const isEffectiveStillOnly =
    stillOnlyByEnv || effectiveClip.status === "still-only";
  const shouldMountVideo =
    layout.measured &&
    activeClipUrl !== null &&
    activeStillLoaded &&
    !isEffectiveStillOnly;

  const name = (index: number) => {
    const item = banners[index];
    if (!item) return `${t.banner} ${index + 1}`;
    const displayed = bannerText(item, lang).title;
    return displayed || `${t.banner} ${index + 1}`;
  };
  const position = (index: number) => `${index + 1} ${t.of} ${count}`;

  const clearBudgetTimer = useCallback(() => {
    if (budgetTimerRef.current !== null) {
      window.clearTimeout(budgetTimerRef.current);
      budgetTimerRef.current = null;
    }
  }, []);

  const markImage = useCallback((url: string, state: StillState) => {
    setImageStates((prev) =>
      prev[url] === state ? prev : { ...prev, [url]: state },
    );
  }, []);

  const startBudgetFor = useCallback(
    (targetKey: string) => {
      clearBudgetTimer();
      budgetTimerRef.current = window.setTimeout(() => {
        budgetTimerRef.current = null;
        if (currentKeyRef.current !== targetKey) return;
        setClipState((prev) => {
          if (
            prev.key !== targetKey ||
            prev.manual ||
            prev.status === "playing" ||
            prev.status === "ended" ||
            prev.status === "refused" ||
            prev.status === "still-only"
          )
            return prev;
          return {
            ...prev,
            status: "still-only",
            frameReady: false,
            budgetExpiredAt: Date.now(),
          };
        });
      }, START_BUDGET_MS);
    },
    [clearBudgetTimer],
  );

  const attemptPlay = useCallback(
    (
      video: HTMLVideoElement,
      targetKey: string,
      manual: boolean,
      withBudget: boolean,
    ) => {
      video.muted = true;
      if (withBudget && !manual) startBudgetFor(targetKey);
      else clearBudgetTimer();
      playPendingRef.current = true;
      const rejectPlay = (err?: unknown) => {
        playPendingRef.current = false;
        if (currentKeyRef.current !== targetKey) return;
        const errName =
          err && typeof err === "object" && "name" in err
            ? String((err as { name?: unknown }).name)
            : "";
        if (errName === "AbortError") return;
        clearBudgetTimer();
        setClipState((prev) =>
          prev.key === targetKey &&
          prev.status !== "still-only" &&
          prev.status !== "playing" &&
          !prev.visibilityPaused &&
          !prev.visitorPaused
            ? { ...prev, status: "refused" }
            : prev,
        );
      };
      let playPromise: unknown;
      try {
        playPromise = video.play();
      } catch (err) {
        rejectPlay(err);
        return;
      }
      if (
        playPromise &&
        typeof (playPromise as Promise<unknown>).then === "function"
      ) {
        void (playPromise as Promise<unknown>).then(() => {
          if (currentKeyRef.current === targetKey)
            playPendingRef.current = false;
        }, rejectPlay);
      } else {
        playPendingRef.current = false;
      }
    },
    [clearBudgetTimer, startBudgetFor],
  );

  const bindVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) el.muted = true;
  }, []);

  // Measure container width before paint so narrow phone format never requests wide clips first (D-11, D-12).
  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const measure = (width: number) => {
      const nextNarrow = width <= NARROW_MAX_WIDTH;
      setLayout((prev) =>
        prev.measured && prev.narrow === nextNarrow
          ? prev
          : { measured: true, narrow: nextNarrow },
      );
    };
    measure(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width =
        entries[0]?.contentRect.width ?? el.getBoundingClientRect().width;
      measure(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep event-readable refs aligned with the current activation.
  useEffect(() => {
    clipSnapshotRef.current = effectiveClip;
  });

  useEffect(() => {
    currentKeyRef.current = activationKey;
    activatedAtRef.current = Date.now();
    settledKeyRef.current = "";
    autoStartedRef.current = false;
    playPendingRef.current = false;
    return clearBudgetTimer;
  }, [activationKey, clearBudgetTimer]);

  useEffect(() => {
    if (!busy && settledKeyRef.current !== activationKey) {
      settledKeyRef.current = activationKey;
      activatedAtRef.current = Date.now();
    }
  }, [activationKey, busy]);

  // Catch synchronously cached or already-complete images for D-13 sequencing.
  useEffect(() => {
    if (!layout.measured) return;
    const syncImg = (el: HTMLImageElement | null, url: string | null) => {
      if (
        el &&
        url &&
        el.getAttribute("src") === url &&
        el.complete &&
        imageStates[url] === undefined
      ) {
        markImage(url, el.naturalWidth > 0 ? "loaded" : "error");
      }
    };
    syncImg(firstImgRef.current, firstStillUrl);
    if (firstStillSettled) syncImg(activeImgRef.current, activeStillUrl);
  }, [
    layout.measured,
    firstStillUrl,
    firstStillSettled,
    activeStillUrl,
    imageStates,
    markImage,
  ]);

  // Auto-start active video clip once still image is loaded and auto-rotation is active (D-02, D-13, D-14, W-02).
  useEffect(() => {
    if (
      !shouldMountVideo ||
      autoStartedRef.current ||
      !playing ||
      hidden ||
      !onScreen
    )
      return;
    const video = videoRef.current;
    if (!video) return;
    autoStartedRef.current = true;
    attemptPlay(video, activationKey, false, true);
  }, [shouldMountVideo, activationKey, playing, hidden, onScreen, attemptPlay]);

  const handleVisibilityPause = useCallback(
    (isVisible: boolean) => {
      const key = currentKeyRef.current;
      const snap = clipSnapshotRef.current;
      const video = videoRef.current;
      if (!isVisible) {
        if (
          snap.key === key &&
          (snap.status === "playing" ||
            playPendingRef.current ||
            (snap.status === "idle" &&
              autoStartedRef.current &&
              budgetTimerRef.current !== null))
        ) {
          clearBudgetTimer();
          playPendingRef.current = false;
          video?.pause();
          clipSnapshotRef.current =
            snap.status !== "still-only"
              ? { ...snap, status: "paused", visibilityPaused: true }
              : snap;
          setClipState((prev) =>
            prev.key === key && prev.status !== "still-only"
              ? { ...prev, status: "paused", visibilityPaused: true }
              : prev,
          );
        }
        return;
      }
      if (
        snap.key === key &&
        snap.status === "paused" &&
        snap.visibilityPaused &&
        !snap.visitorPaused &&
        video
      ) {
        clipSnapshotRef.current = { ...snap, visibilityPaused: false };
        setClipState((prev) =>
          prev.key === key ? { ...prev, visibilityPaused: false } : prev,
        );
        attemptPlay(
          video,
          key,
          snap.manual,
          !snap.frameReady && !snap.manual,
        );
      }
    },
    [attemptPlay, clearBudgetTimer],
  );

  // Track viewport visibility for D-10 off-screen pause/resume.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        setOnScreen(visible);
        handleVisibilityPause(visible && !document.hidden);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleVisibilityPause]);

  function show(target: number) {
    setPlaying(false);
    if (busy || target === safeIndex) return;
    setSlide({ index: target, previous: reduced ? null : safeIndex });
    setAnnouncement(`${position(target)}: ${name(target)}`);
  }

  function advance(direction: number) {
    if (!busy)
      (direction > 0 ? next : previous).current?.focus({
        preventScroll: true,
      });
    show((safeIndex + direction + count) % count);
  }

  // Slide transition lock (280 ms crossfade).
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(
      () => setSlide((s) => ({ ...s, previous: null })),
      280,
    );
    return () => clearTimeout(timer);
  }, [busy]);

  // Carousel auto-rotation timer (D-05, D-07, D-10, D-14, D-16).
  useEffect(() => {
    if (
      !rotating ||
      !playing ||
      hovered ||
      hidden ||
      obscured ||
      busy ||
      (isVideoSlide && !onScreen)
    )
      return;

    const advanceToNext = () =>
      setSlide((s) => ({
        index: (s.index + 1) % count,
        previous: reduced ? null : s.index,
      }));

    if (!isVideoSlide || effectiveClip.status === "refused") {
      const timer = setTimeout(advanceToNext, interval);
      return () => clearTimeout(timer);
    }

    if (isEffectiveStillOnly) {
      const readyAt = Math.max(
        activatedAtRef.current + interval,
        effectiveClip.budgetExpiredAt ?? 0,
      );
      const timer = setTimeout(
        advanceToNext,
        Math.max(0, readyAt - Date.now()),
      );
      return () => clearTimeout(timer);
    }

    if (effectiveClip.status === "ended") {
      const waitMs = Math.max(
        0,
        activatedAtRef.current + interval - Date.now(),
      );
      const timer = setTimeout(advanceToNext, waitMs);
      return () => clearTimeout(timer);
    }

    // Clip is waiting to start, playing, or visitor-paused: never advance on the interval.
    return undefined;
  }, [
    rotating,
    playing,
    hovered,
    hidden,
    obscured,
    busy,
    onScreen,
    reduced,
    safeIndex,
    count,
    interval,
    isVideoSlide,
    isEffectiveStillOnly,
    effectiveClip.status,
    effectiveClip.budgetExpiredAt,
  ]);

  // Visibility, reduced motion, saveData, and resize finish handlers.
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const conn = (navigator as Navigator & { connection?: NetworkConnection })
      .connection;
    const finish = () =>
      setSlide((s) => (s.previous === null ? s : { ...s, previous: null }));
    const visibility = () => {
      setHidden(document.hidden);
      if (document.hidden) finish();
      handleVisibilityPause(!document.hidden && onScreen);
    };
    const motion = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
      finish();
    };
    const connectionChange = () => setSaveData(readSaveData());
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", motion);
    conn?.addEventListener?.("change", connectionChange);
    window.addEventListener("resize", finish);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", motion);
      conn?.removeEventListener?.("change", connectionChange);
      window.removeEventListener("resize", finish);
    };
  }, [handleVisibilityPause, onScreen]);

  const handleVideoPlaying = () => {
    clearBudgetTimer();
    playPendingRef.current = false;
    const key = currentKeyRef.current;
    setClipState((prev) =>
      prev.key === key && prev.status !== "still-only"
        ? {
            ...prev,
            status: "playing",
            frameReady: true,
            visitorPaused: false,
            visibilityPaused: false,
          }
        : prev,
    );
  };

  const handleVideoEnded = () => {
    clearBudgetTimer();
    playPendingRef.current = false;
    const key = currentKeyRef.current;
    if (count === 1) {
      const video = videoRef.current;
      if (video && !isEffectiveStillOnly) {
        video.currentTime = 0;
        attemptPlay(video, key, true, false);
      }
      return;
    }
    setClipState((prev) =>
      prev.key === key && prev.status !== "still-only"
        ? {
            ...prev,
            status: "ended",
            frameReady: true,
            visitorPaused: false,
          }
        : prev,
    );
  };

  const handleVideoError = () => {
    clearBudgetTimer();
    playPendingRef.current = false;
    const key = currentKeyRef.current;
    setClipState((prev) =>
      prev.key === key
        ? { ...prev, status: "still-only", frameReady: false }
        : prev,
    );
  };

  const handleVideoControlClick = () => {
    const video = videoRef.current;
    const key = activationKey;
    if (effectiveClip.status === "playing") {
      clearBudgetTimer();
      playPendingRef.current = false;
      video?.pause();
      setClipState((prev) =>
        prev.key === key
          ? { ...prev, status: "paused", visitorPaused: true, manual: true }
          : prev,
      );
      return;
    }
    if (!video || isEffectiveStillOnly) return;
    if (effectiveClip.status === "ended") {
      try {
        video.currentTime = 0;
      } catch {
        // Ignore seek errors on synthetic test media without loaded duration.
      }
    }
    autoStartedRef.current = true;
    setClipState((prev) =>
      prev.key === key
        ? {
            ...prev,
            status: "idle",
            visitorPaused: false,
            visibilityPaused: false,
            manual: true,
          }
        : prev,
    );
    attemptPlay(video, key, true, false);
  };

  const handleRotationToggle = () => {
    const key = activationKey;
    if (playing) {
      setPlaying(false);
      if (
        isVideoSlide &&
        !isEffectiveStillOnly &&
        (effectiveClip.status === "playing" ||
          playPendingRef.current ||
          (effectiveClip.status === "idle" &&
            budgetTimerRef.current !== null))
      ) {
        clearBudgetTimer();
        playPendingRef.current = false;
        videoRef.current?.pause();
        setClipState((prev) =>
          prev.key === key
            ? { ...prev, status: "paused", visitorPaused: true }
            : prev,
        );
      }
      return;
    }

    setPlaying(true);
    if (!isVideoSlide || isEffectiveStillOnly || !activeStillLoaded) return;
    if (
      effectiveClip.status === "paused" ||
      effectiveClip.status === "idle" ||
      effectiveClip.status === "refused"
    ) {
      const video = videoRef.current;
      if (!video || hidden || !onScreen) return;
      const fromIdleOrRefused =
        effectiveClip.status === "idle" || effectiveClip.status === "refused";
      autoStartedRef.current = true;
      setClipState((prev) =>
        prev.key === key
          ? {
              ...prev,
              status: "idle",
              visitorPaused: false,
              visibilityPaused: false,
              manual: fromIdleOrRefused ? false : prev.manual,
            }
          : prev,
      );
      attemptPlay(
        video,
        key,
        !fromIdleOrRefused && effectiveClip.manual,
        fromIdleOrRefused,
      );
    }
  };

  const showVideoControl =
    layout.measured &&
    isVideoSlide &&
    !isEffectiveStillOnly &&
    (count === 1 || !playing || effectiveClip.status === "refused");
  const videoControlIsPause = effectiveClip.status === "playing";

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
      ref={heroRef}
      className="hero"
      data-format={layoutMode}
      data-has-video={hasVideoBanner ? "true" : undefined}
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
          const active = index === safeIndex,
            outgoing = index === slide.previous,
            target = bannerTarget(item.link_url, lang, categories);
          const stillSrc = stillUrlFor(item);
          const clipSrc = clipUrlFor(item);
          const videoBanner = isVideoBanner(item);
          const canLoadStill =
            layout.measured && (index === 0 || firstStillSettled);
          const previousLoadedStill =
            item.image_mobile_url &&
            imageStates[item.image_mobile_url] === "loaded"
              ? item.image_mobile_url
              : imageStates[item.image_url] === "loaded"
                ? item.image_url
                : undefined;
          const renderedStillSrc = canLoadStill
            ? stillSrc
            : previousLoadedStill;
          const copyText = bannerText(item, lang);
          const accessibleName = copyText.title || `${t.banner} ${index + 1}`;
          const imgRef =
            index === 0 && active
              ? (el: HTMLImageElement | null) => {
                  firstImgRef.current = el;
                  activeImgRef.current = el;
                }
              : index === 0
                ? firstImgRef
                : active
                  ? activeImgRef
                  : undefined;

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
                {...(videoBanner ? { "aria-label": accessibleName } : {})}
                {...(target.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                <div className="hero-media">
                  <img
                    ref={imgRef}
                    src={renderedStillSrc}
                    alt={videoBanner ? "" : accessibleName}
                    draggable={false}
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : "auto"}
                    onLoad={() =>
                      renderedStillSrc && markImage(renderedStillSrc, "loaded")
                    }
                    onError={() =>
                      renderedStillSrc && markImage(renderedStillSrc, "error")
                    }
                  />
                  {active && shouldMountVideo && clipSrc && (
                    <video
                      key={activationKey}
                      ref={bindVideoRef}
                      className={
                        effectiveClip.frameReady
                          ? "hero-video is-visible"
                          : "hero-video"
                      }
                      src={clipSrc}
                      poster={stillSrc}
                      muted
                      playsInline
                      loop={count === 1}
                      preload={
                        playing || effectiveClip.manual ? "auto" : "none"
                      }
                      aria-hidden="true"
                      tabIndex={-1}
                      onPlaying={handleVideoPlaying}
                      onEnded={handleVideoEnded}
                      onError={handleVideoError}
                    />
                  )}
                  {videoBanner && layoutMode !== "fallback" && (
                    <>
                      <div className="hero-scrim" aria-hidden="true" />
                      <div className="hero-overlay">
                        <div className="hero-copy">
                          {copyText.title && (
                            <span className="hero-title">{copyText.title}</span>
                          )}
                          {copyText.subtitle && (
                            <span className="hero-subtitle">
                              {copyText.subtitle}
                            </span>
                          )}
                        </div>
                        <span className="hero-cta" aria-hidden="true">
                          {t.more}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {layoutMode === "fallback" && hasVideoBanner && (
                  <div
                    className="hero-below"
                    aria-hidden={!videoBanner || undefined}
                  >
                    {videoBanner && (
                      <>
                        {copyText.title && (
                          <span className="hero-title">{copyText.title}</span>
                        )}
                        {copyText.subtitle && (
                          <span className="hero-subtitle">
                            {copyText.subtitle}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </a>
            </div>
          );
        })}

        <div className="hero-chrome">
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
            </>
          )}
          {(showVideoControl || rotating) && (
            <div className="hero-top-controls">
              {showVideoControl && (
                <button
                  type="button"
                  className="hero-video-control"
                  aria-label={
                    videoControlIsPause ? t.videoPause : t.videoPlay
                  }
                  title={videoControlIsPause ? t.videoPause : t.videoPlay}
                  onClick={handleVideoControlClick}
                >
                  <VideoControlIcon playing={videoControlIsPause} />
                </button>
              )}
              {rotating && (
                <button
                  className="hero-rotation"
                  aria-label={playing ? t.pause : t.play}
                  title={playing ? t.pause : t.play}
                  aria-describedby="hero-play-state"
                  onClick={handleRotationToggle}
                >
                  <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
                </button>
              )}
            </div>
          )}
          {rotating && (
            <>
              <div className="hero-dots">
                {banners.map((item, index) => (
                  <button
                    key={item.id}
                    className="hero-dot"
                    aria-label={`${t.banner} ${position(index)}`}
                    aria-current={index === safeIndex ? "true" : undefined}
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
      </div>
      <p className="hero-sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
