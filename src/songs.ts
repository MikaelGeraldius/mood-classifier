/**
 * Getting the nine features for a song of your own.
 *
 * Spotify closed its audio-features endpoint to new apps in November 2024. ReccoBeats (reccobeats.com) offers
 * the same nine features on the same scales, free and without a key, in two ways:
 *   - by Spotify track:  GET  https://api.reccobeats.com/v1/audio-features?ids=<spotify id>
 *   - from an audio file: POST https://api.reccobeats.com/v1/analysis/audio-features  (multipart, field
 *     "audioFile", up to 5 MB, only the first 30 seconds are analysed)
 * Uploads are decoded here first and sent as up to three 30-second mono WAV clips from across the song; the
 * results are averaged. If ReccoBeats can't be reached, the page measures loudness, tempo and energy itself and
 * fills the rest with typical values, and says so.
 */
import { featureKeys } from './content'

/**
 * Where requests go. ReccoBeats may not allow calls straight from web pages (CORS), so they can go through a
 * small proxy that adds the header: Vite's dev-server proxy during `npm run dev`, and the Cloudflare Worker in
 * proxy/ on the live site (its URL is set at build time as VITE_RECCOBEATS_PROXY). Without either, direct.
 */
const PROXY = (import.meta.env.VITE_RECCOBEATS_PROXY as string | undefined)?.replace(/\/$/, '')
const API = PROXY ? `${PROXY}/v1` : import.meta.env.DEV ? '/reccobeats/v1' : 'https://api.reccobeats.com/v1'
const OEMBED = PROXY ? `${PROXY}/oembed` : import.meta.env.DEV ? '/spotify/oembed' : 'https://open.spotify.com/oembed'
export const viaProxy = Boolean(PROXY) || import.meta.env.DEV

export interface Song {
  /** Stable key: "spotify:<id>" or "file:<name>:<size>". */
  key: string
  title: string
  artist?: string
  cover?: string
  link?: string
  f: number[]
  /** Where the numbers came from. */
  via: 'reccobeats' | 'reccobeats-file' | 'estimate'
  /** For estimates: which features were measured rather than filled in. */
  measured?: string[]
  added: number
}

// ---- Spotify links

/** Accepts open.spotify.com/track/… (with or without intl-xx and query), spotify:track:…, or a bare 22-char id. */
export function spotifyTrackId(input: string): string | null {
  const s = input.trim()
  const url = s.match(/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})/)
  if (url) return url[1]
  const uri = s.match(/^spotify:track:([A-Za-z0-9]{22})$/)
  if (uri) return uri[1]
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s
  return null
}

/** Pulls the nine features, in model order, out of whatever object holds them. Null if any is missing. */
export function pickFeatures(obj: unknown): number[] | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const f = featureKeys.map((k) => (typeof o[k] === 'number' ? (o[k] as number) : Number.NaN))
  return f.every(Number.isFinite) ? f : null
}

/** ReccoBeats lists come as { content: [...] }; single objects come bare. */
function first(json: unknown): unknown {
  if (Array.isArray(json)) return json[0]
  if (json && typeof json === 'object' && 'content' in json) {
    const c = (json as { content: unknown }).content
    return Array.isArray(c) ? c[0] : c
  }
  return json
}

export class SongError extends Error {}

async function getJson(url: string, init?: RequestInit) {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch {
    // fetch only throws without an answer: no network, or the browser refused to hand over a reply
    // (a missing CORS header, an extension, a page that forbids outside requests).
    throw new SongError(navigator.onLine === false ? 'offline' : 'blocked')
  }
  if (res.status === 429) throw new SongError('busy')
  if (!res.ok) throw new SongError(`http-${res.status}`)
  return res.json()
}

