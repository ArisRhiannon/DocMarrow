import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Rule } from "@docmarrow/core";

/** A 2D affine matrix [a, b, c, d, e, f] (PDF convention, row-vector). */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Compose `first` then `second`: a point p maps as (p · first) · second. */
function compose(first: Matrix, second: Matrix): Matrix {
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

const applyX = (m: Matrix, x: number, y: number): number => m[0] * x + m[2] * y + m[4];
const applyY = (m: Matrix, x: number, y: number): number => m[1] * x + m[3] * y + m[5];

interface Pt {
  x: number;
  y: number;
}

/**
 * Extract axis-aligned vector rules (table borders) from a page's operator
 * list. Paths are walked point-by-point under the current transform matrix;
 * each near-horizontal/near-vertical segment long enough to be a rule is
 * emitted in the top-left point convention (`y` measured from the page top).
 *
 * Curves are treated only as cursor moves (never rules). Rotated/skewed content
 * is handled by the CTM, but only segments that end up axis-aligned are kept.
 */
export function extractRules(
  opList: { fnArray: number[]; argsArray: unknown[] },
  pageHeight: number,
  options: { minLength?: number; tolerance?: number } = {},
): Rule[] {
  const minLength = options.minLength ?? 10;
  const tol = options.tolerance ?? 1.5;
  const { fnArray, argsArray } = opList;

  let ctm: Matrix = [...IDENTITY];
  const stack: Matrix[] = [];
  const rules: Rule[] = [];

  // Convert a user-space point under the CTM to a top-left device point.
  const toTopLeft = (x: number, y: number): Pt => {
    const ux = applyX(ctm, x, y);
    const uy = applyY(ctm, x, y);
    return { x: ux, y: pageHeight - uy };
  };

  const addSegment = (p0: Pt, p1: Pt): void => {
    const dx = Math.abs(p1.x - p0.x);
    const dy = Math.abs(p1.y - p0.y);
    if (dy <= tol && dx >= minLength) {
      const y = (p0.y + p1.y) / 2;
      rules.push({ x0: Math.min(p0.x, p1.x), y0: y, x1: Math.max(p0.x, p1.x), y1: y });
    } else if (dx <= tol && dy >= minLength) {
      const x = (p0.x + p1.x) / 2;
      rules.push({ x0: x, y0: Math.min(p0.y, p1.y), x1: x, y1: Math.max(p0.y, p1.y) });
    }
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === OPS.save) {
      stack.push([...ctm]);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? [...IDENTITY];
    } else if (fn === OPS.transform) {
      const a = argsArray[i] as number[];
      if (a && a.length >= 6) {
        ctm = compose([a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!], ctm);
      }
    } else if (fn === OPS.constructPath) {
      const args = argsArray[i] as [number[], number[], number[]?];
      walkPath(args[0] ?? [], args[1] ?? [], toTopLeft, addSegment);
    }
  }
  return rules;
}

/** Walk a constructPath's sub-ops, emitting segments between consecutive points. */
function walkPath(
  ops: number[],
  coords: number[],
  toTopLeft: (x: number, y: number) => Pt,
  addSegment: (p0: Pt, p1: Pt) => void,
): void {
  let ci = 0;
  const next = (): number => coords[ci++] ?? 0;
  let cur: Pt | null = null;
  let start: Pt | null = null;

  for (const op of ops) {
    if (op === OPS.moveTo) {
      cur = toTopLeft(next(), next());
      start = cur;
    } else if (op === OPS.lineTo) {
      const p = toTopLeft(next(), next());
      if (cur) addSegment(cur, p);
      cur = p;
    } else if (op === OPS.curveTo) {
      next(); next(); next(); next();
      cur = toTopLeft(next(), next());
    } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
      next(); next();
      cur = toTopLeft(next(), next());
    } else if (op === OPS.rectangle) {
      const x = next();
      const y = next();
      const w = next();
      const h = next();
      const a = toTopLeft(x, y);
      const b = toTopLeft(x + w, y);
      const c = toTopLeft(x + w, y + h);
      const d = toTopLeft(x, y + h);
      addSegment(a, b);
      addSegment(b, c);
      addSegment(c, d);
      addSegment(d, a);
      cur = a;
      start = a;
    } else if (op === OPS.closePath) {
      if (cur && start) addSegment(cur, start);
      cur = start;
    }
  }
}
