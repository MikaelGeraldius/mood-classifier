/**
 * Estimating the nine features from raw audio, in the browser, for when no feature service is available.
 *
 * Spotify's features come from its own (unpublished) models, so these are estimates built from standard signal
 * measures, not reproductions:
 *   measured   loudness (mean power in dB, nudged toward LUFS), tempo (onset autocorrelation)
 *   estimated  energy, danceability, acousticness, instrumentalness, speechiness, valence (heuristic mixes of
 *              loudness, onset strength, beat regularity, brightness, dynamic range, noisiness and how much the
 *              vocal band pulses at syllable rate)
 *   typical    liveness (no usable cue; the dataset median is used; it carries 1.5% of the model's importance)
 * Each estimate is kept inside the range real songs occupy, so a wrong guess can't push a slider to an extreme.
 */

export const HOW = {
  measured: ['loudness', 'tempo'],
  estimated: ['energy', 'danceability', 'acousticness', 'instrumentalness', 'speechiness', 'valence'],
  typical: ['liveness'],
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 0 at a, 1 at b, straight in between. */
const n = (x: number, a: number, b: number) => clamp01((x - a) / (b - a))
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d

/** In-place radix-2 FFT. re and im have the same power-of-two length. */
function fft(re: Float64Array, im: Float64Array) {
  const size = re.length
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < size; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar
        im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
}

/** Autocorrelation of `x` at a fractional lag (linear interpolation). */
function acAt(x: Float32Array, lag: number) {
  const l0 = Math.floor(lag)
  const w = lag - l0
  let sum = 0
  for (let i = l0 + 1; i < x.length; i++) sum += x[i] * (x[i - l0] * (1 - w) + x[i - l0 - 1] * w)
  return sum
}

/**
 * Best tempo for an onset envelope sampled at `fps`. The envelope is smoothed a little (beats fall on alternate
 * frames), each tempo is scored on its first three beat multiples (a comb, so a true pulse beats an accidental
 * alignment with off-beats), and a mild pull toward 120 BPM settles octave errors.
 */
export function findTempo(onsetIn: Float32Array, fps: number) {
  const k = [1, 2, 3, 2, 1]
  const onset = new Float32Array(onsetIn.length)
  for (let i = 0; i < onset.length; i++) {
    let s = 0
    for (let j = -2; j <= 2; j++) s += (onsetIn[i + j] ?? 0) * k[j + 2]
    onset[i] = s / 9
  }
  let mean = 0
  for (const v of onset) mean += v
  mean /= Math.max(1, onset.length)
  for (let i = 0; i < onset.length; i++) onset[i] -= mean
  const zero = acAt(onset, 0) || 1

  let best = 120
  let bestScore = -Infinity
  let bestRaw = 0
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (60 / bpm) * fps
    const raw = acAt(onset, lag)
    const comb = raw + acAt(onset, 2 * lag) / 2 + acAt(onset, 3 * lag) / 3
    const score = comb * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2))
    if (score > bestScore) {
      bestScore = score
      best = bpm
      bestRaw = raw
    }
  }
  return { bpm: best, regularity: Math.max(0, bestRaw / zero) }
}

export interface Analysis {
  /** The nine features in model order: danceability, energy, loudness, speechiness, acousticness,
   *  instrumentalness, liveness, valence, tempo. */
  f: number[]
  /** The raw measures behind them, for tests and debugging. */
  raw: Record<string, number>
}

