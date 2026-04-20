import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { MatrixInput } from "./components/MatrixInput";
import { VectorInput } from "./components/VectorInput";
import { Canvas2D } from "./components/Canvas2D";
import { useAnimation } from "./hooks/useAnimation";
import type { Dim, Matrix, NamedVector, Operation, SubspaceToggles, Vec } from "./engine/types";
import {
  colSpace,
  eigen,
  identity,
  leftNullSpace,
  matVec,
  nullSpace,
  rank as computeRank,
  rotationMatrix,
  rowSpace,
} from "./engine/linalg";

const defaultVecs = (dim: Dim): NamedVector[] => [
  { id: "v1", name: "v1", components: dim === 2 ? [1, 0.5] : [1, 0.5, 0.25], color: "#4fa3ff" },
  { id: "v2", name: "v2", components: dim === 2 ? [-0.5, 1] : [-0.5, 1, 0.5], color: "#ff78c2" },
];

const presets: Record<string, Matrix> = {
  "Rotate 45°": [
    [Math.SQRT1_2, -Math.SQRT1_2],
    [Math.SQRT1_2, Math.SQRT1_2],
  ],
  "Scale 2×": [
    [2, 0],
    [0, 2],
  ],
  "Shear": [
    [1, 1],
    [0, 1],
  ],
  "Reflect X": [
    [1, 0],
    [0, -1],
  ],
  "Singular": [
    [1, 2],
    [2, 4],
  ],
};

