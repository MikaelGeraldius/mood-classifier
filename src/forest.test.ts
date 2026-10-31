import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { argmax, parseForest, predict, sweep } from './forest'
import parity from './data/parity.json'
import metrics from './data/metrics.json'

const file = readFileSync(new URL('../public/forest.bin', import.meta.url))
const forest = parseForest(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))

describe('forest.bin', () => {
  it('has the shape the exporter wrote', () => {
    expect(forest.trees).toBe(metrics.web.trees)
    expect(forest.feature.length).toBe(metrics.web.nodes)
  })

  it('gives the same probabilities as the Python reference for 200 test-set songs', () => {
    for (const row of parity) {
      const p = predict(forest, row.f)
      for (let k = 0; k < 4; k++) expect(p[k]).toBeCloseTo(row.p[k], 5)
    }
  })

  it('returns a probability distribution', () => {
    const p = predict(forest, parity[0].f)
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 1)
    expect(argmax(p)).toBe(argmax(parity[0].p))
  })

  it('sweeps a feature across its range', () => {
    const line = sweep(forest, parity[0].f, 1, 0, 1, 2, 10)
    expect(line.length).toBe(10)
    line.forEach((v) => expect(v).toBeGreaterThanOrEqual(0))
  })
})
