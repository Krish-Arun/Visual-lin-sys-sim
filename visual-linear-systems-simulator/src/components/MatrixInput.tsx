import type { Matrix } from "../engine/types";

interface Props {
  matrix: Matrix;
  onChange: (m: Matrix) => void;
}

export const MatrixInput: React.FC<Props> = ({ matrix, onChange }) => {
  const n = matrix.length;
  const update = (i: number, j: number, v: string) => {
    const clean = v.replace(/[^0-9.\-]/g, "");
    const num = clean === "" || clean === "-" ? 0 : parseFloat(clean);
    if (isNaN(num)) return;
    const copy = matrix.map((r) => [...r]);
    copy[i][j] = num;
    onChange(copy);
  };
  return (
    <div className="matrix-grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {matrix.map((row, i) =>
        row.map((val, j) => (
          <input
            key={`${i}-${j}`}
            type="text"
            inputMode="decimal"
            className="matrix-cell"
            value={val}
            onChange={(e) => update(i, j, e.target.value)}
          />
        ))
      )}
    </div>
  );
};