/** Analyses mono audio (any length; up to 90 s from the middle is used). */
export function analyseAudio(input: Float32Array, rate: number): Analysis {
  const maxLen = 90 * rate
  const x =
    input.length > maxLen
      ? input.subarray((input.length - maxLen) >> 1, ((input.length - maxLen) >> 1) + maxLen)
      : input
  const N = 1024
  const hop = 512
  const frames = Math.max(0, Math.floor((x.length - N) / hop))
  const binHz = rate / N
  const bin = (hz: number) => Math.min(N / 2, Math.round(hz / binHz))
  const [b200, b300, b3400, b5000, b8000] = [bin(200), bin(300), bin(3400), bin(5000), bin(8000)]
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))

  const re = new Float64Array(N)
  const im = new Float64Array(N)
  let prev = new Float64Array(N / 2)
  let cur = new Float64Array(N / 2)
  const flux = new Float32Array(frames)
  const vocalEnv = new Float32Array(frames)
  const frameDb: number[] = []
  let sumSq = 0
  let centroidSum = 0
  let highSum = 0
  let totalSum = 0
  let lowSum = 0
  let flatSum = 0
  let weightSum = 0

  for (let t = 0; t < frames; t++) {
    let e = 0
    for (let i = 0; i < N; i++) {
      const v = x[t * hop + i]
      e += v * v
      re[i] = v * win[i]
      im[i] = 0
    }
    sumSq += e
    const db = 10 * Math.log10(e / N + 1e-12)
    fft(re, im)
    let magSum = 0
    let cSum = 0
    let high = 0
    let low = 0
    let vocal = 0
    let logSum = 0
    let pSum = 0
    let f = 0
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k]
      const m = Math.sqrt(p)
      cur[k] = Math.log1p(100 * m)
      f += Math.max(0, cur[k] - prev[k])
      magSum += m
      cSum += m * k * binHz
      if (k >= b5000) high += p
      if (k < b200) low += p
      if (k >= b300 && k < b3400) vocal += p
      if (k >= b200 && k < b8000) {
        logSum += Math.log(p + 1e-12)
        pSum += p
      }
    }
    ;[prev, cur] = [cur, prev]
    flux[t] = f
    vocalEnv[t] = Math.sqrt(vocal)
    if (db > -60) {
      // Quiet frames (silence, fades) say nothing about the sound; leave them out of the averages.
      frameDb.push(db)
      const w = magSum
      centroidSum += (magSum > 0 ? cSum / magSum : 0) * w
      const bands = b8000 - b200
      flatSum += (pSum > 0 ? Math.exp(logSum / bands) / (pSum / bands) : 0) * w
      weightSum += w
      highSum += high
      lowSum += low
      totalSum += high + low + vocal
    }
  }

  const fps = rate / hop
  const loudness = Math.max(-60, Math.min(0, 10 * Math.log10(sumSq / Math.max(1, frames * N) + 1e-12) + 3))
  const meanDb = frameDb.reduce((a, b) => a + b, 0) / Math.max(1, frameDb.length)
  const dynamics = Math.sqrt(frameDb.reduce((a, b) => a + (b - meanDb) ** 2, 0) / Math.max(1, frameDb.length))
  const centroid = weightSum > 0 ? centroidSum / weightSum : 0
  const flatness = weightSum > 0 ? flatSum / weightSum : 0
  const highRatio = totalSum > 0 ? highSum / totalSum : 0
  const lowRatio = totalSum > 0 ? lowSum / totalSum : 0

  // Onsets: spectral flux with its local mean removed.
  const onset = new Float32Array(frames)
  let fluxMean = 0
  for (let t = 0; t < frames; t++) {
    let s = 0
    let c = 0
    for (let j = Math.max(0, t - 8); j <= Math.min(frames - 1, t + 8); j++, c++) s += flux[j]
    onset[t] = Math.max(0, flux[t] - s / c)
    fluxMean += flux[t]
  }
  fluxMean /= Math.max(1, frames)
  const { bpm, regularity } = findTempo(onset, fps)
  const onsetStrength = onset.reduce((a, b) => a + b, 0) / Math.max(1, frames) / (fluxMean + 1e-9)

  // Syllable-rate pulsing of the vocal band (3–8 Hz) as a share of its slow modulation (0.5–16 Hz). Singing and
  // speech pulse there; pads, strings and steady guitars much less. Measured on 6-second windows and averaged.
  const winLen = Math.round(6 * fps)
  let syllabic = 0
  let windows = 0
  for (let start = 0; start + winLen <= frames; start += winLen) {
    const seg = vocalEnv.subarray(start, start + winLen)
    const mean = seg.reduce((a, b) => a + b, 0) / winLen
    if (mean <= 0) continue
    let band = 0
    let all = 0
    for (let hz = 0.5; hz <= 16; hz += 0.25) {
      let r = 0
      let i = 0
      for (let k = 0; k < winLen; k++) {
        const a = (2 * Math.PI * hz * k) / fps
        r += (seg[k] - mean) * Math.cos(a)
        i += (seg[k] - mean) * Math.sin(a)
      }
      const p = r * r + i * i
      all += p
      if (hz >= 3 && hz <= 8) band += p
    }
    if (all > 0) {
      syllabic += band / all
      windows++
    }
  }
  syllabic = windows ? syllabic / windows : 0

  const tempoFit = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.35, 2))
  const energy = clamp01(0.45 * n(loudness, -24, -5) + 0.3 * n(centroid, 900, 3200) + 0.25 * n(flatness, 0.05, 0.35))
  const acousticness = clamp01(
    0.35 * n(dynamics, 3, 11) + 0.35 * (1 - n(highRatio, 0.01, 0.12)) + 0.3 * (1 - n(loudness, -22, -7)),
  )
  const danceability =
    0.15 + 0.8 * clamp01(0.45 * n(regularity, 0.05, 0.35) + 0.3 * tempoFit + 0.25 * n(lowRatio, 0.1, 0.45))
  // Instrumental only when the vocal band barely pulses at syllable rate; most songs have voices, so lean low.
  const instrumentalness = clamp01(n(0.3 - syllabic, 0, 0.14) * (0.6 + 0.4 * n(dynamics, 3, 10)))
  const speechiness = 0.03 + 0.4 * n(syllabic, 0.42, 0.65) * n(onsetStrength, 0.2, 0.6)
  const valence =
    0.1 + 0.8 * clamp01(0.35 * n(centroid, 1000, 3000) + 0.3 * danceability + 0.2 * energy + 0.15 * tempoFit)
  const liveness = 0.12

  return {
    f: [
      round(danceability),
      round(energy),
      Math.round(loudness * 10) / 10,
      round(speechiness),
      round(acousticness),
      round(instrumentalness),
      liveness,
      round(valence),
      Math.round(bpm),
    ],
    raw: { dynamics, centroid, flatness, highRatio, lowRatio, regularity, onsetStrength, syllabic, bpm, loudness },
  }
}
