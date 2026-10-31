import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyseAudio } from './analysis'
import { argmax, parseForest, predict } from './forest'
import { features, moodNames } from './content'

const RATE = 22050
const file = readFileSync(new URL('../public/forest.bin', import.meta.url))
const forest = parseForest(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
const mood = (f: number[]) => moodNames[argmax(predict(forest, f))]

// A seeded random source, so the synthetic songs are the same on every run.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1
}

/** Loud, noisy and on the beat: a kick every beat, hiss and a buzzy bass on top. */
function loudBeat(seconds = 30, bpm = 126) {
  const x = new Float32Array(RATE * seconds)
  const r = rng(1)
  const period = Math.round((60 / bpm) * RATE)
  for (let i = 0; i < x.length; i++) {
    const t = i % period
    const kick = t < 2500 ? Math.sin((2 * Math.PI * 55 * t) / RATE) * (1 - t / 2500) : 0
    const hat = i % (period / 2) < 600 ? r() * 0.6 : r() * 0.15
    const bass = Math.sign(Math.sin((2 * Math.PI * 82 * i) / RATE)) * 0.25
    x[i] = Math.max(-1, Math.min(1, 0.7 * kick + hat + bass))
  }
  return x
}

/** Quiet, sparse and pure: soft decaying tones, as from a piano in a quiet room. */
function quietPiano(seconds = 30) {
  const x = new Float32Array(RATE * seconds)
  const notes = [220, 261.6, 329.6, 392, 293.7, 246.9]
  const step = Math.round(1.4 * RATE)
  for (let n = 0; n * step < x.length; n++) {
    const hz = notes[n % notes.length]
    for (let k = 0; k < step * 2 && n * step + k < x.length; k++) {
      const env = Math.exp(-k / (0.6 * RATE)) * 0.12
      x[n * step + k] += env * (Math.sin((2 * Math.PI * hz * k) / RATE) + 0.3 * Math.sin((4 * Math.PI * hz * k) / RATE))
    }
  }
  return x
}

describe('analyseAudio', () => {
  const loud = analyseAudio(loudBeat(), RATE)
  const quiet = analyseAudio(quietPiano(), RATE)

  it('returns nine features inside the ranges the sliders use', () => {
    for (const a of [loud, quiet]) {
      expect(a.f).toHaveLength(9)
      a.f.forEach((v, i) => {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(features[i].min - 25)
        expect(v).toBeLessThanOrEqual(features[i].max)
      })
    }
  })

  it('measures the tempo of a beat', () => {
    expect(Math.abs(loud.f[8] - 126)).toBeLessThanOrEqual(2)
  })

  it('hears the loud beat as louder, more energetic and less acoustic than the quiet piano', () => {
    expect(loud.f[2]).toBeGreaterThan(quiet.f[2] + 10)
    expect(loud.f[1]).toBeGreaterThan(quiet.f[1] + 0.3)
    expect(quiet.f[4]).toBeGreaterThan(loud.f[4] + 0.3)
  })

  it('leads the forest to a fitting mood for each', () => {
    expect(['Energetic', 'Happy']).toContain(mood(loud.f))
    expect(['Calm', 'Sad']).toContain(mood(quiet.f))
  })
})
