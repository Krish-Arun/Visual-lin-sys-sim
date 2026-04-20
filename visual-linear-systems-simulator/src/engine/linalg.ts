import type { Matrix, Vec, EigenResult, Dim } from "./types";

export const identity = (n: Dim): Matrix =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

export const zeros = (n: Dim): Matrix =>
  Array.from({ length: n }, () => Array(n).fill(0));

export const matVec = (A: Matrix, v: Vec): Vec => {
  const n = A.length;
  const out = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += A[i][j] * v[j];
    out[i] = s;
  }
  return out;
};

export const matMul = (A: Matrix, B: Matrix): Matrix => {
  const n = A.length;
  const out: Matrix = zeros(n as Dim);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i][k] * B[k][j];
      out[i][j] = s;
    }
  return out;
};

export const matPow = (A: Matrix, k: number): Matrix => {
  let result = identity(A.length as Dim);
  for (let i = 0; i < k; i++) result = matMul(result, A);
  return result;
};

export const addVec = (a: Vec, b: Vec): Vec => a.map((x, i) => x + b[i]);
export const scaleVec = (a: Vec, s: number): Vec => a.map((x) => x * s);
export const lerpVec = (a: Vec, b: Vec, t: number): Vec =>
  a.map((x, i) => (1 - t) * x + t * b[i]);

export const norm = (v: Vec): number =>
  Math.sqrt(v.reduce((s, x) => s + x * x, 0));

export const normalize = (v: Vec): Vec => {
  const n = norm(v);
  return n < 1e-12 ? v.map(() => 0) : v.map((x) => x / n);
};

export const det = (A: Matrix): number => {
  const n = A.length;
  if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];
  if (n === 3) {
    const [a, b, c] = A[0];
    const [d, e, f] = A[1];
    const [g, h, i] = A[2];
    return (
      a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    );
  }
  return NaN;
};

// Gaussian elimination for rank and null space
export const rref = (A: Matrix): { R: Matrix; pivots: number[] } => {
  const M = A.map((r) => [...r]);
  const rows = M.length;
  const cols = M[0].length;
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let piv = r;
    for (let i = r + 1; i < rows; i++)
      if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
    if (Math.abs(M[piv][c]) < 1e-10) continue;
    [M[r], M[piv]] = [M[piv], M[r]];
    const pv = M[r][c];
    for (let j = 0; j < cols; j++) M[r][j] /= pv;
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = M[i][c];
      if (Math.abs(f) < 1e-14) continue;
      for (let j = 0; j < cols; j++) M[i][j] -= f * M[r][j];
    }
    pivots.push(c);
    r++;
  }
  return { R: M, pivots };
};

export const rank = (A: Matrix): number => rref(A).pivots.length;

export const transpose = (A: Matrix): Matrix => {
  const n = A.length;
  const out: Matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) out[j][i] = A[i][j];
  return out;
};

// Column space basis: pivot columns of A
export const colSpace = (A: Matrix): Vec[] => {
  const { pivots } = rref(A);
  const n = A.length;
  return pivots.map((p) => {
    const col = Array(n).fill(0);
    for (let i = 0; i < n; i++) col[i] = A[i][p];
    return col;
  });
};

// Row space basis: nonzero rows of rref (= pivot rows)
export const rowSpace = (A: Matrix): Vec[] => {
  const { R, pivots } = rref(A);
  return pivots.map((_, i) => [...R[i]]);
};

// Left null space: null space of A^T
export const leftNullSpace = (A: Matrix): Vec[] => nullSpace(transpose(A));

// Rotation matrix about Z axis (2D: just 2x2 rotation)
export const rotationMatrix = (thetaDeg: number, dim: Dim): Matrix => {
  const r = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  if (dim === 2) {
    return [
      [c, -s],
      [s, c],
    ];
  }
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
};

export const nullSpace = (A: Matrix): Vec[] => {
  const n = A.length;
  const { R, pivots } = rref(A);
  const freeCols: number[] = [];
  for (let c = 0; c < n; c++) if (!pivots.includes(c)) freeCols.push(c);
  const basis: Vec[] = [];
  for (const fc of freeCols) {
    const v = Array(n).fill(0);
    v[fc] = 1;
    for (let p = 0; p < pivots.length; p++) {
      v[pivots[p]] = -R[p][fc];
    }
    basis.push(v);
  }
  return basis;
};

// Eigenvalues via characteristic polynomial
export const eigen = (A: Matrix): EigenResult => {
  const n = A.length;
  if (n === 2) return eigen2(A);
  return eigen3(A);
};

const eigen2 = (A: Matrix): EigenResult => {
  const [a, b] = A[0];
  const [c, d] = A[1];
  const tr = a + d;
  const de = a * d - b * c;
  const disc = tr * tr - 4 * de;
  const values: { re: number; im: number }[] = [];
  const vectors: (Vec | null)[] = [];
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    const l1 = (tr + s) / 2;
    const l2 = (tr - s) / 2;
    values.push({ re: l1, im: 0 }, { re: l2, im: 0 });
    vectors.push(eigvec2(A, l1), eigvec2(A, l2));
  } else {
    const s = Math.sqrt(-disc);
    values.push({ re: tr / 2, im: s / 2 }, { re: tr / 2, im: -s / 2 });
    vectors.push(null, null);
  }
  return { values, vectors };
};

