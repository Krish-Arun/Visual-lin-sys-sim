import { useEffect, useRef } from "react";
import type { Matrix, NamedVector, Vec, EigenResult, Operation, SubspaceToggles } from "../engine/types";
import { identity, lerpVec, matMul, matVec, det as detFn } from "../engine/linalg";
import { easeCos } from "../hooks/useAnimation";

interface SubspaceBases {
  col: Vec[];
  null: Vec[];
  row: Vec[];
  leftNull: Vec[];
}

interface Props {
  dim: 2 | 3;
  matrix: Matrix;
  vectors: NamedVector[];
  operation: Operation;
  t: number; // 0..1
  step: number; // iteration step
  showGrid: boolean;
  showBasis: boolean;
  showTrails: boolean;
  eigen: EigenResult | null;
  nullBasis: Vec[];
  trails: Record<string, Vec[]>;
  subspaces: SubspaceToggles;
  subspaceBases: SubspaceBases | null;
}

const COLORS = {
  bg: "#0b0e14",
  grid: "rgba(77, 163, 255, 0.12)",
  gridStrong: "rgba(77, 163, 255, 0.25)",
  axis: "#4fc3ff",
  axisGlow: "rgba(79, 195, 255, 0.45)",
  deformedGrid: "#f2a23c",
  input: "#4fa3ff",
  transformed: "#ff8a3d",
  basisX: "#ff4d4d",
  basisY: "#4ade80",
  basisZ: "#60a5fa",
  eigen: "#b57bff",
  nullSpace: "#ff69b4",
  unitShapeFill: "rgba(255, 138, 61, 0.15)",
  unitShapeStroke: "#ff8a3d",
  text: "#d6e0f0",
  subCol: "#22e1ff",
  subNull: "#ff5fc8",
  subRow: "#5dffa1",
  subLeftNull: "#ffe15c",
};

// Isometric projection for 3D
const iso = (v: Vec): [number, number] => {
  if (v.length === 2) return [v[0], v[1]];
  const [x, y, z] = v;
  // Classic isometric
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  return [cos30 * (x - y), sin30 * (x + y) - z];
};