export async function songFromSpotify(id: string): Promise<Song> {
  const link = `https://open.spotify.com/track/${id}`
  // Title and cover from Spotify's public oEmbed; artist and features from ReccoBeats. Each is optional but the features.
  const [embed, track, direct] = await Promise.allSettled([
    getJson(`${OEMBED}?url=${encodeURIComponent(link)}`),
    getJson(`${API}/track?ids=${id}`),
    getJson(`${API}/audio-features?ids=${id}`),
  ])
  let f = direct.status === 'fulfilled' ? pickFeatures(first(direct.value)) : null
  const meta = track.status === 'fulfilled' ? (first(track.value) as Record<string, unknown> | undefined) : undefined
  // Fallback: look the track up by its ReccoBeats id.
  if (!f && meta && typeof meta.id === 'string') {
    try {
      f = pickFeatures(first(await getJson(`${API}/track/${meta.id}/audio-features`)))
    } catch {
      /* reported below */
    }
  }
  if (!f) {
    const reason = [direct, track].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    throw reason?.reason instanceof SongError && reason.reason.message !== 'http-404'
      ? reason.reason
      : new SongError('not-found')
  }
  const e = embed.status === 'fulfilled' ? (embed.value as Record<string, unknown>) : {}
  const artists = Array.isArray(meta?.artists)
    ? (meta!.artists as { name?: string }[])
        .map((a) => a.name)
        .filter(Boolean)
        .join(', ')
    : undefined
  return {
    key: `spotify:${id}`,
    title:
      (typeof meta?.trackTitle === 'string' && meta.trackTitle) ||
      (typeof e.title === 'string' && e.title) ||
      'Spotify track',
    artist: artists || undefined,
    cover: typeof e.thumbnail_url === 'string' ? e.thumbnail_url : undefined,
    link,
    f,
    via: 'reccobeats',
    added: Date.now(),
  }
}

// ---- Audio files

export const CLIP_SECONDS = 30
const RATE = 22050

