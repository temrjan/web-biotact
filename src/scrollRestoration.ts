/**
 * Scroll position on hash navigation, owned in one place.
 *
 * A new navigation opens its page at the top; a language-only change keeps the position;
 * Back and Forward return to the position the history entry had, once the data of the
 * shown view has loaded. Each history entry carries a random `nav` id in `history.state`
 * (an entry reached by a link has none yet), and positions live in memory only, so a
 * reload starts at the top. User input cancels an unfinished restore.
 */
export function routeKey(hash: string): string {
  const [view, query = ""] = hash.replace(/^#/, "").split("?");
  const p = new URLSearchParams(query);
  p.delete("lang");
  p.sort();
  return `${view || "home"}|${p.toString()}`;
}

interface Job {
  target: number;
  // The new view has rendered; until then its loading reads are not yet registered.
  rendered: boolean;
}

const CANCEL = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

class NavigationScroll {
  private readonly positions = new Map<string, number>();
  private readonly loading = new Set<object>();
  private current = "";
  private job: Job | null = null;
  private queued = false;
  private observer: ResizeObserver | null = null;

  /** Takes over scrolling from the browser and stamps the shown entry. Idempotent. */
  start(): void {
    if (this.current) return;
    history.scrollRestoration = "manual";
    this.current = navId(history.state) ?? stamp();
    for (const type of CANCEL)
      window.addEventListener(type, () => this.finish(), {
        capture: true,
        passive: true,
      });
  }

  /**
   * Called first in the `hashchange` handler, before the new view renders: keeps the
   * position of the entry being left and chooses the position of the entry shown next.
   */
  leave(previousHash: string, nextHash: string): void {
    if (!this.current) return;
    // A restore still in progress has not reached its target; the target is the position.
    const left = this.job ? this.job.target : window.scrollY;
    this.positions.set(this.current, left);
    const id = navId(history.state);
    const target =
      id === undefined
        ? routeKey(previousHash) === routeKey(nextHash)
          ? left
          : 0
        : (this.positions.get(id) ?? 0);
    this.current = id ?? stamp();
    this.finish();
    this.job = { target, rendered: false };
  }

  /** Called in a layout effect after the view of a new hash has rendered. */
  rendered(): void {
    if (!this.job || this.job.rendered) return;
    this.job.rendered = true;
    this.settle();
  }

  /** A data read of the shown page reports whether it is still loading. */
  track(read: object, isLoading: boolean): void {
    if (isLoading) this.loading.add(read);
    else this.loading.delete(read);
    // Coalesce the reports of one commit; the microtask runs before the next paint.
    if (this.job?.rendered && !this.queued) {
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        this.settle();
      });
    }
  }

  private settle(): void {
    const job = this.job;
    if (!job?.rendered) return;
    // The top is always reachable; other positions wait for the page's data.
    if (job.target !== 0 && this.loading.size) return;
    if (Math.abs(window.scrollY - job.target) > 1)
      window.scrollTo(0, job.target);
    if (!this.loading.size && Math.abs(window.scrollY - job.target) <= 1) {
      this.finish();
      return;
    }
    // Loaded, but the page is still shorter than the target (late layout): retry on growth.
    if (!this.loading.size && !this.observer) {
      this.observer = new ResizeObserver(() => this.settle());
      this.observer.observe(document.body);
    }
  }

  private finish(): void {
    this.job = null;
    this.observer?.disconnect();
    this.observer = null;
  }
}

function navId(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || !("nav" in state))
    return undefined;
  return typeof state.nav === "string" ? state.nav : undefined;
}

/** A random id: entries survive a reload, a counter would repeat. */
function stamp(): string {
  const id = Math.random().toString(36).slice(2);
  const state: unknown = history.state;
  history.replaceState(
    { ...(typeof state === "object" && state !== null ? state : {}), nav: id },
    "",
  );
  return id;
}

export const navigationScroll = new NavigationScroll();
