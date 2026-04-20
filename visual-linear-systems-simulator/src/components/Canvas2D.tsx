import { useEffect, useRef } from "react";
import type { Matrix, NamedVector, Vec, EigenResult, Operation, SubspaceToggles } from "../engine/types";
import { identity, lerpVec, matMul, matVec } from "../engine/linalg";
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
  t: number;
  step: number;
  showGrid: boolean;
  showBasis: boolean;
  showTrails: boolean;
  eigen: EigenResult | null;
  trails: Record<string, Vec[]>;
  subspaces: SubspaceToggles;
  subspaceBases: SubspaceBases | null;
  zoom: number;
  onZoomChange: (z: number) => void;
}

const COLORS = {
  bg: "#0b0e14",
  grid: "rgba(77, 163, 255, 0.12)",
  axis: "rgba(79, 195, 255, 0.65)",
  deformedGrid: "#f2a23c",
  input: "#4fa3ff",
  basisX: "#ff4d4d",
  basisY: "#4ade80",
  basisZ: "#60a5fa",
  eigen: "#b57bff",
  text: "#d6e0f0",
  subCol: "#22e1ff",
  subNull: "#ff5fc8",
  subRow: "#5dffa1",
  subLeftNull: "#ffe15c",
};

// Grid extent in world units. Axes clamp to this.
const GRID_N = 6;
const SUBSPACE_ALPHA_FILL = 0.16;
const SUBSPACE_ALPHA_LINE = 0.9;

