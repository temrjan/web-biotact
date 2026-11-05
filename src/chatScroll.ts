/** A vertical box in viewport coordinates (`getBoundingClientRect`). */
export interface Box {
  top: number;
  bottom: number;
}
/** The chat panel P, the scroll container: its client box and scroll state. */
export interface Panel {
  /** Top of P's client box in viewport coordinates. */
  top: number;
  clientHeight: number;
  scrollTop: number;
  /** `scrollHeight - clientHeight`. */
  maxScroll: number;
}

const inside = (panel: Panel, box: Box) =>
  box.top >= panel.top && box.bottom <= panel.top + panel.clientHeight;

/**
 * The scroll position of P after an answer arrives (spec r7 CH-04, CH-05), or
 * `null` to leave it. `line` is the progress line when the answer arrived;
 * `entry` is the new entry with the cards returned with it. A progress line
 * entirely out of view means the customer scrolled away: P stays. A new entry
 * that fits and is fully visible needs no scroll. Otherwise the top of the
 * new entry (its question, below the entry's top padding) goes to the top of
 * the visible area, limited by P's maximum scroll.
 */
export function afterAnswer(
  panel: Panel,
  line: Box,
  entry: Box,
): number | null {
  const bottom = panel.top + panel.clientHeight;
  if (line.bottom <= panel.top || line.top >= bottom) return null;
  if (entry.bottom - entry.top <= panel.clientHeight && inside(panel, entry))
    return null;
  // Scroll positions are whole pixels: round up so the gap stays within the padding.
  const target = Math.ceil(panel.scrollTop + entry.top - panel.top);
  return Math.max(0, Math.min(target, panel.maxScroll));
}

/**
 * The scroll position of P that shows the whole progress line at the nearest
 * position (spec r7 CH-01), or `null` when it is already in view.
 */
export function reveal(panel: Panel, line: Box): number | null {
  if (inside(panel, line)) return null;
  const below = line.bottom - (panel.top + panel.clientHeight);
  // Whole pixels, rounded so that the line ends inside the visible area.
  const shift = below > 0 ? Math.ceil(below) : Math.floor(line.top - panel.top);
  return Math.max(0, Math.min(panel.scrollTop + shift, panel.maxScroll));
}
