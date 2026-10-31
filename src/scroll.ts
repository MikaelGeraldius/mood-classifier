// Maths for the in-page anchor scroll. Kept free of the DOM so it can be tested.

export const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))

/** Longer trips take longer, but never snappier than 380ms or slower than 1.1s. */
export function anchorDuration(distance: number): number {
  return clamp(250 + Math.abs(distance) * 0.22, 380, 1100)
}

/** Exponential ease-out: most of the travel in the first third, then a long, quiet settle. */
export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : t <= 0 ? 0 : 1 - Math.pow(2, -10 * t)
}

/** Where the page should rest so `top` (the target's distance from the document top) sits under the header offset. */
export function anchorTarget(top: number, offset: number, maxScroll: number): number {
  return clamp(top - offset, 0, Math.max(0, maxScroll))
}