const eigvec2 = (A: Matrix, lambda: number): Vec | null => {
  // (A - λI) v = 0
  const M: Matrix = [
    [A[0][0] - lambda, A[0][1]],
    [A[1][0], A[1][1] - lambda],
  ];
  // Pick nonzero row
  const tryRow = (r: number[]) => {
    if (Math.abs(r[0]) > 1e-10 || Math.abs(r[1]) > 1e-10) {
      // r0*x + r1*y = 0 -> v = (-r1, r0) or (r1, -r0)
      const v: Vec = [-r[1], r[0]];
      return normalize(v);
    }
    return null;
  };
  return tryRow(M[0]) ?? tryRow(M[1]) ?? [1, 0];
};

// Cubic solver for 3x3 (real roots via Cardano / trigonometric method)
const eigen3 = (A: Matrix): EigenResult => {
  // char poly: λ^3 - c2 λ^2 + c1 λ - c0 = 0
  const tr = A[0][0] + A[1][1] + A[2][2];
  // sum of principal 2x2 minors
  const m00 = A[1][1] * A[2][2] - A[1][2] * A[2][1];
  const m11 = A[0][0] * A[2][2] - A[0][2] * A[2][0];
  const m22 = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const c1 = m00 + m11 + m22;
  const c0 = det(A);
  // roots of x^3 - tr x^2 + c1 x - c0 = 0
  const roots = solveCubic(1, -tr, c1, -c0);
  const values: { re: number; im: number }[] = roots;
  const vectors: (Vec | null)[] = roots.map((r) =>
    Math.abs(r.im) < 1e-8 ? eigvec3(A, r.re) : null
  );
  return { values, vectors };
};

const solveCubic = (
  a: number,
  b: number,
  c: number,
  d: number
): { re: number; im: number }[] => {
  // normalize to x^3 + px^2 + qx + r = 0
  const p = b / a;
  const q = c / a;
  const r = d / a;
  // Depress: x = t - p/3 -> t^3 + Pt + Q = 0
  const P = q - (p * p) / 3;
  const Q = (2 * p * p * p) / 27 - (p * q) / 3 + r;
  const disc = (Q * Q) / 4 + (P * P * P) / 27;
  const shift = -p / 3;
  if (disc > 1e-12) {
    const sq = Math.sqrt(disc);
    const u = Math.cbrt(-Q / 2 + sq);
    const v = Math.cbrt(-Q / 2 - sq);
    const t1 = u + v;
    // two complex
    const reT = -(u + v) / 2;
    const imT = ((u - v) * Math.sqrt(3)) / 2;
    return [
      { re: t1 + shift, im: 0 },
      { re: reT + shift, im: imT },
      { re: reT + shift, im: -imT },
    ];
  } else if (disc < -1e-12) {
    // three real via trigonometric
    const m = 2 * Math.sqrt(-P / 3);
    const arg = (3 * Q) / (P * m);
    const theta = Math.acos(Math.max(-1, Math.min(1, arg))) / 3;
    const t1 = m * Math.cos(theta);
    const t2 = m * Math.cos(theta - (2 * Math.PI) / 3);
    const t3 = m * Math.cos(theta - (4 * Math.PI) / 3);
    return [
      { re: t1 + shift, im: 0 },
      { re: t2 + shift, im: 0 },
      { re: t3 + shift, im: 0 },
    ];
  } else {
    // repeated roots
    const u = Math.cbrt(-Q / 2);
    const t1 = 2 * u;
    const t2 = -u;
    return [
      { re: t1 + shift, im: 0 },
      { re: t2 + shift, im: 0 },
      { re: t2 + shift, im: 0 },
    ];
  }
};

const eigvec3 = (A: Matrix, lambda: number): Vec | null => {
  const M: Matrix = [
    [A[0][0] - lambda, A[0][1], A[0][2]],
    [A[1][0], A[1][1] - lambda, A[1][2]],
    [A[2][0], A[2][1], A[2][2] - lambda],
  ];
  const ns = nullSpace(M);
  if (ns.length === 0) {
    // Numerical fallback: inverse iteration-ish — pick smallest column
    // Try cross products of rows for a nonzero vector
    const cross = (a: Vec, b: Vec): Vec => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const candidates = [
      cross(M[0], M[1]),
      cross(M[1], M[2]),
      cross(M[0], M[2]),
    ];
    for (const v of candidates) if (norm(v) > 1e-8) return normalize(v);
    return null;
  }
  return normalize(ns[0]);
};

export const formatNum = (x: number, digits = 3): string => {
  if (Math.abs(x) < 1e-10) return "0";
  const s = x.toFixed(digits);
  return s.replace(/\.?0+$/, "") || "0";
};

export const formatComplex = (z: { re: number; im: number }): string => {
  if (Math.abs(z.im) < 1e-8) return formatNum(z.re);
  const sign = z.im >= 0 ? "+" : "-";
  return `${formatNum(z.re)} ${sign} ${formatNum(Math.abs(z.im))}i`;
};
