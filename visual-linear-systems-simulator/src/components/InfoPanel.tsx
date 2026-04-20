import type { EigenResult, Matrix, Operation, Vec } from "../engine/types";
import { det, formatComplex, formatNum, rank } from "../engine/linalg";

interface Props {
  operation: Operation;
  matrix: Matrix;
  eigen: EigenResult | null;
  nullBasis: Vec[];
}

export const InfoPanel: React.FC<Props> = ({ operation, matrix, eigen, nullBasis }) => {
  const d = det(matrix);
  const r = rank(matrix);
  const n = matrix.length;

  return (
    <div className="info-panel">
      <div className="info-row">
        <span className="info-label">det</span>
        <span className="info-val">{formatNum(d, 4)}</span>
      </div>
      <div className="info-row">
        <span className="info-label">rank</span>
        <span className="info-val">{r} / {n}</span>
      </div>
      <div className="info-row">
        <span className="info-label">nullity</span>
        <span className="info-val">{n - r}</span>
      </div>
      {operation === "eigen" && eigen && (
        <div className="info-block">
          <div className="info-title">Eigenvalues</div>
          {eigen.values.map((v, i) => (
            <div key={i} className="info-row">
              <span className="info-label">λ{i + 1}</span>
              <span className="info-val">{formatComplex(v)}</span>
            </div>
          ))}
          <div className="info-title">Eigenvectors</div>
          {eigen.vectors.map((ev, i) =>
            ev ? (
              <div key={i} className="info-row">
                <span className="info-label">v{i + 1}</span>
                <span className="info-val">
                  [{ev.map((x) => formatNum(x, 2)).join(", ")}]
                </span>
              </div>
            ) : (
              <div key={i} className="info-row">
                <span className="info-label">v{i + 1}</span>
                <span className="info-val muted">complex</span>
              </div>
            )
          )}
        </div>
      )}
      {operation === "rank" && nullBasis.length > 0 && (
        <div className="info-block">
          <div className="info-title">Null space basis</div>
          {nullBasis.map((v, i) => (
            <div key={i} className="info-row">
              <span className="info-label">n{i + 1}</span>
              <span className="info-val">[{v.map((x) => formatNum(x, 2)).join(", ")}]</span>
            </div>
          ))}
        </div>
      )}
      {operation === "rank" && nullBasis.length === 0 && (
        <div className="info-block muted">
          Matrix is full rank — null space is trivial.
        </div>
      )}
    </div>
  );
};