/** Where to take clips from: one for a short song, otherwise up to three spread across it. */
export function clipStarts(duration: number, clip = CLIP_SECONDS): number[] {
  if (duration <= clip + 1) return [0]
  const span = duration - clip
  const starts = [0.2, 0.5, 0.8].map((p) => Math.round(span * p))
  return duration < clip * 2.5 ? [starts[1]] : starts
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

/** Decodes any format the browser can play and resamples to mono 22.05 kHz. */
async function decodeMono(file: File): Promise<{ samples: Float32Array; duration: number }> {
  const data = await file.arrayBuffer()
  const Ctx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(data)
  } catch {
    throw new SongError('decode')
  } finally {
    void ctx.close()
  }
  const length = Math.ceil(decoded.duration * RATE)
  const off = new OfflineAudioContext(1, length, RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return { samples: rendered.getChannelData(0), duration: decoded.duration }
}

export function average(rows: number[][]): number[] {
  return rows[0].map((_, i) => rows.reduce((sum, r) => sum + r[i], 0) / rows.length)
}

export type Progress = (step: string) => void

export async function songFromFile(file: File, fallback: number[], progress: Progress): Promise<Song> {
  progress('Reading the audio')
  const { samples, duration } = await decodeMono(file)
  const starts = clipStarts(duration)
  const results: number[][] = []
  let lastError: SongError | null = null
  for (let i = 0; i < starts.length; i++) {
    progress(starts.length > 1 ? `Analysing part ${i + 1} of ${starts.length}` : 'Analysing')
    const clip = samples.subarray(starts[i] * RATE, (starts[i] + CLIP_SECONDS) * RATE)
    const form = new FormData()
    form.append('audioFile', new Blob([encodeWav(clip, RATE)], { type: 'audio/wav' }), 'clip.wav')
    try {
      const f = pickFeatures(first(await getJson(`${API}/analysis/audio-features`, { method: 'POST', body: form })))
      if (f) results.push(f)
    } catch (error) {
      lastError = error instanceof SongError ? error : new SongError('offline')
      if (lastError.message === 'offline' || lastError.message === 'blocked') break
    }
  }
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')
  const key = `file:${file.name}:${file.size}`
  if (results.length) return { key, title, f: average(results), via: 'reccobeats-file', added: Date.now() }

  // ReccoBeats unreachable: measure what can be measured honestly here.
  progress('Measuring it here instead')
  const est = estimateLocally(samples, RATE)
  const f = fallback.slice()
  f[featureKeys.indexOf('loudness')] = est.loudness
  f[featureKeys.indexOf('tempo')] = est.tempo
  f[featureKeys.indexOf('energy')] = est.energy
  void lastError
  return { key, title, f, via: 'estimate', measured: ['loudness', 'tempo', 'energy'], added: Date.now() }
}

// ---- Local estimates (rough; used only when ReccoBeats can't be reached)

/** Loudness as mean RMS in dBFS, a tempo from onset autocorrelation, and energy from loudness and onset density. */
export function estimateLocally(x: Float32Array, rate: number) {
  const hop = 512
  const frames = Math.floor(x.length / hop)
  const rms = new Float32Array(frames)
  let sumSq = 0
  for (let i = 0; i < frames; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) {
      const v = x[i * hop + j]
      s += v * v
    }
    sumSq += s
    rms[i] = Math.sqrt(s / hop)
  }
  const loudness = Math.max(-60, 10 * Math.log10(sumSq / Math.max(1, frames * hop) + 1e-12))
  // Onset strength: positive change in log energy.
  const onset = new Float32Array(frames)
  for (let i = 1; i < frames; i++) onset[i] = Math.max(0, Math.log(rms[i] + 1e-6) - Math.log(rms[i - 1] + 1e-6))
  const fps = rate / hop
  let best = 120
  let bestScore = -Infinity
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (60 / bpm) * fps
    const l0 = Math.floor(lag)
    const w = lag - l0
    let score = 0
    for (let i = l0 + 1; i < frames; i++) score += onset[i] * (onset[i - l0] * (1 - w) + onset[i - l0 - 1] * w)
    // Mild preference for the 90–140 BPM range, where most pop sits, to settle octave errors.
    score *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2))
    if (score > bestScore) {
      bestScore = score
      best = bpm
    }
  }
  const density = onset.reduce((a, b) => a + b, 0) / Math.max(1, frames)
  const energy = Math.min(1, Math.max(0, 0.55 * ((loudness + 30) / 25) + 0.45 * Math.min(1, density * 6)))
  return { loudness: Math.round(loudness * 10) / 10, tempo: Math.round(best), energy: Math.round(energy * 100) / 100 }
}

// ---- Your songs, kept in this browser

const STORE = 'mood-classifier:songs'

export function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORE)
    const list = raw ? (JSON.parse(raw) as Song[]) : []
    return list.filter((s) => Array.isArray(s.f) && s.f.length === featureKeys.length)
  } catch {
    return []
  }
}

export function saveSongs(list: Song[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.slice(0, 24)))
  } catch {
    /* private mode: the list lives for this visit only */
  }
}

export function songErrorText(error: unknown): string {
  const code = error instanceof SongError ? error.message : 'unknown'
  if (code === 'not-found')
    return 'ReccoBeats has no features for this track. Upload the audio file instead and it will be analysed directly.'
  if (code === 'busy') return 'ReccoBeats is busy right now. Wait a few seconds and try again.'
  if (code === 'offline') return 'You’re offline. Reconnect and try again, or upload the file to measure it here.'
  if (code === 'blocked')
    return viaProxy
      ? 'ReccoBeats didn’t answer through the proxy. It may be down; try again in a minute, or upload the file to measure it here.'
      : 'Your browser blocked the request to ReccoBeats, which supplies the features. ReccoBeats doesn’t let web pages call it directly, so this site needs its proxy set up (see the README), or an extension is blocking it. You can still upload the file to measure it here.'
  if (code === 'decode') return 'This browser can’t read that file. Try an MP3, WAV, OGG, M4A or FLAC.'
  if (code.startsWith('http-')) return `ReccoBeats answered with an error (${code.slice(5)}). Try again in a moment.`
  return 'Something went wrong reading that song. Try again, or set the sliders by hand.'
}
