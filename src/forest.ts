/**
 * The Random Forest, read from public/forest.bin (written by ml/train_export.py).
 *
 * Layout, little-endian:
 *   header   "RFM1", trees, nodes, features (uint32 each), then one uint32 root index per tree
 *   feature  uint8 per node; 255 marks a leaf. Padded to a 4-byte boundary.
 *   value    4 bytes per node: a split's threshold (float32), or a leaf's four class probabilities (uint8, /255)
 *   right    uint32 per node: a split's right child. Its left child is always the next node (sklearn grows
 *            trees depth-first), so it is not stored.
 * A sample goes left when feature <= threshold, as in sklearn.
 */
export interface Forest {
  trees: number
  roots: Uint32Array
  feature: Uint8Array
  threshold: Float32Array
  leaf: Uint8Array
  right: Uint32Array
}

export const MOODS = ['sad', 'happy', 'energetic', 'calm'] as const
export type Mood = (typeof MOODS)[number]

const LEAF = 255

export function parseForest(buffer: ArrayBuffer): Forest {
  const head = new DataView(buffer)
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (magic !== 'RFM1') throw new Error('forest.bin: unknown format')
  const trees = head.getUint32(4, true)
  const nodes = head.getUint32(8, true)
  let offset = 16
  const roots = new Uint32Array(buffer.slice(offset, offset + trees * 4))
  offset += trees * 4
  const feature = new Uint8Array(buffer, offset, nodes)
  offset += nodes + ((4 - ((offset + nodes) % 4)) % 4)
  const valueBytes = buffer.slice(offset, offset + nodes * 4)
  offset += nodes * 4
  const right = new Uint32Array(buffer.slice(offset, offset + nodes * 4))
  return { trees, roots, feature, threshold: new Float32Array(valueBytes), leaf: new Uint8Array(valueBytes), right }
}

/** Class probabilities: the mean of every tree's leaf distribution, as sklearn's predict_proba. */
export function predict(forest: Forest, x: ArrayLike<number>, out = new Float64Array(4)): Float64Array {
  out.fill(0)
  const { roots, feature, threshold, leaf, right } = forest
  // Compare in float32, the precision the thresholds were stored in.
  const xf = Float32Array.from(x as ArrayLike<number>)
  for (let t = 0; t < roots.length; t++) {
    let i = roots[t]
    let f = feature[i]
    while (f !== LEAF) {
      i = xf[f] <= threshold[i] ? i + 1 : right[i]
      f = feature[i]
    }
    const b = i * 4
    out[0] += leaf[b]
    out[1] += leaf[b + 1]
    out[2] += leaf[b + 2]
    out[3] += leaf[b + 3]
  }
  const scale = 1 / (255 * roots.length)
  for (let k = 0; k < 4; k++) out[k] *= scale
  return out
}

export function argmax(p: ArrayLike<number>): number {
  let best = 0
  for (let k = 1; k < p.length; k++) if (p[k] > p[best]) best = k
  return best
}

/**
 * Hold every feature but one where it is, move that one across its range, and record the probability of
 * `mood` at each step. This is what the line above each slider draws.
 */
export function sweep(forest: Forest, x: number[], feature: number, lo: number, hi: number, mood: number, steps = 48) {
  const probe = x.slice()
  const p = new Float64Array(4)
  const out = new Float32Array(steps)
  for (let s = 0; s < steps; s++) {
    probe[feature] = lo + ((hi - lo) * s) / (steps - 1)
    out[s] = predict(forest, probe, p)[mood]
  }
  return out
}

/**
 * The predicted mood over a valence x energy grid, everything else held. Row 0 is the highest energy, so the
 * grid reads like the picture.
 */
export function moodGrid(forest: Forest, x: number[], valence: number, energy: number, size = 36) {
  const probe = x.slice()
  const p = new Float64Array(4)
  const grid = new Uint8Array(size * size)
  for (let r = 0; r < size; r++) {
    probe[energy] = 1 - (r + 0.5) / size
    for (let c = 0; c < size; c++) {
      probe[valence] = (c + 0.5) / size
      grid[r * size + c] = argmax(predict(forest, probe, p))
    }
  }
  return grid
}
