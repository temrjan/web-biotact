import { describe, expect, it } from "vitest";
import { afterAnswer, type Box, type Panel } from "./chatScroll";

// A panel whose client box starts at 0 and is 1000 px high, scrolled to 500 of
// at most 2000; the progress line was in view when the answer arrived.
const panel: Panel = {
  top: 0,
  clientHeight: 1000,
  scrollTop: 500,
  maxScroll: 2000,
};
const line: Box = { top: 600, bottom: 630 };

describe("afterAnswer (spec r7 CH-04, CH-05)", () => {
  it.each<[string, Panel, Box, Box, number | null]>([
    [
      "fits and fully visible: no scroll",
      panel,
      line,
      { top: 400, bottom: 900 },
      null,
    ],
    [
      "taller than the visible area: its top to the top",
      panel,
      line,
      { top: 400, bottom: 1600 },
      900,
    ],
    [
      "fits but runs below the area: its top to the top",
      panel,
      line,
      { top: 700, bottom: 1100 },
      1200,
    ],
    [
      "limited by the maximum scroll",
      { ...panel, maxScroll: 700 },
      line,
      { top: 400, bottom: 1600 },
      700,
    ],
    [
      "progress line above the area: no change",
      panel,
      { top: -80, bottom: -50 },
      { top: 400, bottom: 1600 },
      null,
    ],
    [
      "progress line below the area: no change",
      panel,
      { top: 1000, bottom: 1030 },
      { top: 1200, bottom: 2400 },
      null,
    ],
    [
      "panel below the viewport top (client box at 40)",
      { ...panel, top: 40 },
      line,
      { top: 440, bottom: 1700 },
      900,
    ],
  ])("%s", (_, p, l, entry, expected) => {
    expect(afterAnswer(p, l, entry)).toBe(expected);
  });
});
