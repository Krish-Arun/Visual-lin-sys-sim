# Visual Linear Systems Simulator

An interactive playground for **linear algebra**. Type in a matrix, hit play, and watch space bend. Designed to turn abstract definitions like eigenvectors, rank, and the four fundamental subspaces into something you can literally see.

Built with **React + TypeScript + Vite** and rendered on an HTML `<canvas>`.

---

## Features

- Input a 2×2 or 3×3 matrix directly, or generate rotation / shear / reflection / singular presets
- Add any number of named vectors and watch them transform
- Five modes: **Linear Transformation**, **Iterative Transformation** ($A^k v$), **Eigenvectors & Eigenvalues**, and **Fundamental Subspaces**
- Smooth animation with play / pause / speed / scrub controls
- Mouse-wheel zoom + zoom slider
- Always-visible `Rank(A)` and `Nullity(A)` readout
- Dark neon theme, isometric 3D projection

---

## Running locally

```bash
cd visual-linear-systems-simulator
npm install
npm run dev
```

The app opens at `http://localhost:5173`.

---

## Mathematical Methods (Implementation Notes)

A quick tour of what's actually happening under the hood whenever you press **Play**. The goal here is intuition first, then a pointer to how we coded it.

### 1. Linear Transformation

A matrix is a machine that eats a vector and spits out a new vector. The rule is plain multiplication: every output coordinate is a dot product of one row of the matrix with the input vector.

$$
A v = \begin{bmatrix} a & b \\ c & d \end{bmatrix} \begin{bmatrix} x \\ y \end{bmatrix} = \begin{bmatrix} ax + by \\ cx + dy \end{bmatrix}
$$

If we just drew the starting vector $v$ and then jumped to $Av$, the user would see two arrows and nothing in between — that's not helpful. So we animate the matrix itself. At any time $t$ between 0 and 1 we draw with an **interpolated matrix**:

$$
M(t) = (1 - t)\,I + t\,A
$$

When $t = 0$ we're at the identity (nothing happens); when $t = 1$ we're fully at $A$. In between, space slides smoothly from "unchanged" to "transformed." To make the motion feel natural — instead of robotic and linear — we push $t$ through a cosine ease before using it:

$$
t' = \tfrac{1}{2} - \tfrac{1}{2}\cos(\pi t)
$$

That gives a gentle speed-up and slow-down, like a car pulling away from a stoplight and coasting into another. The same $M(t)$ is used for every vector, the basis arrows, and the deformed grid — which is why the whole scene moves as one coherent piece.

### 2. Iterative Transformation ($A^k v$)

This is the same idea, just *repeated*. Start with $v$, apply $A$ to get $Av$. Apply $A$ again to get $A(Av) = A^2 v$. Keep going:

$$
v \;\to\; Av \;\to\; A^2 v \;\to\; A^3 v \;\to\; \ldots
$$

Each step uses the same cosine-eased animation from above, and then increments $k$. Once the animation finishes we drop a point at the new position and (optionally) connect the dots to leave a trail.

Why bother? Iteration is where the *long-term personality* of a matrix shows up:

