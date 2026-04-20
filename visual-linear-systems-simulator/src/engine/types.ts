export type Matrix = number[][];
export type Vec = number[];

export type Dim = 2 | 3;

export type Operation =
  | "transform"
  | "iterate"
  | "eigen"
  | "determinant"
  | "rank"
  | "subspaces";

export interface NamedVector {
  id: string;
  name: string;
  components: Vec;
  color: string;
}

export interface SubspaceToggles {
  col: boolean;
  null: boolean;
  row: boolean;
  leftNull: boolean;
}

export interface EigenResult {
  values: { re: number; im: number }[];
  vectors: (Vec | null)[];
}