function App() {
  const [dim, setDim] = useState<Dim>(2);
  const [matrix, setMatrix] = useState<Matrix>(identity(2));
  const [vectors, setVectors] = useState<NamedVector[]>(defaultVecs(2));
  const [operation, setOperation] = useState<Operation>("transform");
  const [playing, setPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showBasis, setShowBasis] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [maxIterations, setMaxIterations] = useState(8);
  const [duration, setDuration] = useState(1200);
  const [theta, setTheta] = useState(45);
  const [subspaces, setSubspaces] = useState<SubspaceToggles>({
    col: true,
    null: true,
    row: false,
    leftNull: false,
  });
  const [zoom, setZoom] = useState(1);

  const trailsRef = useRef<Record<string, Vec[]>>({});

  const changeDim = (d: Dim) => {
    setDim(d);
    setMatrix(identity(d));
    setVectors(defaultVecs(d));
    trailsRef.current = {};
  };

  const anim = useAnimation({
    duration,
    playing,
    loop: operation === "iterate",
    maxSteps: operation === "iterate" ? maxIterations : 1,
  });

  useEffect(() => {
    anim.reset();
    setPlaying(false);
    trailsRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation, dim]);

  useEffect(() => {
    if (operation !== "iterate") return;
    const M = matrix;
    const tr: Record<string, Vec[]> = {};
    for (const v of vectors) {
      let p = v.components;
      const trail: Vec[] = [v.components];
      for (let k = 0; k < anim.step + 1; k++) {
        p = matVec(M, p);
        trail.push(p);
      }
      tr[v.id] = trail;
    }
    trailsRef.current = tr;
  }, [anim.step, operation, matrix, vectors]);

  const eigenResult = useMemo(
    () => (operation === "eigen" ? eigen(matrix) : null),
    [matrix, operation]
  );

  const rankA = useMemo(() => computeRank(matrix), [matrix]);
  const nullity = matrix.length - rankA;

  const subspaceBases = useMemo(() => {
    if (operation !== "subspaces") return null;
    return {
      col: colSpace(matrix),
      null: nullSpace(matrix),
      row: rowSpace(matrix),
      leftNull: leftNullSpace(matrix),
    };
  }, [matrix, operation]);

  const applyPreset = (name: string) => {
    if (dim !== 2) return;
    setMatrix(presets[name].map((r) => [...r]));
  };

  return (
    <div className="app">
      <aside className="controls">
        <h1>Visual Linear Systems</h1>

        <section>
          <div className="section-title">Dimension</div>
          <div className="toggle-row">
            <button className={`btn ${dim === 2 ? "active" : ""}`} onClick={() => changeDim(2)}>2 × 2</button>
            <button className={`btn ${dim === 3 ? "active" : ""}`} onClick={() => changeDim(3)}>3 × 3</button>
          </div>
        </section>

        <section>
          <div className="section-title">Matrix A</div>
          <MatrixInput matrix={matrix} onChange={setMatrix} />
          {dim === 2 ? (
            <div className="preset-row">
              {Object.keys(presets).map((name) => (
                <button key={name} className="btn tiny" onClick={() => applyPreset(name)}>{name}</button>
              ))}
              <button className="btn tiny" onClick={() => setMatrix(identity(dim))}>Reset I</button>
            </div>
          ) : (
            <div className="preset-row">
              <button className="btn tiny" onClick={() => setMatrix(identity(dim))}>Reset I</button>
            </div>
          )}
          <div className="rotation-row">
            <label>θ°</label>
            <input
              type="number"
              className="matrix-cell small rotation-input"
              value={theta}
              onChange={(e) => setTheta(parseFloat(e.target.value) || 0)}
            />
            <button
              className="btn tiny"
              onClick={() => setMatrix(rotationMatrix(theta, dim))}
              title={dim === 3 ? "Rotation about Z-axis" : "2D rotation"}
            >
              Apply rotation{dim === 3 ? " (Z)" : ""}
            </button>
          </div>
        </section>

        <section>
          <div className="section-title">Operation</div>
          <select
            className="select"
            value={operation}
            onChange={(e) => setOperation(e.target.value as Operation)}
          >
            <option value="transform">Linear Transformation</option>
            <option value="iterate">Iterative Transformation (Aᵏv)</option>
            <option value="eigen">Eigenvectors &amp; Eigenvalues</option>
            <option value="subspaces">Fundamental Subspaces</option>
          </select>
          {operation === "subspaces" && (
            <div className="subspace-toggles">
              <button
                className={`btn tiny sub-col ${subspaces.col ? "active" : ""}`}
                onClick={() => setSubspaces((s) => ({ ...s, col: !s.col }))}
              >
                Column Space
              </button>
              <button
                className={`btn tiny sub-null ${subspaces.null ? "active" : ""}`}
                onClick={() => setSubspaces((s) => ({ ...s, null: !s.null }))}
              >
                Null Space
              </button>
              <button
                className={`btn tiny sub-row ${subspaces.row ? "active" : ""}`}
                onClick={() => setSubspaces((s) => ({ ...s, row: !s.row }))}
              >
                Row Space
              </button>
              <button
                className={`btn tiny sub-leftnull ${subspaces.leftNull ? "active" : ""}`}
                onClick={() => setSubspaces((s) => ({ ...s, leftNull: !s.leftNull }))}
              >
                Left Null
              </button>
            </div>
          )}
        </section>

        <section>
          <div className="section-title">Vectors</div>
          <VectorInput dim={dim} vectors={vectors} onChange={setVectors} />
        </section>

        <section>
          <div className="section-title">Animation</div>
          <div className="toggle-row">
            <button className="btn primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button className="btn" onClick={() => { setPlaying(false); anim.reset(); trailsRef.current = {}; }}>
              ⟲ Reset
            </button>
          </div>
          <div className="slider-row">
            <label>Speed</label>
            <input
              type="range"
              min={200}
              max={3000}
              step={100}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
            />
            <span className="muted">{(duration / 1000).toFixed(1)}s</span>
          </div>
          {operation === "iterate" && (
            <div className="slider-row">
              <label>Max k</label>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={maxIterations}
                onChange={(e) => setMaxIterations(parseInt(e.target.value))}
              />
              <span className="muted">{maxIterations}</span>
            </div>
          )}
          <div className="slider-row">
            <label>t</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={anim.t}
              onChange={(e) => { setPlaying(false); anim.setT(parseFloat(e.target.value)); }}
            />
            <span className="muted">{anim.t.toFixed(2)}</span>
          </div>
        </section>

        <section>
          <div className="section-title">Display</div>
          <label className="check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid deformation</label>
          <label className="check"><input type="checkbox" checked={showBasis} onChange={(e) => setShowBasis(e.target.checked)} /> Basis vectors</label>
          <label className="check"><input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> Trails</label>
          <div className="slider-row" style={{ marginTop: 6 }}>
            <label>Zoom</label>
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
            />
            <span className="muted">{zoom.toFixed(2)}×</span>
          </div>
        </section>

        <section className="stats-footer">
          <div className="info-row">
            <span className="info-label">Rank(A)</span>
            <span className="info-val">{rankA}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Nullity(A)</span>
            <span className="info-val">{nullity}</span>
          </div>
        </section>

        <footer className="footer muted">
          {dim === 3 ? "3D rendered in isometric projection" : "2D Cartesian view"}
        </footer>
      </aside>

      <main className="canvas-wrap">
        <Canvas2D
          dim={dim}
          matrix={matrix}
          vectors={vectors}
          operation={operation}
          t={anim.t}
          step={anim.step}
          showGrid={showGrid}
          showBasis={showBasis}
          showTrails={showTrails}
          eigen={eigenResult}
          trails={trailsRef.current}
          subspaces={subspaces}
          subspaceBases={subspaceBases}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      </main>
    </div>
  );
}

export default App;
