/**
 * Minimal 2D affine matrix helpers shared by the operator-list walkers
 * (`rules.ts` for table borders, `images.ts` for figures).
 */

/** A 2D affine matrix [a, b, c, d, e, f] (PDF convention, row-vector). */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Compose `first` then `second`: a point p maps as (p · first) · second. */
export function compose(first: Matrix, second: Matrix): Matrix {
  const [a, b, c, d, e, f] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a * a2 + b * c2,
    a * b2 + b * d2,
    c * a2 + d * c2,
    c * b2 + d * d2,
    e * a2 + f * c2 + e2,
    e * b2 + f * d2 + f2,
  ];
}

export const applyX = (m: Matrix, x: number, y: number): number => m[0] * x + m[2] * y + m[4];
export const applyY = (m: Matrix, x: number, y: number): number => m[1] * x + m[3] * y + m[5];