export const Canvas2D: React.FC<Props> = ({
  dim,
  matrix,
  vectors,
  operation,
  t,
  step,
  showGrid,
  showBasis,
  showTrails,
  eigen,
  nullBasis,
  trails,
  subspaces,
  subspaceBases,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // World to screen
    const scale = Math.min(w, h) / 12; // world unit -> px
    const cx = w / 2;
    const cy = h / 2;
    const toScreen = (v: Vec): [number, number] => {
      const [x, y] = iso(v);
      return [cx + x * scale, cy - y * scale];
    };

    // Fill background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const eased = easeCos(t);
    // Effective matrix: smoothly interpolate between I and A (for transform step)
    // For iteration: between A^step and A^(step+1), animate once per step
    const n = dim;
    const I = identity(n);

    // Determine the transformation path
    let fromM: Matrix = I;
    let toM: Matrix = matrix;
    if (operation === "iterate") {
      fromM = I;
      for (let i = 0; i < step; i++) fromM = matMul(matrix, fromM);
      toM = matMul(matrix, fromM);
    }
    // Interpolated matrix using entrywise lerp
    const M: Matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (1 - eased) * fromM[i][j] + eased * toM[i][j])
    );

    // Draw grid
    if (showGrid) {
      drawGrid(ctx, toScreen, dim, I, M);
    }

    // Draw neon-blue axes (on top of grid)
    drawAxes(ctx, toScreen, dim);

    // Draw null space (rank mode)
    if (operation === "rank" && nullBasis.length > 0) {
      ctx.strokeStyle = COLORS.nullSpace;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      for (const nv of nullBasis) {
        const a = toScreen(scaleVecL(nv, -20));
        const b = toScreen(scaleVecL(nv, 20));
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Fundamental subspaces mode
    if (operation === "subspaces" && subspaceBases) {
      if (subspaces.col) drawSubspace(ctx, toScreen, dim, subspaceBases.col, COLORS.subCol, "Col A");
      if (subspaces.null) drawSubspace(ctx, toScreen, dim, subspaceBases.null, COLORS.subNull, "Nul A");
      if (subspaces.row) drawSubspace(ctx, toScreen, dim, subspaceBases.row, COLORS.subRow, "Row A");
      if (subspaces.leftNull)
        drawSubspace(ctx, toScreen, dim, subspaceBases.leftNull, COLORS.subLeftNull, "Nul Aᵀ");
    }

    // Unit shape for determinant mode
    if (operation === "determinant") {
      drawUnitShape(ctx, toScreen, dim, M);
      const dnow = (1 - eased) * detFn(fromM) + eased * detFn(toM);
      ctx.fillStyle = COLORS.text;
      ctx.font = "14px ui-monospace, monospace";
      ctx.fillText(`det = ${dnow.toFixed(3)}`, 16, h - 16);
    }

    // Draw basis vectors
    if (showBasis) {
      const basisColors = [COLORS.basisX, COLORS.basisY, COLORS.basisZ];
      for (let i = 0; i < n; i++) {
        const e = Array(n).fill(0);
        e[i] = 1;
        const Me = matVec(M, e);
        drawArrow(ctx, toScreen([0, 0, 0].slice(0, n) as Vec), toScreen(Me), basisColors[i], 2);
      }
    }

    // Draw trails
    if (showTrails && operation === "iterate") {
      for (const v of vectors) {
        const tr = trails[v.id] ?? [];
        if (tr.length < 2) continue;
        ctx.strokeStyle = v.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const [sx, sy] = toScreen(tr[0]);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < tr.length; i++) {
          const [x, y] = toScreen(tr[i]);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw eigen vectors
    if (operation === "eigen" && eigen) {
      for (let i = 0; i < eigen.vectors.length; i++) {
        const ev = eigen.vectors[i];
        if (!ev) continue;
        const a = toScreen(scaleVecL(ev, -6));
        const b = toScreen(scaleVecL(ev, 6));
        ctx.strokeStyle = COLORS.eigen;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Draw scaled eigen arrow showing Av = λv
        const lambda = eigen.values[i].re;
        const targetEnd = scaleVecL(ev, lambda);
        const animatedEnd = lerpVec(ev, targetEnd, eased);
        drawArrow(ctx, toScreen([0, 0, 0].slice(0, n) as Vec), toScreen(animatedEnd), COLORS.eigen, 2.5);
      }
    }

    // Draw input and transformed vectors
    for (const v of vectors) {
      const Mv = matVec(M, v.components);
      // Input vector (ghost) at original position
      if (operation === "transform" || operation === "determinant") {
        drawArrow(
          ctx,
          toScreen([0, 0, 0].slice(0, n) as Vec),
          toScreen(v.components),
          hexWithAlpha(COLORS.input, 0.35),
          2
        );
      }
      drawArrow(ctx, toScreen([0, 0, 0].slice(0, n) as Vec), toScreen(Mv), v.color, 3);
      if (v.name) {
        const [tx, ty] = toScreen(Mv);
        const [ox, oy] = toScreen([0, 0, 0].slice(0, n) as Vec);
        const dx = tx - ox;
        const dy = ty - oy;
        const len = Math.hypot(dx, dy) || 1;
        // offset label away from arrow tip, perpendicular + along direction
        const nx = -dy / len;
        const ny = dx / len;
        const lx = tx + (dx / len) * 10 + nx * 6;
        const ly = ty + (dy / len) * 10 + ny * 6;
        ctx.fillStyle = v.color;
        ctx.font = "600 13px ui-monospace, monospace";
        ctx.textBaseline = "middle";
        ctx.fillText(v.name, lx, ly);
      }
    }

    // HUD
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px ui-monospace, monospace";
    if (operation === "iterate") {
      ctx.fillText(`k = ${step + (t > 0 ? t : 0).toFixed(2).slice(1)}`, 16, 24);
      ctx.fillText(`step ${step} → ${step + 1}`, 16, 42);
    }
  }, [dim, matrix, vectors, operation, t, step, showGrid, showBasis, showTrails, eigen, nullBasis, trails]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
};

const scaleVecL = (v: Vec, s: number): Vec => v.map((x) => x * s);

const hexWithAlpha = (hex: string, a: number): string => {
  const m = hex.match(/#([0-9a-f]{6})/i);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  color: string,
  width = 2
) => {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const ang = Math.atan2(dy, dx);
  const head = Math.min(12, len * 0.3);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
};

const drawAxes = (
  ctx: CanvasRenderingContext2D,
  toScreen: (v: Vec) => [number, number],
  dim: 2 | 3
) => {
  const N = 8;
  ctx.save();
  // Draw a wide faint line first to simulate glow (cheaper than shadowBlur)
  ctx.strokeStyle = COLORS.axisGlow;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 6;
  const drawLineGlow = (a: Vec, b: Vec) => {
    const [x1, y1] = toScreen(a);
    const [x2, y2] = toScreen(b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  if (dim === 2) {
    drawLineGlow([-N, 0], [N, 0]);
    drawLineGlow([0, -N], [0, N]);
  } else {
    drawLineGlow([-N, 0, 0], [N, 0, 0]);
    drawLineGlow([0, -N, 0], [0, N, 0]);
    drawLineGlow([0, 0, -N], [0, 0, N]);
  }
  ctx.strokeStyle = COLORS.axis;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.5;
  const drawLine = (a: Vec, b: Vec) => {
    const [x1, y1] = toScreen(a);
    const [x2, y2] = toScreen(b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  if (dim === 2) {
    drawLine([-N, 0], [N, 0]);
    drawLine([0, -N], [0, N]);
  } else {
    drawLine([-N, 0, 0], [N, 0, 0]);
    drawLine([0, -N, 0], [0, N, 0]);
    drawLine([0, 0, -N], [0, 0, N]);
  }
  ctx.restore();

  // Axis labels (no glow, crisp)
  ctx.save();
  ctx.fillStyle = COLORS.axis;
  ctx.globalAlpha = 0.9;
  ctx.font = "600 12px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  if (dim === 2) {
    const [xx, xy] = toScreen([N - 0.3, 0]);
    ctx.fillText("x", xx + 4, xy);
    const [yx, yy] = toScreen([0, N - 0.3]);
    ctx.fillText("y", yx + 4, yy);
  } else {
    const [xx, xy] = toScreen([N - 0.3, 0, 0]);
    ctx.fillText("x", xx + 4, xy);
    const [yx, yy] = toScreen([0, N - 0.3, 0]);
    ctx.fillText("y", yx + 4, yy);
    const [zx, zy] = toScreen([0, 0, N - 0.3]);
    ctx.fillText("z", zx + 4, zy);
  }
  ctx.restore();
};

const drawSubspace = (
  ctx: CanvasRenderingContext2D,
  toScreen: (v: Vec) => [number, number],
  dim: 2 | 3,
  basis: Vec[],
  color: string,
  label: string
) => {
  if (basis.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = hexToRGBA(color, 0.18);
  ctx.lineWidth = 2;
  if (basis.length === 1) {
    // Line through origin along basis[0]
    const v = basis[0];
    const s = 20;
    const a = toScreen(v.map((x) => x * -s));
    const b = toScreen(v.map((x) => x * s));
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    const tip = toScreen(v.map((x) => x * 4));
    ctx.fillStyle = color;
    ctx.font = "600 12px ui-monospace, monospace";
    ctx.fillText(label, tip[0] + 6, tip[1]);
  } else if (basis.length === 2) {
    // Plane as parallelogram: from -s*(u+v) to s*(u+v) with 4 corners
    const s = 5;
    const u = basis[0];
    const v = basis[1];
    const c1 = u.map((a, i) => s * a + s * v[i]);
    const c2 = u.map((a, i) => s * a - s * v[i]);
    const c3 = u.map((a, i) => -s * a - s * v[i]);
    const c4 = u.map((a, i) => -s * a + s * v[i]);
    const pts = [c1, c2, c3, c4].map(toScreen);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = hexToRGBA(color, 0.18);
    ctx.fill();
    ctx.stroke();
    // label near center of first edge
    const mid = toScreen(u.map((a, i) => 3 * a + v[i]));
    ctx.fillStyle = color;
    ctx.font = "600 12px ui-monospace, monospace";
    ctx.fillText(label, mid[0] + 6, mid[1]);
  } else {
    // Full space (rank n) — draw an axis-cross marker
    if (dim === 2) {
      // whole plane — light wash
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = color;
      const [x1, y1] = toScreen([-20, -20]);
      const [x2, y2] = toScreen([20, 20]);
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    const [lx, ly] = toScreen(dim === 2 ? [0.5, 0.5] : [0.5, 0.5, 0.5]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = "600 12px ui-monospace, monospace";
    ctx.fillText(`${label} (full)`, lx, ly);
  }
  ctx.restore();
};

const hexToRGBA = (c: string, a: number): string => {
  if (c.startsWith("rgba") || c.startsWith("rgb")) return c;
  const m = c.match(/#([0-9a-f]{6})/i);
  if (!m) return c;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  toScreen: (v: Vec) => [number, number],
  dim: 2 | 3,
  _I: Matrix,
  M: Matrix
) => {
  const N = 6;
  // Original faded grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  if (dim === 2) {
    for (let i = -N; i <= N; i++) {
      const a = toScreen([i, -N]);
      const b = toScreen([i, N]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      const c = toScreen([-N, i]);
      const d = toScreen([N, i]);
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.stroke();
    }
  } else {
    // 3D grid on z=0 plane (and axes)
    for (let i = -N; i <= N; i++) {
      const a = toScreen([i, -N, 0]);
      const b = toScreen([i, N, 0]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      const c = toScreen([-N, i, 0]);
      const d = toScreen([N, i, 0]);
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.stroke();
    }
  }

  // Deformed grid
  ctx.strokeStyle = COLORS.deformedGrid;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  if (dim === 2) {
    for (let i = -N; i <= N; i++) {
      ctx.beginPath();
      for (let j = -N; j <= N; j++) {
        const p = matVec(M, [i, j]);
        const [x, y] = toScreen(p);
        if (j === -N) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let j = -N; j <= N; j++) {
        const p = matVec(M, [j, i]);
        const [x, y] = toScreen(p);
        if (j === -N) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    for (let i = -N; i <= N; i++) {
      ctx.beginPath();
      for (let j = -N; j <= N; j++) {
        const p = matVec(M, [i, j, 0]);
        const [x, y] = toScreen(p);
        if (j === -N) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let j = -N; j <= N; j++) {
        const p = matVec(M, [j, i, 0]);
        const [x, y] = toScreen(p);
        if (j === -N) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
};

const drawUnitShape = (
  ctx: CanvasRenderingContext2D,
  toScreen: (v: Vec) => [number, number],
  dim: 2 | 3,
  M: Matrix
) => {
  ctx.strokeStyle = COLORS.unitShapeStroke;
  ctx.fillStyle = COLORS.unitShapeFill;
  ctx.lineWidth = 2;
  if (dim === 2) {
    const corners: Vec[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    ctx.beginPath();
    for (let i = 0; i < corners.length; i++) {
      const [x, y] = toScreen(matVec(M, corners[i]));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    const cs: Vec[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const transformed = cs.map((c) => matVec(M, c));
    // Fill bottom face
    const faces = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ];
    for (const face of faces) {
      ctx.beginPath();
      for (let i = 0; i < face.length; i++) {
        const [x, y] = toScreen(transformed[face[i]]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    for (const [a, b] of edges) {
      const [x1, y1] = toScreen(transformed[a]);
      const [x2, y2] = toScreen(transformed[b]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
};
