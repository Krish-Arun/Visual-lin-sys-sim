import type { NamedVector } from "../engine/types";

interface Props {
  dim: 2 | 3;
  vectors: NamedVector[];
  onChange: (vs: NamedVector[]) => void;
}

const DEFAULT_COLORS = ["#4fa3ff", "#ff8a3d", "#f5e663", "#3ddba1", "#ff78c2", "#9f7bff"];

export const VectorInput: React.FC<Props> = ({ dim, vectors, onChange }) => {
  const update = (i: number, j: number, v: string) => {
    const clean = v.replace(/[^0-9.\-]/g, "");
    const num = clean === "" || clean === "-" ? 0 : parseFloat(clean);
    if (isNaN(num)) return;
    const copy = vectors.map((vec) => ({ ...vec, components: [...vec.components] }));
    copy[i].components[j] = num;
    onChange(copy);
  };
  const rename = (i: number, name: string) => {
    const copy = vectors.map((vec) => ({ ...vec }));
    copy[i].name = name.slice(0, 6);
    onChange(copy);
  };
  const remove = (i: number) => onChange(vectors.filter((_, idx) => idx !== i));
  const add = () => {
    const zero = Array(dim).fill(0);
    zero[0] = 1;
    const idx = vectors.length + 1;
    onChange([
      ...vectors,
      {
        id: `v${Date.now()}`,
        name: `v${idx}`,
        components: zero,
        color: DEFAULT_COLORS[vectors.length % DEFAULT_COLORS.length],
      },
    ]);
  };

  return (
    <div className="vector-list">
      {vectors.map((v, i) => (
        <div key={v.id} className="vector-row">
          <span className="vector-dot" style={{ background: v.color }} />
          <input
            type="text"
            className="matrix-cell small vector-name"
            value={v.name}
            onChange={(e) => rename(i, e.target.value)}
          />
          <div className="vector-components">
            {v.components.slice(0, dim).map((c, j) => (
              <input
                key={j}
                type="text"
                inputMode="decimal"
                className="matrix-cell small"
                value={c}
                onChange={(e) => update(i, j, e.target.value)}
              />
            ))}
          </div>
          <button className="btn small danger" onClick={() => remove(i)}>
            ×
          </button>
        </div>
      ))}
      <button className="btn" onClick={add}>+ add vector</button>
    </div>
  );
};