- If $A$ is a rotation, the vectors spiral around the origin forever.
- If $A$ has an eigenvalue bigger than 1, most starting vectors blow up along the **dominant eigenvector** — you see them align to a single direction and stretch out. (This is literally what Google's original PageRank did: iterate a matrix until you find the dominant direction.)
- If $A$ is singular (has a zero eigenvalue), vectors collapse onto a smaller subspace — a line or a plane — and stay there.

So the iteration mode is less about "what does this do once" and more about "what is this matrix *pulling* you toward."

### 3. Eigenvalues & Eigenvectors

An eigenvector is a very special kind of input: a direction that the matrix does **not** rotate. It might stretch it, squash it, or flip it, but it stays on the same line through the origin. The stretching factor is the eigenvalue $\lambda$, and the defining equation is:

$$
A v = \lambda v
$$

**How we find $\lambda$.** Rearrange to $(A - \lambda I) v = 0$. A nonzero $v$ can only exist if the matrix $A - \lambda I$ is *singular* — that is, if its determinant is zero. So eigenvalues are the roots of the **characteristic polynomial**:

$$
\det(A - \lambda I) = 0
$$

For a 2×2 this works out to a quadratic, which we solve directly with $\lambda = \tfrac{\text{tr}(A) \pm \sqrt{\text{tr}(A)^2 - 4\det(A)}}{2}$. If the discriminant is negative we get complex eigenvalues (the matrix is rotating, so no real direction is preserved) and we show that honestly in the info panel.

For a 3×3 it becomes a cubic:

$$
\lambda^3 - \text{tr}(A)\,\lambda^2 + c_1\,\lambda - \det(A) = 0
$$

We solve it analytically — first "depress" the cubic by shifting $\lambda$, then use either **Cardano's formula** or a trigonometric formula depending on the sign of the discriminant. This reliably handles all three roots (real or complex) without numerical iteration.

**How we find $v$.** Once we know $\lambda$, we plug it back into $(A - \lambda I) v = 0$ and solve that linear system with row reduction. The non-zero solutions span the eigenvector.

**What you see.** For each real eigenvalue we draw a dashed **invariant line** through the origin — any vector on that line stays on it under $A$. Then we animate an arrow growing from $v$ out to $\lambda v$. You're literally watching the eigen-equation hold: the direction doesn't change, only the length.

### 4. Fundamental Subspaces

Every matrix carries four natural subspaces with it. They answer four very different questions about what the matrix does. The beautiful thing is that **all four come out of a single computation**: reducing the matrix to *Row-Reduced Echelon Form* (RREF) with Gaussian elimination. Our `rref` routine does partial pivoting (grab the largest-magnitude pivot for numerical stability) and returns both the reduced matrix and the list of pivot column indices. Everything else is bookkeeping from there.

#### Column Space — "where can $Ax$ land?"

The column space is the set of every possible output $Ax$ as $x$ ranges over all inputs. Because $Ax$ is a linear combination of the columns of $A$, the column space is exactly the **span of the columns**. But not every column is independent — some might be combinations of the others. So we keep only the columns of $A$ that correspond to **pivot positions** in the RREF. (Important detail: we use the columns of the **original $A$**, not the RREF, since row operations change the columns themselves but preserve which ones are independent.)

Visually: if there's 1 pivot we draw a line; 2 pivots a plane. That's literally "all the places this matrix can send you."

#### Null Space — "what gets crushed to zero?"

The null space is every $v$ such that $Av = 0$. These are the directions the matrix *kills*. We find them by solving the homogeneous system using the RREF: every pivot variable is expressed in terms of the **free variables**, and we get one basis vector per free variable. If there are no free variables, the null space is just $\{0\}$ and the matrix is invertible.

Visually: a line or plane through the origin showing "if you start here, you land at the origin after applying $A$."

#### Row Space — "what's left after reduction?"

The row space is the span of the rows of $A$. Row operations don't change this span, so a basis is simply the **non-zero rows of the RREF**. This is the domain-side partner to the column space, and it always has the same dimension — that shared dimension is the rank.

#### Left Null Space — "what gets killed when acting from the left?"

The left null space is the set of row vectors $y$ such that $yA = 0$, or equivalently $A^\top y = 0$. So we just **transpose the matrix and reuse the null-space routine**. Geometrically, the left null space sits orthogonally to the column space and completes the full picture of "what goes in, what comes out, and what gets lost."

Each of the four subspaces is rendered with its own consistent color (cyan / pink / green / yellow) at the same transparency, so overlapping subspaces stay readable.

### 5. Rank and Nullity

The **rank** of $A$ is the number of independent directions in its output — equivalently, the number of pivots we found during row reduction. No separate calculation, just count what RREF already told us.

The **nullity** is the dimension of the null space — i.e., how many free directions get sent to zero. These two are tied together by the **Rank–Nullity Theorem**:

$$
\text{rank}(A) + \text{nullity}(A) = n
$$

where $n$ is the number of columns (dimension of the input space). That's why the footer shows both: they're *two views of the same reduction*. If the grid in the canvas visibly collapses onto a line or plane, you're seeing rank drop — and nullity grow by the same amount, because the directions that used to live in the input have been crushed into the null space.

---

## File Structure

```
visual-linear-systems-simulator/
├── src/
│   ├── engine/
│   │   ├── types.ts          Matrix, Vec, Operation, NamedVector, SubspaceToggles
│   │   └── linalg.ts         det, rank, rref, nullSpace, colSpace, rowSpace,
│   │                          leftNullSpace, eigen (2×2 + 3×3 cubic), matMul,
│   │                          matPow, rotationMatrix
│   ├── hooks/
│   │   └── useAnimation.ts   requestAnimationFrame loop + cosine easing
│   ├── components/
│   │   ├── MatrixInput.tsx   grid-based numeric input
│   │   ├── VectorInput.tsx   add/remove/edit/rename vectors
│   │   └── Canvas2D.tsx      grid, axes, arrows, subspaces, wheel-zoom
│   ├── App.tsx               central scene state
│   └── App.css               dark neon theme
```

---

## Credits

Concept and implementation: see `idea.md` for the original design brief.