const iso = (v: Vec): [number, number] => {
  if (v.length === 2) return [v[0], v[1]];
  const [x, y, z] = v;
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
  trails,
  subspaces,
  subspaceBases,
  zoom,
  onZoomChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Wheel handler — mount once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = Math.max(0.25, Math.min(4, zoomRef.current * factor));
      onZoomChange(next);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

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

    // Single render-level scale that zoom modifies — no geometry recomputation.
    const baseScale = Math.min(w, h) / 12;
    const scale = baseScale * zoom;
    const cx = w / 2;
    const cy = h / 2;
    const toScreen = (v: Vec): [number, number] => {
      const [x, y] = iso(v);
      return [cx + x * scale, cy - y * scale];
    };

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const eased = easeCos(t);
    const n = dim;
    const I = identity(n);

    let fromM: Matrix = I;
    let toM: Matrix = matrix;
    if (operation === "iterate") {
      fromM = I;
      for (let i = 0; i < step; i++) fromM = matMul(matrix, fromM);
      toM = matMul(matrix, fromM);
    }
    const M: Matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (1 - eased) * fromM[i][j] + eased * toM[i][j])
    );

    // Layer 1: grid
    if (showGrid) drawGrid(ctx, toScreen, dim, M);

    // Layer 2: axes (clamped to grid bounds, thin, subtle)
    drawAxes(ctx, toScreen, dim);

    // Layer 3: subspaces (behind vectors)
    if (operation === "subspaces" && subspaceBases) {
      const list: [Vec[], string, string][] = [];
      if (subspaces.col) list.push([subspaceBases.col, COLORS.subCol, "Col A"]);
      if (subspaces.row) list.push([subspaceBases.row, COLORS.subRow, "Row A"]);
      if (subspaces.null) list.push([subspaceBases.null, COLORS.subNull, "Nul A"]);
      if (subspaces.leftNull) list.push([subspaceBases.leftNull, COLORS.subLeftNull, "Nul Aᵀ"]);
      // Reduce clutter: when >=3 enabled, use a single label slot per subspace offset vertically
      let labelSlot = 0;
      for (const [basis, color, label] of list) {
        drawSubspace(ctx, toScreen, dim, basis, color, label, labelSlot++);
      }
    }

    // Layer 4: basis vectors
    if (showBasis) {
      const basisColors = [COLORS.basisX, COLORS.basisY, COLORS.basisZ];
      const origin = Array(n).fill(0) as Vec;
      for (let i = 0; i < n; i++) {
        const e = Array(n).fill(0);
        e[i] = 1;
        const Me = matVec(M, e);
        drawArrow(ctx, toScreen(origin), toScreen(Me), basisColors[i], 2);
      }
    }

    // Layer 5: trails
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

    // Layer 6: eigen visualization
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
        const lambda = eigen.values[i].re;
        const targetEnd = scaleVecL(ev, lambda);
        const animatedEnd = lerpVec(ev, targetEnd, eased);
        const origin = Array(n).fill(0) as Vec;
        drawArrow(ctx, toScreen(origin), toScreen(animatedEnd), COLORS.eigen, 2.5);
      }
    }

    // Layer 7: input + transformed vectors (always on top)
    for (const v of vectors) {
      const Mv = matVec(M, v.components);
      const origin = Array(n).fill(0) as Vec;
      if (operation === "transform") {
        drawArrow(
          ctx,
          toScreen(origin),
          toScreen(v.components),
          hexWithAlpha(COLORS.input, 0.35),
          2
        );
      }
      drawArrow(ctx, toScreen(origin), toScreen(Mv), v.color, 3);
      if (v.name) {
        const [tx, ty] = toScreen(Mv);
        const [ox, oy] = toScreen(origin);
        const dx = tx - ox;
        const dy = ty - oy;
        const len = Math.hypot(dx, dy) || 1;
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
    if (zoom !== 1) {
      ctx.globalAlpha = 0.6;
      ctx.fillText(`zoom ${zoom.toFixed(2)}×`, w - 90, h - 14);
      ctx.globalAlpha = 1;
    }
  }, [dim, matrix, vectors, operation, t, step, showGrid, showBasis, showTrails, eigen, trails, subspaces, subspaceBases, zoom]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }} />;
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
  const N = GRID_N;
  ctx.save();
  ctx.strokeStyle = COLORS.axis;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.2;
  const drawLine = (a: Vec, b: Vec) => {
    const [x1, y1] = toScreen(a);
    const [x2, y2] = toScreen(b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const axesEndpoints: [Vec, Vec, string][] = dim === 2
    ? [
        [[-N, 0], [N, 0], "x"],
        [[0, -N], [0, N], "y"],
      ]
    : [
        [[-N, 0, 0], [N, 0, 0], "x"],
        [[0, -N, 0], [0, N, 0], "y"],
        [[0, 0, -N], [0, 0, N], "z"],
      ];
  for (const [a, b] of axesEndpoints) drawLine(a, b);
  ctx.restore();

  // Labels: offset ABOVE axis in screen space, small gap
  ctx.save();
  ctx.fillStyle = "#8ed4ff";
  ctx.globalAlpha = 0.95;
  ctx.font = "600 12px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const LABEL_OFFSET_Y = -12; // screen px above the axis line
  for (const [, endpoint, label] of axesEndpoints) {
    const [lx, ly] = toScreen(endpoint);
    ctx.fillText(label, lx, ly + LABEL_OFFSET_Y);
  }
  ctx.restore();
};

const drawSubspace = (
  ctx: CanvasRenderingContext2D,
  toScreen: (v: Vec) => [number, number],
  dim: 2 | 3,
  basis: Vec[],
  color: string,
  label: string,
  labelSlot: number
) => {
  if (basis.length === 0) return;
  ctx.save();
  if (basis.length === 1) {
    const v = basis[0];
    const s = GRID_N + 2; // stay near grid extents
    const a = toScreen(v.map((x) => x * -s));
    const b = toScreen(v.map((x) => x * s));
    ctx.strokeStyle = color;
    ctx.globalAlpha = SUBSPACE_ALPHA_LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  } else if (basis.length === 2) {
    const s = GRID_N - 1;
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
    ctx.fillStyle = hexToRGBA(color, SUBSPACE_ALPHA_FILL);
    ctx.fill();
    ctx.strokeStyle = hexToRGBA(color, SUBSPACE_ALPHA_LINE);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Full space — faint wash, no overlap
    if (dim === 2) {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = color;
      const [x1, y1] = toScreen([-GRID_N, -GRID_N]);
      const [x2, y2] = toScreen([GRID_N, GRID_N]);
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
  }
  ctx.restore();

  // Legend label: stacked in top-left corner to avoid clutter
  ctx.save();
  ctx.fillStyle = hexToRGBA(color, 0.18);
  ctx.fillRect(12, 60 + labelSlot * 22, 92, 18);
  ctx.fillStyle = color;
  ctx.font = "600 11px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, 18, 60 + labelSlot * 22 + 9);
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
  M: Matrix
) => {
  const N = GRID_N;
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
  ctx.globalAlpha = 0.55;
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
